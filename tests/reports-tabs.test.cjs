'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const elements = {}, requests = [], notices = [];
  let focused;
  const element = id => ({ id, value: '', innerHTML: '', hidden: false, isConnected: true, style: {}, attributes: {},
    classList: { add() {}, remove() {} }, setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute() {},
    focus() { focused = id; }, addEventListener() {}, appendChild() {} });
  const context = vm.createContext({ console, Intl, Date, Blob, history: {},
    localStorage: { getItem: () => null }, setTimeout() {}, clearTimeout() {}, addEventListener() {},
    document: { readyState: 'loading', addEventListener() {}, getElementById: id => elements[id] ||= element(id),
      createElement: () => element('new'), body: element('body') },
    normalizeComplaintStatus: value => value === 'Open' ? 'Reviewed' : value,
  });
  context.window = context;
  const run = source => vm.runInContext(source, context);
  run(fs.readFileSync(require.resolve('../public/js/main.js'), 'utf8'));
  run(fs.readFileSync(require.resolve('../public/js/disbursements.js'), 'utf8'));
  Object.assign(context, { syncHomeownerBalances() {}, renderDonut() {}, renderPaginationComponent() {},
    avatarHTML: () => '', complaintCategoryBadge: String, complaintStatusBadge: String,
    showToast: (...args) => notices.push(args), print() {} });
  const payload = { records: Array.from({ length: 12 }, (_, i) => ({ id: 'd' + i, expense_category: 'Gasoline', transaction_date: '2026-10-15', amount: '10.25' })),
    collections: [{ date: '2026-10-20', amount: '1000.50' }, { date: '2026-11-20', amount: '20.00' }] };
  context.request = async path => { requests.push(path); return payload; };
  run(`currentUser={id:'a',role:'admin',status:'active',permissions:['*']}; currentView='reports';
    api.request=request;
    dbCache.homeowners=Array.from({length:12},(_,i)=>({id:'h'+i,name:'Homeowner '+i,block:'1',lot:String(i)}));
    dbCache.billings=Array.from({length:12},(_,i)=>({id:'b'+i,title:'Bill '+i,amount:100,assignedTo:['h'+i],createdAt:'2026-10-01'}));
    dbCache.payments=[{id:'p',status:'approved',amount:1000.50,homeownerId:'h0',payment_date:'2026-10-20'}, {status:'pending',amount:99999,payment_date:'2026-10-20'}];
    dbCache.complaints=[{id:'c',homeownerId:'h0',category:'Noise',status:'Open',dateFiled:'2026-10-25'}];
    reportsDateFilterState={preset:'month'}; reportsDateFilterState={preset:'range',startDate:'2026-10-01',endDate:'2026-10-31'};
  `);
  ['hoBalanceSearch', 'hoBalanceStatusFilter', 'reportsDateFilter'].forEach(id => context.document.getElementById(id));
  return { context, run, elements, requests, notices, payload, focused: () => focused,
    async render() { context.renderReports(); await run('reportsFinancialRequest'); } };
}

test('four semantic tabs preserve snapshots, dates, search and pagination without fetching on switches', async () => {
  const f = fixture(); await f.render();
  const { run, elements, requests } = f;
  assert.equal(run('activeReportTab'), 'overview');
  assert.equal((elements.contentArea.innerHTML.match(/role="tab"/g) || []).length, 4);
  assert.match(elements.contentArea.innerHTML, /Financial, collection, expense, and community reports\./);
  const snapshot = run('currentReportsData');
  assert.equal(snapshot.totalDue, 1200);
  assert.equal(snapshot.totalPaid, 1000.5);
  assert.equal(snapshot.totalOutstanding, 199.5, 'expenses never reduce billing balances');
  assert.equal(snapshot.expenses.totalDisbursements, 123);
  assert.equal(snapshot.expenses.netCashMovement, 877.5);
  assert.match(elements['report-panel-overview'].innerHTML, /₱877\.50/);
  assert.doesNotMatch(elements['report-panel-overview'].innerHTML, /<table/);
  elements.hoBalanceSearch.value = 'Homeowner'; elements.hoBalanceStatusFilter.value = 'due';
  run('filterHOBalanceReport(); changeHOBalancePage(2); changeBillingCollectionPage(2); changeExpenseHistoryPage(2)');
  const before = run('JSON.stringify(getReportExportData())');
  const rows = elements.hoBalanceTableBody.innerHTML;
  for (const tab of ['collections', 'disbursements', 'community', 'overview']) {
    run(`switchReportTab('${tab}')`);
    assert.equal(run('currentReportsData'), snapshot);
    for (const key of ['overview', 'collections', 'disbursements', 'community']) {
      assert.equal(elements['report-panel-' + key].hidden, tab !== key);
      assert.equal(elements['report-tab-' + key].attributes['aria-selected'], String(tab === key));
      assert.equal(elements['report-tab-' + key].tabIndex, tab === key ? 0 : -1);
    }
  }
  assert.equal(requests.length, 1);
  assert.equal(elements.hoBalanceSearch.value, 'Homeowner');
  assert.equal(elements.hoBalanceTableBody.innerHTML, rows);
  assert.equal(run('hoBalancePaginationState.page'), 2);
  assert.equal(run('expenseHistoryPage'), 2);
  assert.equal(run('JSON.stringify(getReportExportData())').replace(/"generatedAt":"[^"]+"/, ''), before.replace(/"generatedAt":"[^"]+"/, ''));
  assert.equal(run('getReportExportData().balanceRows.length'), 12, 'export uses every matching homeowner');
});

test('keyboard tabs wrap, support Home/End and reject unauthorized changes', async () => {
  const f = fixture(); await f.render();
  const key = (id, key) => f.context.handleReportTabKey({ target: { id: 'report-tab-' + id }, key, preventDefault() {} });
  key('overview', 'ArrowLeft'); assert.equal(f.run('activeReportTab'), 'community'); assert.equal(f.focused(), 'report-tab-community');
  key('community', 'ArrowRight'); assert.equal(f.run('activeReportTab'), 'overview');
  key('overview', 'End'); assert.equal(f.run('activeReportTab'), 'community');
  key('community', 'Home'); assert.equal(f.run('activeReportTab'), 'overview');
  f.run("currentUser={id:'resident',role:'homeowner',permissions:['resident']}; switchReportTab('collections')");
  assert.equal(f.run('activeReportTab'), 'overview');
  const count = f.requests.length; f.context.renderReports(); assert.equal(f.requests.length, count);
  assert.equal(f.notices.at(-1)[1], 'Access Denied');
});

test('shared date changes retain the active tab and update both financial and community snapshots', async () => {
  const f = fixture(); await f.render();
  f.run("switchReportTab('disbursements')");
  f.elements.reportsDateFilter.value = 'date';
  f.context.document.getElementById('reportsDate').value = '2026-11-20';
  f.context.updateReportsDateFilter(); await f.run('reportsFinancialRequest');
  assert.equal(f.run('activeReportTab'), 'disbursements');
  assert.equal(f.run('currentReportsData.expenses.totalDisbursements'), 0);
  assert.equal(f.run('currentReportsData.expenses.totalCollections'), 20);
  assert.equal(f.run('currentReportsData.complaints.length'), 0);
  assert.match(f.elements.disbursementReportPanel.innerHTML, /No recorded expenses/);
  assert.match(f.elements.contentArea.innerHTML, /id="report-panel-disbursements"[^>]*tabindex="0" >/);
  f.run("switchReportTab('overview')"); assert.equal(f.run('reportsDateFilterState.date'), '2026-11-20');
});

test('print expands only the active tab to its full filtered dataset and restores pagination', async () => {
  const f = fixture(); await f.render();
  let captured;
  f.context.print = () => { captured = { billings: f.elements.billingCollectionTableBody.innerHTML, expenses: f.elements.expenseHistoryRows.innerHTML }; };
  f.run("switchReportTab('collections'); changeBillingCollectionPage(2); changeHOBalancePage(2)");
  await f.context.printReports();
  assert.equal((captured.billings.match(/<tr>/g) || []).length, 12);
  assert.equal(f.run('billingCollectionPaginationState.page'), 2);
  assert.equal(f.run('hoBalancePaginationState.page'), 2);
  f.run("switchReportTab('disbursements'); changeExpenseHistoryPage(2)");
  await f.context.printReports();
  assert.equal((captured.expenses.match(/<tr>/g) || []).length, 12);
  assert.equal(f.run('expenseHistoryPage'), 2);
  assert.match(f.elements.reportPrintContext.textContent, /Disbursements.*2026-10-01 to 2026-10-31/);
});

test('late financial responses cannot replace a newer period or cross an account change', async () => {
  const f = fixture(); const resolvers = [];
  f.context.request = () => new Promise(resolve => resolvers.push(resolve)); f.run('api.request=request');
  f.context.renderReports(); const old = f.run('reportsFinancialRequest');
  f.run("reportsDateFilterState={preset:'date',date:'2026-11-20'}; renderReports()");
  const current = f.run('reportsFinancialRequest');
  resolvers[1](f.payload); await current;
  resolvers[0](f.payload); await old;
  assert.equal(f.run('currentReportsData.expenses.totalCollections'), 20);
  f.context.renderReports(); const switched = f.run('reportsFinancialRequest');
  f.run("currentUser={id:'other',role:'homeowner',permissions:['resident']}");
  resolvers[2](f.payload); await switched;
  assert.equal(f.run('currentReportsData.expenses'), undefined);
  assert.equal(f.run('currentReportsData.expenseError'), true);
});
