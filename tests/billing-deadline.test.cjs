'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { auditFixture } = require('./helpers/audit-fixture.cjs');

async function setup(t) {
  const f = await auditFixture(t);
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["resident"]';
  return f;
}
function bill(overrides = {}) {
  return { id: 'bill', title: 'Monthly Association Dues - January 2026', amount: 100,
    assignedTo: ['home-1'], status: 'active', billing_type: 'Monthly Association Dues',
    monthly_dues_month: '2026-01', noDueDate: true, dueDate: null, ...overrides };
}

test('manual monthly dues store NULL deadlines, retain the month and reject duplicate dues', async t => {
  const f = await setup(t);
  const result = await f.request('POST', '/api/billings', bill());
  assert.equal(result.status, 201, JSON.stringify(result));
  const saved = f.pool.tables.billings[0];
  assert.equal(saved.dueDate, null);
  assert.equal(saved.due_date, null);
  assert.equal(saved.monthly_dues_month, '2026-01');
  assert.equal(f.pool.tables.billing_assignments[0].monthly_dues_month, '2026-01');
  assert.match(f.pool.tables.notifications[0].message, /No due date/);
  assert.equal((await f.request('POST', '/api/billings', bill({ id: 'duplicate', noDueDate: false, dueDate: '2026-01-31' }))).status, 400);
  const generated = await f.request('POST', '/api/billings/generate-monthly-dues', { month: '2026-01', noDueDate: true });
  assert.equal(generated.status, 200);
  assert.equal(generated.body.createdCount, 0);
  assert.equal(generated.body.alreadyBilledCount, 1);
});

test('Other Billing including amenity charges supports either deadline choice', async t => {
  const f = await setup(t);
  for (const [id, title, dueDate] of [['amenity', 'Clubhouse booking charge', null], ['other', 'Repair contribution', '2026-12-15']]) {
    const result = await f.request('POST', '/api/billings', bill({ id, title, billing_type: 'Other Billing', noDueDate: !dueDate, dueDate }));
    assert.equal(result.status, 201, JSON.stringify(result));
    const saved = f.pool.tables.billings.find(b => b.id === id);
    assert.equal(saved.dueDate, dueDate);
    assert.equal(saved.due_date, dueDate);
    assert.equal(saved.monthly_dues_month, null);
  }
});

test('manual and generated requests validate explicit choices, real dates and required monthly periods', async t => {
  const f = await setup(t);
  for (const changes of [
    { noDueDate: undefined, dueDate: null }, { noDueDate: false, dueDate: '' },
    { noDueDate: 'true' }, { noDueDate: true, dueDate: '2026-01-31' },
    { noDueDate: false, dueDate: '2026-02-30' }, { noDueDate: false, dueDate: 123 },
    { monthly_dues_month: null }, { monthly_dues_month: '2026-13' },
  ]) {
    const result = await f.request('POST', '/api/billings', bill(changes));
    assert.equal(result.status, 400, JSON.stringify({ changes, result }));
  }
  for (const changes of [
    { month: '' }, { month: '2026-13' }, { dueDate: '2026-02-30' },
    { dueDate: {} }, { noDueDate: 'true' }, { noDueDate: true, dueDate: '2026-01-31' },
  ]) {
    assert.equal((await f.request('POST', '/api/billings/generate-monthly-dues', { month: '2026-01', ...changes })).status, 400);
  }
  assert.equal(f.pool.tables.billings.length, 0);
  assert.equal((await f.request('POST', '/api/billings', bill({ billing_type: 'Other Billing', title: '' }))).status, 400);
});

test('bulk billing creation cannot bypass deadline validation or monthly duplicate protection', async t => {
  const f = await setup(t);
  assert.equal((await f.request('PUT', '/api/billings', [bill({ noDueDate: undefined })])).status, 400);
  assert.equal(f.pool.tables.billings.length, 0);
  assert.equal((await f.request('PUT', '/api/billings', [bill(), bill({ id: 'duplicate' })])).status, 400);
  assert.equal(f.pool.tables.billings.length, 0, 'invalid batches roll back earlier writes');
  assert.equal((await f.request('PUT', '/api/billings', [bill()])).status, 200);
  assert.equal(f.pool.tables.billings[0].dueDate, null);
});

test('generation preserves explicit dates and legacy month-end defaults; explicit noDueDate wins over the default', async t => {
  const f = await setup(t);
  for (const [month, choice, expected] of [
    ['2026-01', { dueDate: '2026-02-10' }, '2026-02-10'],
    ['2026-02', { noDueDate: true, dueDate: null }, null],
    ['2026-03', {}, '2026-03-31'], ['2028-02', { dueDate: '' }, '2028-02-29'],
    ['2026-04', { dueDate: null }, '2026-04-30'],
  ]) {
    const result = await f.request('POST', '/api/billings/generate-monthly-dues', { month, ...choice });
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.body.createdCount, 1);
    const saved = f.pool.tables.billings.find(b => b.monthly_dues_month === month);
    assert.equal(saved.dueDate, expected);
    assert.equal(saved.due_date, expected);
    const duplicate = await f.request('POST', '/api/billings/generate-monthly-dues', { month, noDueDate: true });
    assert.equal(duplicate.body.createdCount, 0);
  }
  assert.ok(f.pool.tables.notifications.some(n => /No due date/.test(n.message)));
});

test('legacy missing deadlines survive unrelated updates and explicit changes synchronize both columns', async t => {
  const f = await setup(t);
  f.pool.tables.billings.push({ ...bill({ billing_type: 'Other Billing', monthly_dues_month: null }), noDueDate: undefined, dueDate: '' });
  assert.equal((await f.request('PUT', '/api/billings/bill', { description: 'Updated note' })).status, 200);
  assert.equal(f.pool.tables.billings[0].dueDate, null);
  assert.equal((await f.request('PUT', '/api/billings/bill', { dueDate: '2026-12-15' })).status, 200);
  assert.equal(f.pool.tables.billings[0].due_date, '2026-12-15');
  assert.equal((await f.request('PUT', '/api/billings/bill', { noDueDate: true })).status, 200);
  assert.equal(f.pool.tables.billings[0].due_date, null);
  assert.equal((await f.request('PUT', '/api/billings/bill', { dueDate: '' })).status, 400);
});

test('undated bills accept resident submissions and approved payments without losing their billing period', async t => {
  const f = await setup(t);
  assert.equal((await f.request('POST', '/api/billings', bill())).status, 201);
  const proof = new FormData();
  proof.set('billingId', 'bill'); proof.set('amount', '40'); proof.set('refNum', 'undated-proof');
  proof.set('receipt', new Blob([Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])], { type: 'image/png' }), 'proof.png');
  const submitted = await f.request('POST', '/api/payments/submit', proof, 'resident-1');
  assert.equal(submitted.status, 201, JSON.stringify(submitted));
  assert.equal(submitted.body.payment.monthly_dues_month, '2026-01');
  const approved = await f.request('POST', `/api/payments/${submitted.body.payment.id}/approve`, {});
  assert.equal(approved.status, 200, JSON.stringify(approved));
  const paid = await f.request('POST', '/api/payments/manual', {
    homeownerId: 'home-1', billingId: 'bill', amount: 60, payment_method: 'Cash', payment_date: '2026-10-27',
  });
  assert.equal(paid.status, 201, JSON.stringify(paid));
  assert.equal(f.pool.tables.billings[0].status, 'paid');
  assert.equal(f.pool.tables.billings[0].dueDate, null);
  assert.equal(f.pool.tables.billings[0].monthly_dues_month, '2026-01');
});

function frontend() {
  const elements = {};
  const element = () => ({ value: '', checked: false, innerHTML: '', dataset: {}, style: {},
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {}, removeAttribute() {} });
  const context = vm.createContext({ console, Date, Intl, setTimeout() {}, clearTimeout() {},
    localStorage: { getItem() { return null; } }, addEventListener() {}, history: {},
    document: { readyState: 'loading', addEventListener() {}, getElementById: id => elements[id] ||= element(),
      querySelectorAll: selector => selector === '.ho-cb:checked' ? [{ value: 'home-1' }] : [],
      createElement: element }, saved: [], requests: [], notices: [],
  });
  context.window = context;
  for (const id of ['bf_no_due', 'bf_due', 'bf_month', 'bf_title', 'bf_amount', 'bf_billing_type', 'gen_dues_no_due']) {
    context.document.getElementById(id);
  }
  for (const file of ['main.js', 'billing.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js', file), 'utf8'), context);
  vm.runInContext(`
    currentUser = {id:'admin',role:'admin',permissions:['*']};
    dbCache.homeowners = [{id:'home-1',name:'Resident',lotArea:100}];
    dbCache.users = [{id:'resident',role:'homeowner',homeowner_id:'home-1',permissions:['resident']}];
    dbCache.billings = []; dbCache.payments = [];
    db.save = async (table, item) => saved.push(item);
    api.loadAll = async () => {};
    api.request = async (url, options) => { requests.push(JSON.parse(options.body)); return {createdCount:1}; };
    showToast = (...args) => notices.push(args);
    showLoading = hideLoading = closeModal = logAction = renderBilling = () => {};
    syncHomeownerBalances = async () => {};
    openModal = (title, html) => { window.modal = {title,html}; };
  `, context);
  return { context, elements, run: code => vm.runInContext(code, context) };
}

test('creation forms send explicit choices, require monthly period, and toggle the date input', async () => {
  const { context: c, elements: e } = frontend();
  c.openProfessionalBillingModal();
  assert.match(c.modal.html, /bf_no_due/);
  assert.match(c.modal.html, /No due date/);
  e.bf_no_due.checked = true;
  c.toggleBillingDeadline('bf');
  assert.equal(e.bf_due.disabled, true);
  assert.equal(e.bf_due.required, false);
  e.bf_title.value = 'Monthly Association Dues'; e.bf_amount.value = '100'; e.bf_month.value = '2026-01';
  await c.saveAddBilling();
  assert.equal(c.saved[0].dueDate, null); assert.equal(c.saved[0].noDueDate, true);
  assert.equal(c.saved[0].monthly_dues_month, '2026-01');
  e.bf_month.value = '';
  await c.saveAddBilling(); assert.equal(c.saved.length, 1);
  e.bf_billing_type.value = 'Other Billing'; e.bf_title.value = 'Clubhouse booking';
  await c.saveAddBilling(); assert.equal(c.saved[1].dueDate, null);
  assert.equal(c.saved[1].monthly_dues_month, null);
  e.bf_no_due.checked = false; c.toggleBillingDeadline('bf');
  assert.equal(e.bf_due.disabled, false); assert.equal(e.bf_due.required, true);
  e.bf_due.value = ''; await c.saveAddBilling(); assert.equal(c.saved.length, 2);
  e.bf_due.value = '2026-12-15'; await c.saveAddBilling(); assert.equal(c.saved[2].dueDate, '2026-12-15');
  c.autoGenerateLotAreaMonthlyDues(); assert.match(c.modal.html, /gen_dues_no_due/);
  c.document.getElementById('gen_dues_month').value = '2026-02';
  c.document.getElementById('gen_dues_due'); c.updateGeneratedDuesDeadline();
  assert.equal(e.gen_dues_due.value, '2026-02-28');
  await c.executeAutoGenerateMonthlyDues(); assert.equal(c.requests[0].dueDate, '2026-02-28');
  e.gen_dues_no_due.checked = true; await c.executeAutoGenerateMonthlyDues();
  assert.equal(c.requests[1].noDueDate, true); assert.equal(c.requests[1].dueDate, null);
  e.gen_dues_month.value = ''; await c.executeAutoGenerateMonthlyDues(); assert.equal(c.requests.length, 2);
});

test('undated bills stay outstanding and payable but never enter overdue-only results', () => {
  const { context: c, run } = frontend();
  run(`dbCache.billings = [${JSON.stringify(bill())}, ${JSON.stringify(bill({ id: 'dated', dueDate: '2000-01-31' }))}];`);
  const undated = run('dbCache.billings[0]');
  assert.equal(c.getBillingCollectionStatus(undated), 'active');
  undated.status = 'overdue';
  assert.equal(c.getBillingCollectionStatus(undated), 'active', 'a stale stored status cannot make an undated bill overdue');
  assert.equal(c.calculateUserOutstandingBalance('home-1'), 200);
  assert.equal(c.getBillingPaymentSummary(undated, 'home-1').remainingBalance, 100);
  c.document.getElementById('billStatusFilter').value = 'overdue';
  run('renderBillingTable = rows => { window.filtered = rows; }');
  c.filterBillings();
  const overdue = c.filtered;
  assert.deepEqual(Array.from(overdue, b => b.id), ['dated']);
  run("dbCache.payments = [{id:'partial',billingId:'bill',homeownerId:'home-1',status:'approved',amount:40}]");
  assert.equal(c.getBillingCollectionStatus(undated), 'partially_paid');
  assert.equal(c.getBillingPaymentSummary(undated, 'home-1').remainingBalance, 60);
  assert.equal(c.calculateUserOutstandingBalance('home-1'), 160);
  run("currentUser = {id:'resident',homeowner_id:'home-1',role:'homeowner',permissions:['resident']}");
  c.openPayNowModal('bill'); assert.match(c.modal.html, /No due date/);
  run("dbCache.payments[0].amount = 100");
  assert.equal(c.getBillingCollectionStatus(undated), 'paid');
});
