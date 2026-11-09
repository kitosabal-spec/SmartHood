'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { auditFixture } = require('./helpers/audit-fixture.cjs');
const { inferBillingCategory } = require('../src/utils/billingCategory');

function browser(records = [], payments = []) {
  const elements = {};
  const context = {
    document: { getElementById: id => elements[id] ||= { value: '', innerHTML: '', style: {} } },
    db: { get: table => table === 'billings' ? records : table === 'payments' ? payments : [],
      getOne: (table, id) => records.find(b => b.id === id) },
    getHomeowners: () => [{ id: 'h1', name: 'Alex Example' }, { id: 'h2', name: 'Robin Example' }],
    canManageBilling: () => true, syncHomeownerBalances() {},
    toMoneyNumber: value => Number(value || 0),
    renderPaginationComponent: options => { context.pagination = options; },
  };
  vm.createContext(context);
  const main = fs.readFileSync(require.resolve('../public/js/main.js'), 'utf8');
  vm.runInContext(main.slice(main.indexOf('function getBillingPaymentSummary('), main.indexOf('function getBillingCollectionStatus(')), context);
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/billing.js'), 'utf8'), context);
  return { context, elements };
}
function bill(changes = {}) {
  return { id: 'bill-1', title: 'Gate repair', amount: 100, assignedTo: ['h1'], status: 'active',
    billing_type: 'Other Billing', dueDate: null, ...changes };
}
function payment(changes = {}) {
  return { id: 'p1', billingId: 'bill-1', homeownerId: 'h1', amount: 100, status: 'approved', ...changes };
}

test('browser and server categorize structured records identically without guessing from titles or changing data', () => {
  const { context } = browser();
  const cases = [
    [bill(), 'other_charges'], [bill({ title: 'Vehicle sticker' }), 'other_charges'],
    [bill({ title: 'Court reservation', monthly_dues_month: '2026-01' }), 'other_charges'],
    [bill({ billing_type: null, monthly_dues_month: '2026-01' }), 'monthly_dues'],
    [bill({ billing_type: 'Monthly Association Dues', billing_category: 'other_charges' }), 'monthly_dues'],
    [bill({ vehicle_registration_id: 'v1', billing_category: 'other_charges' }), 'vehicle_fees'],
    [bill({ amenity_booking_id: 'a1', billing_category: 'vehicle_fees' }), 'amenity_fees'],
    [bill({ billing_category: 'vehicle_fees' }), 'vehicle_fees'],
    [bill({ billing_category: '__proto__' }), 'other_charges'],
  ];
  for (const [record, expected] of cases) {
    const before = JSON.stringify(record);
    assert.equal(inferBillingCategory(record), expected);
    assert.equal(context.getBillingCategory(record), expected);
    assert.equal(JSON.stringify(record), before);
  }
});

test('admin states use approved cents per homeowner; pending, rejected, void and unrelated payments never settle a bill', () => {
  const { context } = browser();
  const state = (record, payments) => context.getAdminBillingState(record, payments);
  assert.equal(state(bill({ status: 'paid' }), []).status, 'unpaid', 'stale persisted status is not proof of payment');
  assert.equal(state(bill(), [payment()]).status, 'paid');
  assert.equal(state(bill(), [payment({ amount: 33.33 }), payment({ amount: 33.33 }), payment({ amount: 33.34 })]).remaining, 0);
  const partial = state(bill(), [payment({ amount: 20 }), payment({ amount: 80, status: 'pending' })]);
  assert.equal(partial.status, 'pending');
  assert.equal(partial.remaining, 80);
  assert.equal(partial.partial, true);
  assert.equal(state(bill(), [payment({ status: 'rejected' })]).status, 'unpaid');
  assert.equal(state(bill(), [payment({ voided_at: '2026-01-01' }), payment({ archived_at: '2026-01-01' }), payment({ homeownerId: 'foreign' })]).remaining, 100);
  assert.equal(state(bill({ assignedTo: ['h1', 'h2'] }), [payment({ amount: 200 })]).status, 'partially_paid', 'overpayment cannot settle another homeowner');
  const overdue = state(bill({ dueDate: '2000-01-01' }), [payment({ amount: 20 })]);
  assert.equal(overdue.status, 'overdue');
  assert.equal(overdue.partial, true);
  assert.equal(state(bill({ dueDate: '2000-01-01' }), [payment()]).status, 'paid');
  assert.equal(state(bill({ status: 'inactive' }), []).status, 'inactive');
  assert.equal(state(bill({ balance_reset_at: '2026-01-01' }), []).status, 'cleared');
});

test('categories compose with search, dates, statuses and pagination; counts represent the full filtered result', () => {
  const records = Array.from({ length: 13 }, (_, i) => bill({ id: `v${i}`, title: `Sticker ${i}`,
    billing_category: 'vehicle_fees', createdAt: '2026-11-01' }));
  records.push(bill({ id: 'monthly', billing_type: 'Monthly Association Dues', monthly_dues_month: '2026-11', assignedTo: ['h1', 'h2'] }),
    bill({ id: 'amenity', amenity_booking_id: 'a1' }), bill());
  const { context: c, elements: e } = browser(records, [payment({ billingId: 'v0' }), payment({ billingId: 'v1', status: 'pending' })]);
  c.renderBilling();
  c.selectBillingCategory('vehicle_fees');
  assert.equal(c.pagination.totalItems, 13);
  c.changeBillingPage(2);
  assert.equal(c.pagination.currentPage, 2);
  assert.equal((e.billTableBody.innerHTML.match(/<tr/g) || []).length, 3);
  assert.match(e.billingSummary.innerHTML, /<strong>13<\/strong>/);
  assert.match(e.billTableBody.innerHTML, /Alex Example/);
  e.billSearch.value = 'Alex';
  e.billStatusFilter.value = 'pending';
  e.billDateFilter.value = 'range';
  e.billStartDate.value = '2026-11-01'; e.billEndDate.value = '2026-11-30';
  c.filterBillings();
  assert.equal(c.pagination.currentPage, 1);
  assert.equal(c.pagination.totalItems, 1);
  assert.match(e.billTableBody.innerHTML, /Pending Verification/);
  c.selectBillingCategory('amenity_fees');
  assert.equal(c.pagination.totalItems, 0);
  assert.match(e.billTableBody.innerHTML, /No billings found/);
  c.resetBillingFilters();
  assert.equal(c.pagination.totalItems, 1, 'reset keeps selected category');
  c.selectBillingCategory('monthly_dues');
  assert.equal(e.billingDuesTools.hidden, false);
  assert.match(e.billTableBody.innerHTML, /2 homeowners/);
  c.selectBillingCategory('all');
  assert.equal(e.billingDuesTools.hidden, true);
  assert.equal(c.pagination.totalItems, 16);
});

test('manual category CRUD preserves billing type, relationships, money and notifications, with server validation and audit', async t => {
  const f = await auditFixture(t);
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["resident"]';
  for (const category of ['vehicle_fees', 'amenity_fees', 'other_charges']) {
    const result = await f.request('POST', '/api/billings', bill({ id: category, assignedTo: ['home-1'],
      amount: 229.50, billing_category: category, noDueDate: true }));
    assert.equal(result.status, 201, JSON.stringify(result));
    const saved = f.pool.tables.billings.find(b => b.id === category);
    assert.equal(saved.billing_category, category);
    assert.equal(saved.billing_type, 'Other Billing');
    assert.equal(saved.amount, 229.50);
    assert.ok(!saved.vehicle_registration_id && !saved.amenity_booking_id);
    assert.equal(f.pool.tables.billing_assignments.find(a => a.billing_id === category).assigned_amount, 229.50);
    const updated = await f.request('PUT', `/api/billings/${category}`, { description: 'Updated note' });
    assert.equal(updated.status, 200, JSON.stringify(updated));
    assert.equal(f.pool.tables.billings.find(b => b.id === category).billing_category, category);
  }
  for (const category of ['invalid', 'monthly_dues', '', {}, 'all']) {
    const result = await f.request('POST', '/api/billings', bill({ id: 'bad', assignedTo: ['home-1'], billing_category: category, noDueDate: true }));
    assert.equal(result.status, 400, JSON.stringify(result));
  }
  assert.equal(f.pool.tables.billings.length, 3);
  assert.equal(f.pool.tables.notifications.length, 3);
  assert.equal(f.pool.tables.auditLog.filter(row => row.action.includes('created billings')).length, 3);
  const { changeSummary } = require('../src/services/auditService');
  assert.match(changeSummary({}, { billing_category: 'vehicle_fees' }, ['billing_category']), /vehicle_fees/);
  assert.equal((await f.request('POST', '/api/billings', bill({ noDueDate: true }), 'resident-1')).status, 403);
});

test('automatic monthly dues carry category without changing amount or duplicate protection', async t => {
  const f = await auditFixture(t);
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["resident"]';
  const result = await f.request('POST', '/api/billings/generate-monthly-dues', { month: '2026-11', noDueDate: true });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.body.createdCount, 1);
  const saved = f.pool.tables.billings[0];
  assert.equal(saved.billing_category, 'monthly_dues');
  assert.equal(saved.billing_type, 'Monthly Association Dues');
  const retry = await f.request('POST', '/api/billings/generate-monthly-dues', { month: '2026-11', noDueDate: true });
  assert.equal(retry.body.createdCount, 0);
  assert.equal(f.pool.tables.billings.length, 1);
});
