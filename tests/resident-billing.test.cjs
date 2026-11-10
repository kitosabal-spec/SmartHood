'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { auditFixture } = require('./helpers/audit-fixture.cjs');

function fixture() {
  const bill = (id, extra = {}) => ({ id, title: id, amount: 100, assignedTo: ['home-1'], status: 'active', ...extra });
  const payment = (id, billingId, amount, status, extra = {}) => ({ id, billingId, amount, status, homeownerId: 'home-1', ...extra });
  const data = {
    billings: [bill('paid'), bill('dues', { billing_type: 'Monthly Association Dues', monthly_dues_month: '2026-11' }),
      bill('vehicle', { vehicle_registration_id: 'v1' }), bill('pending', { amenity_booking_id: 'a1' }),
      bill('late', { dueDate: '2000-01-01' }), bill('rejected'), bill('foreign', { assignedTo: ['home-2'] }),
      bill('archived', { archived_at: '2026-01-01' }), bill('inactive', { status: 'inactive' }),
      bill('cleared', { balance_reset_at: '2026-01-01' })],
    payments: [payment('p1', 'paid', 100, 'approved'), payment('p2', 'vehicle', 30, 'approved'),
      payment('p3', 'pending', 20, 'approved'), payment('p4', 'pending', 80, 'pending'),
      payment('p5', 'late', 10, 'approved'), payment('p6', 'rejected', 100, 'rejected'),
      payment('p7', 'dues', 100, 'approved', { homeownerId: 'home-2' }),
      payment('p8', 'vehicle', 70, 'approved', { voided_at: '2026-01-01' })],
  };
  const elements = Object.fromEntries(['contentArea', 'hoBillingSummary', 'hoBillingCategoryTabs', 'hoBillTableBody', 'hoBillSearch', 'hoBillStatus'].map(id => [id, { innerHTML: '', value: id === 'hoBillStatus' ? 'all' : '' }]));
  const c = vm.createContext({
    db: { get: key => data[key] || [], getOne: (key, id) => (data[key] || []).find(row => row.id === id) },
    document: { getElementById: id => elements[id], querySelector: () => null },
    getCurrentHomeownerId: () => 'home-1', toMoneyNumber: n => Number(n || 0), closeModal() {},
    openModal: (...args) => { c.modal = args; }, showToast: (...args) => { c.toast = args; },
    renderPaginationComponent: config => { c.pagination = config; },
  });
  const main = fs.readFileSync(require.resolve('../public/js/main.js'), 'utf8');
  vm.runInContext(main.slice(main.indexOf('function getBillingPaymentSummary('), main.indexOf('function getBillingCollectionStatus(')), c);
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/billing.js'), 'utf8'), c);
  return { c, data, elements };
}

test('resident rows reuse shared totals, isolate owners, exclude void payments, and order outstanding first without writes', () => {
  const { c, data } = fixture();
  const before = JSON.stringify(data);
  const rows = c.getResidentBillRows();
  assert.deepEqual(Array.from(rows, r => r.bill.id), ['dues', 'vehicle', 'pending', 'late', 'rejected', 'paid', 'cleared']);
  const byId = Object.fromEntries(rows.map(r => [r.bill.id, r]));
  assert.equal(byId.dues.summary.remainingBalance, 100);
  assert.equal(byId.vehicle.summary.remainingBalance, 70);
  assert.equal(byId.pending.summary.remainingBalance, 80, 'pending proof does not reduce debt');
  assert.equal(byId.pending.status, 'pending');
  assert.equal(byId.pending.payable, false);
  assert.equal(byId.late.status, 'overdue');
  assert.equal(byId.late.partial, true);
  assert.equal(byId.rejected.status, 'unpaid');
  assert.equal(byId.rejected.payable, true);
  assert.equal(byId.cleared.payable, false);
  assert.ok(rows.filter(r => !r.bill.dueDate).every(r => !r.overdue));
  assert.equal(JSON.stringify(data), before);
});

test('null/invalid dates never become overdue and timestamp dates use the Philippine calendar', () => {
  const { c, data } = fixture();
  for (const dueDate of [null, '', 'invalid', '0000-00-00']) {
    data.billings[1].dueDate = dueDate;
    assert.equal(c.getResidentBillRows().find(r => r.bill.id === 'dues').overdue, false);
  }
  data.billings[1].dueDate = '2000-01-01T16:00:00.000Z';
  assert.equal(c.getResidentBillRows().find(r => r.bill.id === 'dues').dueDate, '2000-01-02');
});

test('filters combine categories, search and statuses; summaries stay account-wide and pagination clamps', () => {
  const { c, data, elements } = fixture();
  for (let i = 0; i < 12; i++) data.billings.push({ id: `extra-${i}`, title: `Maintenance ${i}`, amount: 10, assignedTo: ['home-1'] });
  c.filterHOBillings();
  assert.equal(c.pagination.totalItems, 19);
  assert.equal((elements.hoBillTableBody.innerHTML.match(/<tr>/g) || []).length, 10);
  const summary = elements.hoBillingSummary.innerHTML;
  assert.match(summary, /₱560.00/);
  c.changeHOBillingPage(2);
  assert.equal(c.pagination.currentPage, 2);
  c.selectHOBillingCategory('vehicle_fees');
  assert.equal(c.pagination.currentPage, 1);
  assert.equal(c.pagination.totalItems, 1);
  elements.hoBillStatus.value = 'partially_paid';
  elements.hoBillSearch.value = 'vehicle';
  c.filterHOBillings();
  assert.equal(c.pagination.totalItems, 1);
  assert.equal(elements.hoBillingSummary.innerHTML, summary);
  elements.hoBillStatus.value = 'paid';
  c.filterHOBillings();
  assert.match(elements.hoBillTableBody.innerHTML, /No bills match/);
  c.resetHOBillingFilters();
  c.changeHOBillingPageSize(5);
  c.changeHOBillingPage(99);
  assert.equal(c.pagination.currentPage, 4);
});

test('details preserve full escaped descriptions and block foreign bills, payments, and inactive payment attempts', () => {
  const { c, data, elements } = fixture();
  const full = '<script>bad()</script> ' + 'Description '.repeat(30);
  data.billings[1].description = full;
  c.filterHOBillings();
  assert.ok(!elements.hoBillTableBody.innerHTML.includes(full));
  c.viewHOBillingDetail('dues');
  assert.match(c.modal[1], /&lt;script&gt;bad/);
  assert.ok(c.modal[1].includes('Description '.repeat(30)));
  c.modal = null;
  c.viewHOBillingDetail('foreign');
  assert.equal(c.modal, null);
  assert.equal(c.toast[1], 'Access Denied');
  c.viewPaymentDetail('p7', true);
  assert.equal(c.modal, null);
  for (const id of ['foreign', 'inactive', 'archived', 'cleared']) {
    c.openPayNowModal(id);
    assert.equal(c.toast[1], 'Access Denied');
    assert.equal(c.modal, null);
  }
  c.getCurrentHomeownerId = () => null;
  assert.equal(c.getResidentBillRows().length, 0);
});

test('advance dues retain full-amount validation, duplicate submission protection and exclusion from generated billing', async t => {
  const f = await auditFixture(t);
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["resident"]';
  function proof(ref, amount, month = '2027-01') {
    const form = new FormData();
    form.set('monthly_dues_month', month);
    form.set('amount', String(amount));
    form.set('refNum', ref);
    form.set('receipt', new Blob([Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])], { type: 'image/png' }), 'proof.png');
    return form;
  }
  assert.equal((await f.request('POST', '/api/payments/submit', proof('bad-month', 572.5, '2027-13'), 'resident-1')).status, 400);
  assert.equal((await f.request('POST', '/api/payments/submit', proof('partial-advance', 100), 'resident-1')).status, 400);
  const submitted = await f.request('POST', '/api/payments/submit', proof('advance-valid', 572.5), 'resident-1');
  assert.equal(submitted.status, 201, JSON.stringify(submitted));
  assert.equal(submitted.body.payment.billingId, null);
  assert.equal(submitted.body.payment.status, 'pending');
  assert.equal((await f.request('POST', '/api/payments/submit', proof('advance-duplicate', 572.5), 'resident-1')).status, 400);
  assert.equal((await f.request('POST', `/api/payments/${submitted.body.payment.id}/approve`, {})).status, 200);
  assert.equal((await f.request('POST', '/api/payments/submit', proof('advance-already-paid', 572.5), 'resident-1')).status, 400);
  for (let attempt = 0; attempt < 2; attempt++) {
    const generated = await f.request('POST', '/api/billings/generate-monthly-dues', { month: '2027-01', noDueDate: true });
    assert.equal(generated.status, 200, JSON.stringify(generated));
    assert.equal(generated.body.createdCount, 0);
  }
  assert.equal(f.pool.tables.billings.length, 0);
  assert.equal(f.pool.tables.payments.length, 1);
});
