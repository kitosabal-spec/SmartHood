const fs = require('fs');
const path = require('path');

// Simulate DOM
let lastContentAreaHtml = '';
const elements = {};

function getMockElement(id) {
  if (!elements[id]) {
    elements[id] = {
      id,
      innerHTML: '',
      value: '',
      style: {},
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        toggle(c, force) { if (force !== undefined) { force ? this.add(c) : this.remove(c); } else { this.classes.has(c) ? this.remove(c) : this.add(c); } },
        contains(c) { return this.classes.has(c); },
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
  return elements[id];
}

global.document = {
  getElementById: (id) => {
    if (id === 'contentArea') {
      return {
        get innerHTML() { return lastContentAreaHtml; },
        set innerHTML(val) { lastContentAreaHtml = val; },
        querySelector: () => null,
        querySelectorAll: () => [],
      };
    }
    return getMockElement(id);
  },
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  body: { appendChild: () => {}, removeChild: () => {} },
  createElement: () => ({ setProperty: () => {}, style: {}, appendChild: () => {}, remove: () => {} }),
};
global.window = global;
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.history = { scrollRestoration: 'auto', pushState: () => {}, replaceState: () => {} };
global.location = { hash: '', pathname: '/' };
global.dbCache = {};
global.getLocalDateValue = () => '2026-09-29';
global.showToast = (type, title, msg) => console.log(`[Toast ${type}] ${title}: ${msg}`);
global.showLoading = () => {};
global.hideLoading = () => {};
global.openModal = (title, html) => { console.log(`[Modal Opened] ${title}`); };
global.closeModal = () => {};
global.openConfirm = (title, msg, onConfirm) => onConfirm();
global.logAction = (msg) => console.log(`[Audit Log] ${msg}`);

const mainJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'main.js'), 'utf8');
const lfJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'lost-found.js'), 'utf8');

global.mockUsers = [
  { id: 'u001', name: 'Amy Antipolo', role: 'admin' },
  { id: 'u002', name: 'Juan Dela Cruz', role: 'homeowner', contact: '09171234567', block: '3', lot: '7' },
  { id: 'u003', name: 'Anna Reyes', role: 'homeowner', contact: '09281234567', block: '1', lot: '2' },
];

global.mockLostFound = [];

global.db = {
  get: (table) => {
    if (table === 'lostFound') return global.mockLostFound;
    if (table === 'users') return global.mockUsers;
    return [];
  },
  getOne: (table, id) => {
    return global.db.get(table).find(x => x.id === id) || null;
  },
  save: async (table, item) => {
    const arr = global.db.get(table);
    const idx = arr.findIndex(x => x.id === item.id);
    if (idx >= 0) arr[idx] = item;
    else arr.push(item);
    return item;
  }
};

eval(mainJs);
eval(lfJs);

// Set up mock DB data
global.currentUser = { id: 'u002', role: 'homeowner', name: 'Juan Dela Cruz', contact: '09171234567' };

global.mockLostFound = [
  {
    id: 'lf_1',
    homeownerId: 'u002',
    reportType: 'Lost',
    itemType: 'Wallet',
    itemName: 'Brown Leather Wallet',
    description: 'Lost at clubhouse',
    location: 'Clubhouse',
    eventDate: '2026-09-28',
    contactName: 'Juan Dela Cruz',
    contactNumber: '09171234567',
    status: 'Pending',
    remarks: '',
    createdAt: '2026-09-28T10:00:00Z',
  },
  {
    id: 'lf_2',
    homeownerId: 'u002',
    reportType: 'Found',
    itemType: 'Watch',
    itemName: 'Silver Wristwatch',
    description: 'Found at tennis court',
    location: 'Tennis Court',
    eventDate: '2026-09-27',
    contactName: 'Juan Dela Cruz',
    contactNumber: '09171234567',
    status: 'Approved',
    remarks: '',
    createdAt: '2026-09-27T10:00:00Z',
  },
  {
    id: 'lf_3',
    homeownerId: 'u002',
    reportType: 'Lost',
    itemType: 'Phone',
    itemName: 'Old Smartphone',
    description: 'Dropped on street',
    location: 'Street 4',
    eventDate: '2026-09-25',
    contactName: 'Juan Dela Cruz',
    contactNumber: '09171234567',
    status: 'Rejected',
    remarks: 'Duplicate report. Item already found.',
    createdAt: '2026-09-25T10:00:00Z',
  },
  {
    id: 'lf_4',
    homeownerId: 'u003',
    reportType: 'Found',
    itemType: 'Keys',
    itemName: 'Car Keys',
    description: 'Found at park',
    location: 'Main Park',
    eventDate: '2026-09-26',
    contactName: 'Anna Reyes',
    contactNumber: '09281234567',
    status: 'Approved',
    remarks: '',
    createdAt: '2026-09-26T10:00:00Z',
  },
];

console.log('\n--- TESTING RESIDENT LOST & FOUND UI ---');

// Test renderHOLostFound ('community' tab)
renderHOLostFound('community');
console.log('✓ renderHOLostFound("community") executed without error');
if (!lastContentAreaHtml.includes('Community Board')) throw new Error('Missing Community Board tab');
if (!elements['hoLfGrid']?.innerHTML?.includes('Silver Wristwatch')) throw new Error('Missing approved item lf_2');
if (!elements['hoLfGrid']?.innerHTML?.includes('Car Keys')) throw new Error('Missing approved item lf_4');
if (elements['hoLfGrid']?.innerHTML?.includes('Brown Leather Wallet')) throw new Error('Pending item lf_1 should not appear on Community Board!');
if (elements['hoLfGrid']?.innerHTML?.includes('Old Smartphone')) throw new Error('Rejected item lf_3 should not appear on Community Board!');
console.log('✓ Community Board strictly shows ONLY approved items!');

// Test renderHOLostFound ('my-reports' tab)
renderHOLostFound('my-reports');
console.log('✓ renderHOLostFound("my-reports") executed without error');
const myReportsHtml = elements['hoLostFoundTabContent']?.innerHTML || '';
if (!myReportsHtml.includes('Brown Leather Wallet')) throw new Error('Missing user own pending item');
if (!myReportsHtml.includes('Pending')) throw new Error('Missing Pending badge');
if (!myReportsHtml.includes('Under review')) throw new Error('Missing Under review notice');
if (!myReportsHtml.includes('Silver Wristwatch')) throw new Error('Missing user approved item');
if (!myReportsHtml.includes('Old Smartphone')) throw new Error('Missing user rejected item');
if (!myReportsHtml.includes('Duplicate report')) throw new Error('Missing rejection remarks for resident');
console.log('✓ My Submitted Reports correctly displays Pending, Approved, and Rejected with rejection reason!');

console.log('\n--- TESTING ADMIN LOST & FOUND UI ---');
global.currentUser = { id: 'u001', role: 'admin', name: 'Amy Antipolo' };
renderLostFoundManagement();
console.log('✓ renderLostFoundManagement() executed without error');
if (!lastContentAreaHtml.includes('Pending Lost &amp; Found Reports')) throw new Error('Missing Pending Lost & Found Reports section');
if (!lastContentAreaHtml.includes('Pending Review')) throw new Error('Missing Pending Review stat');
if (!lastContentAreaHtml.includes('Brown Leather Wallet')) throw new Error('Pending section must list Brown Leather Wallet');
console.log('✓ Admin Lost & Found Management includes dedicated Pending Lost & Found Reports section!');

console.log('\n✓ ALL FRONTEND UI SIMULATION TESTS PASSED SUCCESSFULLY!');
