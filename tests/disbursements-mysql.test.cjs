'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { up } = require('../migrations/017_create_disbursements');
const { presentDisbursement } = require('../src/services/disbursementService');

test('real MySQL: migration retry, DECIMAL persistence, date serialization and soft void', { skip: process.env.TEST_LOCAL_MYSQL !== '1' }, async () => {
  // Never loads .env or uses the application database. Only this random test schema is dropped.
  const config = { host: '127.0.0.1', user: 'root', password: '' };
  const admin = await mysql.createConnection(config);
  const schema = 'san_disbursement_test_' + crypto.randomBytes(8).toString('hex');
  let db, created = false;
  try {
    await admin.query(`CREATE DATABASE \`${schema}\``); created = true;
    db = await mysql.createConnection({ ...config, database: schema });
    await up(db); await up(db);
    await db.execute('INSERT INTO disbursements (id, expense_category, transaction_date, amount, created_by) VALUES (?, ?, ?, ?, ?)', ['d1', 'Gasoline', '2026-10-31', '1500.10', 'test-admin']);
    await db.end();
    db = await mysql.createConnection({ ...config, database: schema });
    const [[record]] = await db.query('SELECT * FROM disbursements');
    assert.equal(record.amount, '1500.10');
    assert.equal(presentDisbursement(record).transaction_date, '2026-10-31');
    assert.ok(record.created_at); assert.ok(record.updated_at);
    await db.execute('UPDATE disbursements SET amount = ? WHERE id = ?', ['1600.20', 'd1']);
    const [[updated]] = await db.query('SELECT SUM(amount) AS total FROM disbursements WHERE voided_at IS NULL');
    assert.equal(updated.total, '1600.20');
    await db.execute('UPDATE disbursements SET voided_at = CURRENT_TIMESTAMP(3), voided_by = ? WHERE id = ?', ['test-admin', 'd1']);
    assert.equal((await db.query('SELECT * FROM disbursements WHERE voided_at IS NULL'))[0].length, 0);
    const [[voided]] = await db.query('SELECT * FROM disbursements');
    assert.equal(voided.voided_by, 'test-admin'); assert.equal(voided.amount, '1600.20');
    await assert.rejects(db.execute('INSERT INTO disbursements (id, expense_category, transaction_date, amount, created_by) VALUES (?, ?, ?, ?, ?)', ['bad', 'Payroll', '2026-10-31', '-1.00', 'test-admin']));
  } finally {
    if (db) await db.end();
    if (created) await admin.query(`DROP DATABASE \`${schema}\``);
    await admin.end();
  }
});
