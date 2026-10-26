'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runMigrations, loadMigrations } = require('../src/db/migrationRunner');

function migrationDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'san-email-migration-'));
  const name = '013_administrator_email_verification.js';
  fs.copyFileSync(path.resolve(__dirname, '../migrations', name), path.join(directory, name));
  t.after(() => { fs.unlinkSync(path.join(directory, name)); fs.rmdirSync(directory); });
  return directory;
}

function fixture(t, { version = '8.0.11-TiDB-v8.5.0', partial = false, duplicate = false, failIndex = false } = {}) {
  const directory = migrationDirectory(t);
  const columns = new Set(partial ? ['admin_email_verified_at', 'pending_admin_email', 'admin_email_token_hash', 'admin_email_token_expires_at', 'admin_email_password_tag'] : []);
  const indexes = new Set();
  const applied = new Map();
  const statements = [];
  const issues = [];
  let shouldFail = failIndex;
  let locked = false;
  const connection = {
    async query(sql) {
      statements.push(sql);
      if (sql === 'SELECT VERSION() AS version') return [[{ version }]];
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) return [{}];
      if (sql.includes('GET_LOCK(')) { locked = true; return [[{ acquired: 1 }]]; }
      if (sql.includes('RELEASE_LOCK(')) { locked = false; return [[{ released: 1 }]]; }
      assert.ok(locked, 'migration must keep its session lock');
      if (sql === 'SELECT version, checksum FROM schema_migrations') return [[...applied].map(([version, checksum]) => ({ version, checksum }))];
      if (sql.includes('FROM deferred_constraints')) return [[]];
      if (sql.startsWith('SELECT MIN(id) AS id FROM users')) return [duplicate ? [{ id: 'duplicate-account' }] : []];
      const column = sql.match(/^ALTER TABLE `users` ADD COLUMN `([^`]+)`/);
      if (column) {
        if (/tidb/i.test(version) && column[1] === 'normalized_email') {
          assert.doesNotMatch(sql, /NULLIF|STORED/, 'the exact TiDB-incompatible constructs must not be sent');
          assert.match(sql, /CASE WHEN LOWER\(TRIM\(email\)\) = '' THEN NULL ELSE LOWER\(TRIM\(email\)\) END\) VIRTUAL$/);
        }
        assert.ok(!columns.has(column[1]), 'existing columns must be retained on recovery');
        columns.add(column[1]);
        return [{}];
      }
      const index = sql.match(/^ALTER TABLE `users` ADD (?:UNIQUE )?INDEX `([^`]+)`/);
      if (index) {
        if (shouldFail) { shouldFail = false; throw Object.assign(new Error('index permission denied'), { code: 'ER_TABLEACCESS_DENIED_ERROR' }); }
        indexes.add(index[1]); return [{}];
      }
      assert.fail(`Unexpected SQL: ${sql}`);
    },
    async execute(sql, values) {
      assert.ok(locked);
      if (sql.includes('information_schema.columns')) {
        return [sql.startsWith('SELECT COLUMN_NAME') ? [{ column_name: 'admin_email_token_hash', data_type: 'char' }] : columns.has(values[1]) ? [{}] : []];
      }
      if (sql.includes('information_schema.statistics')) return [indexes.has(values[1]) ? [{}] : []];
      if (sql.startsWith('INSERT INTO schema_migrations')) { applied.set(values[0], values[2]); return [{}]; }
      if (sql.startsWith('INSERT INTO migration_issues')) { issues.push(values); return [{}]; }
      assert.fail(`Unexpected SQL: ${sql}`);
    },
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
  };
  return { pool: { getConnection: async () => connection }, directory, columns, indexes, applied, statements, issues };
}

test('TiDB 013 creates an indexed virtual CASE column and preserves the original checksum on restart', async t => {
  for (const partial of [false, true]) {
    const f = fixture(t, { partial });
    await runMigrations(f.pool, { directory: f.directory });
    const alters = f.statements.filter(sql => sql.startsWith('ALTER TABLE')).length;
    await runMigrations(f.pool, { directory: f.directory });
    assert.equal(f.statements.filter(sql => sql.startsWith('ALTER TABLE')).length, alters);
    assert.equal(f.applied.get('013'), loadMigrations(f.directory)[0].checksum);
    assert.ok(f.indexes.has('idx_users_normalized_email'));
    assert.ok(f.statements.some(sql => sql.includes('ADD UNIQUE INDEX `idx_users_normalized_email` (`normalized_email`)')));
    assert.doesNotMatch(f.statements.join('\n'), /DROP |DELETE |UPDATE users|REPLACE INTO/);
    assert.equal(f.columns.size, 6);
  }
});

test('TiDB 013 resumes after column DDL succeeds but index creation fails; failure is never marked applied', async t => {
  const f = fixture(t, { failIndex: true });
  await assert.rejects(runMigrations(f.pool, { directory: f.directory }), /013_administrator_email_verification failed: index permission denied/);
  assert.equal(f.applied.size, 0);
  assert.ok(f.columns.has('normalized_email'));
  await runMigrations(f.pool, { directory: f.directory });
  assert.equal(f.applied.size, 1);
  assert.equal(f.statements.filter(sql => sql.includes('ADD COLUMN `normalized_email`')).length, 1);
});

test('013 still refuses duplicate accounts before altering columns and keeps checksum protection', async t => {
  const f = fixture(t, { duplicate: true });
  await assert.rejects(runMigrations(f.pool, { directory: f.directory }), /Duplicate normalized account emails/);
  assert.equal(f.columns.size, 0);
  assert.equal(f.applied.size, 0);
  assert.equal(f.issues[0][1], 'duplicate_email');
  const changed = fixture(t);
  changed.applied.set('013', 'wrong-checksum');
  await assert.rejects(runMigrations(changed.pool, { directory: changed.directory }), /Applied migration 013 has changed/);
  assert.equal(changed.columns.size, 0);
});

test('MySQL and MariaDB retain the original 013 generated-column SQL', async t => {
  for (const version of ['8.0.36', '10.4.32-MariaDB']) {
    const f = fixture(t, { version });
    await runMigrations(f.pool, { directory: f.directory });
    assert.match(f.statements.find(sql => sql.includes('ADD COLUMN `normalized_email`')), /NULLIF\(LOWER\(TRIM\(email\)\), ''\)\) STORED$/);
  }
});

// Executes the actual CASE/VIRTUAL DDL on disposable local MariaDB schemas.
// The version shim selects the TiDB path; this is not a live TiDB test.
test('real database: 013 compatibility preserves users and normalized email uniqueness on insert/update', {
  skip: process.env.TEST_LOCAL_MYSQL !== '1',
}, async t => {
  const mysql = require('mysql2/promise');
  const crypto = require('node:crypto');
  const config = { host: '127.0.0.1', user: 'root', password: '', connectionLimit: 2 };
  const admin = await mysql.createConnection(config);
  const database = `san_email_test_${crypto.randomBytes(8).toString('hex')}`;
  let pool;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    pool = mysql.createPool({ ...config, database });
    await pool.query('CREATE TABLE users (id VARCHAR(64) PRIMARY KEY, email VARCHAR(255), password VARCHAR(255)) ENGINE=InnoDB');
    await pool.execute('INSERT INTO users (id, email, password) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)',
      ['existing', '  Existing@Example.test  ', 'unchanged-hash', 'blank', ' ', 'hash2', 'null', null, 'hash3']);
    const [before] = await pool.query('SELECT id, email, password FROM users ORDER BY id');
    const acquire = pool.getConnection.bind(pool);
    // Use a wrapper, not mutation of pooled connection methods across retries.
    const compatiblePool = { getConnection: async () => {
      const db = await acquire();
      return {
        query: (sql, ...args) => sql === 'SELECT VERSION() AS version' ? Promise.resolve([[{ version: '8.0.11-TiDB-v8.5.0' }]]) : db.query(sql, ...args),
        execute: (...args) => db.execute(...args), beginTransaction: () => db.beginTransaction(),
        commit: () => db.commit(), rollback: () => db.rollback(), release: () => db.release(), destroy: () => db.destroy(),
      };
    } };
    const directory = migrationDirectory(t);
    await runMigrations(compatiblePool, { directory });
    await runMigrations(compatiblePool, { directory });
    const [after] = await pool.query('SELECT id, email, password FROM users ORDER BY id');
    assert.deepEqual(after, before);
    const [values] = await pool.query('SELECT id, normalized_email, admin_email_verified_at FROM users ORDER BY id');
    assert.deepEqual(values.map(row => row.normalized_email), [null, 'existing@example.test', null]);
    assert.ok(values.every(row => row.admin_email_verified_at === null));
    await assert.rejects(pool.execute('INSERT INTO users (id, email) VALUES (?, ?)', ['duplicate', 'EXISTING@example.test']), { code: 'ER_DUP_ENTRY' });
    await assert.rejects(pool.execute('UPDATE users SET email = ? WHERE id = ?', [' existing@EXAMPLE.test ', 'blank']), { code: 'ER_DUP_ENTRY' });
    await pool.execute('UPDATE users SET email = ? WHERE id = ?', [' New@Example.test ', 'existing']);
    const [[updated]] = await pool.query("SELECT normalized_email FROM users WHERE id = 'existing'");
    assert.equal(updated.normalized_email, 'new@example.test');
    await pool.execute('INSERT INTO users (id, email) VALUES (?, ?), (?, ?)', ['empty2', '', 'null2', null]);
    const racing = await Promise.allSettled([
      pool.execute('INSERT INTO users (id, email) VALUES (?, ?)', ['race1', 'Race@Example.test']),
      pool.execute('INSERT INTO users (id, email) VALUES (?, ?)', ['race2', ' race@example.test ']),
    ]);
    assert.equal(racing.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(racing.find(result => result.status === 'rejected').reason.code, 'ER_DUP_ENTRY');
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  }
});
