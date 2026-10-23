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
        await runMigrations(pool);
        await runMigrations(pool);
        const [[count]] = await pool.query('SELECT COUNT(*) AS count FROM schema_migrations');
        assert.equal(Number(count.count), 12);
        const [[index]] = await pool.query("SELECT SUB_PART AS prefix FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'auditLog' AND index_name = 'idx_audit_actor'");
        assert.equal(index.prefix, legacy ? 191 : null);
        if (legacy) {
          const [[row]] = await pool.query("SELECT adminId, action FROM auditLog WHERE id = 'legacy-event'");
          assert.equal(row.adminId, actor);
          assert.equal(row.action, 'original action');
        }
      } finally {
        await pool.end();
        await admin.query(`DROP DATABASE \`${database}\``);
      }
    }
  } finally {
    await admin.end();
  }
});
