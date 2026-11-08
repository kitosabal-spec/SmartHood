'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildPageQuery } = require('../src/services/paginationService');
const { readPage } = require('../src/services/pagedDataService');
const { auditFixture } = require('./helpers/audit-fixture.cjs');
const can = (user, permission) => user.permissions?.includes(permission);
const resident = { id: 'account', role: 'homeowner', homeowner_id: 'own-home', permissions: ['resident'] };

test('all paged modules bind filters and search after ownership scope, with deterministic bounded pages', () => {
  for (const table of ['payments', 'complaints', 'amenityBookings', 'vehicleRegistrations', 'lostFound']) {
    const q = buildPageQuery(table, { q: "%' OR 1=1 --_!", page: '999999999999999999999999', pageSize: '9999', sort: 'id; DROP TABLE users', direction: 'asc; --', homeownerId: 'other-home' }, resident, can);
    assert.match(q.where, /t.homeownerId = \?/);
    assert.equal(q.params[0], 'own-home');
    assert.ok(!q.where.includes('other-home'));
    assert.ok(!q.where.includes('OR 1=1'));
    assert.ok(q.params.includes("%!%' or 1=1 --!_!!%"));
    assert.equal(q.pageSize, 100);
    assert.equal(q.page, 1);
    assert.match(q.order, /, t.id DESC$/);
  }
  const ownBills = buildPageQuery('billings', {}, resident, can);
  assert.match(ownBills.where, /ba.homeowner_id = \?/);
  assert.deepEqual(ownBills.params, ['own-home']);
  assert.match(buildPageQuery('homeowners', {}, resident, can).where, /t.id = \?/);
  const publicLost = buildPageQuery('lostFound', {}, true, can);
  assert.match(publicLost.where, /status IN \('Approved', 'Posted', 'Claimed'\)/);
  assert.deepEqual(publicLost.params, [null]);
  assert.equal(buildPageQuery('notifications', {}, resident, can), null);
});

test('registered-account filters and user search respect linked homeowner names and default account status', () => {
  const admin = { role: 'admin' };
  assert.match(buildPageQuery('homeowners', { registration: 'not-registered' }, admin, can).where, /NOT EXISTS.*u.archived_at IS NULL/);
  const users = buildPageQuery('users', { q: 'resident', status: 'active', sort: 'name', direction: 'asc' }, admin, can);
  assert.match(users.where, /COALESCE\(t.status, 'active'\) = \?/);
  assert.match(users.where, /SELECT h.`name` FROM homeowners/);
  assert.match(users.order, /SELECT h.`name` FROM homeowners/);
});

function pageServices(rows, total = rows.length) {
  const calls = [];
  return { calls, userHasPermission: can, requesterHomeownerId: u => u.homeowner_id,
    get: async (sql, params) => { calls.push({ sql, params }); return { total }; },
    all: async (sql, params) => { calls.push({ sql, params }); return rows; },
    deserializeRow: (_table, row) => ({ ...row }),
    presentPrivateFiles: (_table, row) => ({ ...row, secured: true }),
    attachComplaintResponses: async rows => rows.map(row => ({ ...row, responses: [{ id: 'response' }] })),
    presentHomeownerAccountStatus: row => row,
    mergeUserWithHomeowner: row => row,
  };
}

test('last-page deletion clamps offset; count does not inherit LIMIT, and file presentation is applied', async () => {
  const s = pageServices([{ id: 'payment', receipt: 'private-file' }], 11);
  const result = await readPage('payments', { page: '9', pageSize: '10' }, resident, s);
  assert.equal(result.page, 2); assert.equal(result.total, 11); assert.equal(result.totalPages, 2);
  assert.equal(result.items[0].secured, true);
  assert.doesNotMatch(s.calls[0].sql, /LIMIT/);
  assert.match(s.calls[1].sql, /historical_billing_title/);
  assert.deepEqual(s.calls[1].params, ['own-home', 10, 10]);
});

test('resident paged bills never return other assignment IDs or perform the global assignment read', async () => {
  const s = pageServices([{ id: 'bill', assignedTo: ['own-home', 'private-neighbor'] }]);
  const page = await readPage('billings', {}, resident, s);
  assert.deepEqual(page.items[0].assignedTo, ['own-home']);
  assert.equal(s.calls.length, 2);
});

test('page enrichment retains complaint histories, financial balances and linked amenity/vehicle billing fields', async () => {
  const admin = { role: 'admin' };
  const c = await readPage('complaints', {}, admin, pageServices([{ id: 'c' }]));
  assert.equal(c.items[0].responses.length, 1);
  for (const table of ['amenityBookings', 'vehicleRegistrations', 'homeowners']) {
    const s = pageServices([{ id: 'item' }]);
    await readPage(table, { sort: 'balance' }, admin, s);
    assert.match(s.calls[1].sql, table === 'homeowners' ? /homeowner_financial_summary/ : /billingArchivedAt/);
  }
});

test('targeted data refresh queries only requested groups and keeps existing permission scope', async t => {
  const f = await auditFixture(t);
  const execute = f.pool.execute;
  const reads = [];
  f.pool.execute = async (sql, params) => { reads.push(sql); return execute(sql, params); };
  const response = await f.request('GET', '/api/data?tables=lostFound');
  assert.equal(response.status, 200, JSON.stringify(f.errors, (_key, value) => value instanceof Error ? value.message : value));
  assert.deepEqual(Object.keys(response.body), ['lostFound']);
  assert.ok(!reads.some(sql => /FROM (payments|billings|auditLog|complaints)/.test(sql)));
  assert.equal((await f.request('GET', '/api/data?tables=bad_table')).status, 400);
});

test('application bootstrap omits comment threads and full audit payloads while retaining badge IDs', async t => {
  const f = await auditFixture(t);
  const execute = f.pool.execute;
  const reads = [];
  f.pool.execute = async (sql, params) => { reads.push(sql); return execute(sql, params); };
  const response = await f.request('GET', '/api/data?mode=app');
  assert.equal(response.status, 200, JSON.stringify(f.errors, (_key, value) => value instanceof Error ? value.message : value));
  assert.ok(reads.includes('SELECT id FROM auditLog'));
  assert.ok(!reads.some(sql => /SELECT \* FROM `?auditLog|FROM `?announcement_comments/.test(sql)));
  assert.deepEqual(response.body.announcement_comments, []);
});

test('formatted audit search is bounded and preserves display text, counts and final-page clamping', async () => {
  const records = Array.from({ length: 620 }, (_, i) => ({ id: String(i), actor_name: 'Administrator',
    action_type: 'created', entity_type: 'amenityBookings', action: 'created amenityBookings',
    new_values: JSON.stringify({ summary: 'bookingDate: (empty) -> 2026-10-31' }) }));
  const s = pageServices([]);
  s.all = async (sql, params) => {
    s.calls.push({ sql, params });
    assert.match(sql, /LIMIT \? OFFSET \?$/);
    assert.equal(params.at(-2), 250);
    return records.slice(params.at(-1), params.at(-1) + params.at(-2));
  };
  for (const q of ['Created amenity booking', 'Oct 31, 2026']) {
    const result = await readPage('auditLog', { q, page: '99', pageSize: '30' }, { role: 'admin' }, s);
    assert.equal(result.total, 620); assert.equal(result.page, 21); assert.equal(result.items.length, 20);
  }
  assert.equal(s.calls.length, 6);
  const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/main.js'), 'utf8');
  const shared = fs.readFileSync(require('node:path').join(__dirname, '../src/utils/auditPresentation.js'), 'utf8');
  assert.ok(shared.includes(source.slice(source.indexOf('function getAuditEventParts('), source.indexOf('\nfunction auditLocalDateValue'))), 'server and browser audit presentation must remain identical');
});

test('paged endpoints reject unauthorized account/audit/financial reads before issuing page queries', async t => {
  const f = await auditFixture(t);
  for (const table of ['users', 'auditLog']) {
    const response = await f.request('GET', '/api/paged/' + table + '?q=private', undefined, 'resident-1');
    assert.equal(response.status, 403);
  }
  for (const table of ['users', 'homeowners', 'payments', 'billings', 'complaints', 'amenityBookings', 'vehicleRegistrations', 'auditLog']) {
    const response = await f.request('GET', '/api/paged/' + table, undefined, null);
    assert.equal(response.status, 401);
  }
});

test('compact financial bootstrap reduces payload without changing complete financial calculations', async t => {
  const f = await auditFixture(t);
  f.pool.tables.billings.push({ id: 'bill', amount: 100, assignedTo: '["home-1"]', title: 'Dues', status: 'active', createdAt: '2026-01-01', monthly_dues_month: '2026-01' });
  for (let i = 0; i < 30; i++) f.pool.tables.payments.push({ id: 'p' + i, billingId: 'bill', homeownerId: 'home-1',
    amount: 1.25, status: i % 3 ? 'approved' : 'pending', submittedAt: '2026-01-03', reviewedAt: '2026-01-04',
    monthly_dues_month: '2026-01', remarks: 'large historical remarks '.repeat(500) });
  const full = (await f.request('GET', '/api/data')).body;
  const response = await f.request('GET', '/api/data?mode=app');
  assert.equal(response.status, 200);
  const compact = response.body;
  assert.equal(compact.payments.length, 30);
  assert.ok(compact.payments.every(row => row._summary && row.remarks === undefined));
  assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length / 4);
  const c = vm.createContext({ console, history: {}, localStorage: { getItem: () => null },
    document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    setTimeout, clearTimeout, FormData, URLSearchParams, addEventListener() {} });
  c.window = c;
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../public/js/main.js'), 'utf8'), c);
  function totals(data) {
    c.snapshot = data;
    return JSON.parse(vm.runInContext(`dbCache = snapshot; JSON.stringify((() => {
      const r = getReportsData();
      return { due: r.totalDue, paid: r.totalPaid, outstanding: r.totalOutstanding, monthly: r.monthlyData,
        approved: r.approved.length, pending: r.pending.length,
        balance: calculateUserOutstandingBalance('home-1'), status: getBillingCollectionStatus(db.get('billings')[0]) };
    })())`, c));
  }
  assert.deepEqual(totals(compact), totals(full));
  t.diagnostic(`Synthetic complete payload ${JSON.stringify(full).length} bytes; compact bootstrap ${JSON.stringify(compact).length} bytes. Not a production benchmark.`);
});

function browserApi() {
  const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/main.js'), 'utf8');
  const c = vm.createContext({ Map, Set, URLSearchParams, FormData, console, currentUser: { id: 'admin' },
    dbCache: { payments: [{ id: 'complete-financial-record' }] }, dataSessionGeneration: 1,
    document: {}, setTimeout, clearTimeout });
  vm.runInContext(source.slice(source.indexOf('const api = {'), source.indexOf('\nfunction reportSyncError')), c);
  c.api = vm.runInContext('api', c);
  return c;
}

test('concurrent targeted refreshes coalesce, merge atomically and preserve unrelated complete data', async () => {
  const c = browserApi(); let calls = 0, resolve;
  c.api.request = () => { calls++; return new Promise(done => { resolve = done; }); };
  const first = c.api.loadAll(['homeowners']), second = c.api.loadAll(['homeowners']);
  assert.equal(calls, 1);
  resolve({ homeowners: [{ id: 'home' }] }); await Promise.all([first, second]);
  assert.equal(c.dbCache.payments[0].id, 'complete-financial-record');
  assert.equal(c.dbCache.homeowners[0].id, 'home');
  assert.equal(c.api.readRequests.size, 0);
});

test('writes invalidate in-flight reads; old-session pages and failed reads cannot populate the cache', async () => {
  const c = browserApi(); const resolvers = [];
  c.api.request = () => new Promise(resolve => resolvers.push(resolve));
  const pending = c.api.loadAll(['homeowners']);
  c.api.writeVersion++;
  resolvers[0]({ homeowners: [{ id: 'old' }] });
  await new Promise(setImmediate);
  assert.equal(resolvers.length, 2);
  resolvers[1]({ homeowners: [{ id: 'fresh' }] }); await pending;
  assert.equal(c.dbCache.homeowners[0].id, 'fresh');
  const page = c.api.page('payments');
  c.dataSessionGeneration++;
  resolvers[2]({ items: [{ id: 'private' }] });
  await assert.rejects(page, /session changed/);
  c.api.request = async () => { throw new Error('offline'); };
  await assert.rejects(c.api.loadAll(['homeowners']), /offline/);
  assert.equal(c.dbCache.homeowners[0].id, 'fresh');
  assert.equal(c.api.readRequests.size, 0);
});
