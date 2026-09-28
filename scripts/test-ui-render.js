const fs = require('fs');
const path = require('path');

// Simulate browser global environment
const mainJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'main.js'), 'utf8');
const billingJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'billing.js'), 'utf8');

// Mock DOM
global.document = {
  getElementById: (id) => {
    return {
      innerHTML: '',
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {} },
      appendChild: () => {},
    };
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: (tag) => {
    return {
      className: '',
      style: { setProperty: () => {} },
      appendChild: () => {},
      remove: () => {},
      classList: { add: () => {}, remove: () => {} },
      select: () => {},
    };
  },
  body: {
    appendChild: () => {},
    removeChild: () => {},
  },
};
global.window = global;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.history = { pushState: () => {}, replaceState: () => {} };
global.navigator = { clipboard: { writeText: async () => {} } };
global.location = { hash: '', pathname: '/' };

// Mock db and currentUser
global.currentUser = {
  id: 'u002',
  role: 'homeowner',
  name: 'Juan Dela Cruz',
  lotArea: 40,
};

const mockBillings = [
  { id: 'b0', title: 'Monthly Dues - December 2025', amount: 500, dueDate: '2025-12-31', assignedTo: ['u002'], monthly_dues_month: '2025-12', status: 'paid' },
  { id: 'b1', title: 'Monthly Dues - October 2026', amount: 500, dueDate: '2026-10-31', assignedTo: ['u002'], monthly_dues_month: '2026-10', status: 'active' },
  { id: 'b2', title: 'Monthly Dues - November 2026', amount: 500, dueDate: '2026-11-30', assignedTo: ['u002'], monthly_dues_month: '2026-11', status: 'active' },
  { id: 'b3', title: 'Monthly Dues - January 2027', amount: 500, dueDate: '2027-01-31', assignedTo: ['u002'], monthly_dues_month: '2027-01', status: 'active' },
];

const mockPayments = [
  { id: 'p0', homeownerId: 'u002', billingId: 'b0', amount: 500, refNum: 'REF000', status: 'approved', monthly_dues_month: '2025-12', payment_date: '2025-12-05' },
  { id: 'p1', homeownerId: 'u002', billingId: 'b1', amount: 500, refNum: 'REF123', status: 'approved', monthly_dues_month: '2026-10', payment_date: '2026-10-02' },
];

const mockPaymentSettings = [
  { payment_method: 'gcash', account_name: 'San Alfonso HOA', account_number: '09171234567', instructions: 'Step 1\nStep 2', is_active: 1 }
];

global.db = {
  get: (table) => {
    if (table === 'billings') return mockBillings;
    if (table === 'payments') return mockPayments;
    if (table === 'payment_settings') return mockPaymentSettings;
    if (table === 'appSettings') return [{ id: 'duesRatePerSqm', value: '5.725' }];
    return [];
  },
  getOne: (table, id) => {
    const list = global.db.get(table);
    return list.find(item => item.id === id) || null;
  }
};

global.canManageBilling = () => false;
global.syncHomeownerBalances = () => {};

// Execute scripts in mock environment
try {
  let lastRenderedHtml = '';
  document.getElementById = (id) => {
    return {
      innerHTML: '',
      set innerHTML(val) { lastRenderedHtml = val; },
      get innerHTML() { return lastRenderedHtml; },
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {} },
      textContent: '',
      appendChild: () => {},
    };
  };

  eval(mainJs);
  eval(billingJs);
  console.log('✓ Successfully loaded main.js and billing.js');

  // Test executing renderHOPayNow
  window.renderHOPayNow();
  console.log('✓ renderHOPayNow() executed without throwing any errors!');
  if (!lastRenderedHtml.includes('Monthly Dues Schedule')) {
    throw new Error('Rendered HTML missing header!');
  }
  if (!lastRenderedHtml.includes('October')) {
    throw new Error('Rendered HTML missing October!');
  }
  console.log('✓ renderHOPayNow() output verified: contains schedule header and months!');

  // Test changing year
  window.handlePayNowYearChange(2027);
  console.log('✓ handlePayNowYearChange(2027) executed without throwing any errors!');
  if (!lastRenderedHtml.includes('2027')) {
    throw new Error('Rendered HTML missing updated year 2027!');
  }

  // Switch back to 2026
  window.handlePayNowYearChange(2026);

  // Test opening advance pay modal
  let modalTitleOpened = '';
  let modalHtmlOpened = '';
  global.openModal = (title, html, buttons) => {
    modalTitleOpened = title;
    modalHtmlOpened = html;
    console.log(`✓ openModal called for: "${title}" with ${buttons?.length || 0} buttons`);
  };
  window.openAdvancePayModal('2026-12', 229);
  if (!modalTitleOpened.includes('GCash')) throw new Error('Expected GCash payment modal');

  // Test opening pay now modal with billingId
  window.openPayNowModal('b2');
  if (!modalTitleOpened.includes('GCash')) throw new Error('Expected GCash payment modal');

  // Test opening submit payment form
  window.openSubmitPaymentForm({ billingId: 'b2', month: '2026-11', amount: 500, title: 'Monthly Dues - November 2026' });
  if (!modalTitleOpened.includes('Submit Payment Proof')) throw new Error('Expected Submit Payment Proof modal');

  // Test copy GCash number
  window.copyGcashNumber('09171234567');
  console.log('✓ copyGcashNumber executed cleanly');

  // Test with user with 0 bills & 0 payments
  global.currentUser = { id: 'u_new', role: 'homeowner', name: 'New Resident', lotArea: 40 };
  window.renderHOPayNow();
  console.log('✓ renderHOPayNow() with brand new resident (0 bills, 0 payments) rendered cleanly!');

  console.log('\nAll browser UI render simulations passed successfully!');
  process.exit(0);
} catch (err) {
  console.error('✗ UI Simulation Error:', err);
  process.exit(1);
}
