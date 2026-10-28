'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { auditFixture } = require('./helpers/audit-fixture.cjs');
const { createPublicAssetCache } = require('../src/utils/publicAssetCache');
const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'public/js/main.js'), 'utf8');

function browserFixture() {
  const events = {};
  const timers = new Map();
  const context = {
    console: { warn() {}, error() {} }, FormData, URLSearchParams, Set, Map,
    document: { hidden: false, addEventListener: (name, fn) => { events[name] = fn; },
      getElementById: () => null },
    currentUser: { id: 'user-1' }, dbCache: {}, dataSessionGeneration: 0, publicDataRequest: null,
    notificationRequest: null, notificationRefreshActive: false, notificationGeneration: 0,
    notificationRefreshTimer: null,
    setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
    getVisibleNotifications: () => context.dbCache.notifications || [],
    updateNotifBadge() {}, renderNotificationList() {}, markVisibleNotificationsSeen() {}, showToast() {},
  };
  vm.createContext(context);
  vm.runInContext(mainSource.slice(mainSource.indexOf('const api = {'), mainSource.indexOf('\nfunction reportSyncError')), context);
  vm.runInContext(mainSource.slice(mainSource.indexOf('let knownNotifIds = null;'), mainSource.indexOf('\nfunction toggleNotifPanel')), context);
  context.api = vm.runInContext('api', context);
  return { context, events, timers };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('notification requests never overlap, pause in hidden tabs, resume, and recover after errors', async () => {
  const { context: c, events, timers } = browserFixture();
  let pending = deferred(), calls = 0;
  c.api.request = () => { calls++; return pending.promise; };
  c.startNotificationRefresh();
  const duplicate = c.refreshNotifications();
  assert.equal(calls, 1);
  c.document.hidden = true;
  events.visibilitychange();
  pending.resolve([{ id: 'n1' }]);
  await duplicate;
  await new Promise(setImmediate);
  assert.equal(timers.size, 0);
  await c.refreshNotifications();
  assert.equal(calls, 1);
  pending = deferred();
  c.document.hidden = false;
  events.visibilitychange();
  assert.equal(calls, 2);
  const duplicateFailure = c.refreshNotifications();
  pending.reject(new Error('temporary offline'));
  await duplicateFailure;
  await new Promise(setImmediate);
  assert.equal(timers.size, 1, 'one retry is scheduled after the request settles');
  c.stopNotificationRefresh();
  assert.equal(timers.size, 0);
});

test('late notification responses cannot repopulate a logged-out or different account cache', async () => {
  const { context: c } = browserFixture();
  const pending = deferred();
  c.api.request = () => pending.promise;
  const request = c.refreshNotifications();
  c.stopNotificationRefresh();
  c.currentUser = { id: 'user-2' };
  c.dbCache = { notifications: [] };
  pending.resolve([{ id: 'private-user-1' }]);
  await request;
  assert.deepEqual(c.dbCache.notifications, []);
});

test('public loads coalesce; a response from before login cannot overwrite private/shared records', async () => {
  const { context: c } = browserFixture();
  c.currentUser = null;
  const pending = deferred();
  let calls = 0;
  c.api.request = () => { calls++; return pending.promise; };
  const first = c.api.loadPublic(), second = c.api.loadPublic();
  assert.equal(calls, 1);
  c.dataSessionGeneration++;
  c.currentUser = { id: 'signed-in' };
  c.dbCache = { lostFound: [{ id: 'own-pending' }], payments: [{ id: 'payment' }] };
  pending.resolve({ lostFound: [], announcements: [] });
  await Promise.all([first, second]);
  assert.equal(c.dbCache.lostFound[0].id, 'own-pending');
  assert.equal(c.dbCache.payments[0].id, 'payment');
});

test('an outstanding full load is rejected after logout/account change', async () => {
  const { context: c } = browserFixture();
  const pending = deferred();
  c.api.request = () => pending.promise;
  const request = c.api.loadAll();
  c.dataSessionGeneration++;
  c.currentUser = null;
  c.dbCache = {};
  pending.resolve({ users: [{ id: 'user-1' }], payments: [{ id: 'private' }] });
  await assert.rejects(request, /session changed/);
  assert.deepEqual(c.dbCache, {});
});

test('bounded data reads share the financial summary only within one request and keep complete records', async t => {
  const f = await auditFixture(t);
  f.pool.tables.homeowners[0].balance = 42.75;
  f.pool.tables.billings.push({ id: 'bill', amount: 100, assignedTo: '["home-1"]', status: 'active' });
  f.pool.tables.payments.push({ id: 'payment', billingId: 'bill', homeownerId: 'home-1', amount: 57.25, status: 'approved' });
  let active = 0, peak = 0, summaries = 0;
  const execute = f.pool.execute;
  f.pool.execute = async (...args) => {
    assert.match(args[0], /^SELECT /, 'GET must never write records');
    active++; peak = Math.max(peak, active);
    if (args[0].includes('LEFT JOIN homeowner_financial_summary')) summaries++;
    try { await new Promise(resolve => setTimeout(resolve, 10)); return await execute(...args); }
    finally { active--; }
  };
  const response = await f.request('GET', '/api/data');
  assert.equal(response.status, 200, JSON.stringify(f.errors));
  assert.equal(response.body.billings[0].amount, 100);
  assert.equal(response.body.payments[0].amount, 57.25);
  assert.equal(response.body.homeowners[0].balance, 42.75);
  assert.equal(response.body.users.find(user => user.id === 'resident-1').balance, 42.75);
  assert.equal(summaries, 1);
  assert.ok(peak > 1 && peak <= 6, `peak=${peak}`);
  assert.deepEqual(Object.keys(response.body).sort(), ['users', 'homeowners', 'billings', 'payments',
    'payment_settings', 'announcements', 'announcement_comments', 'complaints', 'amenityBookings',
    'vehicleRegistrations', 'lostFound', 'auditLog', 'notifications', 'appSettings', 'board_of_directors'].sort());
  f.pool.tables.homeowners[0].balance = 20;
  const fresh = await f.request('GET', '/api/data');
  assert.equal(fresh.body.homeowners[0].balance, 20);
  assert.equal(summaries, 2, 'a new request re-reads the database');
});

test('one failed table fails the whole load instead of returning incomplete balances', async t => {
  const f = await auditFixture(t);
  const execute = f.pool.execute;
  f.pool.execute = (...args) => args[0].replace(/`/g, '').startsWith('SELECT * FROM payments')
    ? Promise.reject(new Error('injected read failure')) : execute(...args);
  const response = await f.request('GET', '/api/data');
  assert.equal(response.status, 500);
  assert.equal(response.body.payments, undefined);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('only matching content versions receive long public caching; private routes stay no-store', async t => {
  const f = await auditFixture(t);
  const page = await fetch(f.base);
  assert.match(page.headers.get('cache-control'), /no-store/);
  const html = await page.text();
  assert.match(html, /src="public\/images\/entrance\.[a-f0-9]{16}\.webp"/,
    'HTML and CSS must use the identical fingerprinted image URL');
  const url = html.match(/src="(public\/js\/main\.js\?v=[a-f0-9]{16})"/)[1];
  for (const [asset, immutable] of [[url, true], ['public/js/main.js', false], ['public/js/main.js?v=old', false]]) {
    const response = await fetch(`${f.base}/${asset}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control').includes('immutable'), immutable);
    await response.arrayBuffer();
  }
  for (const url of ['/api/session', '/api/data', '/api/notifications', '/api/files/receipts/missing']) {
    const response = await fetch(f.base + url);
    assert.match(response.headers.get('cache-control'), /no-store/, url);
    await response.arrayBuffer();
  }
  const blocked = await fetch(f.base + '/public/uploads/receipts/test.png?v=123');
  assert.equal(blocked.status, 404);
  assert.ok(!blocked.headers.get('cache-control')?.includes('immutable'));
  const versioner = createPublicAssetCache(path.join(root, 'public'));
  assert.equal(versioner.versionHtml('<img src="/api/files/receipts/x"><img src="public/uploads/x">'),
    '<img src="/api/files/receipts/x"><img src="public/uploads/x">');
});

test('bounded scheduler preserves payloads and reduces simulated network wait', async t => {
  const source = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const loader = source.slice(source.indexOf('async function loadAllData('), source.indexOf('\nasync function getScopedTableData('));
  const tables = ['users', 'homeowners', 'billings', 'payments', 'complaints', 'notifications', 'appSettings', 'lostFound', 'auditLog'];
  async function measure(transaction) {
    const c = { tableConfig: Object.fromEntries(tables.map(key => [key, {}])),
      audit: { current: () => transaction ? { connection: {} } : null },
      getScopedTableData: async table => { await new Promise(resolve => setTimeout(resolve, 30)); return [{ id: table }]; },
      presentPrivateFiles: (table, record) => record };
    vm.createContext(c); vm.runInContext(loader, c);
    const start = performance.now();
    const data = await c.loadAllData({ id: 'admin', role: 'admin' });
    return { data: JSON.parse(JSON.stringify(data)), milliseconds: Math.round(performance.now() - start) };
  }
  const sequential = await measure(true), bounded = await measure(false);
  assert.deepEqual(bounded.data, sequential.data);
  t.diagnostic(`Synthetic 9 groups × 30ms: sequential=${sequential.milliseconds}ms; bounded=${bounded.milliseconds}ms. Not a production benchmark.`);
});

test('editing a bundled asset changes its HTML URL and invalidates the old cache version', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smarthood-assets-'));
  const folder = path.join(directory, 'js');
  const file = path.join(folder, 'example.js');
  fs.mkdirSync(folder);
  t.after(() => { fs.unlinkSync(file); fs.rmdirSync(folder); fs.rmdirSync(directory); });
  fs.writeFileSync(file, 'original');
  const assets = createPublicAssetCache(directory);
  const html = '<script src="public/js/example.js?v=old"></script>';
  const first = assets.versionHtml(html);
  fs.writeFileSync(file, 'changed content');
  const second = assets.versionHtml(html);
  assert.notEqual(first, second);
  const oldVersion = first.match(/\?v=([a-f0-9]+)/)[1];
  const headers = {};
  assets.setHeaders({ req: { query: { v: oldVersion } }, setHeader: (name, value) => { headers[name] = value; } }, file, fs.statSync(file));
  assert.equal(headers['Cache-Control'], 'public, max-age=0, must-revalidate');
});
