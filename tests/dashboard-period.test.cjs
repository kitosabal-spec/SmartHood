'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));

function harness() {
  const elements = {};
  const storage = {};
  let listeners = 0;
  const element = () => ({ innerHTML: '', textContent: '', value: '', hidden: false, disabled: false,
    focus() {}, setAttribute() {}, querySelectorAll: () => [],
    classList: { contains: () => false, add() {}, remove() {}, toggle() {} } });
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-29T12:00:00Z'])); } }
  const context = vm.createContext({ console, Date: Clock, Intl,
    setTimeout() {}, clearTimeout() {}, addEventListener() {}, history: {},
    localStorage: { getItem: key => storage[key] ?? null, setItem: (key, value) => { storage[key] = String(value); } },
    document: { readyState: 'loading', addEventListener() { listeners++; },
      getElementById: id => elements[id] ||= element(), querySelectorAll: () => [], body: element() },
    normalizeComplaintStatus: status => status === 'Open' ? 'Reviewed' : status,
    complaintStatusBadge: status => status,
  });
  context.window = context;
  const run = source => vm.runInContext(source, context);
  run(fs.readFileSync(path.join(root, 'public/js/main.js'), 'utf8'));
  run(fs.readFileSync(path.join(root, 'public/js/dashboard.js'), 'utf8'));
  run(`
    currentUser = { id: 'admin', role: 'admin', name: 'Admin', permissions: ['*'] };
    dbCache.homeowners = [{ id: 'h1', name: 'One', balance: 650 }, { id: 'h2', name: 'Two', balance: 250 }];
    dbCache.billings = [
      { id: 'b1', title: 'October', createdAt: '2026-10-01', amount: '500.00', assignedTo: ['h1', 'h2'] },
      { id: 'b2', title: 'September', createdAt: '2026-09-30', amount: 100, assignedTo: '["h1"]' },
      { id: 'b3', title: 'Undated', createdAt: null, amount: 10, assignedTo: ['h2'] }
    ];
    dbCache.payments = [
      { id: 'p1', homeownerId: 'h1', billingId: 'b1', amount: '100.00', status: 'approved', payment_date: '2026-10-01', submittedAt: '2026-09-30', verified_at: '2026-11-01T01:00:00Z', monthly_dues_month: '2027-01' },
      { id: 'p2', homeownerId: 'h1', billingId: 'b1', amount: '150.00', status: 'approved', payment_date: '2026-10-31', submittedAt: '2026-10-31' },
      { id: 'p3', homeownerId: 'h2', amount: 20, status: 'approved', verified_at: '2026-09-30T16:00:00Z', reviewedAt: '2026-09-30', submittedAt: '2026-09-28' },
      { id: 'p4', homeownerId: 'h2', amount: 30, status: 'approved', reviewedAt: '2026-10-15', submittedAt: '2026-09-27' },
      { id: 'p5', homeownerId: 'h2', amount: 40, status: 'approved', submittedAt: '2026-10-20' },
      { id: 'p6', homeownerId: 'h2', amount: 60, status: 'approved', payment_date: '2025-12-31', submittedAt: '2025-12-31' },
      { id: 'p7', homeownerId: 'h2', amount: 70, status: 'approved', payment_date: 'invalid', submittedAt: null },
      { id: 'p8', homeownerId: 'h1', amount: 80, status: 'pending', submittedAt: '2026-10-01', payment_date: '2026-09-30' },
      { id: 'p9', homeownerId: 'h1', amount: 90, status: 'pending', submittedAt: '2026-09-30' },
      { id: 'p10', homeownerId: 'h1', amount: 5, status: 'rejected', submittedAt: '2026-10-31T23:59:59+08:00' },
      { id: 'p11', homeownerId: 'h1', amount: 5, status: 'pending', submittedAt: '2026-02-30' }
    ];
    dbCache.complaints = [
      { id: 'c1', category: 'October', status: 'Reviewed', dateFiled: '2026-10-01' },
      { id: 'c2', category: 'September', status: 'Reviewed', dateFiled: '2026-09-30', updatedAt: '2026-10-05' },
      { id: 'c3', category: 'Resolved', status: 'Resolved', dateFiled: '2026-10-20' },
      { id: 'c4', category: 'Undated', status: 'Reviewed', dateFiled: null }
    ];
    db.save = () => { throw new Error('Dashboard must never write records'); };
  `);
  return { context, run, elements, storage, listeners: () => listeners,
    cards() { return [...elements.contentArea.innerHTML.matchAll(/class="stat-value">([^<]+)</g)].map(m => m[1]); } };
}

test('presets use Philippine calendar months/year, including January rollover and leap years', () => {
  const { context: c } = harness();
  assert.equal(c.adminDashboardRange({ preset: 'all' }), null);
  assert.deepEqual(plain(c.adminDashboardRange({ preset: 'month' })), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(plain(c.adminDashboardRange({ preset: 'lastMonth' })), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(plain(c.adminDashboardRange({ preset: 'year' })), { from: '2026-01-01', to: '2026-12-31' });
  const boundary = new Date('2025-12-31T16:00:00Z');
  assert.deepEqual(plain(c.adminDashboardRange({ preset: 'month' }, boundary)), { from: '2026-01-01', to: '2026-01-31' });
  assert.deepEqual(plain(c.adminDashboardRange({ preset: 'lastMonth' }, boundary)), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(plain(c.adminDashboardRange({ preset: 'lastMonth' }, new Date('2024-03-10Z'))), { from: '2024-02-01', to: '2024-02-29' });
});

test('This Week uses Monday–Sunday Philippine boundaries across months and years', () => {
  const { context: c } = harness();
  const range = c.adminDashboardRange({ preset: 'week' });
  assert.deepEqual(plain(range), { from: '2026-10-26', to: '2026-11-01' });
  assert.deepEqual(plain(c.adminDashboardRange({ preset: 'week' }, new Date('2026-11-01T15:59:59.999Z'))), plain(range));
  assert.deepEqual(plain(c.adminDashboardRange({ preset: 'week' }, new Date('2026-11-01T16:00:00Z'))), { from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual(plain(c.adminDashboardRange({ preset: 'week' }, new Date('2025-12-31T16:00:00Z'))), { from: '2025-12-29', to: '2026-01-04' });
  for (const date of ['2026-10-25T16:00:00Z', '2026-11-01T15:59:59.999Z']) {
    assert.equal(c.adminDashboardIncludes(date, range), true);
  }
  for (const date of ['2026-10-25T15:59:59.999Z', '2026-11-01T16:00:00Z']) {
    assert.equal(c.adminDashboardIncludes(date, range), false);
  }
});

test('This Week filters dashboard results and persists through navigation with current balances unchanged', () => {
  const h = harness();
  const before = h.run('JSON.stringify(dbCache)');
  h.context.changeAdminDashboardPeriod('week');
  assert.deepEqual(h.cards(), ['2', '₱150', '₱0', '₱900', '0', '0']);
  assert.match(h.elements.contentArea.innerHTML, /value="week" selected>This Week/);
  assert.match(h.elements.donutChart.innerHTML, /donut-value">2</);
  assert.equal((h.elements.recentPaymentsTable.innerHTML.match(/<tr>/g) || []).length, 2);
  assert.match(h.elements.recentComplaintsPanel.innerHTML, /No complaints/);
  h.elements.contentArea.innerHTML = '<p>Another page</p>';
  h.context.renderAdminDashboard();
  assert.match(h.elements.contentArea.innerHTML, /value="week" selected>This Week/);
  assert.equal(h.run('JSON.stringify(dbCache)'), before);
  h.context.changeAdminDashboardPeriod('all');
  assert.deepEqual(h.cards(), ['2', '₱470', '₱1,110', '₱900', '3', '3']);
});

test('inclusive dates accept local dates and offset timestamps, reject invalid/missing dates', () => {
  const { context: c } = harness();
  const range = { from: '2026-10-01', to: '2026-10-31' };
  for (const value of ['2026-10-01', '2026-10-31', '2026-09-30T16:00:00Z', '2026-10-31T15:59:59.999Z', '2026-10-31 23:59:59', '2026-10-01T00:00:00+08:00']) {
    assert.equal(c.adminDashboardIncludes(value, range), true, value);
  }
  for (const value of [null, undefined, '', 0, 'not a date', '10/01/2026', '2026-02-30', '2026-10-32', '2026-10-01T24:00:00Z', '2026-10-01T00:00:00+25:00', '2026-09-30T15:59:59.999Z', '2026-10-31T16:00:00Z']) {
    assert.equal(c.adminDashboardIncludes(value, range), false, String(value));
    assert.equal(c.adminDashboardIncludes(value, null), true, 'All Time retains legacy data');
  }
  assert.equal(c.adminDashboardDate('2024-02-29').day, '2024-02-29');
  assert.equal(c.adminDashboardDate('2025-02-29'), null);
});

test('All Time matches original totals, assigned billing counts and records without writes', () => {
  const h = harness();
  const before = h.run('JSON.stringify(dbCache)');
  h.context.renderAdminDashboard();
  assert.deepEqual(h.cards(), ['2', '₱470', '₱1,110', '₱900', '3', '3']);
  assert.match(h.elements.contentArea.innerHTML, /Undated/);
  assert.match(h.elements.recentComplaintsPanel.innerHTML, /Undated/);
  assert.match(h.elements.contentArea.innerHTML, /Approved \(7\)/);
  assert.match(h.elements.donutChart.innerHTML, /donut-value">11</);
  assert.equal(h.run('JSON.stringify(dbCache)'), before);
});

test('This Month uses transaction dates for partial collections, submission dates for statuses, and filed dates for complaints', () => {
  const h = harness();
  const before = h.run('JSON.stringify(dbCache)');
  h.context.changeAdminDashboardPeriod('month');
  assert.deepEqual(h.cards(), ['2', '₱340', '₱1,000', '₱900', '1', '1']);
  assert.match(h.elements.contentArea.innerHTML, /Approved \(2\)/);
  assert.match(h.elements.contentArea.innerHTML, /Pending \(1\)/);
  assert.match(h.elements.contentArea.innerHTML, /Rejected \(1\)/);
  assert.match(h.elements.donutChart.innerHTML, /donut-value">4</);
  assert.equal((h.elements.donutChart.innerHTML.match(/stroke-dasharray=/g) || []).length, 3);
  assert.doesNotMatch(h.elements.recentPaymentsTable.innerHTML, /₱100</);
  assert.doesNotMatch(h.elements.recentComplaintsPanel.innerHTML, /September|Undated/);
  assert.equal(h.run('JSON.stringify(dbCache)'), before);
});

test('Last Month and This Year apply to every scoped summary; current balances never change', () => {
  const h = harness();
  h.context.changeAdminDashboardPeriod('lastMonth');
  assert.deepEqual(h.cards(), ['2', '₱0', '₱100', '₱900', '1', '1']);
  h.context.changeAdminDashboardPeriod('year');
  assert.deepEqual(h.cards(), ['2', '₱340', '₱1,100', '₱900', '2', '2']);
});

test('collection fallback is first valid payment_date, verified_at, reviewedAt, submittedAt; never dues month', () => {
  const { context: c } = harness();
  const payment = { payment_date: '2026-10-01', verified_at: '2026-11-02T00:00:00Z', reviewedAt: '2026-11-03', submittedAt: '2026-09-01', monthly_dues_month: '2027-01' };
  for (const field of ['payment_date', 'verified_at', 'reviewedAt', 'submittedAt']) {
    assert.equal(c.adminDashboardCollectionDate(payment), payment[field]);
    payment[field] = 'invalid';
  }
  assert.equal(c.adminDashboardCollectionDate(payment), null);
});

test('custom dates validate before applying, allow a single day, and Reset restores All Time', () => {
  const h = harness();
  h.context.changeAdminDashboardPeriod('month');
  const html = h.elements.contentArea.innerHTML;
  h.context.changeAdminDashboardPeriod('custom');
  assert.equal(h.elements.adminDashboardCustomDates.hidden, false);
  assert.equal(h.run('adminDashboardPeriod.preset'), 'month');
  for (const [from, to] of [['', ''], ['2026-11-01', '2026-10-01'], ['2026-02-30', '2026-03-01']]) {
    h.elements.adminDashboardFrom.value = from;
    h.context.document.getElementById('adminDashboardTo').value = to;
    assert.equal(h.context.applyAdminDashboardPeriod(), false);
    assert.match(h.elements.adminDashboardPeriodError.textContent, /valid From and To/);
    assert.equal(h.elements.contentArea.innerHTML, html);
  }
  h.elements.adminDashboardFrom.value = h.elements.adminDashboardTo.value = '2026-10-01';
  h.context.applyAdminDashboardPeriod();
  assert.deepEqual(h.cards(), ['2', '₱120', '₱1,000', '₱900', '1', '1']);
  h.context.changeAdminDashboardPeriod('all');
  assert.deepEqual(h.cards(), ['2', '₱470', '₱1,110', '₱900', '3', '3']);
  assert.equal(h.run('adminDashboardPeriod.from'), '');
});

test('zero-result period clears tables and chart while preserving current totals', () => {
  const h = harness();
  h.run("adminDashboardPeriod = { preset: 'custom', from: '2040-01-01', to: '2040-01-31' }");
  h.context.renderAdminDashboard();
  assert.deepEqual(h.cards(), ['2', '₱0', '₱0', '₱900', '0', '0']);
  assert.match(h.elements.contentArea.innerHTML, /No billings created in this period/);
  assert.match(h.elements.recentPaymentsTable.innerHTML, /No payments submitted in this period/);
  assert.match(h.elements.recentComplaintsPanel.innerHTML, /No complaints filed in this period/);
  assert.match(h.elements.donutChart.innerHTML, /donut-value">0</);
  assert.doesNotMatch(h.elements.donutChart.innerHTML, /stroke-dasharray|NaN/);
});

test('recent lists sort by actual date descending, cap at 5/5/4, and do not mutate records', () => {
  const h = harness();
  h.run(`
    dbCache.billings = Array.from({ length: 8 }, (_, i) => ({ id: 'b' + i, title: 'Bill ' + i, amount: 10, assignedTo: ['h1'], createdAt: '2026-10-' + String(i + 1).padStart(2, '0') }));
    dbCache.payments = dbCache.billings.map((b, i) => ({ id: 'p' + i, homeownerId: 'h1', amount: i + 1, status: 'approved', submittedAt: b.createdAt }));
    dbCache.complaints = dbCache.billings.map((b, i) => ({ id: 'c' + i, category: 'Complaint ' + i, status: 'Reviewed', dateFiled: b.createdAt }));
  `);
  const before = h.run('JSON.stringify(dbCache)');
  h.context.changeAdminDashboardPeriod('month');
  assert.deepEqual([...h.elements.contentArea.innerHTML.matchAll(/<strong>Bill (\d)<\/strong>/g)].map(m => m[1]), ['7', '6', '5', '4', '3']);
  assert.deepEqual([...h.elements.recentPaymentsTable.innerHTML.matchAll(/₱(\d)</g)].map(m => m[1]), ['8', '7', '6', '5', '4']);
  assert.deepEqual([...h.elements.recentComplaintsPanel.innerHTML.matchAll(/Complaint (\d)/g)].map(m => m[1]), ['7', '6', '5', '4']);
  assert.equal(h.run('JSON.stringify(dbCache)'), before);
  assert.deepEqual(plain(h.context.adminDashboardRecent([{ id: 'early', date: '2026-10-02T00:00:00+08:00' }, { id: 'late', date: '2026-10-01T17:00:00Z' }, { id: 'invalid' }], 'date', 3)).map(r => r.id), ['late', 'early', 'invalid']);
});

test('navigation preserves period, repeated renders add no listeners, and revenue year remains independent', () => {
  const h = harness();
  const listeners = h.listeners();
  h.context.changeAdminDashboardPeriod('month');
  h.context.setAdminRevenueYear(2027);
  const saved = { ...h.storage };
  h.elements.contentArea.innerHTML = '<p>Another page</p>';
  h.context.renderAdminDashboard();
  assert.match(h.elements.contentArea.innerHTML, /value="month" selected/);
  assert.match(h.elements.contentArea.innerHTML, /revenueYearText">2027</);
  assert.match(h.elements.barChart.innerHTML, /data-value="100" data-month="Jan"/);
  h.context.changeAdminDashboardPeriod('lastMonth');
  assert.deepEqual(h.storage, saved);
  assert.match(h.elements.barChart.innerHTML, /data-value="100" data-month="Jan"/);
  h.context.changeAdminDashboardPeriod('all');
  assert.deepEqual(h.storage, saved);
  assert.equal(h.listeners(), listeners);
});
