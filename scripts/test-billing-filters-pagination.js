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
global.navigator = { clipboard: { writeText: async () => {} } };
global.location = { hash: '', pathname: '/' };
global.history = { pushState: () => {}, replaceState: () => {} };

// Load application scripts
const mainJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'main.js'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
const billingJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'billing.js'), 'utf8');

// Mock current user
global.currentUser = {
  id: 'u001',
  role: 'admin',
  name: 'Administrator',
  permissions: ['*'],
};

// Set up mock test data
const mockUsers = [
  { id: 'u001', role: 'admin', name: 'Admin User', username: 'admin' },
  { id: 'ho001', role: 'homeowner', name: 'Keith Bryan', username: 'keith', email: 'keith@example.com', block: 'Block 1', lot: 'Lot 5' },
  { id: 'ho002', role: 'homeowner', name: 'Joy San Luis', username: 'sanluisjoy', email: 'joy@example.com', block: 'Block 2', lot: 'Lot 10' },
  { id: 'ho003', role: 'homeowner', name: 'Maria Santos', username: 'msantos', email: 'maria@example.com', block: 'Block 3', lot: 'Lot 12' },
];

const todayStr = new Date().toISOString().slice(0, 10);
const pastDateStr = '2026-01-15';
const futureDateStr = '2026-11-30';

const mockBillings = [
  // 1. Paid billing
  {
    id: 'b-paid-1',
    title: 'Monthly Association Dues - January 2026',
    amount: 1500,
    dueDate: '2026-01-31',
    createdAt: '2026-01-01',
    assignedTo: ['ho001'],
    status: 'active',
    monthly_dues_month: '2026-01',
    billing_type: 'Monthly Association Dues',
  },
  // 2. Overdue billing (past due date, no approved payment)
  {
    id: 'b-overdue-1',
    title: 'Special Assessment - Gate Repair',
    amount: 2500,
    dueDate: pastDateStr,
    createdAt: '2026-01-01',
    assignedTo: ['ho002'],
    status: 'active',
    description: 'Emergency gate motor replacement',
    billing_type: 'Other Billing',
  },
  // 3. Unpaid billing (future due date, not paid)
  {
    id: 'b-unpaid-future',
    title: 'Monthly Association Dues - November 2026',
    amount: 1750,
    dueDate: futureDateStr,
    createdAt: todayStr,
    assignedTo: ['ho001', 'ho003'],
    status: 'active',
    monthly_dues_month: '2026-11',
    billing_type: 'Monthly Association Dues',
  },
  // 4. Today billing (created today, due today, unpaid)
  {
    id: 'b-today-1',
    title: 'Clubhouse Maintenance Fee',
    amount: 800,
    dueDate: todayStr,
    createdAt: todayStr,
    assignedTo: ['ho003'],
    status: 'active',
    description: 'Pool and clubhouse upkeep',
    billing_type: 'Other Billing',
  },
];

// Add extra billings to test pagination (> 10 items)
for (let i = 5; i <= 25; i++) {
  mockBillings.push({
    id: `b-extra-${i}`,
    title: `General Assessment Item #${i}`,
    amount: 500 + i * 10,
    dueDate: futureDateStr,
    createdAt: todayStr,
    assignedTo: ['ho001'],
    status: 'active',
    description: `Assessment item ${i}`,
    billing_type: 'Other Billing',
  });
}

const mockPayments = [
  // Approved payment for b-paid-1
  {
    id: 'p-001',
    homeownerId: 'ho001',
    billingId: 'b-paid-1',
    amount: 1500,
    status: 'approved',
    monthly_dues_month: '2026-01',
    payment_date: '2026-01-10',
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
    return global.db.get(table).find(x => x.id === id) || null;
  },
  save: async (table, item) => item,
  delete: async () => {},
  newId: (p) => p + Date.now().toString(36),
};

global.canManageBilling = () => true;
global.syncHomeownerBalances = () => {};
global.showToast = () => {};
global.showLoading = () => {};
global.hideLoading = () => {};
global.openModal = () => {};
global.closeModal = () => {};
global.logAction = () => {};

const vm = require('vm');
vm.runInThisContext(mainJs);
vm.runInThisContext(dashboardJs);
vm.runInThisContext(billingJs);

// Populate db data after scripts are loaded
dbCache['users'] = mockUsers;
dbCache['billings'] = mockBillings;
dbCache['payments'] = mockPayments;

global.canManageBilling = () => true;
global.syncHomeownerBalances = () => {};

console.log('=== Running Admin Billing Pagination & Filtering Tests ===\n');
let passed = 0;
let total = 0;

function test(description, fn) {
  total++;
  try {
    fn();
    console.log(`[PASS] ${description}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${description}:`, err.message);
  }
}

// 1. Initial Render & Pagination UI
test('renderBilling sets up header, controls, table, and pagination container', () => {
  renderBilling();
  const content = elements['contentArea']?.innerHTML || '';
  assert(content.includes('Billing Management'), 'Header title missing');
  assert(content.includes('id="billSearch"'), 'Search input missing');
  assert(content.includes('id="billStatusFilter"'), 'Status filter missing');
  assert(content.includes('id="billDateFilter"'), 'Date filter missing');
  assert(content.includes('id="billingPagination"'), 'Pagination container missing');
  assert(content.includes('id="billTableBody"'), 'Table body missing');
});

// 2. Pagination Page Slicing & Per Page
test('Default pagination shows 10 items per page with total count 25', () => {
  renderBilling();
  assert.strictEqual(billingPaginationState.page, 1, 'Initial page should be 1');
  assert.strictEqual(billingPaginationState.pageSize, 10, 'Initial pageSize should be 10');
  const tbody = elements['billTableBody']?.innerHTML || '';
  const rowCount = (tbody.match(/<tr/g) || []).length;
  assert.strictEqual(rowCount, 10, 'Should render exactly 10 rows on page 1');
  const paginHtml = elements['billingPagination']?.innerHTML || '';
  assert(paginHtml.includes('Showing <span class="table-pagination-highlight">1</span> to <span class="table-pagination-highlight">10</span> of <span class="table-pagination-highlight">25</span>'), 'Pagination label text incorrect');
});

test('changeBillingPage navigates to page 2', () => {
  changeBillingPage(2);
  assert.strictEqual(billingPaginationState.page, 2, 'Page should be 2');
  const tbody = elements['billTableBody']?.innerHTML || '';
  const rowCount = (tbody.match(/<tr/g) || []).length;
  assert.strictEqual(rowCount, 10, 'Should render 10 rows on page 2');
  const paginHtml = elements['billingPagination']?.innerHTML || '';
  assert(paginHtml.includes('Showing <span class="table-pagination-highlight">11</span> to <span class="table-pagination-highlight">20</span>'), 'Pagination start/end incorrect for page 2');
});

test('changeBillingPageSize changes page size to 5 and resets page to 1', () => {
  changeBillingPageSize(5);
  assert.strictEqual(billingPaginationState.pageSize, 5, 'PageSize should be 5');
  assert.strictEqual(billingPaginationState.page, 1, 'Page should be reset to 1 on size change');
  const tbody = elements['billTableBody']?.innerHTML || '';
  const rowCount = (tbody.match(/<tr/g) || []).length;
  assert.strictEqual(rowCount, 5, 'Should render 5 rows');
});

// Reset pageSize back to 10 for following tests
billingPaginationState.pageSize = 10;

// 3. Search Field Tests
test('Search by resident name (e.g. Keith) returns matching billings and resets page to 1', () => {
  changeBillingPage(2);
  elements['billSearch'].value = 'Keith';
  filterBillings(true);
  assert.strictEqual(billingPaginationState.page, 1, 'Page should reset to 1 after search');
  const tbody = elements['billTableBody']?.innerHTML || '';
  assert(tbody.includes('January 2026'), 'Should include Keith billing b-paid-1');
  assert(tbody.includes('November 2026'), 'Should include Keith billing b-unpaid-future');
  assert(!tbody.includes('Gate Repair'), 'Should NOT include Joy billing b-overdue-1');
});

test('Search by resident block (e.g. Block 2) matches Joy San Luis', () => {
  elements['billSearch'].value = 'Block 2';
  filterBillings(true);
  const tbody = elements['billTableBody']?.innerHTML || '';
  assert(tbody.includes('Gate Repair'), 'Should find billing assigned to Block 2 resident');
  assert(!tbody.includes('January 2026'), 'Should not find Keith billing');
});

test('Search by billing description (e.g. Emergency gate motor)', () => {
  elements['billSearch'].value = 'Emergency gate motor';
  filterBillings(true);
  const tbody = elements['billTableBody']?.innerHTML || '';
  assert(tbody.includes('Gate Repair'), 'Should match by billing description');
});

test('Search by billing amount (e.g. 2,500.00 or 2500)', () => {
  elements['billSearch'].value = '2,500';
  filterBillings(true);
  const tbody = elements['billTableBody']?.innerHTML || '';
  assert(tbody.includes('Gate Repair'), 'Should match by formatted amount 2,500');
});

test('Search by monthly dues month name (e.g. November 2026)', () => {
  elements['billSearch'].value = 'November 2026';
  filterBillings(true);
  const tbody = elements['billTableBody']?.innerHTML || '';
  assert(tbody.includes('November 2026'), 'Should match by formatted month name');
});

// 4. Status Filter Tests
test('Status filter Paid returns only approved paid billings', () => {
  resetBillingFilters();
  elements['billStatusFilter'].value = 'paid';
  filterBillings(true);
  const tbody = elements['billTableBody']?.innerHTML || '';
  assert(tbody.includes('b-paid-1') || tbody.includes('January 2026'), 'Should include paid billing');
  assert(!tbody.includes('Gate Repair'), 'Should NOT include overdue billing in paid');
  assert(!tbody.includes('November 2026'), 'Should NOT include unpaid billing in paid');
});

test('Status filter Overdue returns only past due uncollected billings', () => {
  resetBillingFilters();
  elements['billStatusFilter'].value = 'overdue';
  filterBillings(true);
  const tbody = elements['billTableBody']?.innerHTML || '';
  assert(tbody.includes('Gate Repair'), 'Should include overdue Gate Repair');
  assert(!tbody.includes('January 2026'), 'Should NOT include paid January 2026 dues');
  assert(!tbody.includes('November 2026'), 'Should NOT include future November 2026 dues');
});

test('Status filter Unpaid returns uncollected active/pending billings that are not overdue', () => {
  resetBillingFilters();
  elements['billStatusFilter'].value = 'unpaid';
  filterBillings(true);
  const tbody = elements['billTableBody']?.innerHTML || '';
  assert(tbody.includes('November 2026'), 'Should include unpaid future November dues');
  assert(!tbody.includes('January 2026'), 'Should NOT include paid January dues');
  assert(!tbody.includes('Gate Repair'), 'Should NOT include overdue Gate Repair in unpaid');
});

// 5. Date Filter Tests
test('Date filter Today matches billings with date today', () => {
  resetBillingFilters();
  elements['billDateFilter'].value = 'today';
  filterBillings(true);
  const tbody = elements['billTableBody']?.innerHTML || '';
  assert(tbody.includes('Clubhouse Maintenance Fee'), 'Should match b-today-1');
  assert(!tbody.includes('January 2026'), 'Should NOT match January 2026');
});

test('Date filter Choose Date matches specific date', () => {
  resetBillingFilters();
  elements['billDateFilter'].value = 'date';
  elements['billDate'].value = pastDateStr;
  filterBillings(true);
  const tbody = elements['billTableBody']?.innerHTML || '';
  assert(tbody.includes('Gate Repair'), 'Should match Gate Repair with due date 2026-01-15');
});

test('Date filter Date Range matches date interval', () => {
  resetBillingFilters();
  elements['billDateFilter'].value = 'range';
  elements['billStartDate'].value = '2026-01-01';
  elements['billEndDate'].value = '2026-01-31';
  filterBillings(true);
  const tbody = elements['billTableBody']?.innerHTML || '';
  assert(tbody.includes('January 2026'), 'Should match January dues');
  assert(tbody.includes('Gate Repair'), 'Should match Gate Repair in January');
  assert(!tbody.includes('November 2026'), 'Should NOT match November dues');
});

// 6. Combined Filter & Pagination Reset Tests
test('Combined Search + Status + Date work together with pagination', () => {
  resetBillingFilters();
  elements['billSearch'].value = 'Keith';
  elements['billStatusFilter'].value = 'unpaid';
  elements['billDateFilter'].value = 'range';
  elements['billStartDate'].value = '2026-11-01';
  elements['billEndDate'].value = '2026-12-31';
  filterBillings(true);
  const tbody = elements['billTableBody']?.innerHTML || '';
  assert(tbody.includes('November 2026'), 'Should match Keith unpaid November dues in range');
  assert(!tbody.includes('January 2026'), 'Should exclude January dues because status is paid');
});

test('resetBillingFilters resets search, status, date and pagination to page 1', () => {
  elements['billSearch'].value = 'Sample';
  elements['billStatusFilter'].value = 'paid';
  elements['billDateFilter'].value = 'today';
  billingPaginationState.page = 3;
  resetBillingFilters();
  assert.strictEqual(elements['billSearch'].value, '', 'Search should be cleared');
  assert.strictEqual(elements['billStatusFilter'].value, 'all', 'Status should be all');
  assert.strictEqual(elements['billDateFilter'].value, 'all', 'Date filter should be all');
  assert.strictEqual(billingPaginationState.page, 1, 'Page should reset to 1');
});

test('Existing functions viewBillingDetail and confirmDeleteBilling remain defined', () => {
  assert(typeof viewBillingDetail === 'function', 'viewBillingDetail must exist');
  assert(typeof confirmDeleteBilling === 'function', 'confirmDeleteBilling must exist');
  assert(typeof autoGenerateLotAreaMonthlyDues === 'function', 'autoGenerateLotAreaMonthlyDues must exist');
  assert(typeof openProfessionalBillingModal === 'function', 'openProfessionalBillingModal must exist');
});

console.log(`\n=== Verification Finished: ${passed}/${total} checks passed ===\n`);
if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
