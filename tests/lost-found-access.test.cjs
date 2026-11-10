'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { auditFixture } = require('./helpers/audit-fixture.cjs');

async function setup(t) {
  const f = await auditFixture(t, { emailConfigured: false });
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["resident"]';
  f.pool.users.push(
    { id: 'unassigned', role: 'homeowner', status: 'active', permissions: '["billing"]', homeowner_id: 'home-1' },
    { id: 'inactive', role: 'homeowner', status: 'inactive', permissions: '["resident"]', homeowner_id: 'home-1' },
    { id: 'manager', role: 'homeowner', status: 'active', permissions: '["lostfound"]', homeowner_id: 'home-1' },
    { id: 'archived', role: 'homeowner', status: 'active', permissions: '["resident"]', archived_at: '2026-01-01', homeowner_id: 'home-1' },
  );
  return f;
}

function media() {
  const data = new FormData();
  data.append('media', new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], { type: 'image/png' }), 'item.png');
  return data;
}

test('reports and both upload aliases reject anonymous, invalid, inactive and unauthorized accounts before writing', async t => {
  const f = await setup(t);
  for (const [user, status] of [[null, 401], ['missing', 401], ['archived', 401], ['inactive', 403], ['unassigned', 403]]) {
    assert.equal((await f.request('POST', '/api/lostFound', { id: 'blocked', status: 'Approved' }, user)).status, status, user);
    for (const url of ['/api/lostfound/upload', '/api/lost-found/upload']) {
      assert.equal((await f.request('POST', url, media(), user)).status, status, `${user}: ${url}`);
    }
  }
  const spoofed = await fetch(f.base + '/api/lostFound', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': 'resident-1' }, body: '{}',
  });
  assert.equal(spoofed.status, 401);
  assert.equal(f.pool.tables.lostFound.length, 0);
  assert.equal(f.pool.tables.storage_objects.length, 0);
  assert.deepEqual(fs.readdirSync(f.uploadDir), []);
});

test('authorized submissions use session ownership and Pending status; public visibility still requires approval', async t => {
  const f = await setup(t);
  for (const user of ['resident-1', 'manager', 'admin-1']) {
    const result = await f.request('POST', '/api/lostFound', {
      id: user, homeownerId: 'forged-owner', reportType: 'Lost', itemName: 'Wallet',
      status: 'Approved', remarks: 'forged approval', claimedAt: '2020-01-01', createdAt: '2020-01-01',
    }, user);
    assert.equal(result.status, 201, JSON.stringify(f.errors));
    assert.equal(result.body.homeownerId, user === 'admin-1' ? null : 'home-1');
    assert.equal(result.body.status, 'Pending');
    assert.equal(result.body.remarks, '');
    assert.equal(result.body.claimedAt, '');
    assert.notEqual(result.body.createdAt, '2020-01-01');
    assert.ok(f.pool.tables.auditLog.some(row => row.adminId === user), 'submission is linked to the authenticated account in the audit log');
  }
  assert.equal((await f.request('GET', '/api/lostFound', undefined, null)).body.length, 0);
  assert.equal((await f.request('GET', '/api/public-data', undefined, null)).body.lostFound.length, 0);
  assert.equal((await f.request('PUT', '/api/lostFound/resident-1', { status: 'Approved' }, 'resident-1')).status, 403);
  assert.equal((await f.request('PUT', '/api/lostFound', [], 'resident-1')).status, 403);
  assert.equal((await f.request('POST', '/api/lostfound/resident-1/approve', {}, 'resident-1')).status, 403);
  assert.equal((await f.request('POST', '/api/lostFound', { id: 'resident-1', itemName: 'Overwrite' }, 'resident-1')).status, 409);
  assert.equal((await f.request('POST', '/api/lostfound/resident-1/approve', {})).status, 200);
  for (const url of ['/api/lostFound', '/api/public-data']) {
    const result = await f.request('GET', url, undefined, null);
    const reports = url === '/api/public-data' ? result.body.lostFound : result.body;
    assert.deepEqual(reports.map(row => row.id), ['resident-1']);
  }
  for (const [url, user] of [['/api/lostfound/upload', 'resident-1'], ['/api/lost-found/upload', 'manager']]) {
    assert.equal((await f.request('POST', url, media(), user)).status, 200, JSON.stringify(f.errors));
  }
});

function browserFixture() {
  const elements = new Map(), forms = [], views = [], notices = [];
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set(['hidden']);
      elements.set(id, { value: '', style: {}, focus() {}, classList: {
        add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      } });
    }
    return elements.get(id);
  }
  const user = { id: 'account-1', homeowner_id: 'home-1', role: 'homeowner', status: 'active', permissions: ['resident'], name: 'Resident' };
  const c = {
    currentUser: null, currentRole: null, pendingPostLoginView: null, pendingLostFoundReportType: null,
    dataSessionGeneration: 0, activePasswordResetToken: null, ADMIN_ONLY_MODULES: ['users', 'settings'],
    URL, Date, console, document: { getElementById: element, body: { style: {} } },
    window: { location: { hash: '', pathname: '/', href: 'https://example.test/' }, history: { pushState() {}, replaceState() {} } },
    setTimeout() {}, setAuthPanel() {}, showLoading() {}, hideLoading() {},
    showToast: (...args) => notices.push(args), showLoginError: message => notices.push(message),
    loginFailureMessage: error => error.message,
    api: { login: async () => user, loadAll: async () => {} }, db: { getOne: () => user },
    restoreSession: () => !!c.currentUser, performLogout() {}, buildSidebar() {}, setupSidebarOverlay() {},
    getDefaultViewForRole: () => 'ho-dashboard', getNavForRole: () => [],
    navigate: view => views.push(view), updateNotifBadge() {}, startNotificationRefresh() {},
    isAdmin: () => c.currentUser?.role === 'admin',
    escapeHtml: value => value, closeModal() {}, openModal: (title, body) => forms.push({ title, body }),
  };
  vm.createContext(c);
  const main = fs.readFileSync(path.join(__dirname, '../public/js/main.js'), 'utf8');
  for (const [start, end] of [
    ['async function handleLogin()', 'function loginFailureMessage('],
    ['function initApp(', 'function getNavForRole('],
    ['function userHasModulePermission(', 'function isAdmin('],
    ['function canAccessView(', 'function hasPaymentForBilling('],
    ['function openLoginModal(', 'function closeLoginModalOutside('],
  ]) vm.runInContext(main.slice(main.indexOf(start), main.indexOf(end)), c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/lost-found.js'), 'utf8'), c);
  element('loginUser').value = 'resident@example.test';
  element('loginPass').value = 'password';
  return { c, element, forms, views, notices, user };
}

test('both public buttons use login and resume the corresponding existing form in the resident portal', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  for (const type of ['Lost', 'Found']) {
    assert.ok(html.includes(`onclick="requestLostFoundReport('${type}')"`));
    const { c, element, forms, views } = browserFixture();
    c.requestLostFoundReport(type);
    assert.equal(element('loginModal').classList.contains('hidden'), false);
    assert.equal(forms.length, 0);
    element('loginUser').value = 'resident@example.test';
    element('loginPass').value = 'password';
    await c.handleLogin();
    assert.deepEqual(views, ['ho-lostfound']);
    assert.equal(forms[0].title, `Report ${type} Item`);
    assert.ok(forms[0].body.includes(`value="${type}" selected`));
    assert.equal(c.pendingLostFoundReportType, null);
  }
});

test('failed login retains intent; cancelling or opening ordinary login clears it', async () => {
  const { c, element, forms, user } = browserFixture();
  c.openLostFoundReportModal('Found');
  assert.equal(forms.length, 0, 'direct form calls cannot bypass login');
  c.api.login = async () => { throw new Error('Invalid password'); };
  element('loginUser').value = 'resident@example.test';
  element('loginPass').value = 'wrong';
  await c.handleLogin();
  assert.equal(c.pendingLostFoundReportType, 'Found');
  c.closeLoginModal();
  assert.equal(c.pendingLostFoundReportType, null);
  c.requestLostFoundReport('Lost');
  c.openLoginModal();
  assert.equal(c.pendingLostFoundReportType, null);
  c.api.login = async () => user;
  element('loginUser').value = 'resident@example.test';
  element('loginPass').value = 'password';
  await c.handleLogin();
  assert.equal(forms.length, 0);
});

test('authenticated public clicks resume directly, and unauthorized accounts never open or submit forms', async () => {
  const { c, forms, views, user } = browserFixture();
  c.currentUser = user;
  c.requestLostFoundReport('Lost');
  assert.equal(views[0], 'ho-lostfound');
  assert.equal(forms.length, 1);
  const denied = browserFixture();
  denied.user.permissions = ['billing'];
  denied.c.requestLostFoundReport('Found');
  denied.element('loginUser').value = 'resident@example.test';
  denied.element('loginPass').value = 'password';
  await denied.c.handleLogin();
  assert.equal(denied.forms.length, 0);
  assert.equal(denied.notices[0][1], 'Access Denied');
  await denied.c.submitLostFoundReport();
  assert.equal(denied.notices.length, 2);
});
