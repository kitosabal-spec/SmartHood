'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { auditFixture } = require('./helpers/audit-fixture.cjs');
const { fixture, password } = require('./helpers/auth-fixture.cjs');

test('payment and complaint responses commit durable jobs without invoking slow SMTP', async t => {
  let calls = 0;
  const f = await auditFixture(t, { deliver() { calls++; return new Promise(() => {}); } });
  const rows = f.pool.tables;
  rows.billings.push({ id: 'bill-1', title: 'Test bill', amount: 100, assignedTo: '["home-1"]', status: 'active' });
  const result = await f.request('POST', '/api/payments/manual', {
    homeownerId: 'home-1', billingId: 'bill-1', amount: 50, payment_method: 'Cash', payment_date: '2026-10-22',
  });
  assert.equal(result.status, 201, JSON.stringify(result));
  assert.equal(rows.email_outbox.length, 1);
  assert.equal(result.body.billingSummary.remainingBalance, 50);
  rows.complaints.push({ id: 'case-1', homeownerId: 'home-1', status: 'Reviewed' });
  assert.equal((await f.request('PUT', '/api/complaints/case-1', { status: 'Resolved' })).status, 200);
  assert.equal(rows.email_outbox.length, 2);
  assert.equal(calls, 0);
  const before = structuredClone(rows.email_outbox);
  f.pool.failAudit = true;
  assert.equal((await f.request('PUT', '/api/complaints/case-1', { status: 'Rejected' })).status, 500);
  assert.equal(rows.complaints[0].status, 'Resolved');
  assert.deepEqual(rows.email_outbox, before);
});

test('outbox storage failure rolls back financial records and audit entries', async t => {
  const f = await auditFixture(t, { queueFail: true });
  const rows = f.pool.tables;
  rows.billings.push({ id: 'bill-1', title: 'Test bill', amount: 100, assignedTo: '["home-1"]', status: 'active' });
  const result = await f.request('POST', '/api/payments/manual', {
    homeownerId: 'home-1', billingId: 'bill-1', amount: 50, payment_method: 'Cash', payment_date: '2026-10-22',
  });
  assert.equal(result.status, 500);
  assert.equal(rows.payments.length, 0);
  assert.equal(rows.auditLog.length, 0);
  assert.equal(rows.billings[0].status, 'active');
  assert.equal(rows.email_outbox.length, 0);
});

test('authentication requests commit guarded jobs without waiting for SMTP', async t => {
  let calls = 0;
  const f = await fixture(t, { deliver() { calls++; throw Error('SMTP unavailable'); } });
  assert.equal((await f.request('/api/forgot-password', { email: 'resident@example.test' })).status, 200);
  assert.equal(f.pool.outbox.length, 1);
  assert.ok(f.pool.users.find(u => u.id === 'resident-1').reset_token_hash);
  const login = await f.login('registered-admin@example.test', password);
  const response = await f.request('/api/admin-email/request', { email: 'verified@example.test', currentPassword: password },
    undefined, { Cookie: login.headers.get('set-cookie').split(';')[0] });
  assert.equal(response.status, 200);
  assert.equal(f.pool.outbox.length, 2);
  assert.equal(calls, 0);
  assert.match(response.body.message, /queued/);
});

test('reset queue failure preserves generic response and rolls back token changes', async t => {
  const f = await fixture(t, { queueFail: true });
  const account = f.pool.users.find(u => u.id === 'resident-1');
  const before = account.reset_token_hash;
  const known = await f.request('/api/forgot-password', { email: 'resident@example.test' });
  const unknown = await f.request('/api/forgot-password', { email: 'unknown@example.test' });
  assert.equal(known.status, 200);
  assert.deepEqual(known.body, unknown.body);
  assert.equal(f.pool.users.find(u => u.id === 'resident-1').reset_token_hash, before);
  assert.equal(f.pool.outbox.length, 0);
});
