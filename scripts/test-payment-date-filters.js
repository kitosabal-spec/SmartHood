const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Simulate DOM and Browser environment
const elements = {};

function createMockElement(id, tagName = 'div') {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    value: '',
    innerHTML: '',
    style: { display: '' },
    children: [],
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false,
    },
    setAttribute: () => {},
    getAttribute: () => null,
    addEventListener: (evt, handler) => {
      el[`on${evt}`] = handler;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: (child) => el.children.push(child),
    removeChild: () => {},
  };
  return el;
}

global.document = {
  getElementById: (id) => {
    if (!elements[id]) {
      elements[id] = createMockElement(id);
    }
    return elements[id];
  },
  createElement: (tag) => createMockElement('', tag),
  body: createMockElement('body'),
  documentElement: { dataset: {} },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
};

global.window = global;
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.fetch = async () => ({ ok: true, json: async () => ({}) });
global.localStorage = { getItem: () => null, setItem: () => {} };
global.location = { hash: '', pathname: '/' };

// Mock current user as admin
global.currentUser = {
  id: 'u001',
  role: 'admin',
  name: 'Administrator',
  permissions: ['*'],
};

// Global helpers
global.canViewPayments = () => true;
global.canManagePayments = () => true;
global.canManageBilling = () => true;
global.canViewReports = () => true;
global.showToast = () => {};

// Mock DB
const mockUsers = [
  { id: 'ho001', role: 'homeowner', name: 'Keith Bryan', username: 'keith', email: 'keith@example.com', block: 'Block 1', lot: 'Lot 5' },
  { id: 'ho002', role: 'homeowner', name: 'Joy San Luis', username: 'joy', email: 'joy@example.com', block: 'Block 2', lot: 'Lot 10' },
  { id: 'ho003', role: 'homeowner', name: 'Maria Santos', username: 'maria', email: 'maria@example.com', block: 'Block 3', lot: 'Lot 12' },
];

const mockBillings = [
  { id: 'b001', title: 'Monthly Association Dues - September 2026', amount: 1500, assignedTo: ['ho001'] },
  { id: 'b002', title: 'Special Assessment Gate', amount: 2000, assignedTo: ['ho002'] },
  { id: 'b003', title: 'Clubhouse Maintenance', amount: 800, assignedTo: ['ho003'] },
];

function toIsoDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const now = new Date();
const todayStr = toIsoDate(now);

const dayOfWeek = now.getDay() || 7;
const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1);
const thisWeekStr = toIsoDate(mon);

const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-02`;
const pastDateThisYear = `${now.getFullYear()}-01-10`;
const lastYearDate = `${now.getFullYear() - 1}-06-15`;

const mockPayments = [
  // 1. Payment today (Keith, approved)
  {
    id: 'pay-today-1',
    homeownerId: 'ho001',
    billingId: 'b001',
    amount: 1500,
    payment_method: 'GCash',
    refNum: 'GCASH-TODAY-001',
    payment_date: todayStr,
    submittedAt: todayStr,
    status: 'approved',
  },
  // 2. Payment this week, pending (Joy)
  {
    id: 'pay-week-1',
    homeownerId: 'ho002',
    billingId: 'b002',
    amount: 2000,
    payment_method: 'GCash',
    refNum: 'GCASH-WEEK-002',
    payment_date: thisWeekStr,
    submittedAt: thisWeekStr,
    status: 'pending',
  },
  // 3. Payment earlier this month, rejected (Maria)
  {
    id: 'pay-month-1',
    homeownerId: 'ho003',
    billingId: 'b003',
    amount: 800,
    payment_method: 'Cash',
    payment_source: 'manual_admin',
    refNum: 'CASH-MONTH-003',
    payment_date: thisMonthStr,
    submittedAt: thisMonthStr,
    status: 'rejected',
  },
  // 4. Payment earlier this year (Keith)
  {
    id: 'pay-year-1',
    homeownerId: 'ho001',
    billingId: 'b001',
    amount: 1500,
    payment_method: 'GCash',
    refNum: 'GCASH-YEAR-004',
    payment_date: pastDateThisYear,
    submittedAt: pastDateThisYear,
    status: 'approved',
  },
  // 5. Payment last year (Joy)
  {
    id: 'pay-lastyear-1',
    homeownerId: 'ho002',
    billingId: 'b002',
    amount: 2000,
    payment_method: 'GCash',
    refNum: 'GCASH-OLD-005',
    payment_date: lastYearDate,
    submittedAt: lastYearDate,
    status: 'approved',
  },
];

global.db = {
  get: (table) => {
    if (table === 'users') return mockUsers;
    if (table === 'billings') return mockBillings;
    if (table === 'payments') return mockPayments;
    return [];
  },
  getOne: (table, id) => {
    const list = global.db.get(table);
    return list.find(x => x.id === id) || null;
  }
};

// Load billing.js
const billingCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'billing.js'), 'utf8');
eval(billingCode);

console.log('=== Running Admin Payment Date Filter Tests ===\n');

// Test 1: renderPayments sets up the date filter controls
{
  const contentArea = document.getElementById('contentArea');
  renderPayments();

  const html = contentArea.innerHTML;
  assert(html.includes('Payment Management'), 'Header should say Payment Management for admin');
  assert(html.includes('id="paySearch"'), 'paySearch input exists');
  assert(html.includes('id="payFilter"'), 'payFilter select exists');
  assert(html.includes('id="payDateFilter"'), 'payDateFilter select exists');
  assert(html.includes('id="payDateWrap"'), 'payDateWrap container exists');
  assert(html.includes('id="payDate"'), 'payDate input exists');
  assert(html.includes('id="payRangeWrap"'), 'payRangeWrap container exists');
  assert(html.includes('id="payStartDate"'), 'payStartDate input exists');
  assert(html.includes('id="payEndDate"'), 'payEndDate input exists');
  assert(html.includes('id="payResetBtn"'), 'payResetBtn exists');
  assert(html.includes('id="payTableBody"'), 'payTableBody table body exists');

  // Check payDateFilter options in innerHTML
  assert(html.includes('value="all">All Dates'), 'Options should include All Dates');
  assert(html.includes('value="today">Today'), 'Options should include Today');
  assert(html.includes('value="week">This Week'), 'Options should include This Week');
  assert(html.includes('value="month">This Month'), 'Options should include This Month');
  assert(html.includes('value="year">This Year'), 'Options should include This Year');
  assert(html.includes('value="date">Choose Date'), 'Options should include Choose Date');
  assert(html.includes('value="range">Date Range'), 'Options should include Date Range');

  console.log('[PASS] renderPayments sets up header, search, status, and all date filter controls');
}

// Test 2: Filter preset "today"
{
  document.getElementById('payDateFilter').value = 'today';
  document.getElementById('payFilter').value = '';
  document.getElementById('paySearch').value = '';
  filterPayments();

  const tbodyHtml = document.getElementById('payTableBody').innerHTML;
  assert(tbodyHtml.includes('GCASH-TODAY-001'), 'Today filter must include payment from today');
  assert(!tbodyHtml.includes('GCASH-YEAR-004'), 'Today filter must exclude past date this year');
  assert(!tbodyHtml.includes('GCASH-OLD-005'), 'Today filter must exclude last year payment');

  console.log('[PASS] Date filter "today" correctly filters payments from today');
}

// Test 3: Filter preset "week" (This Week)
{
  document.getElementById('payDateFilter').value = 'week';
  document.getElementById('payFilter').value = '';
  document.getElementById('paySearch').value = '';
  filterPayments();

  const tbodyHtml = document.getElementById('payTableBody').innerHTML;
  assert(tbodyHtml.includes('GCASH-TODAY-001'), 'This Week filter must include payment from today');
  assert(tbodyHtml.includes('GCASH-WEEK-002'), 'This Week filter must include payment from Monday this week');
  assert(!tbodyHtml.includes('GCASH-YEAR-004'), 'This Week filter must exclude past date this year');
  assert(!tbodyHtml.includes('GCASH-OLD-005'), 'This Week filter must exclude last year payment');

  console.log('[PASS] Date filter "week" correctly filters payments within current week');
}

// Test 4: Filter preset "month" (This Month)
{
  document.getElementById('payDateFilter').value = 'month';
  document.getElementById('payFilter').value = '';
  document.getElementById('paySearch').value = '';
  filterPayments();

  const tbodyHtml = document.getElementById('payTableBody').innerHTML;
  assert(tbodyHtml.includes('GCASH-TODAY-001'), 'This Month filter must include payment from today');
  assert(tbodyHtml.includes('CASH-MONTH-003'), 'This Month filter must include payment from earlier this month');
  assert(!tbodyHtml.includes('GCASH-YEAR-004'), 'This Month filter must exclude payment from January');
  assert(!tbodyHtml.includes('GCASH-OLD-005'), 'This Month filter must exclude last year payment');

  console.log('[PASS] Date filter "month" correctly filters payments within current month');
}

// Test 5: Filter preset "year" (This Year)
{
  document.getElementById('payDateFilter').value = 'year';
  document.getElementById('payFilter').value = '';
  document.getElementById('paySearch').value = '';
  filterPayments();

  const tbodyHtml = document.getElementById('payTableBody').innerHTML;
  assert(tbodyHtml.includes('GCASH-TODAY-001'), 'This Year filter must include payment from today');
  assert(tbodyHtml.includes('GCASH-YEAR-004'), 'This Year filter must include past payment from this year');
  assert(!tbodyHtml.includes('GCASH-OLD-005'), 'This Year filter must exclude payment from last year');

  console.log('[PASS] Date filter "year" correctly filters payments within current year');
}

// Test 6: Filter preset "date" (Choose Date)
{
  document.getElementById('payDateFilter').value = 'date';
  document.getElementById('payDate').value = pastDateThisYear;
  document.getElementById('payFilter').value = '';
  document.getElementById('paySearch').value = '';
  filterPayments();

  const tbodyHtml = document.getElementById('payTableBody').innerHTML;
  assert(tbodyHtml.includes('GCASH-YEAR-004'), 'Choose Date filter must include payment matching selected date');
  assert(!tbodyHtml.includes('GCASH-TODAY-001'), 'Choose Date filter must exclude payment from today');
  assert(!tbodyHtml.includes('GCASH-OLD-005'), 'Choose Date filter must exclude payment from last year');

  console.log('[PASS] Date filter "date" (Choose Date) matches exact selected date');
}

// Test 7: Filter preset "range" (Date Range)
{
  document.getElementById('payDateFilter').value = 'range';
  document.getElementById('payStartDate').value = `${now.getFullYear()}-01-01`;
  document.getElementById('payEndDate').value = `${now.getFullYear()}-01-31`;
  document.getElementById('payFilter').value = '';
  document.getElementById('paySearch').value = '';
  filterPayments();

  const tbodyHtml = document.getElementById('payTableBody').innerHTML;
  assert(tbodyHtml.includes('GCASH-YEAR-004'), 'Date Range filter must include payment from January');
  assert(!tbodyHtml.includes('GCASH-TODAY-001'), 'Date Range filter must exclude payment outside January range');
  assert(!tbodyHtml.includes('GCASH-OLD-005'), 'Date Range filter must exclude payment from last year');

  console.log('[PASS] Date filter "range" (Date Range) matches date interval');
}

// Test 8: onPaymentDateFilterChange visibility toggling and default initialization
{
  const payDateWrap = document.getElementById('payDateWrap');
  const payRangeWrap = document.getElementById('payRangeWrap');
  const payDate = document.getElementById('payDate');
  const payStartDate = document.getElementById('payStartDate');
  const payEndDate = document.getElementById('payEndDate');

  document.getElementById('payDateFilter').value = 'date';
  payDate.value = '';
  onPaymentDateFilterChange();

  assert.strictEqual(payDateWrap.style.display, 'inline-flex', 'payDateWrap should be shown when mode is date');
  assert.strictEqual(payRangeWrap.style.display, 'none', 'payRangeWrap should be hidden when mode is date');
  assert(payDate.value.length > 0, 'payDate should be auto-filled with default date if empty');

  document.getElementById('payDateFilter').value = 'range';
  payStartDate.value = '';
  payEndDate.value = '';
  onPaymentDateFilterChange();

  assert.strictEqual(payDateWrap.style.display, 'none', 'payDateWrap should be hidden when mode is range');
  assert.strictEqual(payRangeWrap.style.display, 'inline-flex', 'payRangeWrap should be shown when mode is range');
  assert(payStartDate.value.length > 0, 'payStartDate should be auto-filled if empty');
  assert(payEndDate.value.length > 0, 'payEndDate should be auto-filled if empty');

  console.log('[PASS] onPaymentDateFilterChange properly manages UI visibility and default date population');
}

// Test 9: Combined Status + Date filter
{
  document.getElementById('payDateFilter').value = 'year';
  document.getElementById('payFilter').value = 'pending';
  document.getElementById('paySearch').value = '';
  filterPayments();

  const tbodyHtml = document.getElementById('payTableBody').innerHTML;
  assert(tbodyHtml.includes('GCASH-WEEK-002'), 'Pending payment from this week should be included');
  assert(!tbodyHtml.includes('GCASH-TODAY-001'), 'Approved payment from today should be excluded by status filter');
  assert(!tbodyHtml.includes('CASH-MONTH-003'), 'Rejected payment from this month should be excluded by status filter');

  console.log('[PASS] Combined Status and Date filters work together');
}

// Test 10: Combined Search + Date filter
{
  document.getElementById('payDateFilter').value = 'year';
  document.getElementById('payFilter').value = '';
  document.getElementById('paySearch').value = 'Keith';
  filterPayments();

  const tbodyHtml = document.getElementById('payTableBody').innerHTML;
  assert(tbodyHtml.includes('GCASH-TODAY-001'), 'Keith today payment included');
  assert(tbodyHtml.includes('GCASH-YEAR-004'), 'Keith earlier payment included');
  assert(!tbodyHtml.includes('GCASH-WEEK-002'), 'Joy payment excluded by search filter');

  console.log('[PASS] Combined Search and Date filters work together');
}

// Test 11: resetPaymentFilters
{
  document.getElementById('paySearch').value = 'Some query';
  document.getElementById('payFilter').value = 'pending';
  document.getElementById('payDateFilter').value = 'range';
  document.getElementById('payDate').value = '2026-05-01';
  document.getElementById('payStartDate').value = '2026-05-01';
  document.getElementById('payEndDate').value = '2026-05-10';
  document.getElementById('payDateWrap').style.display = 'inline-flex';
  document.getElementById('payRangeWrap').style.display = 'inline-flex';

  resetPaymentFilters();

  assert.strictEqual(document.getElementById('paySearch').value, '', 'Search should be cleared');
  assert.strictEqual(document.getElementById('payFilter').value, '', 'Status filter should be reset to all');
  assert.strictEqual(document.getElementById('payDateFilter').value, 'all', 'Date filter should be reset to all');
  assert.strictEqual(document.getElementById('payDate').value, '', 'Date input should be cleared');
  assert.strictEqual(document.getElementById('payStartDate').value, '', 'Start date input should be cleared');
  assert.strictEqual(document.getElementById('payEndDate').value, '', 'End date input should be cleared');
  assert.strictEqual(document.getElementById('payDateWrap').style.display, 'none', 'payDateWrap should be hidden');
  assert.strictEqual(document.getElementById('payRangeWrap').style.display, 'none', 'payRangeWrap should be hidden');

  const tbodyHtml = document.getElementById('payTableBody').innerHTML;
  assert(tbodyHtml.includes('GCASH-TODAY-001'), 'All payments restored');
  assert(tbodyHtml.includes('GCASH-WEEK-002'), 'All payments restored');
  assert(tbodyHtml.includes('CASH-MONTH-003'), 'All payments restored');
  assert(tbodyHtml.includes('GCASH-YEAR-004'), 'All payments restored');
  assert(tbodyHtml.includes('GCASH-OLD-005'), 'All payments restored');

  console.log('[PASS] resetPaymentFilters resets all search/status/date inputs and re-renders full list');
}

console.log('\n=== All 11 Admin Payment Date Filter Tests Passed! ===\n');
