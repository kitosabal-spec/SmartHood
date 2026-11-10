'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { auditFixture } = require('./helpers/audit-fixture.cjs');

test('payment history inherits canonical billing categories including archived bills and advance dues without changing records', async t => {
  const f = await auditFixture(t);
  const rows = f.pool.tables;
  const bills = [
    { id: 'monthly', billing_type: 'Monthly Association Dues', billing_category: 'other_charges', monthly_dues_month: '2026-11' },
    { id: 'vehicle', vehicle_registration_id: 'v1', billing_category: 'other_charges' },
    { id: 'amenity', amenity_booking_id: 'a1' },
    { id: 'manual-category', billing_category: 'vehicle_fees' },
    { id: 'archived', billing_category: 'amenity_fees', archived_at: '2026-10-01', balance_reset_at: '2026-10-01' },
    { id: 'other', title: 'Vehicle monthly dues words do not define category', billing_type: 'Other Billing' },
  ];
  rows.billings.push(...bills.map(b => ({ title: b.id, amount: 100, assignedTo: '["home-1"]', ...b })));
  rows.payments.push(...bills.map((b, i) => ({ id: `p-${b.id}`, billingId: b.id, homeownerId: 'home-1', amount: 20,
    status: i % 2 ? 'approved' : 'pending', payment_source: i % 2 ? 'manual_admin' : 'resident_submission' })),
  { id: 'advance', billingId: null, homeownerId: 'home-1', monthly_dues_month: '2026-12', amount: 229, status: 'pending' });
  const before = structuredClone({ billings: rows.billings, payments: rows.payments });
  const response = await f.request('GET', '/api/data');
  assert.equal(response.status, 200);
  const payments = response.body.payments;
  assert.deepEqual(payments.map(p => p.billing_category), ['monthly_dues', 'vehicle_fees', 'amenity_fees', 'vehicle_fees', 'amenity_fees', 'other_charges', 'monthly_dues']);
  const browser = vm.createContext({ db: { getOne: (_, id) => response.body.billings.find(b => b.id === id) } });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/billing.js'), 'utf8'), browser);
  for (const payment of payments) assert.equal(browser.getPaymentCategory(payment), payment.billing_category);
  assert.equal(browser.canReviewPendingPayment(payments.find(p => p.id === 'p-archived')), false);
  assert.deepEqual({ billings: rows.billings, payments: rows.payments }, before);
});

test('categorized manual and reviewed partial payments retain balances, validation, notifications and audit history', async t => {
  const f = await auditFixture(t);
  const rows = f.pool.tables;
  rows.billings.push({ id: 'vehicle', title: 'Vehicle registration', billing_category: 'vehicle_fees', amount: 100,
    assignedTo: '["home-1"]', status: 'active', billing_type: 'Other Billing' });
  const body = { homeownerId: 'home-1', billingId: 'vehicle', amount: 30, payment_method: 'Cash', payment_date: '2026-11-01', refNum: 'CASH-1' };
  assert.equal((await f.request('POST', '/api/payments/manual', body, 'resident-1')).status, 403);
  const manual = await f.request('POST', '/api/payments/manual', body);
  assert.equal(manual.status, 201, JSON.stringify(manual));
  assert.equal(manual.body.billingSummary.remainingBalance, 70);
  rows.payments.push({ id: 'pending', billingId: 'vehicle', homeownerId: 'home-1', amount: 40, status: 'pending' });
  assert.equal((await f.request('POST', '/api/payments/manual', { ...body, refNum: 'CASH-2' })).status, 409);
  assert.equal((await f.request('POST', '/api/payments/pending/reject', { reason: '   ' })).status, 400);
  assert.equal((await f.request('POST', '/api/payments/pending/reject', { reason: 'Unreadable proof' })).status, 200);
  assert.equal((await f.request('POST', '/api/payments/pending/approve', {})).status, 400);
  assert.equal((await f.request('POST', '/api/payments/pending/reject', { reason: 'Again' })).status, 400);
  rows.payments.push({ id: 'replacement', billingId: 'vehicle', homeownerId: 'home-1', amount: 40, status: 'pending' });
  const approved = await f.request('POST', '/api/payments/replacement/approve', {});
  assert.equal(approved.status, 200, JSON.stringify(approved));
  assert.equal(approved.body.billingSummary.totalPaid, 70);
  assert.equal(approved.body.billingSummary.remainingBalance, 30);
  assert.equal((await f.request('POST', '/api/payments/replacement/approve', {})).status, 400);
  assert.equal((await f.request('POST', '/api/payments/replacement/reject', { reason: 'Invalid transition' })).status, 400);
  assert.equal((await f.request('POST', '/api/payments/manual', { ...body, amount: 31, refNum: 'TOO-MUCH' })).status, 400);
  const final = await f.request('POST', '/api/payments/manual', { ...body, refNum: 'CASH-FINAL' });
  assert.equal(final.status, 201, JSON.stringify(final));
  assert.equal(final.body.billingSummary.remainingBalance, 0);
  assert.equal(final.body.billingSummary.totalPaid, 100);
  assert.equal(final.body.billingSummary.status, 'paid');
  const data = (await f.request('GET', '/api/data')).body;
  assert.ok(data.payments.every(p => p.billing_category === 'vehicle_fees'));
  assert.equal(data.payments.find(p => p.id === 'pending').rejection_reason, 'Unreadable proof');
  assert.equal(rows.auditLog.length, 4, 'only successful financial mutations are audited');
  assert.ok(rows.notifications.length >= 4);
});
