'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { auditFixture } = require('./helpers/audit-fixture.cjs');
const { fixture, password } = require('./helpers/auth-fixture.cjs');
const { isResidentAccount } = require('../migrations/020_reset_homeowner_accounts_and_balances');

test('reset targets resident-only accounts and preserves every officer/admin permission group', () => {
  for (const permissions of ['["resident"]', '["ho-bills","ho-profile"]', '[]']) {
    assert.equal(isResidentAccount({ role: 'homeowner', permissions }), true);
  }
  for (const permissions of ['["resident","billing","payments","reports"]', '["complaints","vehicles","lostfound"]', '["*"]', 'invalid']) {
    assert.equal(isResidentAccount({ role: 'homeowner', permissions }), false);
  }
  for (const role of ['admin', 'hoa_officer']) assert.equal(isResidentAccount({ role, permissions: '[]' }), false);
});

test('archived resident credentials and previously issued session cookies cannot authenticate', async t => {
  const f = await fixture(t);
  const signedIn = await f.login('resident@example.test', password);
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.get('set-cookie').split(';')[0];
  f.pool.users.find(u => u.id === 'resident-1').archived_at = new Date();
  assert.equal((await f.login('resident@example.test', password)).status, 401);
  const session = await f.request('/api/session', undefined, undefined, { Cookie: cookie });
  assert.equal(session.body.authenticated, false);
  assert.equal((await f.request('/api/data', undefined, undefined, { Cookie: cookie })).status, 401);
  assert.equal((await f.login('admin', password)).status, 200);
});

test('Register Account creates a fresh identity, updates status, keeps profile/history, and rejects duplicate registration', async t => {
  const f = await auditFixture(t);
  const old = f.pool.tables.users.find(u => u.id === 'resident-1');
  Object.assign(old, { archived_at: new Date().toISOString(), historical_homeowner_id: 'home-1', homeowner_id: null,
    email: null, username: null, password: null, status: 'inactive' });
  const profile = f.pool.tables.homeowners.find(h => h.id === 'home-1');
  const before = structuredClone(profile);
  const history = structuredClone(f.pool.tables.payments);
  let response = await f.request('GET', '/api/homeowners');
  assert.equal(response.body.find(h => h.id === 'home-1').accountStatus, 'No Account');
  const body = { email: 'new-resident@example.test', mobile: '09171234567', password,
    permissions: ['resident'], termsAccepted: true, privacyAcknowledged: true, policyVersion: '2026-10-06' };
  assert.equal((await f.request('POST', '/api/homeowners/home-1/account', body, 'resident-1')).status, 401);
  response = await f.request('POST', '/api/homeowners/home-1/account', body);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.notEqual(response.body.id, old.id);
  assert.equal(response.body.homeowner_id, 'home-1');
  assert.equal(response.body.password, undefined);
  assert.equal((await f.request('POST', '/api/homeowners/home-1/account', body)).status, 409);
  response = await f.request('GET', '/api/homeowners');
  assert.equal(response.body.find(h => h.id === 'home-1').accountStatus, 'Registered');
  for (const key of ['id', 'name', 'block', 'lot', 'lotArea']) assert.equal(profile[key], before[key]);
  assert.deepEqual(f.pool.tables.payments, history);
  assert.equal((await f.request('GET', '/api/session', undefined, old.id)).body.authenticated, false);
});

test('stale browser balance writes and archived billing edits cannot restore cleared obligations', async t => {
  const f = await auditFixture(t);
  const homeowner = f.pool.tables.homeowners.find(h => h.id === 'home-1');
  homeowner.balance = 0;
  assert.equal((await f.request('PUT', '/api/homeowners/home-1', { balance: 9000, contact: '09171234567' })).status, 200);
  assert.equal(homeowner.balance, 0);
  f.pool.tables.billings.push({ id: 'cleared', title: 'Old dues', amount: 500, archived_at: new Date().toISOString(),
    balance_reset_at: new Date().toISOString(), status: 'inactive', assignedTo: '["home-1"]' });
  const edited = await f.request('PUT', '/api/billings/cleared', { title: 'Old dues', status: 'active', amount: 500, assignedTo: ['home-1'] });
  assert.equal(edited.status, 409, JSON.stringify(edited.body));
  assert.equal(f.pool.tables.billings.find(b => b.id === 'cleared').status, 'inactive');
});

test('frontend ignores cleared bills, keeps historical payment amounts, and clamps each new bill separately', () => {
  const source = fs.readFileSync(require.resolve('../public/js/main.js'), 'utf8');
  const billings = [{ id: 'old', amount: 9000, assignedTo: ['h'], balance_reset_at: '2026-11-07' },
    { id: 'inactive', amount: 700, status: 'inactive', assignedTo: ['h'] },
    { id: 'new', amount: 500, assignedTo: ['h'] }, { id: 'paid', amount: 100, assignedTo: ['h'] }];
  const payments = [{ billingId: 'paid', homeownerId: 'h', amount: 200, status: 'approved' },
    { billingId: 'old', homeownerId: 'h', amount: 250, status: 'approved' }];
  const context = { db: { get: key => ({ billings, payments })[key] }, toMoneyNumber: Number, getAssignedHomeownerIds: b => b.assignedTo };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function getBillingPaymentSummary('), source.indexOf('\nasync function syncHomeownerBalances')), context);
  assert.equal(context.calculateUserOutstandingBalance('h'), 500);
  const old = context.getBillingPaymentSummary(billings[0], 'h', payments);
  assert.equal(old.remainingBalance, 0);
  assert.equal(old.totalPaid, 250);
  assert.equal(old.originalAmount, 9000);
  assert.equal(old.status, 'cleared');
});
