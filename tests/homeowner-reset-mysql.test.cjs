'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { runMigrations } = require('../src/db/migrationRunner');
const reset = require('../migrations/020_reset_homeowner_accounts_and_balances');

test('real MySQL reset is atomic, preserves officers and history, remains zero on rerun, and permits new registration and charges', {
  skip: process.env.TEST_LOCAL_MYSQL !== '1',
}, async () => {
  const config = { host: '127.0.0.1', user: 'root', password: '' };
  const admin = await mysql.createConnection(config);
  const schema = `san_reset_test_${crypto.randomBytes(8).toString('hex')}`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'san-reset-test-'));
  let pool, created = false;
  try {
    await admin.query(`CREATE DATABASE \`${schema}\``); created = true;
    pool = mysql.createPool({ ...config, database: schema, connectionLimit: 2 });
    await pool.query(`CREATE TABLE users (id VARCHAR(64) PRIMARY KEY, role VARCHAR(64), permissions TEXT,
      homeowner_id VARCHAR(64) UNIQUE, username VARCHAR(255) UNIQUE, email VARCHAR(255) UNIQUE,
      password TEXT, reset_token_hash TEXT, reset_token_expires_at DATETIME(3), status VARCHAR(32),
      archived_at DATETIME(3), balance DECIMAL(12,2))`);
    await pool.query(`CREATE TABLE homeowners (id VARCHAR(64) PRIMARY KEY, name TEXT, balance DECIMAL(12,2),
      archived_at DATETIME(3), updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3))`);
    await pool.query(`CREATE TABLE billings (id VARCHAR(64) PRIMARY KEY, title TEXT, amount DECIMAL(12,2),
      status VARCHAR(32), archived_at DATETIME(3), updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3))`);
    await pool.query(`CREATE TABLE billing_assignments (billing_assignment_id INT PRIMARY KEY,
      billing_id VARCHAR(64), homeowner_id VARCHAR(64), assigned_amount DECIMAL(12,2), status VARCHAR(32),
      monthly_dues_month VARCHAR(7), updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY homeowner_month (homeowner_id, monthly_dues_month))`);
    await pool.query(`CREATE TABLE payments (id VARCHAR(64) PRIMARY KEY, homeownerId VARCHAR(64), billingId VARCHAR(64),
      amount DECIMAL(12,2), status VARCHAR(32), archived_at DATETIME(3), voided_at DATETIME(3))`);
    await pool.query(`CREATE TABLE auditLog (id VARCHAR(64) PRIMARY KEY, action TEXT, timestamp TEXT,
      actor_name TEXT, actor_role VARCHAR(64), action_type VARCHAR(64), entity_type VARCHAR(64), entity_id VARCHAR(64),
      new_values JSON, created_at DATETIME(3))`);
    await require('../migrations/007_create_balance_view_and_guards').up(pool, { addIndex: async () => {} });
    await pool.query("INSERT INTO homeowners (id,name,balance) VALUES ('h1','Resident profile',500),('h2','Officer profile',600),('h3','No account',300)");
    await pool.query(`INSERT INTO users (id, role, permissions, homeowner_id, username, email, password, status, balance)
      VALUES ('resident','homeowner','["resident"]','h1','old','old@example.test','old-secret','active',500),
      ('officer','homeowner','["resident","billing"]','h2','officer','officer@example.test','officer-secret','active',600),
      ('admin','admin','["*"]',NULL,'admin','admin@example.test','admin-secret','active',0)`);
    await pool.query("INSERT INTO billings (id,title,amount,status) VALUES ('old','Previous charge',500,'active')");
    await pool.query("INSERT INTO billing_assignments (billing_assignment_id,billing_id,homeowner_id,assigned_amount,status,monthly_dues_month) VALUES (1,'old','h1',500,'active','2026-10'),(2,'old','h2',500,'active','2026-10')");
    await pool.query("INSERT INTO payments (id,homeownerId,billingId,amount,status) VALUES ('paid','h1','old',100,'approved'),('pending','h1','old',200,'pending'),('rejected','h2','old',50,'rejected')");
    const paymentsBefore = (await pool.query('SELECT * FROM payments ORDER BY id'))[0];
    fs.copyFileSync(path.join(__dirname, '../migrations/019_homeowner_reset_audit_schema.js'), path.join(directory, '019_homeowner_reset_audit_schema.js'));
    await runMigrations(pool, { directory });
    const protectedBefore = (await pool.query("SELECT * FROM users WHERE id IN ('admin','officer') ORDER BY id"))[0];
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await assert.rejects(reset.up({
        execute: (...args) => connection.execute(...args),
        query: (sql, ...args) => sql.includes("SELECT 'homeowners'") ? Promise.reject(new Error('injected reset failure')) : connection.query(sql, ...args),
      }), /injected reset failure/);
      await connection.rollback();
    } finally { connection.release(); }
    assert.equal((await pool.query("SELECT status FROM users WHERE id = 'resident'"))[0][0].status, 'active');
    assert.equal((await pool.query('SELECT COUNT(*) count FROM homeowner_reset_audit'))[0][0].count, 0);
    fs.copyFileSync(path.join(__dirname, '../migrations/020_reset_homeowner_accounts_and_balances.js'), path.join(directory, '020_reset_homeowner_accounts_and_balances.js'));
    await runMigrations(pool, { directory });
    assert.deepEqual((await pool.query("SELECT * FROM users WHERE id IN ('admin','officer') ORDER BY id"))[0], protectedBefore);
    assert.deepEqual((await pool.query('SELECT * FROM payments ORDER BY id'))[0], paymentsBefore);
    assert.equal((await pool.query('SELECT COUNT(*) count FROM homeowners'))[0][0].count, 3);
    assert.equal((await pool.query('SELECT COUNT(*) count FROM homeowner_financial_summary WHERE remaining_balance <> 0'))[0][0].count, 0);
    const old = (await pool.query("SELECT * FROM users WHERE id = 'resident'"))[0][0];
    assert.equal(old.password, null); assert.equal(old.homeowner_id, null); assert.equal(old.historical_homeowner_id, 'h1');
    assert.ok(old.archived_at); assert.equal(old.status, 'inactive');
    await assert.rejects(pool.query("INSERT INTO billing_assignments (billing_assignment_id,homeowner_id,monthly_dues_month) VALUES (3,'h1','2026-10')"), { code: 'ER_DUP_ENTRY' });
    await pool.query("INSERT INTO users (id,role,permissions,homeowner_id,email,status) VALUES ('new','homeowner','[\"resident\"]','h1','old@example.test','active')");
    await pool.query("INSERT INTO billings (id,title,amount,status) VALUES ('new-bill','New charge',75,'active')");
    await pool.query("INSERT INTO billing_assignments (billing_assignment_id,billing_id,homeowner_id,assigned_amount,status,monthly_dues_month) VALUES (3,'new-bill','h1',75,'active','2026-12')");
    await runMigrations(pool, { directory });
    assert.equal(Number((await pool.query("SELECT remaining_balance FROM homeowner_financial_summary WHERE homeowner_id='h1'"))[0][0].remaining_balance), 75);
    assert.equal((await pool.query("SELECT status FROM users WHERE id='new'"))[0][0].status, 'active');
    assert.equal((await pool.query('SELECT COUNT(*) count FROM auditLog'))[0][0].count, 1);
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE \`${schema}\``);
    await admin.end();
    for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
    fs.rmdirSync(directory);
  }
});
