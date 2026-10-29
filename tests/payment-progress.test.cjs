'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { auditFixture } = require('./helpers/audit-fixture.cjs');

function proof(ref, amount) {
  const form = new FormData();
  form.set('billingId', 'stepper-bill');
  form.set('amount', String(amount));
  form.set('refNum', ref);
  form.set('payment_date', '2026-10-20');
  form.set('status', 'approved'); // Residents cannot set the verification result.
  form.set('receipt', new Blob([Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])], { type: 'image/png' }), 'proof.png');
  return form;
}

test('saved transaction lifecycle: pending, rejected, resubmitted, partially approved, then fully paid', async t => {
  const f = await auditFixture(t);
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["resident"]';
  f.pool.tables.billings.push({ id: 'stepper-bill', title: 'Community repair', amount: 100,
    billing_type: 'Other Billing', assignedTo: '["home-1"]', status: 'active' });
  const main = fs.readFileSync(require.resolve('../public/js/main.js'), 'utf8');
  const context = vm.createContext({ toMoneyNumber: value => Number(value || 0) });
  vm.runInContext(main.slice(main.indexOf('function getBillingPaymentSummary('), main.indexOf("if (typeof window !== 'undefined') window.getBillingPaymentSummary")), context);
  async function saved() {
    // A new HTTP read is the same source used at refresh/login, not a local stage.
    const result = await f.request('GET', '/api/data', undefined, 'resident-1');
    assert.equal(result.status, 200);
    const bill = result.body.billings.find(b => b.id === 'stepper-bill');
    return { ...result.body, summary: context.getBillingPaymentSummary(bill, 'home-1', result.body.payments) };
  }
  const invalid = await f.request('POST', '/api/payments/submit', proof('invalid-amount', 101), 'resident-1');
  assert.equal(invalid.status, 400);
  assert.equal((await saved()).payments.length, 0);
  const first = await f.request('POST', '/api/payments/submit', proof('first-proof', 40), 'resident-1');
  assert.equal(first.status, 201, JSON.stringify(first));
  const firstId = first.body.payment.id;
  assert.equal(first.body.payment.status, 'pending');
  assert.equal((await saved()).summary.remainingBalance, 100);
  assert.equal((await f.request('POST', '/api/payments/submit', proof('duplicate-proof', 40), 'resident-1')).status, 400);
  assert.equal((await f.request('POST', `/api/payments/${firstId}/approve`, {}, 'resident-1')).status, 403);
  assert.equal((await f.request('POST', `/api/payments/${firstId}/reject`, { reason: 'Receipt is unreadable' })).status, 200);
  let data = await saved();
  assert.equal(data.payments[0].status, 'rejected');
  assert.equal(data.payments[0].rejection_reason, 'Receipt is unreadable');
  assert.equal(data.summary.totalPaid, 0);
  assert.equal(data.summary.remainingBalance, 100);
  const second = await f.request('POST', '/api/payments/submit', proof('second-proof', 40), 'resident-1');
  assert.equal(second.status, 201, JSON.stringify(second));
  const secondId = second.body.payment.id;
  assert.notEqual(firstId, secondId);
  assert.equal((await f.request('POST', `/api/payments/${secondId}/approve`, {})).status, 200);
  data = await saved();
  assert.equal(data.summary.totalPaid, 40);
  assert.equal(data.summary.remainingBalance, 60);
  assert.equal(data.summary.status, 'partially_paid');
  assert.equal(data.payments.find(p => p.id === firstId).status, 'rejected');
  assert.equal(data.payments.find(p => p.id === secondId).status, 'approved');
  const third = await f.request('POST', '/api/payments/submit', proof('remaining-proof', 60), 'resident-1');
  assert.equal(third.status, 201);
  assert.equal((await saved()).summary.remainingBalance, 60);
  assert.equal((await f.request('POST', `/api/payments/${third.body.payment.id}/approve`, {})).status, 200);
  data = await saved();
  assert.equal(data.summary.remainingBalance, 0);
  assert.equal(data.summary.status, 'paid');
  assert.equal((await f.request('POST', '/api/payments/submit', proof('overpaid-proof', 1), 'resident-1')).status, 400);
  assert.ok(f.pool.tables.notifications.length > 0, 'existing notification workflow still runs');
});
