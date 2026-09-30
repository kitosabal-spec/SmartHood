const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Load script sources
const mainJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'main.js'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');

// Mock localStorage
const storage = {};
global.localStorage = {
  getItem: (key) => (Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null),
  setItem: (key, val) => { storage[key] = String(val); },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};

global.history = { pushState: () => {}, replaceState: () => {} };

global.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};

// Mock DOM elements
let elements = {};
let renderedChartData = null;

function resetMockDom() {
  elements = {};
  renderedChartData = null;
}

function getOrCreateElement(id) {
  if (!elements[id]) {
    elements[id] = {
      id,
      innerHTML: '',
      textContent: '',
      value: '',
      disabled: false,
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); },
        toggle(c, force) {
          if (force !== undefined) {
            if (force) this.classes.add(c);
            else this.classes.delete(c);
          } else {
            if (this.classes.has(c)) this.classes.delete(c);
            else this.classes.add(c);
          }
        }
      },
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      contains() { return false; },
      dataset: {}
    };
  }
  return elements[id];
}

global.document = {
  getElementById: (id) => getOrCreateElement(id),
  querySelectorAll: (selector) => {
    return [];
  },
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  body: {
    innerHTML: '',
    appendChild: () => {},
    removeChild: () => {}
  },
  documentElement: {
    dataset: {}
  }
};

global.addEventListener = () => {};
global.removeEventListener = () => {};
global.fetch = async () => ({ ok: true, json: async () => ({}) });
global.window = global;
global.location = { hash: '', pathname: '/' };
global.toMoneyNumber = (v) => Number(v) || 0;
global.formatCurrency = (v) => '₱' + Number(v).toLocaleString();
global.syncHomeownerBalances = () => {};
global.normalizeComplaintStatus = (s) => s || 'Pending';
global.paymentStatusCounts = () => ({ approved: 1, pending: 0, rejected: 0 });
global.getBillingTotal = (b) => Number(b.amount) || 0;

global.currentUser = { id: 'admin1', name: 'Admin User', role: 'admin' };

global.badgeHtml = (s) => `<span>${s}</span>`;
global.getAssignedHomeownerIds = () => ['u1'];

// Mock database with payments across years 2026, 2027, 2028 (default will be 2028)
global.db = {
  get: (table) => {
    if (table === 'users') return [{ id: 'u1', role: 'homeowner', name: 'John' }];
    if (table === 'billings') {
      return [
        { id: 'b2026', amount: 500, dueDate: '2026-05-15', monthly_dues_month: '2026-05', createdAt: '2026-05-01' },
        { id: 'b2028', amount: 500, dueDate: '2028-10-15', monthly_dues_month: '2028-10', createdAt: '2028-10-01' }
      ];
    }
    if (table === 'payments') {
      return [
        { id: 'p2026', amount: 1500, status: 'approved', monthly_dues_month: '2026-05', payment_date: '2026-05-10', submittedAt: '2026-05-10' },
        { id: 'p2028', amount: 2500, status: 'approved', monthly_dues_month: '2028-10', payment_date: '2028-10-02', submittedAt: '2028-10-02' }
      ];
    }
    if (table === 'complaints') return [];
    return [];
  },
  getOne: () => null
};

// Evaluate main.js and dashboard.js
eval(mainJs);
eval(dashboardJs);

console.log('=== Running Revenue Year Persistence Tests ===\n');

// 1. Initial load without saved year in localStorage
localStorage.clear();
global.adminRevenueYear = null;
resetMockDom();

// Hook renderMonthlyBarChart to inspect chart reloading arguments
const originalRenderMonthlyBarChart = global.renderMonthlyBarChart;
global.renderMonthlyBarChart = (containerId, monthlyData, year) => {
  renderedChartData = { containerId, monthlyData, year };
  if (originalRenderMonthlyBarChart) {
    originalRenderMonthlyBarChart(containerId, monthlyData, year);
  }
};

window.renderAdminDashboard();
const contentAreaInitial = getOrCreateElement('contentArea').innerHTML;
assert(contentAreaInitial.includes('Monthly Revenue'), 'Dashboard should include Monthly Revenue section');
assert.strictEqual(window.adminRevenueYear, 2028, 'Default year should be 2028 when no localStorage exists');
assert.strictEqual(renderedChartData.year, 2028, 'Monthly revenue chart must load with default year 2028');
assert(contentAreaInitial.includes('<span id="revenueYearText">2028</span>'), 'HTML should display default year 2028');
console.log('✓ Initial dashboard load uses default year 2028 and renders chart for 2028');

// 2. User selects year 2026 from dropdown
window.setAdminRevenueYear(2026);
assert.strictEqual(window.adminRevenueYear, 2026, 'adminRevenueYear should be updated to 2026');
assert.strictEqual(localStorage.getItem('sah_revenue_year'), '2026', 'localStorage sah_revenue_year should be 2026');
assert.strictEqual(renderedChartData.year, 2026, 'Chart should reload with selected year 2026');
assert.strictEqual(getOrCreateElement('revenueYearText').textContent, '2026', '#revenueYearText should be updated to 2026');
console.log('✓ Selecting year 2026 saves to localStorage and reloads Monthly Revenue chart for 2026');

// 3. User clicks next button (>)
// Available years are 2026, 2027, 2028. Next from 2026 is 2027.
window.changeAdminRevenueYear(1);
assert.strictEqual(window.adminRevenueYear, 2027, 'adminRevenueYear should be 2027 after clicking next');
assert.strictEqual(localStorage.getItem('sah_revenue_year'), '2027', 'localStorage should be updated to 2027');
assert.strictEqual(renderedChartData.year, 2027, 'Chart should reload for 2027');
console.log('✓ Clicking > button updates localStorage and chart to 2027');

// 4. User clicks prev button (<)
window.changeAdminRevenueYear(-1);
assert.strictEqual(window.adminRevenueYear, 2026, 'adminRevenueYear should be 2026 after clicking prev');
assert.strictEqual(localStorage.getItem('sah_revenue_year'), '2026', 'localStorage should be updated to 2026');
assert.strictEqual(renderedChartData.year, 2026, 'Chart should reload for 2026');
console.log('✓ Clicking < button updates localStorage and chart to 2026');

// 5. Simulate page refresh:
// Memory variables are reset, dashboard.js is re-evaluated with localStorage containing 2026
global.adminRevenueYear = null;
eval(dashboardJs);
resetMockDom();

// When dashboard loads on fresh page load
window.renderAdminDashboard();
const contentAreaAfterRefresh = getOrCreateElement('contentArea').innerHTML;
assert.strictEqual(window.adminRevenueYear, 2026, 'adminRevenueYear should restore 2026 from localStorage on page refresh');
assert.strictEqual(renderedChartData.year, 2026, 'Monthly revenue chart must load with saved year 2026 on refresh');
assert(contentAreaAfterRefresh.includes('<span id="revenueYearText">2026</span>'), 'Year selector must display 2026 after refresh');
console.log('✓ Page refresh restores saved year 2026 from localStorage and reloads chart');

// 6. Simulate logout and log back in:
// During logout, sah_session is cleared from sessionStorage and localStorage.
// But sah_revenue_year remains in localStorage.
localStorage.removeItem('sah_session');
sessionStorage.removeItem('sah_session');
global.currentUser = null;
global.adminRevenueYear = null;

// Re-login as admin
global.currentUser = { id: 'admin1', name: 'Admin User', role: 'admin' };
resetMockDom();
window.renderAdminDashboard();
const contentAreaAfterRelogin = getOrCreateElement('contentArea').innerHTML;
assert.strictEqual(window.adminRevenueYear, 2026, 'adminRevenueYear should still be 2026 after logout and relogin');
assert.strictEqual(renderedChartData.year, 2026, 'Monthly revenue chart must reload with 2026 after relogin');
assert(contentAreaAfterRelogin.includes('<span id="revenueYearText">2026</span>'), 'Year selector must still show 2026 instead of resetting to 2028');
console.log('✓ Logout and log back in preserves saved year 2026 instead of resetting to 2028');

console.log('\n=== All Revenue Year Persistence Tests Passed Successfully! ===');
process.exit(0);
