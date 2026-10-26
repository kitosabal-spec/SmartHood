'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { addIndex, runMigrations } = require('../src/db/migrationRunner');

function connection(metadata, exists = false) {
  const statements = [];
  return {
    statements,
    async execute(sql) {
      if (sql.includes('information_schema.statistics')) return [exists ? [{}] : []];
      if (sql.includes('information_schema.columns')) return [metadata];
      throw new Error(`Unexpected query: ${sql}`);
    },
    async query(sql) { statements.push(sql); },
  };
}

test('legacy text lookup indexes use a prefix without altering stored values', async () => {
  for (const type of ['tinytext', 'text', 'mediumtext', 'longtext', 'blob', 'longblob']) {
    const db = connection([{ column_name: 'adminId', data_type: type }]);
    await addIndex(db, 'auditLog', 'idx_audit_actor', '`adminId`');
    assert.deepEqual(db.statements, ['ALTER TABLE `auditLog` ADD INDEX `idx_audit_actor` (`adminId`(191))']);
  }
});

test('typed columns, explicit prefixes and unique index semantics are preserved', async () => {
  const db = connection([
    { column_name: 'adminId', data_type: 'text' },
    { column_name: 'created_at', data_type: 'datetime' },
    { column_name: 'actor_role', data_type: 'varchar' },
  ]);
  await addIndex(db, 'auditLog', 'mixed', '`adminId`, `created_at`, `actor_role`');
  await addIndex(db, 'auditLog', 'explicit', '`adminId`(64)');
  await addIndex(db, 'auditLog', 'unique_actor', '`adminId`', { unique: true });
  assert.deepEqual(db.statements, [
    'ALTER TABLE `auditLog` ADD INDEX `mixed` (`adminId`(191), `created_at`, `actor_role`)',
    'ALTER TABLE `auditLog` ADD INDEX `explicit` (`adminId`(64))',
    'ALTER TABLE `auditLog` ADD UNIQUE INDEX `unique_actor` (`adminId`)',
  ]);
});

test('existing indexes are skipped on retry', async () => {
  const db = connection([], true);
  await addIndex(db, 'auditLog', 'idx_audit_actor', '`adminId`');
  assert.deepEqual(db.statements, []);
});

// Opt-in: uses only a disposable local database, never the application's .env.
test('real database: all migrations, legacy 006 failure recovery, and restart', {
  skip: process.env.TEST_LOCAL_MYSQL !== '1',
}, async () => {
  const mysql = require('mysql2/promise');
  const crypto = require('node:crypto');
  const config = { host: '127.0.0.1', user: 'root', password: '', connectionLimit: 1 };
  const admin = await mysql.createConnection(config);
  try {
    for (const legacy of [false, true]) {
      const database = `san_migration_test_${crypto.randomBytes(8).toString('hex')}`;
      await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      const pool = mysql.createPool({ ...config, database });
      try {
        const actor = 'legacy-actor-' + 'x'.repeat(300);
        if (legacy) {
          await pool.query('CREATE TABLE auditLog (id VARCHAR(64) PRIMARY KEY, action TEXT, adminId TEXT, timestamp TEXT) ENGINE=InnoDB');
          await pool.execute('INSERT INTO auditLog VALUES (?, ?, ?, ?)', ['legacy-event', 'original action', actor, '2026-10-24T01:02:03.456Z']);
          // Interrupt at the same DDL as the failed MySQL deployment. MariaDB
          // can auto-prefix TEXT indexes, so inject MySQL's error explicitly.
          const originalGetConnection = pool.getConnection.bind(pool);
          pool.getConnection = async () => {
            const db = await originalGetConnection();
            const query = db.query.bind(db);
            db.query = async (sql, ...args) => {
              if (sql.startsWith('ALTER TABLE `auditLog` ADD INDEX `idx_audit_actor`')) {
                throw Object.assign(new Error("BLOB/TEXT column 'adminId' used in key specification without a key length"), { code: 'ER_BLOB_KEY_WITHOUT_LENGTH' });
              }
              return query(sql, ...args);
            };
            return db;
          };
          await assert.rejects(runMigrations(pool), /006_improve_audit_logs failed:.*BLOB\/TEXT/);
          pool.getConnection = originalGetConnection;
          const [before] = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
          assert.deepEqual(before.map(row => row.version), ['001', '002', '003', '004', '005']);
        }
        // Exercise the real 008 SQL with a dropped connection mid-backfill.
        const getConnection = pool.getConnection.bind(pool);
        let interrupted = false;
        pool.getConnection = async () => {
          const db = await getConnection();
          const execute = db.execute.bind(db);
          db.execute = async (sql, ...args) => {
            if (!interrupted && sql.startsWith('UPDATE `payments` SET `submitted_at`')) {
              interrupted = true;
              db.destroy();
              throw Object.assign(new Error('Connection lost during operational date backfill'), { code: 'PROTOCOL_CONNECTION_LOST' });
            }
            return execute(sql, ...args);
          };
          return db;
        };
        await runMigrations(pool);
        assert.equal(interrupted, true);
        pool.getConnection = getConnection;
        await runMigrations(pool);
        const [[count]] = await pool.query('SELECT COUNT(*) AS count FROM schema_migrations');
        assert.equal(Number(count.count), 13);
        const [[index]] = await pool.query("SELECT SUB_PART AS prefix FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'auditLog' AND index_name = 'idx_audit_actor'");
        assert.equal(index.prefix, legacy ? 191 : null);
        if (legacy) {
          const [[row]] = await pool.query("SELECT adminId, action FROM auditLog WHERE id = 'legacy-event'");
          assert.equal(row.adminId, actor);
          assert.equal(row.action, 'original action');
        }
        // Exercise business/audit atomicity on real InnoDB tables as well as
        // the HTTP suite's SQL double. These schemas are disposable fixtures.
        const { createAuditService } = require('../src/services/auditService');
        const audit = createAuditService({ getPool: () => pool,
          resolveActor: async () => ({ id: 'test-operator', role: 'admin', name: 'Test Operator' }) });
        const req = { ip: '127.0.0.1' };
        await audit.transaction(req, async () => {
          await audit.current().connection.execute("INSERT INTO appSettings (id, value) VALUES ('audit-commit', 'saved')");
          await audit.record(req, { table: 'appSettings', id: 'audit-commit', operation: 'created' });
        });
        const [[saved]] = await pool.query("SELECT COUNT(*) AS count FROM appSettings WHERE id = 'audit-commit'");
        const [[event]] = await pool.query("SELECT id, actor_name, ip_address FROM auditLog WHERE entity_id = 'audit-commit'");
        assert.equal(Number(saved.count), 1);
        assert.equal(event.actor_name, 'Test Operator');
        assert.equal(event.ip_address, '127.0.0.1');
        await assert.rejects(audit.transaction(req, async () => {
          await audit.current().connection.execute("INSERT INTO appSettings (id, value) VALUES ('audit-rollback', 'must disappear')");
          await audit.record(req, { table: 'appSettings', id: 'audit-rollback', operation: 'created' });
          throw new Error('Simulated request failure after both writes');
        }), /Simulated request failure/);
        const [[rolledBack]] = await pool.query("SELECT COUNT(*) AS count FROM appSettings WHERE id = 'audit-rollback'");
        const [[rolledBackAudit]] = await pool.query("SELECT COUNT(*) AS count FROM auditLog WHERE entity_id = 'audit-rollback'");
        assert.equal(Number(rolledBack.count), 0);
        assert.equal(Number(rolledBackAudit.count), 0);
        await assert.rejects(pool.execute('UPDATE auditLog SET action = ? WHERE id = ?', ['tampered', event.id]), /Audit logs are immutable/);
        await assert.rejects(pool.execute('DELETE FROM auditLog WHERE id = ?', [event.id]), /Audit logs are immutable/);
      } finally {
        await pool.end();
        await admin.query(`DROP DATABASE \`${database}\``);
      }
    }
  } finally {
    await admin.end();
  }
});
