'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { auditFixture } = require('./helpers/audit-fixture.cjs');
const { DB_CONFIG } = require('../src/config/environment');

test('real MySQL payment categories, partial/manual balances and concurrent review transitions', {
  skip: process.env.PAYMENT_MYSQL_INTEGRATION !== '1', timeout: 60000,
}, async () => {
  // Copy schema only; all writes and cleanup target a unique disposable database.
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(DB_CONFIG.host), 'Use a local test database server');
  const name = `san_payment_review_test_${crypto.randomBytes(8).toString('hex')}`;
  assert.match(name, /^san_payment_review_test_[a-f0-9]{16}$/);
  const control = await mysql.createConnection(DB_CONFIG);
  const cleanups = [];
  let pool, created = false;
  try {
    await control.query(`CREATE DATABASE ${mysql.escapeId(name)}`);
    created = true;
    const [schema] = await control.query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
    for (const row of schema) {
      const table = Object.values(row)[0];
      await control.query(`CREATE TABLE ${mysql.escapeId(name)}.${mysql.escapeId(table)} LIKE ${mysql.escapeId(DB_CONFIG.database)}.${mysql.escapeId(table)}`);
    }
    pool = mysql.createPool({ ...DB_CONFIG, database: name, connectionLimit: 5 });
    // CREATE TABLE LIKE omits views; recreate the existing financial view in the test schema.
    await require('../migrations/007_create_balance_view_and_guards').up(pool, { addIndex: async () => {} });
    await pool.execute("INSERT INTO homeowners (id, name, lotArea) VALUES ('home-1', 'Test Resident', 100)");
    await pool.execute(`INSERT INTO users (id, role, name, status, email, admin_email_verified_at, permissions)
      VALUES ('admin-1', 'admin', 'Test Admin', 'active', 'admin@example.test', NOW(), '["*"]')`);
    await pool.execute(`INSERT INTO users (id, role, name, status, homeowner_id, permissions)
      VALUES ('resident-1', 'homeowner', 'Test Resident', 'active', 'home-1', '["resident"]')`);
    for (const category of ['monthly_dues', 'vehicle_fees', 'amenity_fees', 'other_charges']) {
      await pool.execute(`INSERT INTO billings (id, title, amount, assignedTo, status, billing_type, billing_category, monthly_dues_month)
        VALUES (?, ?, 100, '["home-1"]', 'active', ?, ?, ?)`,
      [category, category, category === 'monthly_dues' ? 'Monthly Association Dues' : 'Other Billing', category, category === 'monthly_dues' ? '2026-11' : null]);
      await pool.execute("INSERT INTO billing_assignments (billing_id, homeowner_id, assigned_amount, status) VALUES (?, 'home-1', 100, 'active')", [category]);
    }
    const f = await auditFixture({ after: fn => cleanups.push(fn) }, { pool });
    const manualBody = { homeownerId: 'home-1', billingId: 'vehicle_fees', amount: 30, payment_method: 'Cash', payment_date: '2026-11-01', refNum: 'CASH-1' };
    const manual = await f.request('POST', '/api/payments/manual', manualBody);
    assert.equal(manual.status, 201, JSON.stringify(manual));
    assert.equal(manual.body.billingSummary.remainingBalance, 70);
    await pool.execute("INSERT INTO payments (id, homeownerId, billingId, amount, status) VALUES ('pending', 'home-1', 'vehicle_fees', 40, 'pending')");
    assert.equal((await f.request('POST', '/api/payments/pending/approve', {}, 'resident-1')).status, 403);
    const approvals = await Promise.all([f.request('POST', '/api/payments/pending/approve', {}), f.request('POST', '/api/payments/pending/approve', {})]);
    assert.deepEqual(approvals.map(r => r.status).sort(), [200, 400]);
    assert.equal(approvals.find(r => r.status === 200).body.billingSummary.remainingBalance, 30);
    assert.equal((await f.request('POST', '/api/payments/pending/reject', { reason: 'Invalid transition' })).status, 400);
    assert.equal((await f.request('POST', '/api/payments/manual', { ...manualBody, amount: 31, refNum: 'OVER' })).status, 400);
    const final = await f.request('POST', '/api/payments/manual', { ...manualBody, refNum: 'CASH-2' });
    assert.equal(final.status, 201, JSON.stringify(final));
    assert.equal(final.body.billingSummary.remainingBalance, 0);
    assert.equal(final.body.billingSummary.status, 'paid');
    await pool.execute("INSERT INTO payments (id, homeownerId, billingId, amount, status) VALUES ('race', 'home-1', 'amenity_fees', 20, 'pending')");
    assert.equal((await f.request('POST', '/api/payments/race/reject', { reason: ' ' })).status, 400);
    const reviews = await Promise.all([f.request('POST', '/api/payments/race/approve', {}), f.request('POST', '/api/payments/race/reject', { reason: 'Unreadable proof' })]);
    assert.deepEqual(reviews.map(r => r.status).sort(), [200, 400]);
    await pool.execute("INSERT INTO payments (id, homeownerId, billingId, amount, status) VALUES ('reject', 'home-1', 'other_charges', 25, 'pending')");
    assert.equal((await f.request('POST', '/api/payments/reject/reject', { reason: 'Unreadable proof' })).status, 200);
    await pool.execute("INSERT INTO payments (id, homeownerId, amount, status, monthly_dues_month) VALUES ('advance', 'home-1', 229, 'pending', '2026-12')");
    await pool.execute("UPDATE billings SET archived_at = NOW(), balance_reset_at = NOW() WHERE id = 'other_charges'");
    const response = await f.request('GET', '/api/data');
    assert.equal(response.status, 200, JSON.stringify({ response, errors: f.errors.map(args => args.map(arg => arg?.message || String(arg))) }));
    const payments = response.body.payments;
    assert.equal(payments.find(p => p.id === 'pending').billing_category, 'vehicle_fees');
    assert.equal(payments.find(p => p.id === 'race').billing_category, 'amenity_fees');
    assert.equal(payments.find(p => p.id === 'reject').billing_category, 'other_charges');
    assert.ok(payments.find(p => p.id === 'reject').billing_archived_at);
    assert.equal(payments.find(p => p.id === 'reject').rejection_reason, 'Unreadable proof');
    assert.equal(payments.find(p => p.id === 'advance').billing_category, 'monthly_dues');
    assert.equal(payments.filter(p => p.billingId === 'vehicle_fees' && p.status === 'approved').reduce((sum, p) => sum + Number(p.amount), 0), 100);
    const [[balance]] = await pool.execute("SELECT remaining_balance FROM homeowner_financial_summary WHERE homeowner_id = 'home-1'");
    assert.equal(Number(balance.remaining_balance), payments.find(p => p.id === 'race').status === 'approved' ? 180 : 200);
    const [audits] = await pool.execute("SELECT COUNT(*) AS total FROM auditLog WHERE entity_type = 'payments'");
    assert.equal(Number(audits[0].total), 5, 'no duplicate financial audit events');
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup();
    if (pool) await pool.end();
    if (created) await control.query(`DROP DATABASE ${mysql.escapeId(name)}`);
    await control.end();
  }
});
