'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const migration = require('../migrations/025_billing_categories');

test('real MySQL category migration preserves every original column, relationship and financial record on retries', {
  skip: process.env.TEST_LOCAL_MYSQL !== '1',
}, async () => {
  // Use only a random disposable local schema, never application configuration.
  const db = await mysql.createConnection({ host: '127.0.0.1', user: 'root', password: '', dateStrings: true });
  const schema = `san_billing_category_test_${crypto.randomBytes(8).toString('hex')}`;
  let created = false;
  try {
    await db.query(`CREATE DATABASE \`${schema}\``); created = true;
    await db.query(`USE \`${schema}\``);
    await db.query(`CREATE TABLE billings (id VARCHAR(64) PRIMARY KEY, title TEXT, amount DECIMAL(12,2),
      billing_type VARCHAR(64), monthly_dues_month VARCHAR(7), vehicle_registration_id VARCHAR(64),
      amenity_booking_id VARCHAR(64), status VARCHAR(32), assignedTo TEXT, dueDate DATE, archived_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
    await db.query(`CREATE TABLE payments (id INT PRIMARY KEY, billingId VARCHAR(64), amount DECIMAL(12,2), status VARCHAR(32),
      FOREIGN KEY (billingId) REFERENCES billings(id))`);
    await db.query(`CREATE TABLE billing_assignments (billing_id VARCHAR(64), homeowner_id VARCHAR(64), assigned_amount DECIMAL(12,2),
      FOREIGN KEY (billing_id) REFERENCES billings(id))`);
    const cases = [
      ['monthly', 'Monthly Association Dues', '2026-11', null, null, 'monthly_dues'],
      ['legacy-month', null, '2026-11', null, null, 'monthly_dues'],
      ['vehicle', 'Other Billing', null, 'v1', null, 'vehicle_fees'],
      ['amenity', 'Other Billing', null, null, 'a1', 'amenity_fees'],
      ['manual', 'Other Billing', null, null, null, 'other_charges'],
      ['ambiguous', 'Other Billing', '2026-11', null, null, 'other_charges'],
    ];
    for (const [id, type, month, vehicle, amenity] of cases) {
      await db.execute(`INSERT INTO billings VALUES (?, 'Vehicle sticker / monthly dues', 229.50, ?, ?, ?, ?,
        'active', '["h1"]', '2026-11-30', ?, '2000-01-01')`, [id, type, month, vehicle, amenity, id === 'ambiguous' ? '2026-01-01' : null]);
      await db.execute('INSERT INTO billing_assignments VALUES (?, ?, ?)', [id, 'h1', 229.50]);
    }
    await db.query("INSERT INTO payments VALUES (1, 'monthly', 100.25, 'approved'), (2, 'monthly', 129.25, 'pending')");
    const [before] = await db.query('SELECT * FROM billings ORDER BY id');
    const [payments] = await db.query('SELECT * FROM payments ORDER BY id');
    const [assignments] = await db.query('SELECT * FROM billing_assignments ORDER BY billing_id');
    // Exercise the migration against the engine; mimic idempotent migration helpers.
    const helpers = {
      async addColumn(connection, table, column, definition) {
        const [rows] = await connection.query('SHOW COLUMNS FROM billings LIKE ?', [column]);
        if (!rows.length) await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      },
      async addIndex(connection, table, name, columns) {
        const [rows] = await connection.query('SHOW INDEX FROM billings WHERE Key_name = ?', [name]);
        if (!rows.length) await connection.query(`ALTER TABLE \`${table}\` ADD INDEX \`${name}\` (${columns})`);
      },
    };
    await migration.up(db, helpers);
    await migration.up(db, helpers);
    const [after] = await db.query('SELECT * FROM billings ORDER BY id');
    assert.deepEqual(after.map(({ billing_category, ...row }) => row), before);
    for (const [id, , , , , category] of cases) assert.equal(after.find(b => b.id === id).billing_category, category);
    assert.deepEqual((await db.query('SELECT * FROM payments ORDER BY id'))[0], payments);
    assert.deepEqual((await db.query('SELECT * FROM billing_assignments ORDER BY billing_id'))[0], assignments);
    await db.query("UPDATE billings SET billing_category = 'vehicle_fees' WHERE id = 'manual'");
    await migration.up(db, helpers);
    assert.equal((await db.query("SELECT billing_category FROM billings WHERE id = 'manual'"))[0][0].billing_category, 'vehicle_fees');
  } finally {
    if (created) await db.query(`DROP DATABASE \`${schema}\``);
    await db.end();
  }
});
