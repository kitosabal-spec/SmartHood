'use strict';

// SECTION 1: STATE & CONSTANTS
let currentUser = null;
let currentRole = 'admin';
let currentView = 'dashboard';
let notifications = [];
let pendingPostLoginView = null;
let pendingPaymentSubmission = null;
let notificationRefreshTimer = null;
let sidebarBadgeRefreshPending = false;

const ROLES = { ADMIN: 'admin', HOMEOWNER: 'homeowner' };
const COMPLAINT_STATUSES = ['Reviewed', 'In Progress', 'Resolved', 'Rejected'];
const DEFAULT_DUES_RATE_PER_SQM = 5.725;
const AMENITIES = ['Basketball Court', 'Clubhouse', 'Chairs', 'Tables', 'Ladder'];
const VEHICLE_TYPES = ['Car', 'Motorcycle', 'Tricycle', 'Van', 'Truck', 'SUV', 'Other'];
const VEHICLE_REGISTRATION_FEES = { homeowner: 200, nonHomeowner: 250 };
const ROLE_LABELS = {
  admin: 'Administrator',
  president: 'President',
  security: 'Security Guard',
  treasurer: 'Treasurer',
  auditor: 'Auditor',
  homeowner: 'Homeowner',
};

const ADMIN_NAV = [
  { id: 'dashboard',      icon: 'ico-dashboard',  label: 'Dashboard',       section: 'MAIN' },
  { id: 'homeowners',     icon: 'ico-users',       label: 'Homeowners',      section: 'MAIN' },
  { id: 'billing',        icon: 'ico-file',        label: 'Billing',         section: 'MANAGEMENT' },
  { id: 'payments',       icon: 'ico-credit',      label: 'Payments',        section: 'MANAGEMENT' },
  { id: 'amenities',      icon: 'ico-building',    label: 'Amenity Bookings', section: 'MANAGEMENT' },
  { id: 'vehicles',       icon: 'ico-parking',     label: 'Vehicle Management', section: 'MANAGEMENT' },
  { id: 'lostfound',      icon: 'ico-search',      label: 'Lost and Found',   section: 'MANAGEMENT' },
  { id: 'complaints',     icon: 'ico-flag',        label: 'Complaints',      section: 'MANAGEMENT' },
  { id: 'announcements',  icon: 'ico-megaphone',   label: 'Announcements',   section: 'MANAGEMENT' },
  { id: 'reports',        icon: 'ico-chart',       label: 'Reports',         section: 'ANALYTICS' },
  { id: 'auditlog',       icon: 'ico-log',         label: 'Audit Log',       section: 'ANALYTICS' },
  { id: 'settings',       icon: 'ico-settings',    label: 'Settings',        section: 'SYSTEM' },
];

const HOMEOWNER_NAV = [
  { id: 'ho-dashboard',     icon: 'ico-dashboard',  label: 'Dashboard',       section: 'MAIN' },
  { id: 'ho-billing',       icon: 'ico-file',       label: 'My Bills',        section: 'ACCOUNT' },
  { id: 'ho-payments',      icon: 'ico-upload',     label: 'Submit Payment',  section: 'ACCOUNT' },
  { id: 'ho-history',       icon: 'ico-history',    label: 'Payment History', section: 'ACCOUNT' },
  { id: 'ho-amenities',     icon: 'ico-building',   label: 'Book Amenities',  section: 'ACCOUNT' },
  { id: 'ho-vehicles',      icon: 'ico-parking',    label: 'My Vehicles',     section: 'ACCOUNT' },
  { id: 'ho-complaints',    icon: 'ico-flag',       label: 'File a Complaint',   section: 'ACCOUNT' },
  { id: 'ho-announcements', icon: 'ico-megaphone',  label: 'Announcements',   section: 'INFO' },
  { id: 'ho-profile',       icon: 'ico-user',       label: 'My Profile',      section: 'ACCOUNT' },
];

const PRESIDENT_NAV = [
  { id: 'complaints', icon: 'ico-flag', label: 'Complaints', section: 'MANAGEMENT' },
];

const SECURITY_NAV = [
  { id: 'complaints', icon: 'ico-flag', label: 'Complaints', section: 'VIEW' },
  { id: 'vehicles',   icon: 'ico-parking', label: 'Vehicle Management', section: 'VIEW' },
  { id: 'lostfound',  icon: 'ico-search', label: 'Lost and Found', section: 'VIEW' },
];

const TREASURER_NAV = [
  { id: 'payments', icon: 'ico-credit', label: 'Payment Records', section: 'FINANCE' },
  { id: 'reports',  icon: 'ico-chart',  label: 'Financial Reports', section: 'FINANCE' },
];

const AUDITOR_NAV = [
  { id: 'reports', icon: 'ico-chart', label: 'Financial Reports', section: 'AUDIT' },
  { id: 'billing', icon: 'ico-file',  label: 'Billing Status',     section: 'AUDIT' },
];


// SECTION 2: SEED DATA

async function seedData() {
  await api.loadAll();
  return;
  if (!localStorage.getItem('sah_seeded')) {
    const users = [
      { id: 'u001', username: 'admin', password: 'admin123', role: 'admin', name: 'Amy Antipolo', email: 'admin@sanalfonsohomes.com' },
      { id: 'u002', username: 'juandelacruz', password: 'home123', role: 'homeowner', name: 'Juan Dela Cruz', email: 'juan@email.com', block: 'Block 3', lot: 'Lot 7', contact: '09171234567', balance: 3500 },
      { id: 'u003', username: 'annamaria', password: 'home123', role: 'homeowner', name: 'Anna Maria Reyes', email: 'anna@email.com', block: 'Block 1', lot: 'Lot 2', contact: '09281234567', balance: 0 },
      { id: 'u004', username: 'carlosmagno', password: 'home123', role: 'homeowner', name: 'Carlos Magno', email: 'carlos@email.com', block: 'Block 2', lot: 'Lot 5', contact: '09351234567', balance: 7000 },
      { id: 'u005', username: 'ritaflores', password: 'home123', role: 'homeowner', name: 'Rita Flores', email: 'rita@email.com', block: 'Block 4', lot: 'Lot 1', contact: '09461234567', balance: 1500 },
      { id: 'u006', username: 'pedroparcero', password: 'home123', role: 'homeowner', name: 'Pedro Parcero', email: 'pedro@email.com', block: 'Block 1', lot: 'Lot 8', contact: '09571234567', balance: 0 },
    ];

    const billings = [
      { id: 'b001', title: 'Monthly Dues – January', amount: 1500, dueDate: '2025-01-31', description: 'Regular monthly association dues.', assignedTo: ['u002','u003','u004','u005','u006'], status: 'active', createdAt: '2025-01-01' },
      { id: 'b002', title: 'Monthly Dues – February', amount: 1500, dueDate: '2025-02-28', description: 'Regular monthly association dues.', assignedTo: ['u002','u003','u004','u005','u006'], status: 'active', createdAt: '2025-02-01' },
      { id: 'b003', title: 'Monthly Dues – March', amount: 1500, dueDate: '2025-03-31', description: 'Regular monthly association dues.', assignedTo: ['u002','u003','u004','u005','u006'], status: 'active', createdAt: '2025-03-01' },
      { id: 'b004', title: 'Security Fund Q1', amount: 2000, dueDate: '2025-03-15', description: 'Quarterly security personnel fund contribution.', assignedTo: ['u002','u004'], status: 'active', createdAt: '2025-02-28' },
      { id: 'b005', title: 'Street Light Maintenance', amount: 500, dueDate: '2025-04-15', description: 'Contribution for street light upkeep.', assignedTo: ['u002','u003','u004','u005','u006'], status: 'active', createdAt: '2025-03-10' },
    ];

    const payments = [
      { id: 'p001', homeownerId: 'u003', billingId: 'b001', amount: 1500, refNum: 'GCH-2025-0011', status: 'approved', receipt: null, submittedAt: '2025-01-10', remarks: '', reviewedAt: '2025-01-11' },
      { id: 'p002', homeownerId: 'u003', billingId: 'b002', amount: 1500, refNum: 'GCH-2025-0045', status: 'approved', receipt: null, submittedAt: '2025-02-08', remarks: '', reviewedAt: '2025-02-09' },
      { id: 'p003', homeownerId: 'u003', billingId: 'b003', amount: 1500, refNum: 'GCH-2025-0091', status: 'pending', receipt: null, submittedAt: '2025-03-05', remarks: '', reviewedAt: null },
      { id: 'p004', homeownerId: 'u006', billingId: 'b001', amount: 1500, refNum: 'BDO-0023411', status: 'approved', receipt: null, submittedAt: '2025-01-15', remarks: '', reviewedAt: '2025-01-16' },
      { id: 'p005', homeownerId: 'u002', billingId: 'b001', amount: 1500, refNum: 'GCH-PAY-882', status: 'rejected', receipt: null, submittedAt: '2025-01-20', remarks: 'Blurry receipt image.', reviewedAt: '2025-01-21' },
      { id: 'p006', homeownerId: 'u005', billingId: 'b003', amount: 1500, refNum: 'BPI-20250301', status: 'pending', receipt: null, submittedAt: '2025-03-12', remarks: '', reviewedAt: null },
    ];

    const announcements = [
      { id: 'a001', title: 'Water Interruption Notice', description: 'There will be a scheduled water interruption on April 20, 2025 from 8AM to 5PM due to pipe maintenance. Please store water in advance.', category: 'Maintenance', date: '2025-04-14', urgent: true, createdBy: 'u001' },
      { id: 'a002', title: 'Community Clean-Up Drive', description: 'Join us this Saturday, April 26, for our monthly subdivision clean-up drive. Gather at the main gate at 7AM.', category: 'Events', date: '2025-04-18', urgent: false, createdBy: 'u001' },
      { id: 'a003', title: 'Gate Access Hours Update', description: 'Effective May 1, 2025, the pedestrian gate will close at 10PM instead of 11PM. Residents are advised to use the main gate after 10PM.', category: 'Security', date: '2025-04-20', urgent: false, createdBy: 'u001' },
      { id: 'a004', title: 'Emergency: Damaged Road on Block 2', description: 'The road leading to Block 2, Lot 4-8 has significant damage due to heavy rain. Road repair crew has been dispatched and is expected to begin work Monday morning.', category: 'Emergency', date: '2025-04-22', urgent: true, createdBy: 'u001' },
    ];

    const complaints = [
      { id: 'c001', homeownerId: 'u002', category: 'Noise', description: 'Neighbor at Block 3, Lot 8 plays loud music past midnight every weekend. This has been going on for two weeks and is disturbing the whole street.', status: 'In Progress', adminResponse: 'We have reached out to the resident in question and issued a formal reminder. Please inform us if the issue continues.', dateFiled: '2025-04-10', updatedAt: '2025-04-12', resolvedAt: null },
      { id: 'c002', homeownerId: 'u003', category: 'Maintenance', description: 'The street light in front of Block 1, Lot 2–4 has been out for over a week. The area is very dark at night and feels unsafe for walking.', status: 'Reviewed', adminResponse: '', dateFiled: '2025-04-18', updatedAt: null, resolvedAt: null },
      { id: 'c003', homeownerId: 'u005', category: 'Security', description: 'I noticed an unfamiliar vehicle parked near the back gate for three consecutive nights. The guard on duty did not seem to take action.', status: 'Resolved', adminResponse: 'Security personnel investigated the matter. The vehicle belonged to a guest of a resident. The guard has been reminded to log all overnight visitors properly.', dateFiled: '2025-04-05', updatedAt: '2025-04-07', resolvedAt: '2025-04-07' },
    ];

    const auditLog = [
      { id: 'l001', action: 'Added homeowner Juan Dela Cruz (u002)', adminId: 'u001', timestamp: '2025-01-01 08:00' },
      { id: 'l002', action: 'Created billing: Monthly Dues – January', adminId: 'u001', timestamp: '2025-01-01 08:30' },
      { id: 'l003', action: 'Approved payment p004 from Pedro Parcero', adminId: 'u001', timestamp: '2025-01-16 09:00' },
      { id: 'l004', action: 'Rejected payment p005 from Juan Dela Cruz — Blurry receipt', adminId: 'u001', timestamp: '2025-01-21 10:15' },
      { id: 'l005', action: 'Posted announcement: Water Interruption Notice', adminId: 'u001', timestamp: '2025-04-14 14:00' },
    ];

    db.set('users', users);
    db.set('billings', billings);
    db.set('payments', payments);
    db.set('announcements', announcements);
    db.set('complaints', complaints);
    db.set('auditLog', auditLog);
    localStorage.setItem('sah_seeded', '1');
  }

  // Ensure complaints key exists for older seeds
  if (!localStorage.getItem('sah_complaints')) db.set('complaints', []);
}


// SECTION 3: DATABASE (Express + MySQL API cache)


let dbCache = {};

// Global XSS Sanitizer Helper
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Global In-Memory Comments Cache (Synced with MySQL)
const announcementCommentsCache = {};

const api = {
  async request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) {
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
    if (typeof currentUser !== 'undefined' && currentUser && (currentUser.id || currentUser.user_id)) {
      headers['X-User-Id'] = currentUser.id || currentUser.user_id;
    }
    const response = await fetch(path, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Request failed.' }));
      throw new Error(err.error || 'Request failed.');
    }

    return response.json();
  },

  async loadAll() {
    dbCache = await this.request('/api/data');
    return dbCache;
  },

  async login(username, password) {
    return this.request('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async save(table, item) {
    const exists = db.get(table).some(x => x.id === item.id);
    return this.request(exists ? `/api/${table}/${item.id}` : `/api/${table}`, {
      method: exists ? 'PUT' : 'POST',
      body: JSON.stringify(item),
    });
  },

  async replace(table, rows) {
    return this.request(`/api/${table}`, {
      method: 'PUT',
      body: JSON.stringify(rows),
    });
  },

  async delete(table, id) {
    return this.request(`/api/${table}/${id}`, { method: 'DELETE' });
  },

  async reset() {
    dbCache = await this.request('/api/reset', { method: 'POST' });
    return dbCache;
  },

  // ── Announcements & MySQL Comments API Helpers ──
  async createAnnouncement(formData) {
    return this.request('/api/announcements', {
      method: 'POST',
      body: formData,
    });
  },

  async updateAnnouncement(id, formData) {
    return this.request(`/api/announcements/${id}`, {
      method: 'PUT',
      body: formData,
    });
  },

  async deleteAnnouncement(id) {
    return this.request(`/api/announcements/${id}`, {
      method: 'DELETE',
    });
  },

  async getComments(announcementId) {
    return this.request(`/api/announcements/${announcementId}/comments`);
  },

  async addComment(announcementId, comment) {
    return this.request(`/api/announcements/${announcementId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  },

  async updateComment(announcementId, commentId, comment) {
    return this.request(`/api/announcements/${announcementId}/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify({ comment }),
    });
  },

  async deleteComment(announcementId, commentId) {
    return this.request(`/api/announcements/${announcementId}/comments/${commentId}`, {
      method: 'DELETE',
    });
  },
};

function reportSyncError(error) {
  console.error(error);
  if (typeof showToast === 'function') {
    showToast('error', 'Database Sync Failed', 'Make sure the Node.js server is running in VS Code.');
  }
}

const db = {
  get(key) {
    return Array.isArray(dbCache[key]) ? dbCache[key] : [];
  },
  set(key, val) {
    dbCache[key] = Array.isArray(val) ? val : [];
    scheduleSidebarBadgeRefresh();
    api.replace(key, dbCache[key]).catch(reportSyncError);
  },
  getOne(key, id) {
    return this.get(key).find(x => x.id === id);
  },
  save(key, item) {
    const arr = this.get(key);
    const idx = arr.findIndex(x => x.id === item.id);
    if (idx >= 0) arr[idx] = item; else arr.push(item);
    dbCache[key] = arr;
    scheduleSidebarBadgeRefresh();
    api.save(key, item).catch(reportSyncError);
  },
  delete(key, id) {
    dbCache[key] = this.get(key).filter(x => x.id !== id);
    scheduleSidebarBadgeRefresh();
    api.delete(key, id).catch(reportSyncError);
  },
  newId(prefix) {
    return prefix + Date.now().toString(36).toUpperCase();
  }
};


// SECTION 4: AUTH


function selectRole(role) {
  currentRole = role;
  document.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`[data-role="${role}"]`);
  if (tab) tab.classList.add('active');
}

async function handleLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value.trim();
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.classList.add('hidden');

  if (!username || !password) {
    showLoginError('Please enter both username and password.');
    return;
  }

  showLoading();
  try {
    const user = await api.login(username, password);
    await api.loadAll();
    hideLoading();
    currentRole = user.role;
    currentUser = db.getOne('users', user.id) || user;
    localStorage.setItem('sah_session', JSON.stringify({ id: user.id, role: user.role }));
    closeLoginModal();
    document.getElementById('landingPage').classList.add('hidden');
    initApp();
  } catch (error) {
    hideLoading();
    showLoginError(error.message || 'Invalid username or password.');
  }
}

function togglePassword() {
  const inp = document.getElementById('loginPass');
  const isPass = inp.type === 'password';
  inp.type = isPass ? 'text' : 'password';
  const icon = document.getElementById('eyeIcon');
  if (icon) icon.innerHTML = isPass ? '<use href="#ico-eye-off"/>' : '<use href="#ico-eye"/>';
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function restoreSession() {
  try {
    const sess = JSON.parse(localStorage.getItem('sah_session'));
    if (!sess) return false;
    const user = db.getOne('users', sess.id);
    if (!user) return false;
    currentUser = user;
    currentRole = user.role;
    return true;
  } catch { return false; }
}


// SECTION 5: APP INIT & NAV


function initApp() {
  const landing = document.getElementById('landingPage');
  if (landing) landing.classList.add('hidden');
  const loginModal = document.getElementById('loginModal');
  if (loginModal) loginModal.classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.body.style.overflow = '';
  buildSidebar();
  setupSidebarOverlay();
  const defaultView = pendingPostLoginView && currentUser.role === 'homeowner'
    ? pendingPostLoginView
    : getDefaultViewForRole(currentUser.role);
  pendingPostLoginView = null;
  navigate(defaultView);
  updateNotifBadge();
  startNotificationRefresh();
}

function getNavForRole(role) {
  const navMap = {
    admin: ADMIN_NAV,
    homeowner: HOMEOWNER_NAV,
    president: PRESIDENT_NAV,
    security: SECURITY_NAV,
    treasurer: TREASURER_NAV,
    auditor: AUDITOR_NAV,
  };
  return navMap[role] || HOMEOWNER_NAV;
}

function getDefaultViewForRole(role) {
  return (getNavForRole(role)[0] || HOMEOWNER_NAV[0]).id;
}

function isAdmin() { return currentUser?.role === 'admin'; }
function canManageComplaints() { return ['admin', 'president'].includes(currentUser?.role); }
function canViewAdminComplaints() { return ['admin', 'president', 'security'].includes(currentUser?.role); }
function canManagePayments() { return isAdmin(); }
function canViewPayments() { return ['admin', 'treasurer'].includes(currentUser?.role); }
function canManageBilling() { return isAdmin(); }
function canViewBillingStatus() { return ['admin', 'auditor'].includes(currentUser?.role); }
function canViewReports() { return ['admin', 'treasurer', 'auditor'].includes(currentUser?.role); }

function canAccessView(viewId) {
  if (isAdmin()) return true;
  return getNavForRole(currentUser?.role).some(item => item.id === viewId);
}

function hasPaymentForBilling(payments, billingId, statuses) {
  return payments.some(payment => payment.billingId === billingId && statuses.includes(payment.status));
}

function getSidebarSeenKey() {
  return currentUser ? `sah_sidebar_seen_${currentUser.id}_${currentUser.role}` : '';
}

function loadSidebarSeen() {
  const key = getSidebarSeenKey();
  if (!key) return {};
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function saveSidebarSeen(seen) {
  const key = getSidebarSeenKey();
  if (key) localStorage.setItem(key, JSON.stringify(seen));
}

function normalizeSidebarBadgeIds(items) {
  return items.map(item => String(item?.id || item)).filter(Boolean);
}

function getSidebarBadgeItems(viewId) {
  if (!currentUser) return [];

  const role = currentUser.role;
  const users = db.get('users');
  const billings = db.get('billings');
  const payments = db.get('payments');
  const complaints = db.get('complaints');
  const amenityBookings = db.get('amenityBookings');
  const vehicles = db.get('vehicleRegistrations');
  const lostFound = db.get('lostFound');

  const homeownerBillings = () => billings.filter(billing => getAssignedHomeownerIds(billing).includes(currentUser.id));
  const homeownerPayments = () => payments.filter(payment => payment.homeownerId === currentUser.id);
  const unpaidHomeownerBillings = () => {
    const myPayments = homeownerPayments();
    return homeownerBillings().filter(billing =>
      !hasPaymentForBilling(myPayments, billing.id, ['approved', 'pending'])
    );
  };

  const itemMap = {
    homeowners: () => users.filter(user => user.role === 'homeowner'),
    billing: () => billings.filter(billing => ['active', 'pending', 'overdue'].includes(getBillingCollectionStatus(billing))),
    payments: () => payments.filter(payment => payment.status === 'pending'),
    amenities: () => amenityBookings.filter(booking => booking.status === 'Pending'),
    vehicles: () => vehicles.filter(vehicle =>
      vehicle.registrationStatus === 'Pending' ||
      (vehicle.registrationStatus === 'Approved' && vehicle.paymentStatus !== 'Paid')
    ),
    lostfound: () => lostFound.filter(report => report.status === 'Pending'),
    complaints: () => complaints.filter(complaint => normalizeComplaintStatus(complaint.status) === 'Reviewed'),
    announcements: () => db.get('announcements'),
    auditlog: () => db.get('auditLog'),
    'ho-billing': () => unpaidHomeownerBillings(),
    'ho-payments': () => unpaidHomeownerBillings(),
    'ho-history': () => homeownerPayments().filter(payment => payment.status === 'pending'),
    'ho-amenities': () => amenityBookings.filter(booking => booking.homeownerId === currentUser.id && booking.status === 'Pending'),
    'ho-vehicles': () => vehicles.filter(vehicle =>
      vehicle.homeownerId === currentUser.id &&
      (vehicle.registrationStatus === 'Pending' ||
        (vehicle.registrationStatus === 'Approved' && vehicle.paymentStatus !== 'Paid'))
    ),
    'ho-complaints': () => complaints.filter(complaint =>
      complaint.homeownerId === currentUser.id &&
      ['Reviewed', 'In Progress'].includes(normalizeComplaintStatus(complaint.status))
    ),
    'ho-announcements': () => db.get('announcements'),
  };

  if (role === 'treasurer' && viewId === 'reports') {
    return normalizeSidebarBadgeIds(payments.filter(payment => payment.status === 'pending'));
  }
  if (role === 'auditor' && viewId === 'reports') {
    return normalizeSidebarBadgeIds(billings.filter(billing => getBillingCollectionStatus(billing) !== 'paid'));
  }
  if (!itemMap[viewId]) return [];
  return normalizeSidebarBadgeIds(itemMap[viewId]());
}

function getSidebarBadgeCount(viewId) {
  const storedIds = loadSidebarSeen()[viewId];
  const seenIds = new Set(Array.isArray(storedIds) ? storedIds : []);
  return getSidebarBadgeItems(viewId).filter(id => !seenIds.has(id)).length;
}

function markSidebarViewSeen(viewId) {
  if (!currentUser || !viewId) return;
  const seen = loadSidebarSeen();
  seen[viewId] = getSidebarBadgeItems(viewId);
  saveSidebarSeen(seen);
}

function updateSidebarBadges() {
  const navEl = document.getElementById('sidebarNav');
  if (!navEl || !currentUser) return;

  navEl.querySelectorAll('.nav-item').forEach(item => {
    if (item.dataset.view === currentView) markSidebarViewSeen(item.dataset.view);
    const count = getSidebarBadgeCount(item.dataset.view);
    let badge = item.querySelector('.nav-badge');

    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        item.appendChild(badge);
      }
      badge.textContent = count > 99 ? '99+' : String(count);
    } else if (badge) {
      badge.remove();
    }
  });
}

function scheduleSidebarBadgeRefresh() {
  if (!currentUser || sidebarBadgeRefreshPending) return;
  sidebarBadgeRefreshPending = true;
  const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout;
  schedule(() => {
    sidebarBadgeRefreshPending = false;
    updateSidebarBadges();
  });
}

// PROFILE PHOTOS (served from /uploads/profile/, stored as path in users.profile_photo)
function userInitials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function profilePhotoUrl(user) {
  const value = user && user.profile_photo;
  if (!value || typeof value !== 'string') return null;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith('/uploads/profile/')) return value;
  if (/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(jpg|jpeg|png|webp)$/i.test(value)) return `/uploads/profile/${value}`;
  return null;
}

function avatarHTML(user, sizeClass = '') {
  const url = profilePhotoUrl(user);
  const initials = userInitials(user && user.name);
  if (url) return `<img src="${url}" alt="" class="avatar-img ${sizeClass}" loading="lazy" onerror="this.outerHTML=avatarFallbackHTML('${initials}', '${sizeClass}')"/>`;
  return avatarFallbackHTML(initials, sizeClass);
}

function avatarFallbackHTML(initials, sizeClass = '') {
  return `<span class="avatar-fallback ${sizeClass}">${initials}</span>`;
}

function renderAvatarInto(el, user) {
  if (!el) return;
  el.innerHTML = avatarHTML(user);
  el.classList.add('has-photo');
}

function syncUserPhotoInCache(userId, photoPath) {
  const users = db.get('users');
  const idx = users.findIndex(u => u.id === userId);
  if (idx >= 0) {
    users[idx] = { ...users[idx], profile_photo: photoPath };
    dbCache.users = users;
  }
  if (currentUser && currentUser.id === userId) {
    currentUser = { ...currentUser, profile_photo: photoPath };
  }
}

function profileAvatarEditableHTML(user) {
  return `
  <div class="profile-avatar-wrapper">
    <div class="profile-avatar-big" id="profileAvatarBig">
      ${avatarHTML(user, 'avatar-2xl')}
    </div>
    <button type="button" class="profile-avatar-edit-btn" id="profileAvatarEditBtn" onclick="toggleProfileAvatarMenu(event)" title="Edit profile photo" aria-label="Edit profile photo" aria-haspopup="true" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
      </svg>
    </button>
    <div class="profile-avatar-menu hidden" id="profileAvatarMenu" role="menu">
      <button type="button" class="profile-avatar-menu-item" onclick="handleAvatarMenuChangePhoto(event)" role="menuitem">
        <span class="profile-avatar-menu-icon">📷</span>
        <span>Change Photo</span>
      </button>
      <button type="button" class="profile-avatar-menu-item danger" onclick="handleAvatarMenuRemovePhoto(event)" role="menuitem">
        <span class="profile-avatar-menu-icon">🗑️</span>
        <span>Remove Photo</span>
      </button>
    </div>
    <input type="file" id="profilePhotoInput" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" class="hidden" onchange="handleProfilePhotoSelect(this)"/>
  </div>`;
}

function toggleProfileAvatarMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('profileAvatarMenu');
  const btn = document.getElementById('profileAvatarEditBtn');
  if (!menu) return;
  const isHidden = menu.classList.contains('hidden');
  if (isHidden) {
    menu.classList.remove('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  } else {
    menu.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}

function closeProfileAvatarMenu() {
  const menu = document.getElementById('profileAvatarMenu');
  const btn = document.getElementById('profileAvatarEditBtn');
  if (menu && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}

function handleAvatarMenuChangePhoto(e) {
  if (e) e.stopPropagation();
  closeProfileAvatarMenu();
  const input = document.getElementById('profilePhotoInput');
  if (input) input.click();
}

function handleAvatarMenuRemovePhoto(e) {
  if (e) e.stopPropagation();
  closeProfileAvatarMenu();
  confirmRemoveProfilePhoto();
}

function profilePhotoSectionHTML(u) {
  return '';
}

let pendingPhotoFile = null;
let pendingPhotoPreviewUrl = null;

function handleProfilePhotoSelect(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    showToast('error', 'Invalid File', 'Only JPG, PNG, or WebP images are allowed.');
    input.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('error', 'Too Large', 'Photo must be 5 MB or smaller.');
    input.value = '';
    return;
  }
  pendingPhotoFile = file;
  if (pendingPhotoPreviewUrl) URL.revokeObjectURL(pendingPhotoPreviewUrl);
  pendingPhotoPreviewUrl = URL.createObjectURL(file);
  openCropModal(pendingPhotoPreviewUrl, file.type);
}

function openCropModal(url, mime) {
  openModal('Adjust Profile Photo', `
    <div class="crop-modal-content">
      <p class="crop-modal-hint">Drag to position, use the slider to zoom, then save.</p>
      <div id="cropEditor" class="crop-editor">
        <div class="crop-viewport" id="cropViewport"><img id="cropImg" alt="Crop preview" draggable="false"/></div>
        <div class="crop-controls">
          <span aria-hidden="true">−</span>
          <input type="range" id="cropZoom" min="1" max="2" step="0.01" value="1" aria-label="Zoom photo"/>
          <span aria-hidden="true">+</span>
        </div>
      </div>
      <div id="photoUploadStatus" class="photo-upload-status" style="margin-top:10px;"></div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Save Photo', cls: 'btn-primary', action: uploadProfilePhoto },
  ]);
  openCropEditor(url, mime);
}

let cropState = null;

function openCropEditor(url, mime) {
  const editor = document.getElementById('cropEditor');
  const viewport = document.getElementById('cropViewport');
  const img = document.getElementById('cropImg');
  const zoom = document.getElementById('cropZoom');
  if (!editor || !viewport || !img || !zoom) return;
  editor.classList.remove('hidden');
  bindCropViewport(viewport, zoom);
  img.onload = () => {
    const vw = viewport.clientWidth || 240;
    const minScale = Math.max(vw / img.naturalWidth, vw / img.naturalHeight);
    cropState = {
      url, mime, imgEl: img,
      imgW: img.naturalWidth, imgH: img.naturalHeight, vw,
      scale: minScale, minScale,
      x: (vw - img.naturalWidth * minScale) / 2,
      y: (vw - img.naturalHeight * minScale) / 2,
    };
    zoom.min = String(minScale);
    zoom.max = String(minScale * 4);
    zoom.step = String(minScale / 50);
    zoom.value = String(minScale);
    applyCropTransform();
  };
  img.src = url;
}

function clampCropPosition(state) {
  const w = state.imgW * state.scale;
  const h = state.imgH * state.scale;
  state.x = Math.min(0, Math.max(state.vw - w, state.x));
  state.y = Math.min(0, Math.max(state.vw - h, state.y));
}

function applyCropTransform() {
  if (!cropState) return;
  const img = document.getElementById('cropImg');
  if (!img) return;
  clampCropPosition(cropState);
  img.style.width = `${cropState.imgW * cropState.scale}px`;
  img.style.height = 'auto';
  img.style.transform = `translate(${cropState.x}px, ${cropState.y}px)`;
}

function bindCropViewport(viewport, zoom) {
  if (viewport.dataset.cropBound) return;
  viewport.dataset.cropBound = '1';
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  viewport.addEventListener('pointerdown', (e) => {
    if (!cropState) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    try { viewport.setPointerCapture(e.pointerId); } catch { /* noop */ }
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!dragging || !cropState) return;
    cropState.x += e.clientX - lastX;
    cropState.y += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    applyCropTransform();
  });
  const endDrag = () => { dragging = false; };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  zoom.addEventListener('input', () => {
    if (!cropState) return;
    const newScale = Number(zoom.value);
    if (!Number.isFinite(newScale) || newScale <= 0) return;
    const cx = cropState.vw / 2;
    const cy = cropState.vw / 2;
    const ratio = newScale / cropState.scale;
    cropState.x = cx - (cx - cropState.x) * ratio;
    cropState.y = cy - (cy - cropState.y) * ratio;
    cropState.scale = newScale;
    applyCropTransform();
  });
}

function renderCroppedPhoto() {
  return new Promise((resolve, reject) => {
    if (!cropState || !cropState.imgEl) {
      reject(new Error('Choose a photo first.'));
      return;
    }
    const st = cropState;
    const side = st.vw / st.scale;
    const sx = -st.x / st.scale;
    const sy = -st.y / st.scale;
    const OUT = 512;
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Cropping is not supported in this browser.'));
      return;
    }
    ctx.drawImage(st.imgEl, sx, sy, side, side, 0, 0, OUT, OUT);
    const mime = st.mime === 'image/png' ? 'image/png' : (st.mime === 'image/webp' ? 'image/webp' : 'image/jpeg');
    const ext = mime === 'image/png' ? '.png' : (mime === 'image/webp' ? '.webp' : '.jpg');
    const toFile = (blob) => {
      if (!blob) {
        if (mime !== 'image/jpeg') {
          canvas.toBlob((fallback) => {
            if (!fallback) { reject(new Error('Could not process the image.')); return; }
            resolve(new File([fallback], `profile-${Date.now().toString(36)}.jpg`, { type: 'image/jpeg' }));
          }, 'image/jpeg', 0.92);
          return;
        }
        reject(new Error('Could not process the image.'));
        return;
      }
      resolve(new File([blob], `profile-${Date.now().toString(36)}${ext}`, { type: mime }));
    };
    canvas.toBlob(toFile, mime, 0.92);
  });
}

function cancelProfilePhotoSelect() {
  pendingPhotoFile = null;
  cropState = null;
  if (pendingPhotoPreviewUrl) { URL.revokeObjectURL(pendingPhotoPreviewUrl); pendingPhotoPreviewUrl = null; }
  const input = document.getElementById('profilePhotoInput');
  if (input) input.value = '';
  document.getElementById('cropEditor')?.classList.add('hidden');
  document.getElementById('photoPreviewActions')?.classList.add('hidden');
  const statusEl = document.getElementById('photoUploadStatus');
  if (statusEl) statusEl.textContent = '';
}

async function uploadProfilePhoto() {
  if (!currentUser) return;
  if (!pendingPhotoFile || !cropState) {
    showToast('error', 'No Photo', 'Choose a photo first.');
    return;
  }
  const statusEl = document.getElementById('photoUploadStatus');
  const saveBtn = document.querySelector('#modalFooter .btn-primary') || document.getElementById('photoSaveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
  if (statusEl) statusEl.textContent = 'Cropping and uploading…';
  try {
    const croppedFile = await renderCroppedPhoto();
    const form = new FormData();
    form.append('photo', croppedFile, croppedFile.name);
    const response = await fetch(`/api/users/${encodeURIComponent(currentUser.id)}/photo`, {
      method: 'POST',
      headers: { 'X-User-Id': currentUser.id },
      body: form,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Upload failed.');
    syncUserPhotoInCache(currentUser.id, result.profile_photo);
    pendingPhotoFile = null;
    cropState = null;
    if (pendingPhotoPreviewUrl) { URL.revokeObjectURL(pendingPhotoPreviewUrl); pendingPhotoPreviewUrl = null; }
    buildSidebar();
    const input = document.getElementById('profilePhotoInput');
    if (input) input.value = '';
    closeModal();
    showToast('success', 'Saved', 'Profile photo updated.');
    if (typeof currentView !== 'undefined' && currentView) renderView(currentView);
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message;
    showToast('error', 'Upload Failed', error.message);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Photo'; }
  }
}

function confirmRemoveProfilePhoto() {
  openModal('Remove Profile Photo?', '<p style="color:var(--text-2);line-height:1.6">Are you sure you want to remove your profile photo?</p>', [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Remove Photo', cls: 'btn-danger', action: () => { closeModal(); removeProfilePhoto(); } },
  ]);
}

async function removeProfilePhoto() {
  if (!currentUser) return;
  try {
    const response = await fetch(`/api/users/${encodeURIComponent(currentUser.id)}/photo`, {
      method: 'DELETE',
      headers: { 'X-User-Id': currentUser.id },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not remove photo.');
    syncUserPhotoInCache(currentUser.id, null);
    buildSidebar();
    showToast('success', 'Removed', 'Profile photo removed.');
    if (typeof currentView !== 'undefined' && currentView) renderView(currentView);
  } catch (error) {
    showToast('error', 'Failed', error.message);
  }
}

function buildSidebar() {
  const nav = getNavForRole(currentUser.role);
  renderAvatarInto(document.getElementById('sidebarAvatar'), currentUser);
  renderAvatarInto(document.getElementById('topbarAvatar'), currentUser);
  document.getElementById('sidebarName').textContent = currentUser.name;
  document.getElementById('sidebarRole').textContent = ROLE_LABELS[currentUser.role] || currentUser.role;

  let lastSection = '';
  const navEl = document.getElementById('sidebarNav');
  navEl.innerHTML = '';

  nav.forEach(item => {
    if (item.section !== lastSection) {
      const lbl = document.createElement('div');
      lbl.className = 'nav-section-label';
      lbl.textContent = item.section;
      navEl.appendChild(lbl);
      lastSection = item.section;
    }
    const el = document.createElement('div');
    el.className = 'nav-item';
    el.dataset.view = item.id;

    const badgeCount = getSidebarBadgeCount(item.id);
    const badgeHtml = badgeCount > 0 ? `<span class="nav-badge">${badgeCount > 99 ? '99+' : badgeCount}</span>` : '';

    el.innerHTML = `<span class="nav-icon"><svg width="17" height="17"><use href="#${item.icon}"/></svg></span><span>${item.label}</span>${badgeHtml}`;
    el.addEventListener('click', () => navigate(item.id));
    navEl.appendChild(el);
  });
}

function navigate(viewId) {
  if (!canAccessView(viewId)) {
    viewId = getDefaultViewForRole(currentUser.role);
  }
  currentView = viewId;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewId);
  });
  const allNav = [...ADMIN_NAV, ...HOMEOWNER_NAV, ...PRESIDENT_NAV, ...SECURITY_NAV, ...TREASURER_NAV, ...AUDITOR_NAV];
  const navItem = allNav.find(n => n.id === viewId);
  document.getElementById('topbarTitle').textContent = navItem ? navItem.label : 'Dashboard';
  renderView(viewId);
  markSidebarViewSeen(viewId);
  updateSidebarBadges();
  if (window.innerWidth <= 900) closeSidebar();
  document.getElementById('notifPanel').classList.add('hidden');
}

function renderView(viewId) {
  const area = document.getElementById('contentArea');
  area.innerHTML = '';
  const renders = {
    'dashboard':         renderAdminDashboard,
    'homeowners':        renderHomeowners,
    'billing':           renderBilling,
    'payments':          renderPayments,
    'amenities':         renderAmenityBookingsAdmin,
    'vehicles':          renderVehicleManagement,
    'lostfound':         renderLostFoundManagement,
    'complaints':        renderAdminComplaints,
    'announcements':     renderAnnouncements,
    'reports':           renderReports,
    'auditlog':          renderAuditLog,
    'settings':          renderSettings,
    'ho-dashboard':      renderHODashboard,
    'ho-billing':        renderHOBilling,
    'ho-payments':       renderHOPayments,
    'ho-history':        renderHOHistory,
    'ho-amenities':      renderHOAmenityBooking,
    'ho-vehicles':       renderHOVehicles,
    'ho-complaints':     renderHOComplaints,
    'ho-announcements':  renderHOAnnouncements,
    'ho-profile':        renderHOProfile,
  };
  if (renders[viewId]) renders[viewId]();
}

function toMoneyNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatCurrency(value) {
  return `PHP ${toMoneyNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatLocationPart(value, label) {
  const cleaned = (value || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const withoutLabel = cleaned.replace(new RegExp(`^${label}\\s*`, 'i'), '').trim();
  return withoutLabel ? `${label} ${withoutLabel}` : '';
}

function formatBillingMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(value || '');
  if (!match) return '';
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const date = new Date(year, monthIndex, 1);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function getLocalDateValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function getLocalMonthValue(date = new Date()) {
  return getLocalDateValue(date).slice(0, 7);
}

function getAssignedHomeownerIds(billing) {
  if (Array.isArray(billing?.assignedTo)) return billing.assignedTo;
  if (typeof billing?.assignedTo !== 'string') return [];

  try {
    const parsed = JSON.parse(billing.assignedTo);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return billing.assignedTo.split(',').map(id => id.trim()).filter(Boolean);
  }
}

function getBillingTotal(billing) {
  return toMoneyNumber(billing?.amount) * getAssignedHomeownerIds(billing).length;
}

function getBillingCollectionStatus(billing) {
  const assignedIds = getAssignedHomeownerIds(billing);
  if (!assignedIds.length) return 'inactive';

  const payments = db.get('payments').filter(payment => payment.billingId === billing.id);
  const approvedHomeowners = new Set(
    payments
      .filter(payment => payment.status === 'approved')
      .map(payment => payment.homeownerId)
  );
  const pendingHomeowners = new Set(
    payments
      .filter(payment => payment.status === 'pending')
      .map(payment => payment.homeownerId)
  );

  if (assignedIds.every(id => approvedHomeowners.has(id))) return 'paid';
  if (assignedIds.some(id => pendingHomeowners.has(id))) return 'pending';
  if (billing.dueDate && billing.dueDate < getLocalDateValue()) return 'overdue';
  return billing.status === 'inactive' ? 'inactive' : 'active';
}

function calculateUserOutstandingBalance(userId) {
  const billings = db.get('billings');
  const activeBillingIds = new Set(billings.map(b => b.id));
  const totalDue = billings
    .filter(billing => getAssignedHomeownerIds(billing).includes(userId))
    .reduce((sum, billing) => sum + toMoneyNumber(billing.amount), 0);
  const totalPaid = db.get('payments')
    .filter(payment =>
      payment.homeownerId === userId &&
      payment.status === 'approved' &&
      activeBillingIds.has(payment.billingId)
    )
    .reduce((sum, payment) => sum + toMoneyNumber(payment.amount), 0);

  return Math.max(0, Math.round((totalDue - totalPaid) * 100) / 100);
}

function syncHomeownerBalances() {
  db.get('users')
    .filter(user => user.role === 'homeowner')
    .forEach(user => {
      const balance = calculateUserOutstandingBalance(user.id);
      if (toMoneyNumber(user.balance) !== balance) {
        user.balance = balance;
        db.save('users', user);
      }
      if (currentUser && currentUser.id === user.id) currentUser = user;
    });
}

function getRecordYear(...values) {
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.getFullYear();
  }
  return null;
}

function getAnalysisYear(payments = db.get('payments'), billings = db.get('billings')) {
  const years = [
    ...payments.map(p => getRecordYear(p.reviewedAt, p.submittedAt)),
    ...billings.map(b => getRecordYear(b.createdAt, b.dueDate)),
  ].filter(Boolean);
  return years.length ? Math.max(...years) : new Date().getFullYear();
}

function buildMonthlyRevenueData(payments, year) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const totals = months.map(month => ({ m: month, v: 0 }));

  payments
    .filter(p => p.status === 'approved')
    .forEach(p => {
      const date = new Date(p.reviewedAt || p.submittedAt);
      if (!Number.isFinite(date.getTime()) || date.getFullYear() !== year) return;
      totals[date.getMonth()].v += toMoneyNumber(p.amount);
    });

  return totals;
}

function paymentStatusCounts(payments) {
  return {
    approved: payments.filter(p => p.status === 'approved').length,
    pending: payments.filter(p => p.status === 'pending').length,
    rejected: payments.filter(p => p.status === 'rejected').length,
  };
}

function renderMonthlyBarChart(containerId, monthlyData, year) {
  const barWrap = document.getElementById(containerId);
  if (!barWrap) return;

  const maxMonthly = Math.max(...monthlyData.map(d => d.v), 0);
  if (maxMonthly <= 0) {
    barWrap.innerHTML = `<div class="chart-empty">No approved payments recorded for ${year}.</div>`;
    return;
  }

  barWrap.innerHTML = monthlyData.map(d => {
    const pct = Math.max((d.v / maxMonthly) * 100, d.v > 0 ? 4 : 0);
    return `
      <div class="chart-bar-wrap">
        <div class="chart-bar" style="height:${pct}%;background:linear-gradient(180deg,#2271c3,#4a90d9)" data-val="${formatCurrency(d.v)}"></div>
      </div>`;
  }).join('');
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay && overlay.classList.toggle('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  const overlay = document.querySelector('.sidebar-overlay');
  overlay && overlay.classList.remove('active');
}
function setupSidebarOverlay() {
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.addEventListener('click', closeSidebar);
    document.body.appendChild(overlay);
  }
}


// SECTION 6: ADMIN — DASHBOARD


function renderAdminDashboard() {
  syncHomeownerBalances();
  const homeowners = db.get('users').filter(u => u.role === 'homeowner');
  const payments = db.get('payments');
  const approved = payments.filter(p => p.status === 'approved');
  const pending  = payments.filter(p => p.status === 'pending');
  const totalCollected = approved.reduce((s, p) => s + p.amount, 0);
  const billings = db.get('billings');
  const totalBilled = billings.reduce((sum, billing) => sum + getBillingTotal(billing), 0);
  const totalOutstanding = homeowners.reduce((sum, user) => sum + toMoneyNumber(user.balance), 0);
  const complaints = db.get('complaints');
  const reviewedComplaints = complaints.filter(c => normalizeComplaintStatus(c.status) === 'Reviewed').length;
  const area = document.getElementById('contentArea');

  const analysisYear = getAnalysisYear(payments, billings);
  const monthlyData = buildMonthlyRevenueData(payments, analysisYear);
  const paymentCounts = paymentStatusCounts(payments);
  const paymentTotal = paymentCounts.approved + paymentCounts.pending + paymentCounts.rejected;

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <h2>Dashboard</h2>
      <p>Welcome back, ${currentUser.name}. Here's your overview.</p>
    </div>
  </div>

  <div class="stat-grid">
    <div class="stat-card" style="--card-accent:#2271c3;--card-accent-bg:#eef5fd">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-users"/></svg></div>
      <div class="stat-value">${homeowners.length}</div>
      <div class="stat-label">Total Homeowners</div>
    </div>
    <div class="stat-card" style="--card-accent:#16a34a;--card-accent-bg:#dcfce7">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-credit"/></svg></div>
      <div class="stat-value">₱${totalCollected.toLocaleString()}</div>
      <div class="stat-label">Total Collected</div>
    </div>
    <div class="stat-card" style="--card-accent:#177a80;--card-accent-bg:#e5f6f7">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-file"/></svg></div>
      <div class="stat-value">₱${totalBilled.toLocaleString()}</div>
      <div class="stat-label">Total Billed</div>
    </div>
    <div class="stat-card" style="--card-accent:#dc2626;--card-accent-bg:#fee2e2">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-clock"/></svg></div>
      <div class="stat-value">₱${totalOutstanding.toLocaleString()}</div>
      <div class="stat-label">Outstanding Balance</div>
    </div>
    <div class="stat-card" style="--card-accent:#eab308;--card-accent-bg:#fef9c3">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-clock"/></svg></div>
      <div class="stat-value">${pending.length}</div>
      <div class="stat-label">Pending Payments</div>
    </div>
    <div class="stat-card" style="--card-accent:#dc2626;--card-accent-bg:#fee2e2">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-flag"/></svg></div>
      <div class="stat-value">${reviewedComplaints}</div>
      <div class="stat-label">Reviewed Complaints</div>
    </div>
  </div>

  <div class="charts-row">
    <div class="chart-card chart-card-wide">
      <h4>Monthly Revenue (${analysisYear})</h4>
      <div class="chart-bars" id="barChart"></div>
      <div style="display:flex;gap:8px;margin-top:6px">
        ${monthlyData.map(d => `<div style="flex:1;text-align:center;font-size:0.72rem;color:var(--text-3)">${d.m}</div>`).join('')}
      </div>
    </div>
    <div class="chart-card">
      <h4>Payment Status</h4>
      <div class="donut-wrap" id="donutChart"></div>
      <div class="donut-legend">
        <div class="legend-item"><div class="legend-dot" style="background:#16a34a"></div> Approved (${paymentCounts.approved})</div>
        <div class="legend-item"><div class="legend-dot" style="background:#eab308"></div> Pending (${paymentCounts.pending})</div>
        <div class="legend-item"><div class="legend-dot" style="background:#dc2626"></div> Rejected (${paymentCounts.rejected})</div>
      </div>
    </div>
  </div>

  <div class="section-card" style="margin-bottom:18px">
    <div class="section-card-header">
      <div><h3>Recent Billings</h3><p>Latest charges assigned to homeowners</p></div>
      <button class="btn btn-secondary btn-sm" onclick="navigate('billing')">View All</button>
    </div>
    <div class="section-card-body no-pad">
      <table class="data-table">
        <thead><tr><th>Billing</th><th>Amount</th><th>Due Date</th><th>Assigned</th></tr></thead>
        <tbody>
          ${[...billings].sort((a, b) => `${b.createdAt || ''}-${b.id || ''}`.localeCompare(`${a.createdAt || ''}-${a.id || ''}`)).slice(0, 5).map(b => {
            const assignedIds = getAssignedHomeownerIds(b);
            return `<tr>
              <td><strong>${b.title}</strong></td>
              <td class="amount-due">₱${toMoneyNumber(b.amount).toLocaleString()}</td>
              <td>${b.dueDate || 'N/A'}</td>
              <td>${assignedIds.length} homeowner(s)</td>
            </tr>`;
          }).join('') || '<tr><td colspan="4"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-file"/></svg>No billings created yet.</div></td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
    <div class="section-card">
      <div class="section-card-header"><div><h3>Recent Payments</h3><p>Latest submissions</p></div></div>
      <div class="section-card-body no-pad">
        <table class="data-table">
          <thead><tr><th>Homeowner</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody id="recentPaymentsTable"></tbody>
        </table>
      </div>
    </div>
    <div class="section-card">
      <div class="section-card-header">
        <div><h3>Recent Complaints</h3><p>Latest submissions</p></div>
        <button class="btn btn-secondary btn-sm" onclick="navigate('complaints')">View All</button>
      </div>
      <div id="recentComplaintsPanel" style="padding:0"></div>
    </div>
  </div>`;

  renderMonthlyBarChart('barChart', monthlyData, analysisYear);
  const total = paymentTotal;
  renderDonut('donutChart', [
    { value: paymentCounts.approved, color: '#16a34a' },
    { value: paymentCounts.pending, color: '#eab308' },
    { value: paymentCounts.rejected, color: '#dc2626' },
  ], total, 'Total', total);

  const tbody = document.getElementById('recentPaymentsTable');
  const recentP = [...payments].sort((a,b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 5);
  recentP.forEach(p => {
    const ho = db.getOne('users', p.homeownerId);
    tbody.innerHTML += `
      <tr>
        <td>${ho ? ho.name : 'Unknown'}</td>
        <td>₱${p.amount.toLocaleString()}</td>
        <td>${badgeHtml(p.status)}</td>
      </tr>`;
  });

  // Recent Complaints Panel
  const cmpPanel = document.getElementById('recentComplaintsPanel');
  const recentC = [...complaints].sort((a,b) => b.dateFiled.localeCompare(a.dateFiled)).slice(0, 4);
  if (!recentC.length) {
    cmpPanel.innerHTML = '<p class="empty-note">No complaints filed.</p>';
  } else {
    recentC.forEach(c => {
      const ho = db.getOne('users', c.homeownerId);
      cmpPanel.innerHTML += `
        <div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div>
            <div style="font-weight:600;font-size:0.85rem;color:var(--text)">${ho ? ho.name : 'Unknown'} — ${c.category}</div>
            <div style="font-size:0.78rem;color:var(--text-3);margin-top:2px">${c.dateFiled}</div>
          </div>
          ${complaintStatusBadge(c.status)}
        </div>`;
    });
  }
}

function renderDonut(containerId, segments, total, centerLabel, centerVal) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const r = 54, cx = 70, cy = 70;
  const circumference = 2 * Math.PI * r;
  const safeTotal = total > 0 ? total : 1;
  let offset = 0;
  let paths = '';
  segments.forEach(seg => {
    if (seg.value <= 0) return;
    const frac = seg.value / safeTotal;
    const dash = frac * circumference;
    const gap = circumference - dash;
    paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="14"
      stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${-offset * circumference}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>`;
    offset += frac;
  });
  el.innerHTML = `
    <svg viewBox="0 0 140 140">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="14"/>
      ${paths}
    </svg>
    <div class="donut-center">
      <div class="donut-value">${centerVal}</div>
      <div class="donut-sub">${centerLabel}</div>
    </div>`;
}


// SECTION 7: ADMIN — HOMEOWNERS


function renderHomeowners() {
  syncHomeownerBalances();
  const area = document.getElementById('contentArea');
  const blockOptions = [...new Set(db.get('users')
    .filter(u => u.role === 'homeowner' && u.block)
    .map(u => u.block))]
    .sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Homeowner Management</h2><p>Manage subdivision residents and their profiles.</p></div>
    <div class="page-header-actions">
      <button class="btn btn-primary" onclick="openAddHomeownerModal()">Add Homeowner</button>
    </div>
  </div>
  <div class="section-card">
    <div class="section-card-header">
      <div class="filters-row">
        <div class="search-box"><span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span><input id="hoSearch" type="text" placeholder="Search by name, email, block..."/></div>
        <select class="filter-select" id="hoFilter" onchange="filterHomeowners()">
          <option value="">All Blocks</option>
          ${blockOptions.map(block => `<option value="${block}">${block}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper"><table class="data-table homeowner-compact-table">
        <thead><tr><th>#</th><th>Homeowner</th><th>Block / Lot</th><th>Balance</th><th>Details</th><th>Actions</th></tr></thead>
        <tbody id="hoTableBody"></tbody>
      </table></div>
    </div>
  </div>`;

  document.getElementById('hoSearch').addEventListener('input', filterHomeowners);
  renderHOTable();
}

function renderHOTable(filtered = null) {
  const users = filtered !== null ? filtered : db.get('users').filter(u => u.role === 'homeowner');
  const tbody = document.getElementById('hoTableBody');
  if (!tbody) return;
  if (!users.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-users"/></svg>No homeowners found.</div></td></tr>`; return; }
  tbody.innerHTML = users.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><div class="homeowner-name-cell">${avatarHTML(u, 'avatar-sm')}<strong>${u.name}</strong></div></td>
      <td>${u.block || '—'}, ${u.lot || '—'}</td>
      <td class="${(u.balance||0) > 0 ? 'amount-due' : 'amount-paid'}">₱${(u.balance||0).toLocaleString()}</td>
      <td><button class="ho-info-btn" onclick="openViewHO('${u.id}')" title="View details">i</button></td>
      <td><div class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="openEditHO('${u.id}')">Edit</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="confirmDeleteHO('${u.id}')" title="Delete"><svg width="14" height="14"><use href="#ico-trash"/></svg></button>
      </div></td>
    </tr>`).join('');
}

function filterHomeowners() {
  const q = (document.getElementById('hoSearch')?.value || '').toLowerCase();
  const blk = document.getElementById('hoFilter')?.value || '';
  let users = db.get('users').filter(u => u.role === 'homeowner');
  if (q) users = users.filter(u =>
    u.name.toLowerCase().includes(q)
    || (u.username || '').toLowerCase().includes(q)
    || u.email.toLowerCase().includes(q)
    || (u.block || '').toLowerCase().includes(q)
  );
  if (blk) users = users.filter(u => u.block === blk);
  renderHOTable(users);
}

function openAddHomeownerModal() {
  openModal('Add Homeowner', `
    <div class="grid-2">
      <div class="form-group"><label>Full Name *</label><input id="f_name" placeholder="e.g. Juan Dela Cruz"/></div>
      <div class="form-group"><label>Username *</label><input id="f_user" placeholder="e.g. juandelacruz"/></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>Password *</label><input id="f_pass" type="password" placeholder="Min 6 characters"/></div>
      <div class="form-group"><label>Email *</label><input id="f_email" type="email" placeholder="email@example.com"/></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>Block</label><input id="f_block" inputmode="numeric" placeholder="e.g. 3"/></div>
      <div class="form-group"><label>Lot</label><input id="f_lot" inputmode="numeric" placeholder="e.g. 7"/></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>Lot Area</label><input id="f_lotArea" type="number" min="0" step="0.01" placeholder="e.g. 120"/></div>
      <div class="form-group"><label>Contact Number</label><input id="f_contact" placeholder="e.g. 09171234567"/></div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Add Homeowner', cls: 'btn-primary', action: saveAddHomeowner },
  ]);
}

function saveAddHomeowner() {
  const name = document.getElementById('f_name').value.trim();
  const username = document.getElementById('f_user').value.trim();
  const password = document.getElementById('f_pass').value.trim();
  const email = document.getElementById('f_email').value.trim();
  if (!name || !username || !password || !email) { showToast('error', 'Missing Fields', 'Please fill in all required fields.'); return; }
  if (password.length < 6) { showToast('error', 'Weak Password', 'Password must be at least 6 characters.'); return; }
  const users = db.get('users');
  if (users.find(u => u.username === username)) { showToast('error', 'Duplicate Username', 'That username is already taken.'); return; }
  const lotAreaValue = document.getElementById('f_lotArea').value.trim();
  const lotArea = lotAreaValue ? Number(lotAreaValue) : 0;
  if (!Number.isFinite(lotArea) || lotArea < 0) { showToast('error', 'Invalid Lot Area', 'Please enter a valid lot area.'); return; }
  const newUser = {
    id: db.newId('u'),
    username, password, role: 'homeowner', name, email,
    block: formatLocationPart(document.getElementById('f_block').value, 'Block'),
    lot: formatLocationPart(document.getElementById('f_lot').value, 'Lot'),
    lotArea,
    contact: document.getElementById('f_contact').value.trim(),
    balance: 0,
  };
  db.save('users', newUser);
  logAction(`Added homeowner ${name}`);
  closeModal();
  showToast('success', 'Homeowner Added', `${name} has been added.`);
  renderHomeowners();
}

function openViewHO(id) {
  const u = db.getOne('users', id);
  if (!u) return;
  const payments = db.get('payments').filter(p => p.homeownerId === id);
  const billings = db.get('billings').filter(b => b.assignedTo.includes(id));
  const complaints = db.get('complaints').filter(c => c.homeownerId === id);
  openModal(`Profile: ${u.name}`, `
    <div class="profile-card" style="margin-bottom:16px">
      <div class="profile-avatar-big">${avatarHTML(u, 'avatar-xl')}</div>
      <div class="profile-info"><h3>${u.name}</h3><p>${u.email}</p><p>${u.block||''} ${u.lot||''}</p></div>
    </div>
    <div class="grid-2" style="grid-template-columns:1fr 1fr 1fr;gap:10px">
      <div class="report-summary-item"><div class="r-val">${billings.length}</div><div class="r-lbl">Bills Assigned</div></div>
      <div class="report-summary-item"><div class="r-val">${payments.filter(p=>p.status==='approved').length}</div><div class="r-lbl">Approved Payments</div></div>
      <div class="report-summary-item"><div class="r-val">${complaints.length}</div><div class="r-lbl">Complaints Filed</div></div>
    </div>
    <p style="margin-top:14px;font-size:0.85rem;color:var(--text-3)">Lot Area: <strong>${u.lotArea || 0} sqm</strong> | Contact: ${u.contact||'N/A'} | Balance: <strong style="color:var(--red-600)">₱${(u.balance||0).toLocaleString()}</strong></p>
    <p style="margin-top:14px;font-size:0.85rem;color:var(--text-3)">Username: <strong>${u.username || 'N/A'}</strong> | Password: <strong>${u.password || 'N/A'}</strong></p>
  `, [{ label: 'Close', cls: 'btn-secondary', action: closeModal }]);
}

function openEditHO(id) {
  const u = db.getOne('users', id);
  if (!u) return;
  openModal('Edit Homeowner', `
    <div class="form-group"><label>Full Name</label><input id="e_name" value="${u.name}"/></div>
    <div class="form-group"><label>Email</label><input id="e_email" value="${u.email}"/></div>
    <div class="grid-2">
      <div class="form-group"><label>Block</label><input id="e_block" value="${u.block||''}"/></div>
      <div class="form-group"><label>Lot</label><input id="e_lot" value="${u.lot||''}"/></div>
    </div>
    <div class="form-group"><label>Contact</label><input id="e_contact" value="${u.contact||''}"/></div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Save Changes', cls: 'btn-primary', action: () => confirmSaveEditHO(id) },
  ]);
}

function confirmSaveEditHO(id) {
  const name = document.getElementById('e_name').value.trim();
  openConfirm('Save Changes', `Are you sure you want to update the profile of <strong>${name}</strong>?`, () => saveEditHO(id));
}

function saveEditHO(id) {
  const u = db.getOne('users', id);
  if (!u) return;
  u.name = document.getElementById('e_name').value.trim() || u.name;
  u.email = document.getElementById('e_email').value.trim() || u.email;
  u.block = formatLocationPart(document.getElementById('e_block').value, 'Block');
  u.lot = formatLocationPart(document.getElementById('e_lot').value, 'Lot');
  u.contact = document.getElementById('e_contact').value.trim();
  db.save('users', u);
  logAction(`Updated homeowner profile: ${u.name}`);
  closeModal();
  showToast('success', 'Profile Updated', `${u.name}'s profile saved.`);
  renderHomeowners();
}

function confirmDeleteHO(id) {
  const u = db.getOne('users', id);
  if (!u) return;
  openModal('Confirm Delete', `<p>Are you sure you want to delete <strong>${u.name}</strong>? This action cannot be undone.</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Delete', cls: 'btn-danger', action: () => { db.delete('users', id); logAction(`Deleted homeowner: ${u.name}`); closeModal(); showToast('success', 'Deleted', `${u.name} removed.`); renderHomeowners(); } },
  ]);
}


// SECTION 8: ADMIN — BILLING


function renderBilling() {
  syncHomeownerBalances();
  const billings = db.get('billings');
  const manageBilling = canManageBilling();
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>${manageBilling ? 'Billing Management' : 'Billing Status'}</h2><p>${manageBilling ? 'Create and manage billing records for homeowners.' : 'View homeowner billing status and collection progress.'}</p></div>
    ${manageBilling ? `<div class="page-header-actions">
      <button class="btn btn-secondary" onclick="autoGenerateLotAreaMonthlyDues()">Auto-Generate Dues</button>
      <button class="btn btn-primary" onclick="openProfessionalBillingModal()">Create Billing</button>
    </div>` : ''}
  </div>
  <div class="section-card">
    <div class="section-card-header">
      <div class="filters-row">
        <div class="search-box"><span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span><input id="billSearch" type="text" placeholder="Search billings..."/></div>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Title</th><th>Amount</th><th>Due Date</th><th>Assigned</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="billTableBody"></tbody>
      </table></div>
    </div>
  </div>`;

  document.getElementById('billSearch').addEventListener('input', () => {
    const q = document.getElementById('billSearch').value.toLowerCase();
    const filtered = billings.filter(b => b.title.toLowerCase().includes(q));
    renderBillingTable(filtered);
  });

  renderBillingTable(billings);
}

function renderBillingTable(billings) {
  const tbody = document.getElementById('billTableBody');
  if (!tbody) return;
  if (!billings.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-file"/></svg>No billings found.</div></td></tr>`; return; }
  tbody.innerHTML = billings.map(b => {
    const assignedIds = getAssignedHomeownerIds(b);
    const collectionStatus = getBillingCollectionStatus(b);
    const overdue = collectionStatus === 'overdue';
    return `<tr class="${overdue ? 'overdue-row' : ''}">
      <td><strong>${b.title}</strong>${overdue ? ' <span class="badge badge-red">Overdue</span>' : ''}</td>
      <td class="amount-due">₱${b.amount.toLocaleString()}</td>
      <td>${b.dueDate}</td>
      <td>${assignedIds.length} homeowner(s)</td>
      <td>${badgeHtml(collectionStatus)}</td>
      <td><div class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="viewBillingDetail('${b.id}')">View</button>
        ${canManageBilling() ? `<button class="btn btn-danger btn-sm btn-icon" onclick="confirmDeleteBilling('${b.id}')" title="Delete"><svg width="14" height="14"><use href="#ico-trash"/></svg></button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
}

function openAddBillingModal() {
  const homeowners = db.get('users').filter(u => u.role === 'homeowner');
  openModal('Create Billing', `
    <div class="form-group"><label>Title *</label><input id="bf_title" placeholder="e.g. Monthly Dues – April"/></div>
    <div class="grid-2">
      <div class="form-group"><label>Amount (₱) *</label><input id="bf_amount" type="number" placeholder="1500"/></div>
      <div class="form-group"><label>Due Date *</label><input id="bf_due" type="date"/></div>
    </div>
    <div class="form-group"><label>Billing Month *</label><input id="bf_month" type="month"/></div>
    <div class="form-group"><label>Description</label><textarea id="bf_desc" placeholder="Optional description..."></textarea></div>
    <div class="form-group">
      <label>Assign To</label>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <input type="checkbox" id="bf_all" onchange="toggleSelectAll(this)"> <span style="font-size:0.85rem;color:var(--text-2)">Select All</span>
      </div>
      <div style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:8px">
        ${homeowners.map(u => `
          <div style="display:flex;align-items:center;gap:8px;padding:5px 0">
            <input type="checkbox" class="ho-cb" value="${u.id}">
            <span style="font-size:0.85rem">${u.name} – ${u.block||''} ${u.lot||''}</span>
          </div>`).join('')}
      </div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Create Billing', cls: 'btn-primary', action: saveAddBilling },
  ]);
}

function toggleSelectAll(cb) {
  document.querySelectorAll('.ho-cb').forEach(c => c.checked = cb.checked);
}

function openProfessionalBillingModal() {
  if (!canManageBilling()) { showToast('error', 'Access Denied', 'Only the admin can create billings.'); return; }
  const homeowners = db.get('users').filter(u => u.role === 'homeowner');
  openModal('Create Billing', `
    <div class="billing-form">
      <section class="billing-form-section">
        <div class="billing-form-kicker">Billing details</div>
        <div class="form-group">
          <label>Title *</label>
          <input id="bf_title" placeholder="Monthly Association Dues"/>
        </div>
        <div class="form-group">
          <label>Billing Month *</label>
          <input id="bf_month" type="month"/>
        </div>
        <div class="grid-2 billing-compact-grid">
          <div class="form-group">
            <label>Amount (PHP) *</label>
            <input id="bf_amount" type="number" min="0" step="0.01" placeholder="1500.00"/>
            <div class="billing-helper-text" id="bf_amountHint"></div>
          </div>
          <div class="form-group">
            <label>Due Date *</label>
            <input id="bf_due" type="date"/>
          </div>
        </div>
        <div class="form-group billing-desc-group">
          <label>Description</label>
          <textarea id="bf_desc" placeholder="Add notes, coverage period, or payment instructions..."></textarea>
        </div>
      </section>

      <section class="billing-form-section billing-assignment-section">
        <div class="billing-assignment-header">
          <div>
            <div class="billing-form-kicker">Homeowner assignment</div>
            <div class="billing-helper-text">Choose who should receive this billing.</div>
          </div>
          <div class="billing-selected-count" id="bf_selectedCount">0 selected</div>
        </div>
        <div class="billing-assignment-tools">
          <label class="billing-select-all">
            <input type="checkbox" id="bf_all" onchange="toggleProfessionalBillingSelectAll(this)">
            <span>Select all homeowners</span>
          </label>
          <div class="billing-search">
            <svg width="14" height="14"><use href="#ico-search"/></svg>
            <input id="bf_assignSearch" type="text" placeholder="Search homeowners..."/>
          </div>
        </div>
        <div class="billing-homeowner-list">
          ${homeowners.map(u => `
            <label class="billing-homeowner-row" data-search="${`${u.name} ${u.block || ''} ${u.lot || ''} ${u.username || ''}`.toLowerCase()}">
              <input type="checkbox" class="ho-cb" value="${u.id}" onchange="updateProfessionalBillingSummary()">
              <span class="billing-homeowner-main">
                <span class="billing-homeowner-name">${u.name}</span>
                <span class="billing-homeowner-meta">${u.block || 'No block'} | ${u.lot || 'No lot'}</span>
              </span>
            </label>`).join('')}
        </div>
      </section>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Create Billing', cls: 'btn-primary', action: saveAddBilling },
  ]);

  setupProfessionalBillingSearch();
  setupBillingAmountAutoFill();
  updateProfessionalBillingSummary();
}

function toggleProfessionalBillingSelectAll(cb) {
  document.querySelectorAll('.ho-cb').forEach(c => c.checked = cb.checked);
  updateProfessionalBillingSummary();
}

function setupProfessionalBillingSearch() {
  const input = document.getElementById('bf_assignSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    document.querySelectorAll('.billing-homeowner-row').forEach(row => {
      row.classList.toggle('hidden', q && !row.dataset.search.includes(q));
    });
  });
}

function updateProfessionalBillingSummary() {
  const selected = document.querySelectorAll('.ho-cb:checked').length;
  const total = document.querySelectorAll('.ho-cb').length;
  const countEl = document.getElementById('bf_selectedCount');
  const allEl = document.getElementById('bf_all');
  if (countEl) countEl.textContent = `${selected} of ${total} selected`;
  if (allEl) {
    allEl.checked = total > 0 && selected === total;
    allEl.indeterminate = selected > 0 && selected < total;
  }
  updateBillingAmountForMonthlyDues();
}

function getDuesRatePerSqm() {
  const setting = db.getOne('appSettings', 'duesRatePerSqm');
  const value = parseFloat(setting?.value);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DUES_RATE_PER_SQM;
}

function calculateMonthlyDues(user, rate = getDuesRatePerSqm()) {
  const lotArea = parseFloat(user?.lotArea || 0);
  return Math.round((Number.isFinite(lotArea) ? lotArea : 0) * rate * 100) / 100;
}

function isMonthlyDuesTitle(title) {
  const text = (title || '').toLowerCase();
  return text.includes('monthly') && text.includes('dues');
}

function setupBillingAmountAutoFill() {
  const titleInput = document.getElementById('bf_title');
  if (titleInput) titleInput.addEventListener('input', updateBillingAmountForMonthlyDues);
  updateBillingAmountForMonthlyDues();
}

function updateBillingAmountForMonthlyDues() {
  const titleInput = document.getElementById('bf_title');
  const amountInput = document.getElementById('bf_amount');
  const hint = document.getElementById('bf_amountHint');
  if (!titleInput || !amountInput) return;

  const monthlyDues = isMonthlyDuesTitle(titleInput.value);
  const selectedIds = [...document.querySelectorAll('.ho-cb:checked')].map(c => c.value);

  amountInput.readOnly = false;
  if (hint) hint.textContent = '';

  if (!monthlyDues) return;

  if (selectedIds.length !== 1) {
    amountInput.value = '';
    amountInput.readOnly = true;
    if (hint) hint.textContent = 'Select one homeowner to calculate from lot area.';
    return;
  }

  const user = db.getOne('users', selectedIds[0]);
  const rate = getDuesRatePerSqm();
  const amount = calculateMonthlyDues(user, rate);
  amountInput.value = amount.toFixed(2);
  amountInput.readOnly = true;
  if (hint) hint.textContent = `${user?.lotArea || 0} sqm x PHP ${rate.toLocaleString()} per sqm`;
}

function saveAddBilling() {
  const title = document.getElementById('bf_title').value.trim();
  const due = document.getElementById('bf_due').value;
  const billingMonth = formatBillingMonth(document.getElementById('bf_month')?.value);
  if (!title || !due || !billingMonth) { showToast('error', 'Missing Fields', 'Fill all required fields.'); return; }
  const checked = [...document.querySelectorAll('.ho-cb:checked')].map(c => c.value);
  if (!checked.length) { showToast('error', 'No Assignment', 'Select at least one homeowner.'); return; }
  if (isMonthlyDuesTitle(title) && checked.length !== 1) {
    showToast('error', 'Select One Homeowner', 'Monthly dues are calculated per homeowner from lot area.');
    return;
  }
  updateBillingAmountForMonthlyDues();
  const amount = parseFloat(document.getElementById('bf_amount').value);
  if (isNaN(amount)) { showToast('error', 'Missing Fields', 'Fill all required fields.'); return; }
  const finalTitle = title.toLowerCase().includes(billingMonth.toLowerCase()) ? title : `${title} - ${billingMonth}`;
  const description = document.getElementById('bf_desc').value.trim();
  const bill = {
    id: db.newId('b'),
    title: finalTitle, amount, dueDate: due,
    description: description ? `Billing month: ${billingMonth}. ${description}` : `Billing month: ${billingMonth}.`,
    assignedTo: checked, status: 'active',
    createdAt: getLocalDateValue(),
  };
  db.save('billings', bill);
  checked.forEach(id => {
    const user = db.getOne('users', id);
    if (user) {
      user.balance = (Number(user.balance) || 0) + amount;
      db.save('users', user);
    }
  });
  logAction(`Created billing: ${finalTitle} for ${checked.length} homeowner(s)`);
  addNotification('New Billing Created', `"${finalTitle}" has been assigned to you.`, { userIds: checked });
  closeModal();
  showToast('success', 'Billing Created', `"${finalTitle}" has been created.`);
  renderBilling();
}

function viewBillingDetail(id) {
  const b = db.getOne('billings', id);
  if (!b) return;
  const users = db.get('users');
  const assignedNames = b.assignedTo.map(uid => { const u = users.find(x => x.id === uid); return u ? u.name : uid; });
  openModal(b.title, `
    <p style="color:var(--text-2);margin-bottom:16px">${b.description || 'No description.'}</p>
    <div class="grid-2 mb-16">
      <div class="report-summary-item"><div class="r-val">₱${b.amount.toLocaleString()}</div><div class="r-lbl">Amount</div></div>
      <div class="report-summary-item"><div class="r-val">${b.dueDate}</div><div class="r-lbl">Due Date</div></div>
    </div>
    <strong style="font-size:0.82rem;color:var(--text-3)">ASSIGNED TO (${assignedNames.length})</strong>
    <div style="margin-top:8px;max-height:180px;overflow-y:auto">
      ${assignedNames.map(n => `<div style="padding:6px 0;font-size:0.88rem;border-bottom:1px solid var(--border);color:var(--text-2)">- ${n}</div>`).join('')}
    </div>
  `, [{ label: 'Close', cls: 'btn-secondary', action: closeModal }]);
}

function confirmDeleteBilling(id) {
  if (!canManageBilling()) { showToast('error', 'Access Denied', 'Only the admin can delete billings.'); return; }
  const b = db.getOne('billings', id);
  if (!b) return;
  openModal('Delete Billing', `<p>Delete <strong>${b.title}</strong>? This cannot be undone.</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Delete', cls: 'btn-danger', action: () => {
      db.delete('billings', id);
      syncHomeownerBalances();
      logAction(`Deleted billing: ${b.title}`);
      closeModal();
      showToast('success', 'Deleted', 'Billing removed and balances updated.');
      renderBilling();
    } },
  ]);
}

function autoGenerateMonthlyDues() {
  const month = new Date().toLocaleString('default', { month: 'long' });
  const year = new Date().getFullYear();
  const title = `Monthly Dues – ${month} ${year}`;
  const homeowners = db.get('users').filter(u => u.role === 'homeowner');
  const existing = db.get('billings').find(b => b.title === title);
  if (existing) { showToast('warning', 'Already Exists', `Dues for ${month} already created.`); return; }
  const lastDay = getLocalDateValue(new Date(year, new Date().getMonth() + 1, 0));
  const bill = { id: db.newId('b'), title, amount: 1500, dueDate: lastDay, description: 'Auto-generated monthly dues.', assignedTo: homeowners.map(u => u.id), status: 'active', createdAt: getLocalDateValue() };
  db.save('billings', bill);
  logAction(`Auto-generated monthly dues: ${title}`);
  showToast('success', 'Generated', `${title} created for ${homeowners.length} homeowners.`);
  renderBilling();
}


function autoGenerateLotAreaMonthlyDues() {
  const month = new Date().toLocaleString('default', { month: 'long' });
  const year = new Date().getFullYear();
  const title = `Monthly Dues - ${month} ${year}`;
  const homeowners = db.get('users').filter(u => u.role === 'homeowner');
  const existing = db.get('billings').filter(b => b.title === title);
  const alreadyAssigned = new Set(existing.flatMap(b => b.assignedTo || []));
  const rate = getDuesRatePerSqm();
  const lastDay = getLocalDateValue(new Date(year, new Date().getMonth() + 1, 0));
  const createdAt = getLocalDateValue();
  let created = 0;

  homeowners.forEach((u, index) => {
    if (alreadyAssigned.has(u.id)) return;
    const amount = calculateMonthlyDues(u, rate);
    const bill = {
      id: `${db.newId('b')}${index}`,
      title,
      amount,
      dueDate: lastDay,
      description: `Auto-generated monthly dues at PHP ${rate.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} per sqm for ${u.lotArea || 0} sqm lot area.`,
      assignedTo: [u.id],
      status: 'active',
      createdAt,
    };
    db.save('billings', bill);
    u.balance = (Number(u.balance) || 0) + amount;
    db.save('users', u);
    created++;
  });

  if (!created) {
    showToast('warning', 'Already Exists', `Dues for ${month} already created.`);
    return;
  }

  logAction(`Auto-generated monthly dues: ${title} at PHP ${rate}/sqm for ${created} homeowner(s)`);
  showToast('success', 'Generated', `${title} created for ${created} homeowner(s).`);
  renderBilling();
}

// SECTION 9: ADMIN — PAYMENTS


// SECTION 9: AMENITY BOOKINGS


function getAmenityBookingDate(value) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function isSundayDate(value) {
  const date = getAmenityBookingDate(value);
  return date ? date.getDay() === 0 : false;
}

function getAmenityUnavailableSettings() {
  const setting = db.getOne('appSettings', 'amenityUnavailable');
  const fallback = { weeklyDays: [0], dateRules: [] };
  if (!setting?.value) return fallback;
  try {
    const parsed = JSON.parse(setting.value);
    return {
      weeklyDays: Array.isArray(parsed.weeklyDays) ? parsed.weeklyDays.map(Number).filter(day => day >= 0 && day <= 6) : fallback.weeklyDays,
      dateRules: Array.isArray(parsed.dateRules) ? parsed.dateRules : [],
    };
  } catch {
    return fallback;
  }
}

function saveAmenityUnavailableSettings(settings) {
  db.save('appSettings', {
    id: 'amenityUnavailable',
    value: JSON.stringify({
      weeklyDays: [...new Set(settings.weeklyDays || [])].map(Number).sort(),
      dateRules: settings.dateRules || [],
    }),
  });
}

function getAmenityUnavailableRule(amenity, dateValue) {
  const date = getAmenityBookingDate(dateValue);
  if (!date) return null;
  const settings = getAmenityUnavailableSettings();
  const dayRule = settings.weeklyDays.includes(date.getDay())
    ? { type: 'weekly', reason: `${date.toLocaleDateString(undefined, { weekday: 'long' })} is marked unavailable.` }
    : null;
  const dateRule = settings.dateRules.find(rule =>
    rule.date === dateValue &&
    (rule.amenity === 'all' || rule.amenity === amenity)
  );
  return dateRule || dayRule;
}

function formatAmenityDate(value) {
  const date = getAmenityBookingDate(value);
  if (!date) return 'N/A';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function amenityBookingConflicts(amenity, bookingDate, ignoreId = null) {
  return db.get('amenityBookings').filter(booking =>
    booking.id !== ignoreId &&
    booking.amenity === amenity &&
    booking.bookingDate === bookingDate &&
    ['Pending', 'Approved'].includes(booking.status)
  );
}

function getAmenityDayStatus(amenity, dateValue) {
  if (getAmenityUnavailableRule(amenity, dateValue)) return 'Unavailable';
  const bookings = amenityBookingConflicts(amenity, dateValue);
  if (bookings.some(booking => booking.status === 'Approved')) return 'Booked';
  if (bookings.some(booking => booking.status === 'Pending')) return 'Pending';
  return 'Free';
}

function renderAmenityCalendar() {
  const container = document.getElementById('amenityCalendar');
  if (!container) return;
  const amenity = document.getElementById('ab_amenity')?.value || AMENITIES[0];
  const monthValue = document.getElementById('ab_month')?.value || getLocalMonthValue();
  const [year, month] = monthValue.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = first.getDay();
  const cells = [];

  for (let i = 0; i < leadingBlanks; i++) cells.push('<div class="amenity-calendar-cell empty"></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const dateValue = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const status = getAmenityDayStatus(amenity, dateValue);
    cells.push(`
      <button class="amenity-calendar-cell ${status.toLowerCase()}" type="button" onclick="selectAmenityDate('${dateValue}')">
        <span>${day}</span>
        <small>${status}</small>
      </button>`);
  }

  container.innerHTML = `
    <div class="amenity-calendar-head">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => `<span>${day}</span>`).join('')}</div>
    <div class="amenity-calendar-grid">${cells.join('')}</div>`;
}

function selectAmenityDate(dateValue) {
  const input = document.getElementById('ab_date');
  if (input) input.value = dateValue;
  updateAmenityAvailabilityNote();
}

function renderAdminAmenityCalendar() {
  const container = document.getElementById('adminAmenityCalendar');
  if (!container) return;
  const amenity = document.getElementById('admin_ab_amenity')?.value || AMENITIES[0];
  const monthValue = document.getElementById('admin_ab_month')?.value || getLocalMonthValue();
  const [year, month] = monthValue.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = first.getDay();
  const cells = [];

  for (let i = 0; i < leadingBlanks; i++) cells.push('<div class="amenity-calendar-cell empty"></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const dateValue = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const status = getAmenityDayStatus(amenity, dateValue);
    cells.push(`
      <button class="amenity-calendar-cell ${status.toLowerCase()}" type="button" onclick="selectAdminAmenityDate('${dateValue}')">
        <span>${day}</span>
        <small>${status}</small>
      </button>`);
  }

  container.innerHTML = `
    <div class="amenity-calendar-head">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => `<span>${day}</span>`).join('')}</div>
    <div class="amenity-calendar-grid">${cells.join('')}</div>`;
}

function selectAdminAmenityDate(dateValue) {
  const input = document.getElementById('adminUnavailableDate');
  if (input) input.value = dateValue;
}

function updateAmenityAvailabilityNote() {
  const note = document.getElementById('ab_availabilityNote');
  if (!note) return;
  const amenity = document.getElementById('ab_amenity')?.value;
  const bookingDate = document.getElementById('ab_date')?.value;
  if (!amenity || !bookingDate) {
    note.textContent = 'Select an amenity and date to check availability.';
    note.className = 'amenity-availability-note';
    return;
  }
  const status = getAmenityDayStatus(amenity, bookingDate);
  const unavailableRule = getAmenityUnavailableRule(amenity, bookingDate);
  note.textContent = unavailableRule
    ? `${amenity} is unavailable on ${formatAmenityDate(bookingDate)}. ${unavailableRule.reason || ''}`.trim()
    : status === 'Free'
      ? `${amenity} is available on ${formatAmenityDate(bookingDate)}.`
      : `${amenity} is ${status.toLowerCase()} on ${formatAmenityDate(bookingDate)}.`;
  note.className = `amenity-availability-note ${status.toLowerCase()}`;
}

function renderHOAmenityBooking() {
  const today = getLocalDateValue();
  const currentMonth = today.slice(0, 7);
  const myBookings = db.get('amenityBookings')
    .filter(booking => booking.homeownerId === currentUser.id)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Book Amenities</h2><p>Request use of community amenities and check availability.</p></div>
  </div>
  <div class="amenity-layout">
    <div class="section-card">
      <div class="section-card-header"><div><h3>New Booking Request</h3><p>Check the calendar before submitting a booking request.</p></div></div>
      <div class="section-card-body">
        <div class="grid-2">
          <div class="form-group">
            <label>Amenity *</label>
            <select id="ab_amenity" onchange="renderAmenityCalendar();updateAmenityAvailabilityNote()">
              ${AMENITIES.map(item => `<option value="${item}">${item}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Calendar Month</label>
            <input id="ab_month" type="month" value="${currentMonth}" onchange="renderAmenityCalendar()"/>
          </div>
        </div>
        <div id="amenityCalendar" class="amenity-calendar"></div>
        <div class="grid-2" style="margin-top:16px">
          <div class="form-group">
            <label>Booking Date *</label>
            <input id="ab_date" type="date" min="${today}" onchange="updateAmenityAvailabilityNote()"/>
          </div>
          <div class="form-group">
            <label>Time *</label>
            <div class="grid-2" style="gap:8px">
              <input id="ab_start" type="time"/>
              <input id="ab_end" type="time"/>
            </div>
          </div>
        </div>
        <div id="ab_availabilityNote" class="amenity-availability-note">Select an amenity and date to check availability.</div>
        <div class="form-group" style="margin-top:14px">
          <label>Purpose</label>
          <textarea id="ab_purpose" placeholder="Briefly describe how the amenity will be used..."></textarea>
        </div>
        <button class="btn btn-primary" onclick="confirmSubmitAmenityBooking()">Submit Request</button>
      </div>
    </div>
    <div class="section-card">
      <div class="section-card-header"><div><h3>My Requests</h3><p>Status of your amenity bookings.</p></div></div>
      <div class="section-card-body no-pad">
        <table class="data-table">
          <thead><tr><th>Amenity</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            ${myBookings.map(booking => `
              <tr>
                <td><strong>${booking.amenity}</strong><br><span style="font-size:0.78rem;color:var(--text-3)">${booking.startTime || ''} - ${booking.endTime || ''}</span></td>
                <td>${formatAmenityDate(booking.bookingDate)}</td>
                <td>${amenityStatusBadge(booking.status)}</td>
              </tr>`).join('') || '<tr><td colspan="3"><div class="no-results">No amenity requests yet.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
  renderAmenityCalendar();
}

function confirmSubmitAmenityBooking() {
  const amenity = document.getElementById('ab_amenity').value;
  const bookingDate = document.getElementById('ab_date').value;
  const startTime = document.getElementById('ab_start').value;
  const endTime = document.getElementById('ab_end').value;
  if (!amenity || !bookingDate || !startTime || !endTime) {
    showToast('error', 'Missing Fields', 'Please select an amenity, date, and time.');
    return;
  }
  const unavailableRule = getAmenityUnavailableRule(amenity, bookingDate);
  if (unavailableRule) {
    showToast('error', 'Unavailable', unavailableRule.reason || `${amenity} is not available on that date.`);
    return;
  }
  if (endTime <= startTime) {
    showToast('error', 'Invalid Time', 'End time must be later than start time.');
    return;
  }
  if (amenityBookingConflicts(amenity, bookingDate).length) {
    showToast('error', 'Not Available', `${amenity} is already booked or pending for that date.`);
    return;
  }
  const purpose = document.getElementById('ab_purpose').value.trim();
  openConfirm(
    'Submit Amenity Request',
    `Submit a request for <strong>${amenity}</strong> on <strong>${formatAmenityDate(bookingDate)}</strong>?`,
    () => submitAmenityBooking({ amenity, bookingDate, startTime, endTime, purpose })
  );
}

function submitAmenityBooking({ amenity, bookingDate, startTime, endTime, purpose }) {
  const booking = {
    id: db.newId('ab'),
    homeownerId: currentUser.id,
    amenity,
    bookingDate,
    startTime,
    endTime,
    purpose,
    status: 'Pending',
    adminRemarks: '',
    createdAt: getLocalDateValue(),
    reviewedAt: '',
  };
  db.save('amenityBookings', booking);
  addNotification('Amenity Booking Request', `${currentUser.name} requested ${booking.amenity} on ${formatAmenityDate(booking.bookingDate)}.`, { roles: ['admin', 'president'] });
  logAction(`Submitted amenity booking request: ${booking.amenity} for ${currentUser.name}`);
  closeModal();
  showToast('success', 'Request Submitted', 'Your amenity booking request is now pending admin approval.');
  renderHOAmenityBooking();
}

function renderAmenityBookingsAdmin() {
  const bookings = [...db.get('amenityBookings')].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const today = getLocalDateValue();
  const currentMonth = today.slice(0, 7);
  const unavailable = getAmenityUnavailableSettings();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Amenity Bookings</h2><p>Review and manage homeowner amenity requests.</p></div>
  </div>
  <div class="amenity-layout">
    <div class="section-card">
      <div class="section-card-header"><div><h3>Availability Calendar</h3><p>View bookings and unavailable dates by amenity.</p></div></div>
      <div class="section-card-body">
        <div class="grid-2">
          <div class="form-group">
            <label>Amenity</label>
            <select id="admin_ab_amenity" onchange="renderAdminAmenityCalendar()">
              ${AMENITIES.map(item => `<option value="${item}">${item}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Calendar Month</label>
            <input id="admin_ab_month" type="month" value="${currentMonth}" onchange="renderAdminAmenityCalendar()"/>
          </div>
        </div>
        <div id="adminAmenityCalendar" class="amenity-calendar"></div>
      </div>
    </div>
    <div class="section-card">
      <div class="section-card-header"><div><h3>Unavailable Schedule</h3><p>Block recurring days or a specific date.</p></div></div>
      <div class="section-card-body">
        <div class="form-group">
          <label>Unavailable Days</label>
          <div class="amenity-day-toggle-grid">
            ${dayNames.map((day, index) => `
              <label class="amenity-day-toggle">
                <input type="checkbox" class="admin-unavailable-day" value="${index}" ${unavailable.weeklyDays.includes(index) ? 'checked' : ''}>
                <span>${day.slice(0, 3)}</span>
              </label>`).join('')}
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveAmenityUnavailableDays()">Save Days</button>
        <div class="form-divider"></div>
        <div class="grid-2">
          <div class="form-group">
            <label>Date</label>
            <input id="adminUnavailableDate" type="date" min="${today}">
          </div>
          <div class="form-group">
            <label>Amenity</label>
            <select id="adminUnavailableAmenity">
              <option value="all">All Amenities</option>
              ${AMENITIES.map(item => `<option value="${item}">${item}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Reason</label>
          <input id="adminUnavailableReason" placeholder="e.g. Maintenance, private HOA event">
        </div>
        <button class="btn btn-primary btn-sm" onclick="addAmenityUnavailableDate()">Block Date</button>
        <div class="amenity-unavailable-list">
          ${unavailable.dateRules.length ? unavailable.dateRules
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
            .map(rule => `
              <div class="amenity-unavailable-item">
                <div>
                  <strong>${formatAmenityDate(rule.date)}</strong>
                  <span>${rule.amenity === 'all' ? 'All Amenities' : rule.amenity}${rule.reason ? ` - ${rule.reason}` : ''}</span>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="removeAmenityUnavailableDate('${rule.id}')">Remove</button>
              </div>`).join('')
            : '<p class="empty-note">No blocked dates.</p>'}
        </div>
      </div>
    </div>
  </div>
  <div class="section-card">
    <div class="section-card-header"><div><h3>Booking Requests</h3><p>Approve or reject submitted amenity requests.</p></div></div>
    <div class="section-card-body no-pad">
      <table class="data-table">
        <thead><tr><th>Homeowner</th><th>Amenity</th><th>Date / Time</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${bookings.map(booking => {
            const homeowner = db.getOne('users', booking.homeownerId);
            return `<tr>
              <td><div class="cell-user">${avatarHTML(homeowner, 'avatar-sm')}<strong>${homeowner ? homeowner.name : 'Unknown'}</strong></div></td>
              <td>${booking.amenity}<br><span style="font-size:0.78rem;color:var(--text-3)">${booking.purpose || 'No purpose provided'}</span></td>
              <td>${formatAmenityDate(booking.bookingDate)}<br><span style="font-size:0.78rem;color:var(--text-3)">${booking.startTime || ''} - ${booking.endTime || ''}</span></td>
              <td>${amenityStatusBadge(booking.status)}</td>
              <td><div class="td-actions">
                ${booking.status === 'Pending' ? `
                  <button class="btn btn-success btn-sm" onclick="confirmApproveAmenityBooking('${booking.id}')">Approve</button>
                  <button class="btn btn-danger btn-sm" onclick="openRejectAmenityBooking('${booking.id}')">Reject</button>
                ` : `<button class="btn btn-secondary btn-sm" onclick="viewAmenityBooking('${booking.id}')">View</button>`}
              </div></td>
            </tr>`;
          }).join('') || '<tr><td colspan="5"><div class="no-results">No amenity booking requests.</div></td></tr>'}
        </tbody>
      </table>
    </div>
  </div>`;
  renderAdminAmenityCalendar();
}

function saveAmenityUnavailableDays() {
  const settings = getAmenityUnavailableSettings();
  settings.weeklyDays = [...document.querySelectorAll('.admin-unavailable-day:checked')].map(input => Number(input.value));
  saveAmenityUnavailableSettings(settings);
  logAction(`Updated amenity unavailable days: ${settings.weeklyDays.join(', ') || 'none'}`);
  showToast('success', 'Days Saved', 'Unavailable amenity days have been updated.');
  renderAmenityBookingsAdmin();
}

function addAmenityUnavailableDate() {
  const date = document.getElementById('adminUnavailableDate')?.value;
  const amenity = document.getElementById('adminUnavailableAmenity')?.value || 'all';
  const reason = document.getElementById('adminUnavailableReason')?.value.trim() || 'Marked unavailable by admin.';
  if (!date) {
    showToast('error', 'Missing Date', 'Select the date to block.');
    return;
  }

  const settings = getAmenityUnavailableSettings();
  const existing = settings.dateRules.find(rule => rule.date === date && rule.amenity === amenity);
  if (existing) {
    existing.reason = reason;
  } else {
    settings.dateRules.push({ id: db.newId('au'), date, amenity, reason });
  }

  saveAmenityUnavailableSettings(settings);
  logAction(`Marked amenity unavailable: ${amenity === 'all' ? 'All amenities' : amenity} on ${formatAmenityDate(date)}`);
  showToast('success', 'Date Blocked', `${amenity === 'all' ? 'All amenities' : amenity} marked unavailable on ${formatAmenityDate(date)}.`);
  renderAmenityBookingsAdmin();
}

function removeAmenityUnavailableDate(id) {
  const settings = getAmenityUnavailableSettings();
  const removed = settings.dateRules.find(rule => rule.id === id);
  settings.dateRules = settings.dateRules.filter(rule => rule.id !== id);
  saveAmenityUnavailableSettings(settings);
  if (removed) logAction(`Removed amenity unavailable date: ${removed.amenity} on ${formatAmenityDate(removed.date)}`);
  showToast('success', 'Date Removed', 'The unavailable date has been removed.');
  renderAmenityBookingsAdmin();
}

function confirmApproveAmenityBooking(id) {
  const booking = db.getOne('amenityBookings', id);
  if (!booking) return;
  const unavailableRule = getAmenityUnavailableRule(booking.amenity, booking.bookingDate);
  if (unavailableRule) {
    showToast('error', 'Unavailable', unavailableRule.reason || 'This amenity is not available on that date.');
    return;
  }
  if (amenityBookingConflicts(booking.amenity, booking.bookingDate, id).some(item => item.status === 'Approved')) {
    showToast('error', 'Schedule Conflict', 'This amenity already has an approved booking for that date.');
    return;
  }
  openConfirm('Approve Booking', `Approve <strong>${booking.amenity}</strong> for <strong>${formatAmenityDate(booking.bookingDate)}</strong>?`, () => approveAmenityBooking(id));
}

function approveAmenityBooking(id) {
  const booking = db.getOne('amenityBookings', id);
  if (!booking) return;
  booking.status = 'Approved';
  booking.reviewedAt = getLocalDateValue();
  db.save('amenityBookings', booking);
  const homeowner = db.getOne('users', booking.homeownerId);
  logAction(`Approved amenity booking: ${booking.amenity} for ${homeowner ? homeowner.name : 'Unknown'}`);
  showToast('success', 'Approved', 'Amenity booking approved.');
  renderAmenityBookingsAdmin();
}

function openRejectAmenityBooking(id) {
  openModal('Reject Amenity Booking', `
    <p style="color:var(--text-2);margin-bottom:16px">Please provide a reason for rejection.</p>
    <div class="form-group"><label>Remarks</label><textarea id="amenityRejectRemarks" placeholder="e.g. Amenity unavailable for maintenance..."></textarea></div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Reject', cls: 'btn-danger', action: () => confirmRejectAmenityBooking(id) },
  ]);
}

function confirmRejectAmenityBooking(id) {
  const booking = db.getOne('amenityBookings', id);
  if (!booking) return;
  const remarks = document.getElementById('amenityRejectRemarks').value.trim() || 'Rejected by admin.';
  openConfirm('Reject Booking', `Reject <strong>${booking.amenity}</strong> request for <strong>${formatAmenityDate(booking.bookingDate)}</strong>?`, () => rejectAmenityBooking(id, remarks));
}

function rejectAmenityBooking(id, remarks) {
  const booking = db.getOne('amenityBookings', id);
  if (!booking) return;
  booking.status = 'Rejected';
  booking.adminRemarks = remarks;
  booking.reviewedAt = getLocalDateValue();
  db.save('amenityBookings', booking);
  const homeowner = db.getOne('users', booking.homeownerId);
  logAction(`Rejected amenity booking: ${booking.amenity} for ${homeowner ? homeowner.name : 'Unknown'} - ${remarks}`);
  closeModal();
  showToast('warning', 'Rejected', 'Amenity booking rejected.');
  renderAmenityBookingsAdmin();
}

function viewAmenityBooking(id) {
  const booking = db.getOne('amenityBookings', id);
  if (!booking) return;
  const homeowner = db.getOne('users', booking.homeownerId);
  openModal('Amenity Booking', `
    <table style="width:100%;font-size:0.88rem">
      <tr><td style="padding:6px 0;color:var(--text-3)">Homeowner</td><td style="font-weight:600">${homeowner ? homeowner.name : 'Unknown'}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-3)">Amenity</td><td>${booking.amenity}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-3)">Date</td><td>${formatAmenityDate(booking.bookingDate)}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-3)">Time</td><td>${booking.startTime || ''} - ${booking.endTime || ''}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-3)">Status</td><td>${amenityStatusBadge(booking.status)}</td></tr>
      ${booking.adminRemarks ? `<tr><td style="padding:6px 0;color:var(--text-3)">Remarks</td><td>${booking.adminRemarks}</td></tr>` : ''}
    </table>
  `, [{ label: 'Close', cls: 'btn-secondary', action: closeModal }]);
}

function amenityStatusBadge(status) {
  const map = {
    Pending: '<span class="badge badge-yellow">Pending</span>',
    Approved: '<span class="badge badge-green">Approved</span>',
    Rejected: '<span class="badge badge-red">Rejected</span>',
  };
  return map[status] || `<span class="badge badge-gray">${status || 'Unknown'}</span>`;
}

// SECTION 9B: VEHICLE REGISTRATION


function normalizeStickerNumber(value) {
  return (value || '').trim().toUpperCase();
}

function getVehicleRegistrationFee(registrantType) {
  return registrantType === 'nonHomeowner'
    ? VEHICLE_REGISTRATION_FEES.nonHomeowner
    : VEHICLE_REGISTRATION_FEES.homeowner;
}

function formatPeso(value) {
  return `₱${toMoneyNumber(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function vehicleRegistrationStatusBadge(status) {
  const map = {
    Pending: '<span class="badge badge-yellow">Pending</span>',
    Approved: '<span class="badge badge-green">Approved</span>',
    Rejected: '<span class="badge badge-red">Rejected</span>',
    Expired: '<span class="badge badge-gray">Expired</span>',
  };
  return map[status] || `<span class="badge badge-gray">${status || 'Unknown'}</span>`;
}

function vehiclePaymentStatusBadge(status) {
  return status === 'Paid'
    ? '<span class="badge badge-green">Paid</span>'
    : '<span class="badge badge-red">Unpaid</span>';
}

function getVehicleLocation(vehicle) {
  return [vehicle.block, vehicle.lot].filter(Boolean).join(' ') || 'N/A';
}

function isVehicleStickerTaken(stickerNumber, currentId = null) {
  const normalized = normalizeStickerNumber(stickerNumber);
  if (!normalized) return false;
  return db.get('vehicleRegistrations').some(vehicle =>
    vehicle.id !== currentId &&
    normalizeStickerNumber(vehicle.stickerNumber) === normalized
  );
}

function updateVehicleFeePreview() {
  const type = document.getElementById('vr_registrantType')?.value || 'homeowner';
  const fee = getVehicleRegistrationFee(type);
  const feeEl = document.getElementById('vr_feePreview');
  if (feeEl) feeEl.textContent = formatPeso(fee);
}

function renderHOVehicles() {
  const vehicles = db.get('vehicleRegistrations')
    .filter(vehicle => vehicle.homeownerId === currentUser.id)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>My Vehicles</h2><p>Register vehicles and track sticker release status.</p></div>
    <div class="page-header-actions">
      <button class="btn btn-primary" onclick="openVehicleRegistrationModal()"><svg class="btn-ico"><use href="#ico-plus"/></svg> Register Vehicle</button>
    </div>
  </div>
  <div class="section-card">
    <div class="section-card-body no-pad">
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Vehicle</th><th>Owner</th><th>Fee</th><th>Payment</th><th>Sticker</th><th>Status</th><th>Remarks</th></tr></thead>
        <tbody>
          ${vehicles.map(vehicle => `
            <tr>
              <td><strong>${vehicle.plateNumber}</strong><br><span style="font-size:0.78rem;color:var(--text-3)">${vehicle.vehicleType}</span></td>
              <td>${vehicle.ownerName}<br><span style="font-size:0.78rem;color:var(--text-3)">${getVehicleLocation(vehicle)}</span></td>
              <td>${formatPeso(vehicle.fee)}</td>
              <td>${vehiclePaymentStatusBadge(vehicle.paymentStatus)}</td>
              <td>${vehicle.stickerNumber ? `<strong>${vehicle.stickerNumber}</strong>${vehicle.releasedAt ? `<br><span style="font-size:0.75rem;color:var(--green-600)">Released ${vehicle.releasedAt}</span>` : ''}` : '<span style="color:var(--text-3)">Not assigned</span>'}</td>
              <td>${vehicleRegistrationStatusBadge(vehicle.registrationStatus)}</td>
              <td>${vehicle.remarks || '<span style="color:var(--text-3)">None</span>'}</td>
            </tr>`).join('') || '<tr><td colspan="7"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-parking"/></svg>No vehicle registrations yet.</div></td></tr>'}
        </tbody>
      </table></div>
    </div>
  </div>`;
}

function openVehicleRegistrationModal() {
  const block = currentUser.block || '';
  const lot = currentUser.lot || '';
  openModal('Register Vehicle', `
    <div class="vehicle-fee-panel">
      <div>
        <span>Registration Fee</span>
        <strong id="vr_feePreview">${formatPeso(VEHICLE_REGISTRATION_FEES.homeowner)}</strong>
      </div>
      <p>Homeowner registrations are ₱200. Non-homeowner registrations are ₱250.</p>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Registrant Type *</label>
        <select id="vr_registrantType" onchange="updateVehicleFeePreview()">
          <option value="homeowner">Homeowner</option>
          <option value="nonHomeowner">Non-homeowner</option>
        </select>
      </div>
      <div class="form-group">
        <label>Vehicle Type *</label>
        <select id="vr_vehicleType">
          ${VEHICLE_TYPES.map(type => `<option value="${type}">${type}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group"><label>Owner Name *</label><input id="vr_ownerName" value="${currentUser.name}" placeholder="Vehicle owner name"></div>
    <div class="grid-2">
      <div class="form-group"><label>Block *</label><input id="vr_block" value="${block}" placeholder="Block"></div>
      <div class="form-group"><label>Lot *</label><input id="vr_lot" value="${lot}" placeholder="Lot"></div>
    </div>
    <div class="form-group"><label>Plate Number *</label><input id="vr_plateNumber" placeholder="ABC 1234" style="text-transform:uppercase"></div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Submit Registration', cls: 'btn-primary', action: confirmSubmitVehicleRegistration },
  ]);
}

function confirmSubmitVehicleRegistration() {
  const registrantType = document.getElementById('vr_registrantType').value;
  const ownerName = document.getElementById('vr_ownerName').value.trim();
  const block = document.getElementById('vr_block').value.trim();
  const lot = document.getElementById('vr_lot').value.trim();
  const plateNumber = document.getElementById('vr_plateNumber').value.trim().toUpperCase();
  const vehicleType = document.getElementById('vr_vehicleType').value;

  if (!ownerName || !block || !lot || !plateNumber || !vehicleType) {
    showToast('error', 'Missing Fields', 'Please complete all required vehicle registration fields.');
    return;
  }

  openConfirm(
    'Submit Vehicle Registration',
    `Submit vehicle registration for <strong>${plateNumber}</strong> with a fee of <strong>${formatPeso(getVehicleRegistrationFee(registrantType))}</strong>?`,
    () => submitVehicleRegistration({ registrantType, ownerName, block, lot, plateNumber, vehicleType })
  );
}

function submitVehicleRegistration({ registrantType, ownerName, block, lot, plateNumber, vehicleType }) {
  const today = getLocalDateValue();
  const vehicle = {
    id: db.newId('vr'),
    homeownerId: currentUser.id,
    ownerName,
    block,
    lot,
    plateNumber,
    vehicleType,
    registrantType,
    fee: getVehicleRegistrationFee(registrantType),
    registrationStatus: 'Pending',
    paymentStatus: 'Unpaid',
    stickerNumber: null,
    remarks: '',
    createdAt: today,
    updatedAt: today,
    releasedAt: '',
  };
  db.save('vehicleRegistrations', vehicle);
  addNotification('Vehicle Registration Submitted', `${currentUser.name} submitted vehicle ${plateNumber} for review.`, { roles: ['admin', 'security'] });
  logAction(`Submitted vehicle registration: ${plateNumber} for ${ownerName}`);
  closeModal();
  showToast('success', 'Registration Submitted', 'Your vehicle registration is pending admin review.');
  renderHOVehicles();
}

function renderVehicleManagement(filtered = null) {
  const allVehicles = filtered || db.get('vehicleRegistrations');
  const vehicles = [...allVehicles].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const pendingCount = db.get('vehicleRegistrations').filter(vehicle => vehicle.registrationStatus === 'Pending').length;
  const unpaidCount = db.get('vehicleRegistrations').filter(vehicle => vehicle.paymentStatus !== 'Paid').length;
  const releasedCount = db.get('vehicleRegistrations').filter(vehicle => vehicle.releasedAt).length;
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Vehicle Management</h2><p>Review registrations, track payments, and release physical stickers.</p></div>
  </div>
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-clock"/></svg></div><div class="stat-info"><span class="stat-value">${pendingCount}</span><span class="stat-label">Pending</span></div></div>
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-credit"/></svg></div><div class="stat-info"><span class="stat-value">${unpaidCount}</span><span class="stat-label">Unpaid</span></div></div>
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-parking"/></svg></div><div class="stat-info"><span class="stat-value">${releasedCount}</span><span class="stat-label">Released Stickers</span></div></div>
  </div>
  <div class="section-card">
    <div class="section-card-header">
      <div class="filters-row">
        <div class="search-box"><span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span><input id="vehicleSearch" type="text" placeholder="Search owner, plate, block, sticker..."/></div>
        <select class="filter-select" id="vehicleStatusFilter" onchange="filterVehicles()">
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          <option value="Expired">Expired</option>
        </select>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper"><table class="data-table vehicle-table">
        <thead><tr><th>Owner</th><th>Vehicle</th><th>Fee</th><th>Payment</th><th>Status</th><th>Sticker</th><th>Actions</th></tr></thead>
        <tbody>
          ${vehicles.map(vehicle => `
            <tr>
              <td><strong>${vehicle.ownerName}</strong><br><span style="font-size:0.78rem;color:var(--text-3)">${getVehicleLocation(vehicle)} - ${vehicle.registrantType === 'nonHomeowner' ? 'Non-homeowner' : 'Homeowner'}</span></td>
              <td><strong>${vehicle.plateNumber}</strong><br><span style="font-size:0.78rem;color:var(--text-3)">${vehicle.vehicleType}</span></td>
              <td>${formatPeso(vehicle.fee)}</td>
              <td>${vehiclePaymentStatusBadge(vehicle.paymentStatus)}</td>
              <td>${vehicleRegistrationStatusBadge(vehicle.registrationStatus)}</td>
              <td>${vehicle.stickerNumber ? `<strong>${vehicle.stickerNumber}</strong>${vehicle.releasedAt ? `<br><span style="font-size:0.75rem;color:var(--green-600)">Released</span>` : ''}` : '<span style="color:var(--text-3)">Not assigned</span>'}</td>
              <td><div class="td-actions">
                <button class="btn btn-secondary btn-sm" onclick="openVehicleAdminModal('${vehicle.id}')">Manage</button>
              </div></td>
            </tr>`).join('') || '<tr><td colspan="7"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-parking"/></svg>No vehicle registrations found.</div></td></tr>'}
        </tbody>
      </table></div>
    </div>
  </div>`;

  const search = document.getElementById('vehicleSearch');
  if (search) search.addEventListener('input', filterVehicles);
}

function filterVehicles() {
  const query = (document.getElementById('vehicleSearch')?.value || '').trim().toLowerCase();
  const status = document.getElementById('vehicleStatusFilter')?.value || '';
  const filtered = db.get('vehicleRegistrations').filter(vehicle => {
    const haystack = [
      vehicle.ownerName,
      vehicle.block,
      vehicle.lot,
      vehicle.plateNumber,
      vehicle.vehicleType,
      vehicle.stickerNumber,
      vehicle.registrationStatus,
      vehicle.paymentStatus,
    ].join(' ').toLowerCase();
    return (!query || haystack.includes(query)) && (!status || vehicle.registrationStatus === status);
  });
  renderVehicleManagement(filtered);
  const search = document.getElementById('vehicleSearch');
  const statusEl = document.getElementById('vehicleStatusFilter');
  if (search) search.value = query;
  if (statusEl) statusEl.value = status;
}

function openVehicleAdminModal(id) {
  const vehicle = db.getOne('vehicleRegistrations', id);
  if (!vehicle) return;
  openModal('Manage Vehicle Registration', `
    <div class="vehicle-detail-grid">
      <div><span>Owner</span><strong>${vehicle.ownerName}</strong></div>
      <div><span>Location</span><strong>${getVehicleLocation(vehicle)}</strong></div>
      <div><span>Plate Number</span><strong>${vehicle.plateNumber}</strong></div>
      <div><span>Vehicle Type</span><strong>${vehicle.vehicleType}</strong></div>
      <div><span>Fee</span><strong>${formatPeso(vehicle.fee)}</strong></div>
      <div><span>Submitted</span><strong>${vehicle.createdAt || 'N/A'}</strong></div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="form-group">
        <label>Payment Status</label>
        <select id="vm_paymentStatus">
          <option value="Unpaid" ${vehicle.paymentStatus === 'Unpaid' ? 'selected' : ''}>Unpaid</option>
          <option value="Paid" ${vehicle.paymentStatus === 'Paid' ? 'selected' : ''}>Paid</option>
        </select>
      </div>
      <div class="form-group">
        <label>Registration Status</label>
        <select id="vm_registrationStatus">
          ${['Pending', 'Approved', 'Rejected', 'Expired'].map(status => `<option value="${status}" ${vehicle.registrationStatus === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Physical Sticker Number</label>
      <input id="vm_stickerNumber" value="${vehicle.stickerNumber || ''}" placeholder="Unique sticker number" style="text-transform:uppercase">
    </div>
    <div class="form-group">
      <label>Remarks</label>
      <textarea id="vm_remarks" placeholder="Payment notes, rejection reason, release remarks...">${vehicle.remarks || ''}</textarea>
    </div>
    <label class="vehicle-release-check">
      <input id="vm_releaseSticker" type="checkbox" ${vehicle.releasedAt ? 'checked' : ''}>
      <span>Sticker released to registrant</span>
    </label>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Save Changes', cls: 'btn-primary', action: () => saveVehicleAdminChanges(id) },
  ]);
}

function saveVehicleAdminChanges(id) {
  const vehicle = db.getOne('vehicleRegistrations', id);
  if (!vehicle) return;
  const stickerNumber = normalizeStickerNumber(document.getElementById('vm_stickerNumber').value);
  const paymentStatus = document.getElementById('vm_paymentStatus').value;
  const registrationStatus = document.getElementById('vm_registrationStatus').value;
  const releaseSticker = document.getElementById('vm_releaseSticker').checked;

  if (stickerNumber && isVehicleStickerTaken(stickerNumber, id)) {
    showToast('error', 'Sticker Already Used', 'That sticker number is already assigned to another vehicle.');
    return;
  }
  if (releaseSticker && !stickerNumber) {
    showToast('error', 'Sticker Required', 'Assign a unique sticker number before releasing the sticker.');
    return;
  }
  if (releaseSticker && paymentStatus !== 'Paid') {
    showToast('error', 'Payment Required', 'Payment status must be Paid before releasing the sticker.');
    return;
  }
  if (releaseSticker && registrationStatus !== 'Approved') {
    showToast('error', 'Approval Required', 'Registration status must be Approved before releasing the sticker.');
    return;
  }

  const today = getLocalDateValue();
  vehicle.paymentStatus = paymentStatus;
  vehicle.registrationStatus = registrationStatus;
  vehicle.stickerNumber = stickerNumber || null;
  vehicle.remarks = document.getElementById('vm_remarks').value.trim();
  vehicle.updatedAt = today;
  vehicle.releasedAt = releaseSticker ? (vehicle.releasedAt || today) : '';
  db.save('vehicleRegistrations', vehicle);
  addNotification('Vehicle Registration Updated', `${vehicle.plateNumber} is now ${vehicle.registrationStatus}.`, { userIds: [vehicle.homeownerId] });
  logAction(`Updated vehicle registration: ${vehicle.plateNumber} (${vehicle.registrationStatus}, ${vehicle.paymentStatus})`);
  closeModal();
  showToast('success', 'Vehicle Updated', 'Vehicle registration details have been saved.');
  renderVehicleManagement();
}

// SECTION 9C: LOST AND FOUND


function lostFoundStatusBadge(status) {
  const map = {
    Pending: '<span class="badge badge-yellow">Pending</span>',
    Approved: '<span class="badge badge-green">Approved</span>',
    Rejected: '<span class="badge badge-red">Rejected</span>',
    Claimed: '<span class="badge badge-gray">Claimed</span>',
  };
  return map[status] || `<span class="badge badge-gray">${status || 'Unknown'}</span>`;
}

function lostFoundTypeBadge(type) {
  return type === 'Found'
    ? '<span class="badge badge-green">Found</span>'
    : '<span class="badge badge-red">Lost</span>';
}

function getApprovedLostFoundPosts() {
  return db.get('lostFound')
    .filter(report => ['Approved', 'Posted'].includes(report.status))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function renderPublicLostFound() {
  const grid = document.getElementById('pubLostFoundGrid');
  if (!grid) return;
  const posts = getApprovedLostFoundPosts().slice(0, 6);
  if (!posts.length) {
    grid.innerHTML = `<div class="no-results" style="grid-column:1/-1"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-search"/></svg>No approved lost and found posts yet.</div>`;
    return;
  }

  grid.innerHTML = posts.map(report => `
    <article class="pub-lostfound-card">
      ${report.image ? `<div class="pub-lostfound-image"><img src="${report.image}" alt="${report.itemName}"></div>` : ''}
      <div class="pub-lostfound-body">
        <div class="pub-lostfound-meta">${lostFoundTypeBadge(report.reportType)}<span>${report.eventDate || 'No date'}</span></div>
        <h3>${report.itemName}</h3>
        <p>${report.description}</p>
        <div class="pub-lostfound-detail"><strong>Type:</strong> ${report.itemType}</div>
        <div class="pub-lostfound-detail"><strong>Location:</strong> ${report.location}</div>
        <div class="pub-lostfound-contact">${report.contactName} · ${report.contactNumber}</div>
      </div>
    </article>`).join('');
}

function openLostFoundReportModal(reportType) {
  const today = getLocalDateValue();
  const actionLabel = reportType === 'Found' ? 'Report Found Item' : 'Report Lost Item';
  openModal(actionLabel, `
    <div class="lostfound-form-note">
      Reports are reviewed by HOA staff before appearing on the public Lost and Found board.
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Item Type *</label>
        <input id="lf_itemType" placeholder="e.g. Wallet, Phone, Keys">
      </div>
      <div class="form-group">
        <label>Item Name *</label>
        <input id="lf_itemName" placeholder="Short item name">
      </div>
    </div>
    <div class="form-group">
      <label>Description *</label>
      <textarea id="lf_description" placeholder="Describe the item, color, marks, or other details..."></textarea>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Location *</label>
        <input id="lf_location" placeholder="Where it was lost or found">
      </div>
      <div class="form-group">
        <label>Date ${reportType === 'Found' ? 'Found' : 'Lost'} *</label>
        <input id="lf_eventDate" type="date" max="${today}" value="${today}">
      </div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Contact Name *</label>
        <input id="lf_contactName" placeholder="Person to contact">
      </div>
      <div class="form-group">
        <label>Contact Number *</label>
        <input id="lf_contactNumber" placeholder="Mobile or phone number">
      </div>
    </div>
    <div class="form-group">
      <label>Optional Image</label>
      <input id="lf_image" type="file" accept="image/*">
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Submit Report', cls: 'btn-primary', action: () => submitLostFoundReport(reportType) },
  ]);
}

function readImageInput(input) {
  return new Promise((resolve, reject) => {
    const file = input?.files?.[0];
    if (!file) {
      resolve('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please upload an image file.'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error('Image must be 2MB or smaller.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

async function submitLostFoundReport(reportType) {
  const itemType = document.getElementById('lf_itemType').value.trim();
  const itemName = document.getElementById('lf_itemName').value.trim();
  const description = document.getElementById('lf_description').value.trim();
  const location = document.getElementById('lf_location').value.trim();
  const eventDate = document.getElementById('lf_eventDate').value;
  const contactName = document.getElementById('lf_contactName').value.trim();
  const contactNumber = document.getElementById('lf_contactNumber').value.trim();

  if (!itemType || !itemName || !description || !location || !eventDate || !contactName || !contactNumber) {
    showToast('error', 'Missing Fields', 'Please complete all required lost and found fields.');
    return;
  }

  try {
    const today = getLocalDateValue();
    const image = await readImageInput(document.getElementById('lf_image'));
    const report = {
      id: db.newId('lf'),
      reportType,
      itemType,
      itemName,
      description,
      location,
      eventDate,
      contactName,
      contactNumber,
      image,
      status: 'Pending',
      remarks: '',
      createdAt: today,
      updatedAt: today,
      claimedAt: '',
    };
    db.save('lostFound', report);
    addNotification('Lost and Found Report', `${contactName} submitted a ${reportType.toLowerCase()} item: ${itemName}.`, { roles: ['admin', 'security'] });
    closeModal();
    showToast('success', 'Report Submitted', 'Your report is pending HOA review.');
  } catch (error) {
    showToast('error', 'Image Error', error.message || 'Could not submit the report.');
  }
}

function renderLostFoundManagement(filtered = null) {
  const source = filtered || db.get('lostFound');
  const reports = [...source].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const allReports = db.get('lostFound');
  const pending = allReports.filter(report => report.status === 'Pending').length;
  const approved = allReports.filter(report => ['Approved', 'Posted'].includes(report.status)).length;
  const claimed = allReports.filter(report => report.status === 'Claimed').length;
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Lost and Found</h2><p>Review, publish, and manage community lost and found reports.</p></div>
  </div>
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-clock"/></svg></div><div class="stat-info"><span class="stat-value">${pending}</span><span class="stat-label">Pending</span></div></div>
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-check"/></svg></div><div class="stat-info"><span class="stat-value">${approved}</span><span class="stat-label">Posted</span></div></div>
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-search"/></svg></div><div class="stat-info"><span class="stat-value">${claimed}</span><span class="stat-label">Claimed</span></div></div>
  </div>
  <div class="section-card">
    <div class="section-card-header">
      <div class="filters-row">
        <div class="search-box"><span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span><input id="lostFoundSearch" type="text" placeholder="Search item, location, contact..."/></div>
        <select class="filter-select" id="lostFoundStatusFilter" onchange="filterLostFoundReports()">
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          <option value="Claimed">Claimed</option>
        </select>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Item</th><th>Details</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${reports.map(report => `
            <tr>
              <td><strong>${report.itemName}</strong><br>${lostFoundTypeBadge(report.reportType)} <span style="font-size:0.78rem;color:var(--text-3)">${report.itemType}</span></td>
              <td>${report.location}<br><span style="font-size:0.78rem;color:var(--text-3)">${report.eventDate || ''}</span></td>
              <td>${report.contactName}<br><span style="font-size:0.78rem;color:var(--text-3)">${report.contactNumber}</span></td>
              <td>${lostFoundStatusBadge(report.status)}</td>
              <td><div class="td-actions">
                <button class="btn btn-secondary btn-sm" onclick="openLostFoundAdminModal('${report.id}')">Manage</button>
                <button class="btn btn-danger btn-sm" onclick="confirmDeleteLostFound('${report.id}')">Delete</button>
              </div></td>
            </tr>`).join('') || '<tr><td colspan="5"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-search"/></svg>No lost and found reports.</div></td></tr>'}
        </tbody>
      </table></div>
    </div>
  </div>`;

  const search = document.getElementById('lostFoundSearch');
  if (search) search.addEventListener('input', filterLostFoundReports);
}

function filterLostFoundReports() {
  const query = (document.getElementById('lostFoundSearch')?.value || '').trim().toLowerCase();
  const status = document.getElementById('lostFoundStatusFilter')?.value || '';
  const filtered = db.get('lostFound').filter(report => {
    const haystack = [
      report.reportType,
      report.itemType,
      report.itemName,
      report.description,
      report.location,
      report.contactName,
      report.contactNumber,
      report.status,
    ].join(' ').toLowerCase();
    return (!query || haystack.includes(query)) && (!status || report.status === status);
  });
  renderLostFoundManagement(filtered);
  const search = document.getElementById('lostFoundSearch');
  const statusEl = document.getElementById('lostFoundStatusFilter');
  if (search) search.value = query;
  if (statusEl) statusEl.value = status;
}

function openLostFoundAdminModal(id) {
  const report = db.getOne('lostFound', id);
  if (!report) return;
  openModal('Manage Lost and Found Report', `
    ${report.image ? `<img src="${report.image}" alt="${report.itemName}" class="lostfound-admin-image">` : ''}
    <div class="grid-2">
      <div class="form-group">
        <label>Report Type</label>
        <select id="lf_admin_reportType">
          <option value="Lost" ${report.reportType === 'Lost' ? 'selected' : ''}>Lost</option>
          <option value="Found" ${report.reportType === 'Found' ? 'selected' : ''}>Found</option>
        </select>
      </div>
      <div class="form-group"><label>Item Type</label><input id="lf_admin_itemType" value="${report.itemType || ''}"></div>
    </div>
    <div class="form-group"><label>Item Name</label><input id="lf_admin_itemName" value="${report.itemName || ''}"></div>
    <div class="form-group"><label>Description</label><textarea id="lf_admin_description">${report.description || ''}</textarea></div>
    <div class="grid-2">
      <div class="form-group"><label>Location</label><input id="lf_admin_location" value="${report.location || ''}"></div>
      <div class="form-group"><label>Date Lost/Found</label><input id="lf_admin_eventDate" type="date" value="${report.eventDate || ''}"></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>Contact Name</label><input id="lf_admin_contactName" value="${report.contactName || ''}"></div>
      <div class="form-group"><label>Contact Number</label><input id="lf_admin_contactNumber" value="${report.contactNumber || ''}"></div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Status</label>
        <select id="lf_admin_status">
          ${['Pending', 'Approved', 'Rejected', 'Claimed'].map(status => `<option value="${status}" ${report.status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Remarks</label><input id="lf_admin_remarks" value="${report.remarks || ''}" placeholder="Optional admin remarks"></div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Save Changes', cls: 'btn-primary', action: () => saveLostFoundAdminChanges(id) },
  ]);
}

function saveLostFoundAdminChanges(id) {
  const report = db.getOne('lostFound', id);
  if (!report) return;
  const required = ['lf_admin_itemType', 'lf_admin_itemName', 'lf_admin_description', 'lf_admin_location', 'lf_admin_eventDate', 'lf_admin_contactName', 'lf_admin_contactNumber'];
  if (required.some(id => !document.getElementById(id).value.trim())) {
    showToast('error', 'Missing Fields', 'Please complete all report details before saving.');
    return;
  }

  const today = getLocalDateValue();
  const newStatus = document.getElementById('lf_admin_status').value;
  report.reportType = document.getElementById('lf_admin_reportType').value;
  report.itemType = document.getElementById('lf_admin_itemType').value.trim();
  report.itemName = document.getElementById('lf_admin_itemName').value.trim();
  report.description = document.getElementById('lf_admin_description').value.trim();
  report.location = document.getElementById('lf_admin_location').value.trim();
  report.eventDate = document.getElementById('lf_admin_eventDate').value;
  report.contactName = document.getElementById('lf_admin_contactName').value.trim();
  report.contactNumber = document.getElementById('lf_admin_contactNumber').value.trim();
  report.status = newStatus;
  report.remarks = document.getElementById('lf_admin_remarks').value.trim();
  report.updatedAt = today;
  report.claimedAt = newStatus === 'Claimed' ? (report.claimedAt || today) : '';
  db.save('lostFound', report);
  logAction(`Updated lost and found report: ${report.itemName} (${report.status})`);
  closeModal();
  showToast('success', 'Report Saved', 'Lost and found report has been updated.');
  renderLostFoundManagement();
  renderPublicLostFound();
}

function confirmDeleteLostFound(id) {
  const report = db.getOne('lostFound', id);
  if (!report) return;
  openModal('Delete Lost and Found Report', `<p>Delete "<strong>${report.itemName}</strong>"? This cannot be undone.</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Delete', cls: 'btn-danger', action: () => {
      db.delete('lostFound', id);
      logAction(`Deleted lost and found report: ${report.itemName}`);
      closeModal();
      showToast('success', 'Deleted', 'Lost and found report removed.');
      renderLostFoundManagement();
      renderPublicLostFound();
    } },
  ]);
}

function renderPayments() {
  if (!canViewPayments()) { showToast('error', 'Access Denied', 'You do not have access to payment records.'); return; }
  const managePayments = canManagePayments();
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>${managePayments ? 'Payment Management' : 'Payment Records'}</h2><p>${managePayments ? 'Review and process homeowner payment submissions.' : 'View homeowner payment records.'}</p></div>
  </div>
  <div class="section-card">
    <div class="section-card-header">
      <div class="filters-row">
        <div class="search-box"><span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span><input id="paySearch" type="text" placeholder="Search by name or reference..."/></div>
        <select class="filter-select" id="payFilter" onchange="filterPayments()">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Homeowner</th><th>Billing</th><th>Amount</th><th>Ref #</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="payTableBody"></tbody>
      </table></div>
    </div>
  </div>`;

  document.getElementById('paySearch').addEventListener('input', filterPayments);
  renderPaymentTable();
}

function renderPaymentTable(filtered = null) {
  const payments = filtered !== null ? filtered : db.get('payments');
  const tbody = document.getElementById('payTableBody');
  if (!tbody) return;
  if (!payments.length) { tbody.innerHTML = `<tr><td colspan="7"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-credit"/></svg>No payments found.</div></td></tr>`; return; }
  tbody.innerHTML = payments.map(p => {
    const ho = db.getOne('users', p.homeownerId);
    const bill = db.getOne('billings', p.billingId);
    return `<tr>
      <td>${ho ? ho.name : 'Unknown'}</td>
      <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${bill ? bill.title : 'N/A'}</td>
      <td>₱${p.amount.toLocaleString()}</td>
      <td style="font-family:monospace;font-size:0.82rem">${p.refNum}</td>
      <td>${p.submittedAt}</td>
      <td>${badgeHtml(p.status)}</td>
      <td><div class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="viewPaymentDetail('${p.id}')">Review</button>
        ${canManagePayments() && p.status === 'pending' ? `
          <button class="btn btn-success btn-sm" onclick="approvePayment('${p.id}')" title="Approve">&#10003;</button>
          <button class="btn btn-danger btn-sm" onclick="openRejectPayment('${p.id}')" title="Reject">&#10007;</button>
        ` : ''}
      </div></td>
    </tr>`;
  }).join('');
}

function filterPayments() {
  const q = (document.getElementById('paySearch')?.value || '').toLowerCase();
  const status = document.getElementById('payFilter')?.value || '';
  let payments = db.get('payments');
  if (status) payments = payments.filter(p => p.status === status);
  if (q) {
    const users = db.get('users');
    payments = payments.filter(p => {
      const ho = users.find(u => u.id === p.homeownerId);
      return (ho && ho.name.toLowerCase().includes(q)) || p.refNum.toLowerCase().includes(q);
    });
  }
  renderPaymentTable(payments);
}

function viewPaymentDetail(id) {
  const p = db.getOne('payments', id);
  if (!p) return;
  const ho = db.getOne('users', p.homeownerId);
  const bill = db.getOne('billings', p.billingId);
  openModal('Payment Detail', `
    <div class="grid-2 mb-16">
      <div class="report-summary-item"><div class="r-val">₱${p.amount.toLocaleString()}</div><div class="r-lbl">Amount Paid</div></div>
      <div class="report-summary-item"><div class="r-val">${badgeHtml(p.status)}</div><div class="r-lbl">Status</div></div>
    </div>
    <table style="width:100%;font-size:0.88rem">
      <tr><td style="padding:6px 0;color:var(--text-3)">Homeowner</td><td style="font-weight:600">${ho ? ho.name : 'N/A'}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-3)">Billing</td><td>${bill ? bill.title : 'N/A'}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-3)">Reference #</td><td style="font-family:monospace">${p.refNum}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-3)">Submitted</td><td>${p.submittedAt}</td></tr>
      ${p.remarks ? `<tr><td style="padding:6px 0;color:var(--text-3)">Remarks</td><td style="color:var(--red-600)">${p.remarks}</td></tr>` : ''}
    </table>
    <div style="margin-top:16px;padding:12px;background:var(--surface-2);border-radius:var(--radius);font-size:0.82rem;color:var(--text-3);text-align:center">
      Receipt image preview not available in demo mode.
    </div>
  `, [{ label: 'Close', cls: 'btn-secondary', action: closeModal }]);
}

function approvePayment(id) {
  if (!canManagePayments()) { showToast('error', 'Access Denied', 'Only the admin can approve payments.'); return; }
  const p = db.getOne('payments', id);
  if (!p) return;
  const ho = db.getOne('users', p.homeownerId);
  const bill = db.getOne('billings', p.billingId);
  openConfirm(
    'Approve Payment',
    `Are you sure you want to approve the payment from <strong>${ho ? ho.name : 'Unknown'}</strong> for <strong>${bill ? bill.title : 'N/A'}</strong>?`,
    () => applyApprovePayment(id)
  );
}

function applyApprovePayment(id) {
  const p = db.getOne('payments', id);
  if (!p) return;
  p.status = 'approved';
  p.reviewedAt = getLocalDateValue();
  db.save('payments', p);
  const ho = db.getOne('users', p.homeownerId);
  syncHomeownerBalances();
  const bill = db.getOne('billings', p.billingId);
  logAction(`Approved payment from ${ho ? ho.name : 'Unknown'} for "${bill ? bill.title : 'N/A'}"`);
  addNotification('Payment Approved', `Your payment for "${bill ? bill.title : 'N/A'}" has been approved.`, { userIds: [p.homeownerId] });
  showToast('success', 'Approved', 'Payment has been approved.');
  renderPayments();
}

function openRejectPayment(id) {
  if (!canManagePayments()) { showToast('error', 'Access Denied', 'Only the admin can reject payments.'); return; }
  openModal('Reject Payment', `
    <p style="color:var(--text-2);margin-bottom:16px">Please provide a reason for rejection.</p>
    <div class="form-group"><label>Remarks</label><textarea id="reject_remarks" placeholder="e.g. Blurry receipt image..."></textarea></div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Reject', cls: 'btn-danger', action: () => confirmRejectPayment(id) },
  ]);
}

function confirmRejectPayment(id) {
  const p = db.getOne('payments', id);
  if (!p) return;
  const ho = db.getOne('users', p.homeownerId);
  const bill = db.getOne('billings', p.billingId);
  const remarks = document.getElementById('reject_remarks').value.trim() || 'Rejected by admin.';
  openConfirm(
    'Reject Payment',
    `Are you sure you want to reject the payment from <strong>${ho ? ho.name : 'Unknown'}</strong> for <strong>${bill ? bill.title : 'N/A'}</strong>?`,
    () => rejectPayment(id, remarks)
  );
}

function rejectPayment(id, remarks) {
  const p = db.getOne('payments', id);
  if (!p) return;
  p.status = 'rejected';
  p.remarks = remarks;
  p.reviewedAt = getLocalDateValue();
  db.save('payments', p);
  const ho = db.getOne('users', p.homeownerId);
  logAction(`Rejected payment from ${ho ? ho.name : 'Unknown'}: ${p.remarks}`);
  closeModal();
  showToast('warning', 'Rejected', 'Payment rejected.');
  renderPayments();
}


// SECTION 10: ADMIN — COMPLAINT MANAGEMENT


function renderAdminComplaints() {
  if (!canViewAdminComplaints()) { showToast('error', 'Access Denied', 'You do not have access to complaints.'); return; }
  const complaints = db.get('complaints');
  const manageComplaints = canManageComplaints();
  const area = document.getElementById('contentArea');

  const reviewed   = complaints.filter(c => normalizeComplaintStatus(c.status) === 'Reviewed').length;
  const inProgress = complaints.filter(c => c.status === 'In Progress').length;
  const resolved   = complaints.filter(c => c.status === 'Resolved').length;
  const rejected   = complaints.filter(c => c.status === 'Rejected').length;

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <h2>Complaint Management</h2>
      <p>${manageComplaints ? 'Review and resolve complaints submitted by homeowners.' : 'View complaints submitted by homeowners.'}</p>
    </div>
  </div>

  <div class="stat-grid" style="margin-bottom:20px">
    <div class="stat-card" style="--card-accent:#dc2626;--card-accent-bg:#fee2e2">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-flag"/></svg></div>
      <div class="stat-value">${reviewed}</div>
      <div class="stat-label">Reviewed</div>
    </div>
    <div class="stat-card" style="--card-accent:#d97706;--card-accent-bg:#fef3c7">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-clock"/></svg></div>
      <div class="stat-value">${inProgress}</div>
      <div class="stat-label">In Progress</div>
    </div>
    <div class="stat-card" style="--card-accent:#16a34a;--card-accent-bg:#dcfce7">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-check"/></svg></div>
      <div class="stat-value">${resolved}</div>
      <div class="stat-label">Resolved</div>
    </div>
    <div class="stat-card" style="--card-accent:#991b1b;--card-accent-bg:#fee2e2">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-x"/></svg></div>
      <div class="stat-value">${rejected}</div>
      <div class="stat-label">Rejected</div>
    </div>
    <div class="stat-card" style="--card-accent:#177a80;--card-accent-bg:#d0f4f6">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-users"/></svg></div>
      <div class="stat-value">${complaints.length}</div>
      <div class="stat-label">Total Complaints</div>
    </div>
  </div>

  <div class="section-card">
    <div class="section-card-header">
      <div><h3>All Complaints</h3><p>${manageComplaints ? 'Click "Manage" to review, respond, and update status.' : 'Review complaint details and current status.'}</p></div>
      <div class="filters-row">
        <div class="search-box">
          <span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span>
          <input id="cmpSearch" type="text" placeholder="Search complaints..."/>
        </div>
        <select class="filter-select" id="cmpStatusFilter" onchange="filterAdminComplaints()">
          <option value="">All Statuses</option>
          ${COMPLAINT_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <select class="filter-select" id="cmpCatFilter" onchange="filterAdminComplaints()">
          <option value="">All Categories</option>
          <option value="Maintenance">Maintenance</option>
          <option value="Noise">Noise</option>
          <option value="Security">Security</option>
          <option value="Others">Others</option>
        </select>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Homeowner</th>
              <th>Category</th>
              <th>Description</th>
              <th>Date Filed</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="cmpTableBody"></tbody>
        </table>
      </div>
    </div>
  </div>`;

  document.getElementById('cmpSearch').addEventListener('input', filterAdminComplaints);
  renderAdminComplaintTable();
}

function renderAdminComplaintTable(filtered = null) {
  const complaints = filtered !== null ? filtered : db.get('complaints');
  const tbody = document.getElementById('cmpTableBody');
  if (!tbody) return;

  if (!complaints.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="no-results">
      <svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-flag"/></svg>
      No complaints found.
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = [...complaints].sort((a, b) => {
    const order = { 'Reviewed': 0, 'Open': 0, 'In Progress': 1, 'Resolved': 2, 'Rejected': 3 };
    return (order[normalizeComplaintStatus(a.status)] ?? 4) - (order[normalizeComplaintStatus(b.status)] ?? 4);
  }).map((c, i) => {
    const ho = db.getOne('users', c.homeownerId);
    const shortDesc = c.description.length > 60 ? c.description.substring(0, 60) + '…' : c.description;
    return `<tr>
      <td>${i + 1}</td>
      <td><div class="cell-user">${avatarHTML(ho, 'avatar-sm')}<div><strong>${ho ? ho.name : 'Unknown'}</strong><br><span style="font-size:0.75rem;color:var(--text-3)">${ho ? (ho.block || '') + ' ' + (ho.lot || '') : ''}</span></div></div></td>
      <td>${complaintCategoryBadge(c.category)}</td>
      <td style="max-width:200px;font-size:0.85rem;color:var(--text-2)">${shortDesc}</td>
      <td>${c.dateFiled}</td>
      <td>${complaintStatusBadge(c.status)}</td>
      <td><div class="td-actions">
        <button class="btn ${canManageComplaints() ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="openManageComplaint('${c.id}')">${canManageComplaints() ? 'Manage' : 'View'}</button>
      </div></td>
    </tr>`;
  }).join('');
}

function filterAdminComplaints() {
  const q      = (document.getElementById('cmpSearch')?.value || '').toLowerCase();
  const status = document.getElementById('cmpStatusFilter')?.value || '';
  const cat    = document.getElementById('cmpCatFilter')?.value || '';
  let complaints = db.get('complaints');
  if (status) complaints = complaints.filter(c => normalizeComplaintStatus(c.status) === status);
  if (cat)    complaints = complaints.filter(c => c.category === cat);
  if (q) {
    complaints = complaints.filter(c => {
      const ho = db.getOne('users', c.homeownerId);
      return c.description.toLowerCase().includes(q)
        || c.category.toLowerCase().includes(q)
        || (ho && ho.name.toLowerCase().includes(q));
    });
  }
  renderAdminComplaintTable(complaints);
}

function openManageComplaint(id) {
  const c = db.getOne('complaints', id);
  if (!c) return;
  const ho = db.getOne('users', c.homeownerId);
  if (!canManageComplaints()) {
    openModal(`Complaint - ${ho ? ho.name : 'Unknown'}`, `
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">
          <div>${complaintCategoryBadge(c.category)}</div>
          <div>${complaintStatusBadge(c.status)}</div>
        </div>
        <p style="font-size:0.9rem;color:var(--text-2);line-height:1.6">${c.description}</p>
        ${c.adminResponse ? `<p style="margin-top:12px;font-size:0.85rem;color:var(--text-2)"><strong>Response:</strong> ${c.adminResponse}</p>` : ''}
      </div>
    `, [{ label: 'Close', cls: 'btn-secondary', action: closeModal }]);
    return;
  }

  const currentStatus = normalizeComplaintStatus(c.status);
  const statusOptions = COMPLAINT_STATUSES.map(s =>
    `<option value="${s}" ${currentStatus === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  openModal(`Manage Complaint — ${ho ? ho.name : 'Unknown'}`, `
    <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">
        <div>
          <span style="font-size:0.75rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em">Category</span><br>
          ${complaintCategoryBadge(c.category)}
        </div>
        <div style="text-align:right">
          <span style="font-size:0.75rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em">Date Filed</span><br>
          <span style="font-size:0.88rem;color:var(--text-2)">${c.dateFiled}</span>
        </div>
      </div>
      <div>
        <span style="font-size:0.75rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em">Description</span>
        <p style="margin-top:6px;font-size:0.9rem;color:var(--text-2);line-height:1.6">${c.description}</p>
      </div>
      ${c.adminResponse ? `
        <div style="margin-top:10px;padding:10px;background:var(--teal-50);border-radius:var(--radius-sm);border-left:3px solid var(--teal-500)">
          <span style="font-size:0.75rem;font-weight:700;color:var(--teal-600);text-transform:uppercase;letter-spacing:0.08em">Previous Response</span>
          <p style="margin-top:4px;font-size:0.85rem;color:var(--text-2);line-height:1.5">${c.adminResponse}</p>
        </div>` : ''}
    </div>

    <div class="form-group">
      <label>Update Status</label>
      <select id="mgmt_status">${statusOptions}</select>
    </div>
    <div class="form-group">
      <label>Admin Response <span style="color:var(--text-3);font-weight:400">(required for resolved or rejected)</span></label>
      <textarea id="mgmt_response" placeholder="Enter your response or resolution details…" style="min-height:90px">${c.adminResponse || ''}</textarea>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Save Changes', cls: 'btn-primary', action: () => saveComplaintManagement(id) },
  ]);
}

function saveComplaintManagement(id) {
  if (!canManageComplaints()) { showToast('error', 'Access Denied', 'You cannot update complaints.'); return; }
  const c = db.getOne('complaints', id);
  if (!c) return;

  const newStatus   = document.getElementById('mgmt_status').value;
  const newResponse = document.getElementById('mgmt_response').value.trim();

  if ((newStatus === 'Resolved' || newStatus === 'Rejected') && !newResponse) {
    showToast('error', 'Response Required', 'Please provide a response before marking the complaint as resolved or rejected.');
    return;
  }

  const oldStatus = normalizeComplaintStatus(c.status);
  c.status        = newStatus;
  c.adminResponse = newResponse || c.adminResponse;
  c.updatedAt     = getLocalDateValue();
  if (newStatus === 'Resolved' && !c.resolvedAt) {
    c.resolvedAt = getLocalDateValue();
  } else if (newStatus !== 'Resolved') {
    c.resolvedAt = null;
  }

  db.save('complaints', c);

  const ho = db.getOne('users', c.homeownerId);
  logAction(`Updated complaint from ${ho ? ho.name : 'Unknown'}: ${oldStatus} -> ${newStatus}`);
  addNotification('Complaint Updated', `Your complaint status changed from "${oldStatus}" to "${newStatus}".`, { userIds: [c.homeownerId] });

  closeModal();
  showToast('success', 'Updated', `Complaint status set to "${newStatus}".`);
  renderAdminComplaints();
}


// SECTION 11: ADMIN & COMMUNITY — ANNOUNCEMENTS

// Date & Relative Time Formatting Helpers
function formatCommunityDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    if (dateStr.length <= 10) {
      return `${month} ${day}, ${year}`;
    }
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${month} ${day}, ${year} at ${hours}:${minutes} ${ampm}`;
  } catch (e) {
    return String(dateStr);
  }
}

function formatPostTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400 && d.getDate() === now.getDate()) return `${Math.floor(diffSec / 3600)}h ago`;
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    if (diffSec < 86400 * 2 && d.getDate() === now.getDate() - 1) return `Yesterday at ${hours}:${minutes} ${ampm}`;
    return formatCommunityDate(isoStr);
  } catch (e) {
    return String(isoStr);
  }
}

// Extract array of images from announcement object
function getAnnouncementImages(a) {
  if (!a) return [];
  if (Array.isArray(a.images) && a.images.length) {
    return a.images;
  }
  if (typeof a.images === 'string') {
    try {
      const parsed = JSON.parse(a.images);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {}
  }
  if (a.image_path) {
    return [a.image_path];
  }
  return [];
}

// ── Facebook-Style Photo Collage Grid Generator ──
function renderPhotoGridHTML(announcementId, images, title) {
  if (!images || !images.length) return '';
  const count = images.length;
  const safeTitle = escapeHtml(title || 'Photo');

  if (count === 1) {
    return `
    <div class="community-photo-grid count-1" onclick="openAnnouncementLightbox('${announcementId}', 0)">
      <div class="photo-item">
        <img src="${escapeHtml(images[0])}" alt="${safeTitle}" loading="lazy" />
      </div>
    </div>`;
  }

  if (count === 2) {
    return `
    <div class="community-photo-grid count-2">
      ${images.map((img, i) => `
        <div class="photo-item" onclick="openAnnouncementLightbox('${announcementId}', ${i})">
          <img src="${escapeHtml(img)}" alt="${safeTitle} (${i+1})" loading="lazy" />
        </div>
      `).join('')}
    </div>`;
  }

  if (count === 3) {
    return `
    <div class="community-photo-grid count-3">
      ${images.map((img, i) => `
        <div class="photo-item" onclick="openAnnouncementLightbox('${announcementId}', ${i})">
          <img src="${escapeHtml(img)}" alt="${safeTitle} (${i+1})" loading="lazy" />
        </div>
      `).join('')}
    </div>`;
  }

  if (count === 4) {
    return `
    <div class="community-photo-grid count-4">
      ${images.map((img, i) => `
        <div class="photo-item" onclick="openAnnouncementLightbox('${announcementId}', ${i})">
          <img src="${escapeHtml(img)}" alt="${safeTitle} (${i+1})" loading="lazy" />
        </div>
      `).join('')}
    </div>`;
  }

  // 5 or more photos: 2x2 grid with +N overlay on 4th photo
  const visible = images.slice(0, 4);
  const remaining = count - 4;

  return `
  <div class="community-photo-grid count-more">
    ${visible.map((img, i) => {
      const isFourth = i === 3;
      return `
      <div class="photo-item" onclick="openAnnouncementLightbox('${announcementId}', ${i})">
        <img src="${escapeHtml(img)}" alt="${safeTitle} (${i+1})" loading="lazy" />
        ${isFourth ? `<div class="photo-more-overlay">+${remaining}</div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

// ── Interactive Lightbox Gallery ──
let currentLightboxData = {
  images: [],
  activeIndex: 0,
  title: '',
};

function openAnnouncementLightbox(announcementOrImages, initialIndex = 0, customTitle = '') {
  let images = [];
  let title = customTitle || 'Announcement Photo';

  if (Array.isArray(announcementOrImages)) {
    images = announcementOrImages;
  } else if (typeof announcementOrImages === 'string') {
    const a = db.getOne('announcements', announcementOrImages);
    if (a) {
      images = getAnnouncementImages(a);
      title = a.title || 'Announcement Photo';
    } else if (announcementOrImages.startsWith('/') || announcementOrImages.startsWith('http')) {
      images = [announcementOrImages];
    }
  }

  if (!images || !images.length) return;

  currentLightboxData = {
    images,
    activeIndex: Math.max(0, Math.min(initialIndex, images.length - 1)),
    title,
  };

  renderLightboxModal();
  document.removeEventListener('keydown', handleLightboxKeydown);
  document.addEventListener('keydown', handleLightboxKeydown);
}

function handleLightboxKeydown(e) {
  if (e.key === 'ArrowRight') {
    nextLightboxPhoto();
  } else if (e.key === 'ArrowLeft') {
    prevLightboxPhoto();
  } else if (e.key === 'Escape') {
    closeLightbox();
  }
}

function closeLightbox() {
  document.removeEventListener('keydown', handleLightboxKeydown);
  closeModal();
}

function nextLightboxPhoto() {
  const { images, activeIndex } = currentLightboxData;
  if (!images.length || images.length <= 1) return;
  currentLightboxData.activeIndex = (activeIndex + 1) % images.length;
  updateLightboxStage();
}

function prevLightboxPhoto() {
  const { images, activeIndex } = currentLightboxData;
  if (!images.length || images.length <= 1) return;
  currentLightboxData.activeIndex = (activeIndex - 1 + images.length) % images.length;
  updateLightboxStage();
}

function goToLightboxPhoto(index) {
  const { images } = currentLightboxData;
  if (index >= 0 && index < images.length) {
    currentLightboxData.activeIndex = index;
    updateLightboxStage();
  }
}

function updateLightboxStage() {
  const { images, activeIndex, title } = currentLightboxData;
  const imgEl = document.getElementById('lightboxMainImg');
  const counterEl = document.getElementById('lightboxCounter');
  if (imgEl) {
    imgEl.src = images[activeIndex];
    imgEl.alt = `${title} (${activeIndex + 1})`;
  }
  if (counterEl) {
    counterEl.textContent = `${activeIndex + 1} of ${images.length}`;
  }
  document.querySelectorAll('.lightbox-thumb-item').forEach((el, idx) => {
    el.classList.toggle('active', idx === activeIndex);
  });
}

function renderLightboxModal() {
  const { images, activeIndex, title } = currentLightboxData;
  const hasMultiple = images.length > 1;

  openModal(title, `
    <div class="lightbox-viewer">
      <div class="lightbox-main-stage">
        ${hasMultiple ? `
          <button type="button" class="lightbox-nav-btn prev" onclick="prevLightboxPhoto()" title="Previous Photo (Left Arrow)">&#8249;</button>
        ` : ''}
        <img id="lightboxMainImg" class="lightbox-main-img" src="${escapeHtml(images[activeIndex])}" alt="${escapeHtml(title)}" />
        ${hasMultiple ? `
          <button type="button" class="lightbox-nav-btn next" onclick="nextLightboxPhoto()" title="Next Photo (Right Arrow)">&#8250;</button>
        ` : ''}
      </div>
      <div class="lightbox-bottom-bar">
        <div style="font-weight:600;font-size:0.92rem;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%;">
          ${escapeHtml(title)}
        </div>
        ${hasMultiple ? `
          <span class="lightbox-counter" id="lightboxCounter">${activeIndex + 1} of ${images.length}</span>
        ` : ''}
      </div>
      ${hasMultiple ? `
        <div class="lightbox-thumb-strip">
          ${images.map((img, i) => `
            <div class="lightbox-thumb-item ${i === activeIndex ? 'active' : ''}" onclick="goToLightboxPhoto(${i})">
              <img src="${escapeHtml(img)}" alt="thumb ${i+1}" />
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `, [
    { label: 'Close', cls: 'btn-secondary', action: closeLightbox }
  ]);
}

// ════════════════════════════════════════════════════════════
// ── PHOTO CROPPER ENGINE (Freeform & Preset Ratios) ──
// ════════════════════════════════════════════════════════════
let activeCropper = {
  img: null,
  stage: null,
  box: null,
  sourceUrl: '',
  sourceName: 'photo.jpg',
  sourceMime: 'image/jpeg',
  rotation: 0,
  ratio: 'free', // 'free', '16:9', '4:3', '1:1', 'orig'
  origRatio: 1,
  boxCoords: { x: 0, y: 0, w: 100, h: 100 },
  stageSize: { w: 100, h: 100 },
  onApply: null,
  isEventsBound: false,
};

function openPhotoCropper(fileOrUrl, onApply, filename = 'photo.jpg') {
  let url = '';
  let mime = 'image/jpeg';
  let name = filename;

  if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
    url = URL.createObjectURL(fileOrUrl);
    mime = fileOrUrl.type || 'image/jpeg';
    name = fileOrUrl.name || filename;
  } else if (typeof fileOrUrl === 'string') {
    url = fileOrUrl;
    if (url.endsWith('.png')) mime = 'image/png';
    else if (url.endsWith('.webp')) mime = 'image/webp';
  }

  if (!url) return;

  activeCropper.sourceUrl = url;
  activeCropper.sourceName = name;
  activeCropper.sourceMime = mime;
  activeCropper.rotation = 0;
  activeCropper.ratio = 'free';
  activeCropper.onApply = onApply;

  const overlay = document.getElementById('photoCropperOverlay');
  const targetImg = document.getElementById('cropperTargetImg');
  const stage = document.getElementById('cropperStage');
  const box = document.getElementById('cropperBox');

  if (!overlay || !targetImg || !stage || !box) return;

  activeCropper.img = targetImg;
  activeCropper.stage = stage;
  activeCropper.box = box;

  // Reset toolbar ratio active button
  document.querySelectorAll('.cropper-ratio-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ratio === 'free');
  });

  targetImg.style.transform = 'none';
  box.style.display = 'none';
  overlay.classList.remove('hidden');

  targetImg.onload = () => {
    initCropperBox();
  };
  targetImg.src = url;

  if (!activeCropper.isEventsBound) {
    bindCropperBoxEvents();
    activeCropper.isEventsBound = true;
  }
}

function initCropperBox() {
  const { img, stage, box } = activeCropper;
  if (!img || !stage || !box) return;

  const stageW = img.clientWidth || 300;
  const stageH = img.clientHeight || 200;
  activeCropper.stageSize = { w: stageW, h: stageH };
  activeCropper.origRatio = (img.naturalWidth && img.naturalHeight) ? (img.naturalWidth / img.naturalHeight) : (stageW / stageH);

  // Default box: 85% of stage, centered
  let w = Math.round(stageW * 0.85);
  let h = Math.round(stageH * 0.85);

  if (activeCropper.ratio !== 'free') {
    const targetRatio = getNumericRatio(activeCropper.ratio);
    if (w / h > targetRatio) {
      w = Math.round(h * targetRatio);
    } else {
      h = Math.round(w / targetRatio);
    }
  }

  const x = Math.round((stageW - w) / 2);
  const y = Math.round((stageH - h) / 2);

  activeCropper.boxCoords = { x, y, w, h };
  box.style.display = 'block';
  renderCropperBoxStyle();
}

function getNumericRatio(ratioStr) {
  if (ratioStr === '16:9') return 16 / 9;
  if (ratioStr === '4:3') return 4 / 3;
  if (ratioStr === '1:1') return 1;
  if (ratioStr === 'orig') return activeCropper.origRatio || 1;
  return null;
}

function renderCropperBoxStyle() {
  const { box, boxCoords } = activeCropper;
  if (!box) return;
  box.style.left = `${boxCoords.x}px`;
  box.style.top = `${boxCoords.y}px`;
  box.style.width = `${boxCoords.w}px`;
  box.style.height = `${boxCoords.h}px`;
}

function setCropperRatio(ratio) {
  activeCropper.ratio = ratio;
  document.querySelectorAll('.cropper-ratio-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ratio === ratio);
  });

  const { stageSize, boxCoords } = activeCropper;
  const targetRatio = getNumericRatio(ratio);

  if (!targetRatio) return; // 'free' maintains current box dimensions

  const cx = boxCoords.x + boxCoords.w / 2;
  const cy = boxCoords.y + boxCoords.h / 2;

  let newW = boxCoords.w;
  let newH = Math.round(newW / targetRatio);

  if (newH > stageSize.h) {
    newH = Math.round(stageSize.h * 0.85);
    newW = Math.round(newH * targetRatio);
  }
  if (newW > stageSize.w) {
    newW = Math.round(stageSize.w * 0.85);
    newH = Math.round(newW / targetRatio);
  }

  let newX = Math.round(cx - newW / 2);
  let newY = Math.round(cy - newH / 2);

  newX = Math.max(0, Math.min(stageSize.w - newW, newX));
  newY = Math.max(0, Math.min(stageSize.h - newH, newY));

  activeCropper.boxCoords = { x: newX, y: newY, w: newW, h: newH };
  renderCropperBoxStyle();
}

function resetCropperBox() {
  initCropperBox();
}

function rotateCropper(deg = 90) {
  activeCropper.rotation = (activeCropper.rotation + deg) % 360;
  const targetImg = activeCropper.img;
  if (targetImg) {
    targetImg.style.transform = `rotate(${activeCropper.rotation}deg)`;
  }
}

function closePhotoCropper() {
  const overlay = document.getElementById('photoCropperOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function bindCropperBoxEvents() {
  const box = document.getElementById('cropperBox');
  if (!box) return;

  let mode = null; // 'move' or 'resize'
  let activeHandle = null;
  let startX = 0;
  let startY = 0;
  let initial = { x: 0, y: 0, w: 0, h: 0 };

  box.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    startX = e.clientX;
    startY = e.clientY;
    initial = { ...activeCropper.boxCoords };

    if (e.target.dataset.handle) {
      mode = 'resize';
      activeHandle = e.target.dataset.handle;
    } else {
      mode = 'move';
      activeHandle = null;
    }

    try { box.setPointerCapture(e.pointerId); } catch (err) {}
  });

  box.addEventListener('pointermove', (e) => {
    if (!mode) return;
    e.preventDefault();

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const { stageSize, ratio } = activeCropper;
    const targetRatio = getNumericRatio(ratio);

    if (mode === 'move') {
      const maxX = stageSize.w - initial.w;
      const maxY = stageSize.h - initial.h;
      activeCropper.boxCoords.x = Math.max(0, Math.min(maxX, initial.x + dx));
      activeCropper.boxCoords.y = Math.max(0, Math.min(maxY, initial.y + dy));
      renderCropperBoxStyle();
      return;
    }

    if (mode === 'resize') {
      let x = initial.x;
      let y = initial.y;
      let w = initial.w;
      let h = initial.h;

      // Handle raw resizing
      if (activeHandle === 'br' || activeHandle === 'r') {
        w = initial.w + dx;
      }
      if (activeHandle === 'br' || activeHandle === 'b') {
        h = initial.h + dy;
      }
      if (activeHandle === 'tl' || activeHandle === 'l') {
        w = initial.w - dx;
        x = initial.x + dx;
      }
      if (activeHandle === 'tl' || activeHandle === 't') {
        h = initial.h - dy;
        y = initial.y + dy;
      }
      if (activeHandle === 'tr') {
        w = initial.w + dx;
        h = initial.h - dy;
        y = initial.y + dy;
      }
      if (activeHandle === 'bl') {
        w = initial.w - dx;
        x = initial.x + dx;
        h = initial.h + dy;
      }

      // Constrain aspect ratio if active
      if (targetRatio) {
        if (activeHandle === 'r' || activeHandle === 'l') {
          h = Math.round(w / targetRatio);
        } else if (activeHandle === 't' || activeHandle === 'b') {
          w = Math.round(h * targetRatio);
        } else {
          // Corners: pick dominant delta
          if (Math.abs(dx) > Math.abs(dy)) {
            h = Math.round(w / targetRatio);
            if (activeHandle.includes('t')) {
              y = initial.y + (initial.h - h);
            }
          } else {
            w = Math.round(h * targetRatio);
            if (activeHandle.includes('l')) {
              x = initial.x + (initial.w - w);
            }
          }
        }
      }

      // Min size threshold
      const MIN_SIZE = 40;
      if (w < MIN_SIZE) w = MIN_SIZE;
      if (h < MIN_SIZE) h = MIN_SIZE;

      // Clamp coordinates to stage boundaries
      if (x < 0) { w += x; x = 0; }
      if (y < 0) { h += y; y = 0; }
      if (x + w > stageSize.w) w = stageSize.w - x;
      if (y + h > stageSize.h) h = stageSize.h - y;

      activeCropper.boxCoords = { x, y, w, h };
      renderCropperBoxStyle();
    }
  });

  const stopPointer = () => { mode = null; activeHandle = null; };
  box.addEventListener('pointerup', stopPointer);
  box.addEventListener('pointercancel', stopPointer);
}

function applyPhotoCrop() {
  const { img, boxCoords, stageSize, sourceName, sourceMime, rotation, onApply } = activeCropper;
  if (!img || !img.naturalWidth || !img.naturalHeight) {
    showToast('error', 'Error', 'Could not read image dimensions.');
    return;
  }

  const scaleX = img.naturalWidth / stageSize.w;
  const scaleY = img.naturalHeight / stageSize.h;

  const cropX = Math.round(boxCoords.x * scaleX);
  const cropY = Math.round(boxCoords.y * scaleY);
  const cropW = Math.round(boxCoords.w * scaleX);
  const cropH = Math.round(boxCoords.h * scaleY);

  const canvas = document.createElement('canvas');
  const rot = (rotation % 360 + 360) % 360;

  if (rot === 90 || rot === 270) {
    canvas.width = cropH;
    canvas.height = cropW;
  } else {
    canvas.width = cropW;
    canvas.height = cropH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    showToast('error', 'Error', 'Canvas context unavailable.');
    return;
  }

  // Handle image rotation around center if specified
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);

  // Draw the cropped portion
  if (rot === 90 || rot === 270) {
    ctx.drawImage(img, cropX, cropY, cropW, cropH, -cropW / 2, -cropH / 2, cropW, cropH);
  } else {
    ctx.drawImage(img, cropX, cropY, cropW, cropH, -cropW / 2, -cropH / 2, cropW, cropH);
  }
  ctx.restore();

  const exportMime = (sourceMime === 'image/png') ? 'image/png' : 'image/jpeg';
  canvas.toBlob((blob) => {
    if (!blob) {
      showToast('error', 'Error', 'Could not generate cropped image.');
      return;
    }
    const cleanName = sourceName.replace(/\.[^/.]+$/, '') + '-cropped.jpg';
    const croppedFile = new File([blob], cleanName, { type: exportMime });

    if (typeof onApply === 'function') {
      onApply(croppedFile);
    }
    closePhotoCropper();
  }, exportMime, 0.92);
}

// ════════════════════════════════════════════════════════════
// ── Announcement Views & Feeds ──
// ════════════════════════════════════════════════════════════

function renderAnnouncements() {
  const area = document.getElementById('contentArea');
  if (!area) return;

  const adminName = currentUser ? escapeHtml(currentUser.name.split(' ')[0]) : 'Admin';

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <h2>Announcements</h2>
      <p>Post and manage community notices, announcements, and resident discussions.</p>
    </div>
    <div class="page-header-actions">
      <button class="btn btn-primary" onclick="openAddAnnouncementModal()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px;vertical-align:-2px"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        New Announcement
      </button>
    </div>
  </div>

  <div class="community-feed-container">
    <!-- Facebook-Style Post Composer Prompt Card -->
    <div class="post-composer-card">
      <div class="post-composer-top">
        ${avatarHTML(currentUser, 'avatar-md')}
        <div class="post-composer-placeholder" onclick="openAddAnnouncementModal()">
          Write an announcement or community update, ${adminName}...
        </div>
      </div>
      <div class="post-composer-actions">
        <button type="button" class="post-composer-action-btn" onclick="openAddAnnouncementModal(true)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--green-600)"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span>Photos / Images</span>
        </button>
        <button type="button" class="post-composer-action-btn" onclick="openAddAnnouncementModal()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--teal-600)"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <span>Create Notice</span>
        </button>
      </div>
    </div>

    <!-- Feed Container -->
    <div id="announcementsList"></div>
  </div>`;

  renderAnnouncementCards();
}

function renderAnnouncementCards() {
  const list = document.getElementById('announcementsList');
  if (!list) return;

  const announcements = [...db.get('announcements')].reverse();
  if (!announcements.length) {
    list.innerHTML = `<div class="no-results" style="padding:40px 20px;"><svg style="width:2.5rem;height:2.5rem;color:var(--text-3);margin-bottom:10px;"><use href="#ico-megaphone"/></svg><br><strong>No announcements posted yet.</strong><p style="color:var(--text-3);font-size:0.85rem;margin-top:4px;">Click the composer above or "New Announcement" to publish your first post.</p></div>`;
    return;
  }

  const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin');
  list.innerHTML = announcements.map(a => communityPostCardHTML(a, isAdmin)).join('');

  // Automatically fetch & render MySQL comments for each announcement
  announcements.forEach(a => {
    loadAndRenderComments(a.id);
  });
}

function communityPostCardHTML(a, isAdmin) {
  const author = db.getOne('users', a.user_id || a.createdBy) || { name: 'Administrator', role: 'admin' };
  const catColors = { Maintenance: '#2271c3', Emergency: '#dc2626', Events: '#16a34a', Security: '#d97706', General: '#177a80' };
  const accentColor = catColors[a.category] || '#177a80';
  const displayDate = formatCommunityDate(a.created_at || a.date);
  const images = getAnnouncementImages(a);

  return `
  <div class="community-post-card" id="announcement-card-${a.id}">
    <div class="community-post-header">
      <div class="community-post-author-row">
        ${avatarHTML(author, 'avatar-md')}
        <div class="community-post-author-info">
          <div class="community-post-author-name">
            <span>${escapeHtml(author.name)}</span>
            <span class="badge-admin-official">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Admin
            </span>
          </div>
          <div class="community-post-meta">
            <span>${displayDate}</span>
            <span class="community-post-meta-dot">&bull;</span>
            <span class="badge" style="background:${accentColor}18;color:${accentColor};font-weight:700;padding:2px 8px;border-radius:10px;font-size:0.72rem;">${escapeHtml(a.category || 'General')}</span>
            ${a.urgent ? '<span class="badge badge-red" style="font-weight:700;padding:2px 8px;border-radius:10px;font-size:0.72rem;">Urgent</span>' : ''}
          </div>
        </div>
      </div>
      ${isAdmin ? `
        <div class="community-post-actions-top">
          <button type="button" class="btn-post-action" onclick="openEditAnnouncementModal('${a.id}')" title="Edit Announcement">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="btn-post-action danger" onclick="confirmDeleteAnnouncement('${a.id}')" title="Delete Announcement">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      ` : ''}
    </div>

    <div class="community-post-content">
      <div class="community-post-title">${escapeHtml(a.title)}</div>
      <div class="community-post-text">${escapeHtml(a.content || a.description || '')}</div>
    </div>

    ${renderPhotoGridHTML(a.id, images, a.title)}

    <div class="community-post-stats">
      <span id="comm-count-${a.id}">💬 0 comments</span>
      ${images.length > 1 ? `<span style="color:var(--text-3);font-size:0.8rem;font-weight:600;">📷 ${images.length} photos</span>` : ''}
    </div>

    <div class="community-post-action-bar">
      <button type="button" class="community-post-action-btn" onclick="focusCommentInput('${a.id}')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>Comment</span>
      </button>
    </div>

    <div class="community-comments-section">
      <div class="comment-composer-wrap">
        ${avatarHTML(currentUser, 'avatar-xs')}
        <div class="comment-composer-input-box">
          <input type="text" id="comment-input-${a.id}" class="comment-composer-input" placeholder="Write a comment as ${escapeHtml(currentUser.name)}..." onkeydown="handleCommentKeydown(event, '${a.id}')" />
          <button type="button" class="comment-composer-submit-btn" onclick="submitNewComment('${a.id}')" title="Post Comment">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
      <div class="community-comments-list" id="comments-list-${a.id}">
        <div style="font-size:0.8rem;color:var(--text-3);padding:6px 0;">Loading comments...</div>
      </div>
    </div>
  </div>`;
}

function focusCommentInput(announcementId) {
  const input = document.getElementById(`comment-input-${announcementId}`);
  if (input) {
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function handleCommentKeydown(event, announcementId) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitNewComment(announcementId);
  }
}

// ── MySQL Comments Handlers ──

async function loadAndRenderComments(announcementId) {
  const container = document.getElementById(`comments-list-${announcementId}`);
  try {
    const comments = await api.getComments(announcementId);
    announcementCommentsCache[announcementId] = comments || [];
    renderCommentsIntoContainer(announcementId);
  } catch (err) {
    if (container) {
      container.innerHTML = `<div style="font-size:0.8rem;color:var(--text-3);padding:4px 0;">Could not load comments.</div>`;
    }
  }
}

function renderCommentsIntoContainer(announcementId) {
  const container = document.getElementById(`comments-list-${announcementId}`);
  const countEl = document.getElementById(`comm-count-${announcementId}`);
  const comments = announcementCommentsCache[announcementId] || [];

  if (countEl) {
    countEl.textContent = comments.length === 0
      ? 'No comments yet'
      : (comments.length === 1 ? '💬 1 comment' : `💬 ${comments.length} comments`);
  }

  if (!container) return;

  if (!comments.length) {
    container.innerHTML = `<div class="empty-comments-note" style="font-size:0.82rem;color:var(--text-3);font-style:italic;padding:4px 0;">No comments yet. Be the first to comment!</div>`;
    return;
  }

  container.innerHTML = comments.map(c => renderSingleCommentHTML(announcementId, c)).join('');
}

function renderSingleCommentHTML(announcementId, c) {
  const authorObj = {
    name: c.author_name || 'Resident',
    role: c.author_role || 'homeowner',
    profile_photo: c.author_photo || null,
  };
  const currentUserId = currentUser ? (currentUser.id || currentUser.user_id) : null;
  const isAuthor = currentUserId && (String(c.user_id) === String(currentUserId));
  const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin');

  return `
  <div class="comment-item" id="comment-item-${c.id}">
    ${avatarHTML(authorObj, 'avatar-xs')}
    <div class="comment-bubble-container">
      <div class="comment-bubble" id="comment-bubble-${c.id}">
        <div class="comment-author-row">
          <span class="comment-author-name">${escapeHtml(authorObj.name)}</span>
          ${c.author_role === 'admin' ? '<span class="comment-role-badge">Admin</span>' : ''}
        </div>
        <div class="comment-text" id="comment-text-${c.id}">${escapeHtml(c.comment)}</div>
      </div>
      <div class="comment-meta-row">
        <span>${formatPostTime(c.created_at)}</span>
        ${c.updated_at && c.updated_at !== c.created_at ? '<span style="font-size:0.7rem;color:var(--text-3);">(edited)</span>' : ''}
        ${isAuthor ? `<button type="button" class="comment-action-link" onclick="startEditComment('${announcementId}', '${c.id}')">Edit</button>` : ''}
        ${(isAuthor || isAdmin) ? `<button type="button" class="comment-action-link danger" onclick="confirmDeleteComment('${announcementId}', '${c.id}')">Delete</button>` : ''}
      </div>
    </div>
  </div>`;
}

async function submitNewComment(announcementId) {
  const input = document.getElementById(`comment-input-${announcementId}`);
  if (!input) return;
  const commentText = input.value.trim();
  if (!commentText) return;

  input.disabled = true;
  try {
    const created = await api.addComment(announcementId, commentText);
    input.value = '';
    if (!announcementCommentsCache[announcementId]) {
      announcementCommentsCache[announcementId] = [];
    }
    announcementCommentsCache[announcementId].push(created);
    renderCommentsIntoContainer(announcementId);
    showToast('success', 'Comment Posted', 'Your comment has been saved.');
  } catch (err) {
    showToast('error', 'Failed', err.message || 'Could not post comment.');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function startEditComment(announcementId, commentId) {
  const comments = announcementCommentsCache[announcementId] || [];
  const c = comments.find(x => x.id === commentId);
  if (!c) return;

  const bubble = document.getElementById(`comment-bubble-${commentId}`);
  if (!bubble) return;

  bubble.innerHTML = `
    <div class="comment-edit-form">
      <textarea id="edit-comment-input-${commentId}" class="comment-edit-textarea" rows="2">${escapeHtml(c.comment)}</textarea>
      <div class="comment-edit-actions">
        <button type="button" class="btn btn-primary btn-xs" onclick="saveEditComment('${announcementId}', '${commentId}')">Save</button>
        <button type="button" class="btn btn-secondary btn-xs" onclick="cancelEditComment('${announcementId}', '${commentId}')">Cancel</button>
      </div>
    </div>
  `;
  const textarea = document.getElementById(`edit-comment-input-${commentId}`);
  if (textarea) {
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveEditComment(announcementId, commentId);
      } else if (e.key === 'Escape') {
        cancelEditComment(announcementId, commentId);
      }
    });
  }
}

function cancelEditComment(announcementId, commentId) {
  renderCommentsIntoContainer(announcementId);
}

async function saveEditComment(announcementId, commentId) {
  const input = document.getElementById(`edit-comment-input-${commentId}`);
  if (!input) return;
  const newText = input.value.trim();
  if (!newText) {
    showToast('error', 'Empty Comment', 'Comment cannot be empty.');
    return;
  }

  input.disabled = true;
  try {
    const updated = await api.updateComment(announcementId, commentId, newText);
    const comments = announcementCommentsCache[announcementId] || [];
    const idx = comments.findIndex(x => x.id === commentId);
    if (idx >= 0) {
      comments[idx] = updated;
    }
    renderCommentsIntoContainer(announcementId);
    showToast('success', 'Comment Updated', 'Your comment changes have been saved.');
  } catch (err) {
    showToast('error', 'Failed', err.message || 'Could not update comment.');
    input.disabled = false;
  }
}

function confirmDeleteComment(announcementId, commentId) {
  openModal('Delete Comment?', `
    <p style="color:var(--text-2);line-height:1.6">Are you sure you want to delete this comment?</p>
    <p style="color:var(--text-3);font-size:0.82rem;margin-top:6px;">This action cannot be undone.</p>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    {
      label: 'Delete Comment',
      cls: 'btn-danger',
      action: async () => {
        closeModal();
        try {
          await api.deleteComment(announcementId, commentId);
          if (announcementCommentsCache[announcementId]) {
            announcementCommentsCache[announcementId] = announcementCommentsCache[announcementId].filter(x => x.id !== commentId);
          }
          renderCommentsIntoContainer(announcementId);
          showToast('success', 'Comment Deleted', 'The comment has been removed.');
        } catch (err) {
          showToast('error', 'Failed', err.message || 'Could not delete comment.');
        }
      }
    }
  ]);
}

// ════════════════════════════════════════════════════════════
// ── Admin Announcement Modals (Multi-Photo & Cropping) ──
// ════════════════════════════════════════════════════════════

let selectedAnnouncementFiles = [];

function openAddAnnouncementModal(triggerPhoto = false) {
  selectedAnnouncementFiles = [];
  openModal('New Announcement', `
    <div class="form-group">
      <label>Title *</label>
      <input id="af_title" placeholder="Announcement title..."/>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Category</label>
        <select id="af_cat">
          <option>General</option>
          <option>Maintenance</option>
          <option>Emergency</option>
          <option>Events</option>
          <option>Security</option>
        </select>
      </div>
      <div class="form-group">
        <label>Date</label>
        <input id="af_date" type="date" value="${getLocalDateValue()}"/>
      </div>
    </div>
    <div class="form-group">
      <label>Content / Details *</label>
      <textarea id="af_content" placeholder="Write announcement details..." style="min-height:110px"></textarea>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <input type="checkbox" id="af_urgent">
      <label for="af_urgent" style="font-size:0.88rem;cursor:pointer;color:var(--text-2);font-weight:600">Mark as Urgent</label>
    </div>
    <div class="form-group">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <label style="margin-bottom:0;">Photos / Images (Optional, up to 10 photos, max 5MB each)</label>
        <span id="af_photos_count_badge" class="photo-count-badge hidden">0 photos</span>
      </div>

      <input type="file" id="af_images_input" accept="image/jpeg,image/png,image/webp" multiple style="display:none" onchange="handleAnnouncementImagesSelect(event)" />
      
      <div class="image-upload-dropzone" onclick="document.getElementById('af_images_input').click()">
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;color:var(--teal-600);font-weight:600;font-size:0.88rem">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span id="af_images_dropzone_label">Click to select photos (JPG, PNG, WebP)</span>
        </div>
      </div>

      <div id="af_images_preview_wrap" class="multi-photo-preview-grid hidden"></div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Post Announcement', cls: 'btn-primary', action: saveAnnouncement },
  ]);

  if (triggerPhoto) {
    setTimeout(() => {
      const fileInput = document.getElementById('af_images_input');
      if (fileInput) fileInput.click();
    }, 150);
  }
}

function handleAnnouncementImagesSelect(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  const startIndex = selectedAnnouncementFiles.length;

  for (const f of files) {
    if (selectedAnnouncementFiles.length >= 10) {
      showToast('error', 'Limit Reached', 'You can upload up to 10 photos per announcement.');
      break;
    }
    if (f.size > 5 * 1024 * 1024) {
      showToast('error', 'File Too Large', `"${f.name}" exceeds 5 MB.`);
      continue;
    }
    if (!allowed.includes(f.type)) {
      showToast('error', 'Invalid File Type', `"${f.name}" is not a JPG, PNG, or WebP image.`);
      continue;
    }
    selectedAnnouncementFiles.push(f);
  }

  event.target.value = '';
  renderSelectedAnnouncementImagesPreviews();

  // If user selected exactly 1 photo, automatically open the cropper for convenient editing
  if (files.length === 1 && selectedAnnouncementFiles.length > startIndex) {
    openCropperForSelectedFile(startIndex);
  }
}

function openCropperForSelectedFile(index) {
  if (index < 0 || index >= selectedAnnouncementFiles.length) return;
  const file = selectedAnnouncementFiles[index];
  openPhotoCropper(file, (croppedFile) => {
    selectedAnnouncementFiles[index] = croppedFile;
    renderSelectedAnnouncementImagesPreviews();
    showToast('success', 'Photo Cropped', 'Crop applied successfully.');
  }, file.name);
}

function removeSelectedAnnouncementFile(index) {
  if (index >= 0 && index < selectedAnnouncementFiles.length) {
    selectedAnnouncementFiles.splice(index, 1);
    renderSelectedAnnouncementImagesPreviews();
  }
}

function renderSelectedAnnouncementImagesPreviews() {
  const wrap = document.getElementById('af_images_preview_wrap');
  const badge = document.getElementById('af_photos_count_badge');
  const label = document.getElementById('af_images_dropzone_label');
  if (!wrap) return;

  if (!selectedAnnouncementFiles.length) {
    wrap.innerHTML = '';
    wrap.classList.add('hidden');
    if (badge) badge.classList.add('hidden');
    if (label) label.textContent = 'Click to select photos (JPG, PNG, WebP)';
    return;
  }

  wrap.classList.remove('hidden');
  if (badge) {
    badge.textContent = `📷 ${selectedAnnouncementFiles.length} photo${selectedAnnouncementFiles.length > 1 ? 's' : ''}`;
    badge.classList.remove('hidden');
  }
  if (label) {
    label.textContent = selectedAnnouncementFiles.length >= 10 ? 'Maximum 10 photos selected' : 'Add more photos (JPG, PNG, WebP)';
  }

  wrap.innerHTML = selectedAnnouncementFiles.map((f, idx) => {
    const url = URL.createObjectURL(f);
    return `
    <div class="multi-photo-thumb-wrap" title="${escapeHtml(f.name)}" onclick="openCropperForSelectedFile(${idx})">
      <img src="${url}" alt="Preview ${idx + 1}" />
      <button type="button" class="multi-photo-thumb-remove" onclick="event.stopPropagation(); removeSelectedAnnouncementFile(${idx})" title="Remove photo">&times;</button>
    </div>`;
  }).join('');
}

async function saveAnnouncement() {
  const title = (document.getElementById('af_title').value || '').trim();
  const content = (document.getElementById('af_content').value || '').trim();
  const category = document.getElementById('af_cat').value;
  const date = document.getElementById('af_date').value;
  const urgent = document.getElementById('af_urgent').checked;

  if (!title || !content) {
    showToast('error', 'Missing Fields', 'Title and content are required.');
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('content', content);
  formData.append('category', category);
  formData.append('date', date);
  formData.append('urgent', urgent ? 'true' : 'false');
  
  for (const f of selectedAnnouncementFiles) {
    formData.append('images', f);
  }

  showLoading();
  try {
    const created = await api.createAnnouncement(formData);
    const announcements = db.get('announcements');
    announcements.unshift(created);
    dbCache.announcements = announcements;

    logAction(`Posted announcement: "${title}"`);
    addNotification('New Announcement', title, { audience: 'all' });
    closeModal();
    hideLoading();
    showToast('success', 'Posted', 'Announcement published to community feed.');
    renderAnnouncements();
  } catch (err) {
    hideLoading();
    showToast('error', 'Failed', err.message || 'Could not publish announcement.');
  }
}

let editExistingImages = [];
let editNewFiles = [];

function openEditAnnouncementModal(id) {
  const a = db.getOne('announcements', id);
  if (!a) return;

  editExistingImages = [...getAnnouncementImages(a)];
  editNewFiles = [];

  openModal('Edit Announcement', `
    <div class="form-group">
      <label>Title *</label>
      <input id="edit_af_title" value="${escapeHtml(a.title)}" placeholder="Announcement title..."/>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Category</label>
        <select id="edit_af_cat">
          <option ${a.category === 'General' ? 'selected' : ''}>General</option>
          <option ${a.category === 'Maintenance' ? 'selected' : ''}>Maintenance</option>
          <option ${a.category === 'Emergency' ? 'selected' : ''}>Emergency</option>
          <option ${a.category === 'Events' ? 'selected' : ''}>Events</option>
          <option ${a.category === 'Security' ? 'selected' : ''}>Security</option>
        </select>
      </div>
      <div class="form-group">
        <label>Date</label>
        <input id="edit_af_date" type="date" value="${a.date || getLocalDateValue()}"/>
      </div>
    </div>
    <div class="form-group">
      <label>Content / Details *</label>
      <textarea id="edit_af_content" style="min-height:110px">${escapeHtml(a.content || a.description || '')}</textarea>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <input type="checkbox" id="edit_af_urgent" ${a.urgent ? 'checked' : ''}>
      <label for="edit_af_urgent" style="font-size:0.88rem;cursor:pointer;color:var(--text-2);font-weight:600">Mark as Urgent</label>
    </div>
    <div class="form-group">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <label style="margin-bottom:0;">Photos / Images (Optional, up to 10 photos)</label>
        <span id="edit_photos_count_badge" class="photo-count-badge">0 photos</span>
      </div>
      
      <div id="edit_photos_container" class="multi-photo-preview-grid" style="margin-bottom:10px;"></div>

      <input type="file" id="edit_af_images_input" accept="image/jpeg,image/png,image/webp" multiple style="display:none" onchange="handleEditImagesSelect(event)" />
      
      <div class="image-upload-dropzone" onclick="document.getElementById('edit_af_images_input').click()">
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;color:var(--teal-600);font-weight:600;font-size:0.88rem">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span id="edit_af_images_label">Add more photos (JPG, PNG, WebP)</span>
        </div>
      </div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Save Changes', cls: 'btn-primary', action: () => updateAnnouncement(id) },
  ]);

  renderEditPhotosPreviews();
}

function handleEditImagesSelect(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  const startIdx = editNewFiles.length;

  for (const f of files) {
    if (editExistingImages.length + editNewFiles.length >= 10) {
      showToast('error', 'Limit Reached', 'You can have up to 10 photos per announcement.');
      break;
    }
    if (f.size > 5 * 1024 * 1024) {
      showToast('error', 'File Too Large', `"${f.name}" exceeds 5 MB.`);
      continue;
    }
    if (!allowed.includes(f.type)) {
      showToast('error', 'Invalid File Type', `"${f.name}" is not a JPG, PNG, or WebP image.`);
      continue;
    }
    editNewFiles.push(f);
  }

  event.target.value = '';
  renderEditPhotosPreviews();

  if (files.length === 1 && editNewFiles.length > startIdx) {
    openCropperForEditNewFile(startIdx);
  }
}

function openCropperForEditNewFile(index) {
  if (index < 0 || index >= editNewFiles.length) return;
  const file = editNewFiles[index];
  openPhotoCropper(file, (croppedFile) => {
    editNewFiles[index] = croppedFile;
    renderEditPhotosPreviews();
    showToast('success', 'Photo Cropped', 'Crop applied successfully.');
  }, file.name);
}

function openCropperForExistingImage(index) {
  if (index < 0 || index >= editExistingImages.length) return;
  const imgUrl = editExistingImages[index];
  openPhotoCropper(imgUrl, (croppedFile) => {
    // Remove the old server path and add the new cropped file to editNewFiles
    editExistingImages.splice(index, 1);
    editNewFiles.push(croppedFile);
    renderEditPhotosPreviews();
    showToast('success', 'Photo Cropped', 'Crop applied. Save changes to update post.');
  }, `photo-${index + 1}.jpg`);
}

function removeEditExistingImage(index) {
  if (index >= 0 && index < editExistingImages.length) {
    editExistingImages.splice(index, 1);
    renderEditPhotosPreviews();
  }
}

function removeEditNewFile(index) {
  if (index >= 0 && index < editNewFiles.length) {
    editNewFiles.splice(index, 1);
    renderEditPhotosPreviews();
  }
}

function renderEditPhotosPreviews() {
  const container = document.getElementById('edit_photos_container');
  const badge = document.getElementById('edit_photos_count_badge');
  const label = document.getElementById('edit_af_images_label');
  if (!container) return;

  const total = editExistingImages.length + editNewFiles.length;
  if (badge) {
    badge.textContent = `📷 ${total} photo${total === 1 ? '' : 's'}`;
  }
  if (label) {
    label.textContent = total >= 10 ? 'Maximum 10 photos reached' : 'Add more photos (JPG, PNG, WebP)';
  }

  let html = '';
  // Existing photos
  editExistingImages.forEach((img, idx) => {
    html += `
    <div class="multi-photo-thumb-wrap" title="Click to crop photo ${idx + 1}" onclick="openCropperForExistingImage(${idx})">
      <img src="${escapeHtml(img)}" alt="Existing ${idx + 1}" />
      <button type="button" class="multi-photo-thumb-remove" onclick="event.stopPropagation(); removeEditExistingImage(${idx})" title="Remove this photo">&times;</button>
    </div>`;
  });

  // Newly selected photos
  editNewFiles.forEach((f, idx) => {
    const url = URL.createObjectURL(f);
    html += `
    <div class="multi-photo-thumb-wrap" title="Click to crop: ${escapeHtml(f.name)}" onclick="openCropperForEditNewFile(${idx})" style="border-color:var(--teal-500);">
      <img src="${url}" alt="New ${idx + 1}" />
      <button type="button" class="multi-photo-thumb-remove" onclick="event.stopPropagation(); removeEditNewFile(${idx})" title="Cancel this photo">&times;</button>
    </div>`;
  });

  container.innerHTML = html || '<div style="font-size:0.82rem;color:var(--text-3);padding:6px 0;">No photos currently attached.</div>';
}

async function updateAnnouncement(id) {
  const title = (document.getElementById('edit_af_title').value || '').trim();
  const content = (document.getElementById('edit_af_content').value || '').trim();
  const category = document.getElementById('edit_af_cat').value;
  const date = document.getElementById('edit_af_date').value;
  const urgent = document.getElementById('edit_af_urgent').checked;

  if (!title || !content) {
    showToast('error', 'Missing Fields', 'Title and content are required.');
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('content', content);
  formData.append('category', category);
  formData.append('date', date);
  formData.append('urgent', urgent ? 'true' : 'false');
  
  formData.append('existing_images', JSON.stringify(editExistingImages));
  if (editExistingImages.length === 0 && editNewFiles.length === 0) {
    formData.append('remove_all_images', 'true');
  }

  for (const f of editNewFiles) {
    formData.append('images', f);
  }

  showLoading();
  try {
    const updated = await api.updateAnnouncement(id, formData);
    const announcements = db.get('announcements');
    const idx = announcements.findIndex(x => x.id === id);
    if (idx >= 0) announcements[idx] = updated;
    dbCache.announcements = announcements;

    logAction(`Updated announcement: "${title}"`);
    closeModal();
    hideLoading();
    showToast('success', 'Updated', 'Announcement changes saved.');
    renderAnnouncements();
  } catch (err) {
    hideLoading();
    showToast('error', 'Failed', err.message || 'Could not update announcement.');
  }
}

function confirmDeleteAnnouncement(id) {
  const a = db.getOne('announcements', id);
  if (!a) return;

  openModal('Delete Announcement', `
    <p style="color:var(--text-2);line-height:1.6">Are you sure you want to delete "<strong>${escapeHtml(a.title)}</strong>"?</p>
    <p style="color:var(--text-3);font-size:0.82rem;margin-top:8px;">This will permanently remove the announcement, all its attached photos, and all resident comments.</p>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    {
      label: 'Delete Announcement',
      cls: 'btn-danger',
      action: async () => {
        showLoading();
        try {
          await api.deleteAnnouncement(id);
          dbCache.announcements = db.get('announcements').filter(x => x.id !== id);
          delete announcementCommentsCache[id];
          logAction(`Deleted announcement: "${a.title}"`);
          closeModal();
          hideLoading();
          showToast('success', 'Deleted', 'Announcement removed from community feed.');
          renderAnnouncements();
        } catch (err) {
          hideLoading();
          showToast('error', 'Failed', err.message || 'Could not delete announcement.');
        }
      }
    },
  ]);
}


// SECTION 12: ADMIN — REPORTS


function renderReports() {
  if (!canViewReports()) { showToast('error', 'Access Denied', 'You do not have access to financial reports.'); return; }
  syncHomeownerBalances();
  const payments = db.get('payments');
  const billings = db.get('billings');
  const users = db.get('users').filter(u => u.role === 'homeowner');
  const complaints = db.get('complaints');
  const approved = payments.filter(p => p.status === 'approved');
  const pending  = payments.filter(p => p.status === 'pending');
  const rejected = payments.filter(p => p.status === 'rejected');
  const totalDue = billings.reduce((s, b) => s + getBillingTotal(b), 0);
  const totalPaid = approved.reduce((s, p) => s + toMoneyNumber(p.amount), 0);
  const totalOutstanding = Math.max(0, totalDue - totalPaid);
  const analysisYear = getAnalysisYear(payments, billings);
  const monthlyData = buildMonthlyRevenueData(payments, analysisYear);

  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Reports & Analytics</h2><p>Financial summaries and collection reports.</p></div>
    <div class="page-header-actions"><button class="btn btn-secondary" onclick="window.print()">Print Report</button></div>
  </div>
  <div class="report-summary-grid">
    <div class="report-summary-item"><div class="r-val">₱${totalDue.toLocaleString()}</div><div class="r-lbl">Total Billed</div></div>
    <div class="report-summary-item"><div class="r-val" style="color:var(--green-600)">₱${totalPaid.toLocaleString()}</div><div class="r-lbl">Total Collected</div></div>
    <div class="report-summary-item"><div class="r-val" style="color:var(--red-600)">₱${totalOutstanding.toLocaleString()}</div><div class="r-lbl">Outstanding</div></div>
    <div class="report-summary-item"><div class="r-val">${users.length}</div><div class="r-lbl">Total Homeowners</div></div>
  </div>

  <div class="charts-row" style="margin-bottom:22px">
    <div class="chart-card">
      <h4>Payment Status</h4>
      <div class="donut-wrap" id="reportDonut"></div>
      <div class="donut-legend">
        <div class="legend-item"><div class="legend-dot" style="background:#16a34a"></div> Approved (${approved.length})</div>
        <div class="legend-item"><div class="legend-dot" style="background:#eab308"></div> Pending (${pending.length})</div>
        <div class="legend-item"><div class="legend-dot" style="background:#dc2626"></div> Rejected (${rejected.length})</div>
      </div>
    </div>
    <div class="chart-card">
      <h4>Complaint Status</h4>
      <div class="donut-wrap" id="complaintDonut"></div>
      <div class="donut-legend">
        <div class="legend-item"><div class="legend-dot" style="background:#2271c3"></div> Reviewed (${complaints.filter(c=>normalizeComplaintStatus(c.status)==='Reviewed').length})</div>
        <div class="legend-item"><div class="legend-dot" style="background:#d97706"></div> In Progress (${complaints.filter(c=>c.status==='In Progress').length})</div>
        <div class="legend-item"><div class="legend-dot" style="background:#16a34a"></div> Resolved (${complaints.filter(c=>c.status==='Resolved').length})</div>
        <div class="legend-item"><div class="legend-dot" style="background:#dc2626"></div> Rejected (${complaints.filter(c=>c.status==='Rejected').length})</div>
      </div>
    </div>
    <div class="chart-card chart-card-wide">
      <h4>Monthly Collections (${analysisYear})</h4>
      <div class="chart-bars" id="reportBarChart"></div>
      <div style="display:flex;gap:8px;margin-top:6px">
        ${monthlyData.map(d => `<div style="flex:1;text-align:center;font-size:0.72rem;color:var(--text-3)">${d.m}</div>`).join('')}
      </div>
    </div>
    <div class="chart-card" style="flex:2">
      <h4>Collection by Billing</h4>
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Billing</th><th>Assigned</th><th>Collected</th><th>Rate</th></tr></thead>
        <tbody>
          ${billings.map(b => {
            const assignedIds = getAssignedHomeownerIds(b);
            const billPayments = payments.filter(p => p.billingId === b.id && p.status === 'approved');
            const paidHomeowners = new Set(billPayments.map(p => p.homeownerId));
            const rate = assignedIds.length > 0 ? Math.round((paidHomeowners.size / assignedIds.length) * 100) : 0;
            return `<tr>
              <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.title}</td>
              <td>${assignedIds.length}</td>
              <td>${paidHomeowners.size}</td>
              <td><div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:6px;background:var(--border);border-radius:99px;overflow:hidden">
                  <div style="height:100%;width:${rate}%;background:${rate >= 70 ? 'var(--green-600)' : rate >= 40 ? 'var(--amber-500)' : 'var(--red-600)'};border-radius:99px;transition:width 0.6s ease"></div>
                </div>
                <span style="font-size:0.78rem;font-weight:700;color:var(--text-2)">${rate}%</span>
              </div></td>
            </tr>`;
          }).join('') || '<tr><td colspan="4"><div class="no-results">No billings on record.</div></td></tr>'}
        </tbody>
      </table></div>
    </div>
  </div>

  <div class="section-card" style="margin-bottom:22px">
    <div class="section-card-header"><div><h3>Homeowner Balance Report</h3></div></div>
    <div class="section-card-body no-pad">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Block/Lot</th><th>Balance</th><th>Status</th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td><strong>${u.name}</strong></td>
              <td>${u.block||''} ${u.lot||''}</td>
              <td class="${(u.balance||0) > 0 ? 'amount-due' : 'amount-paid'}">₱${(u.balance||0).toLocaleString()}</td>
              <td>${(u.balance||0) > 0 ? '<span class="badge badge-red">With Balance</span>' : '<span class="badge badge-green">Clear</span>'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <div class="section-card">
    <div class="section-card-header"><div><h3>Complaint Summary</h3></div></div>
    <div class="section-card-body no-pad">
      <table class="data-table">
        <thead><tr><th>Homeowner</th><th>Category</th><th>Date Filed</th><th>Status</th></tr></thead>
        <tbody>
          ${complaints.map(c => {
            const ho = db.getOne('users', c.homeownerId);
            return `<tr>
              <td>${ho ? ho.name : 'Unknown'}</td>
              <td>${complaintCategoryBadge(c.category)}</td>
              <td>${c.dateFiled}</td>
              <td>${complaintStatusBadge(c.status)}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="4"><div class="no-results">No complaints on record.</div></td></tr>'}
        </tbody>
      </table>
    </div>
  </div>`;

  renderMonthlyBarChart('reportBarChart', monthlyData, analysisYear);

  const total = approved.length + pending.length + rejected.length;
  renderDonut('reportDonut', [
    { value: approved.length, color: '#16a34a' },
    { value: pending.length,  color: '#eab308' },
    { value: rejected.length, color: '#dc2626' },
  ], total, 'Payments', total);

  const cmpTotal = complaints.length;
  renderDonut('complaintDonut', [
    { value: complaints.filter(c=>normalizeComplaintStatus(c.status)==='Reviewed').length, color: '#2271c3' },
    { value: complaints.filter(c=>c.status==='In Progress').length, color: '#d97706' },
    { value: complaints.filter(c=>c.status==='Resolved').length,    color: '#16a34a' },
    { value: complaints.filter(c=>c.status==='Rejected').length,    color: '#dc2626' },
  ], cmpTotal, 'Complaints', complaints.length);
}


// SECTION 13: ADMIN — AUDIT LOG


function renderAuditLog() {
  const logs = [...db.get('auditLog')].reverse();
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Audit Log</h2><p>Track all admin actions and system events.</p></div>
    <div class="page-header-actions">
      <button class="btn btn-danger btn-sm" onclick="clearAuditLog()">Clear Log</button>
    </div>
  </div>
  <div class="section-card">
    <div class="section-card-header">
      <div class="search-box"><span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span><input id="logSearch" type="text" placeholder="Search actions..."/></div>
    </div>
    <div class="section-card-body" id="logBody">
      ${logs.map(l => `
        <div class="log-item">
          <div class="log-dot"></div>
          <div>
            <div class="log-text">${l.action}</div>
            <div class="log-time">${l.timestamp}</div>
          </div>
        </div>`).join('') || '<div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-log"/></svg>No log entries.</div>'}
    </div>
  </div>`;

  document.getElementById('logSearch')?.addEventListener('input', function() {
    const q = this.value.toLowerCase();
    const filtered = logs.filter(l => l.action.toLowerCase().includes(q));
    document.getElementById('logBody').innerHTML = filtered.map(l => `
      <div class="log-item"><div class="log-dot"></div><div>
        <div class="log-text">${l.action}</div>
        <div class="log-time">${l.timestamp}</div>
      </div></div>`).join('') || '<div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-search"/></svg>No matching entries.</div>';
  });
}

function clearAuditLog() {
  openModal('Clear Audit Log', '<p>This will permanently clear all audit log entries. Are you sure?</p>', [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Clear All', cls: 'btn-danger', action: () => { db.set('auditLog', []); closeModal(); showToast('success', 'Cleared', 'Audit log cleared.'); renderAuditLog(); } },
  ]);
}


// SECTION 14: ADMIN — SETTINGS


function renderSettings() {
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Settings</h2><p>System preferences and admin profile.</p></div>
  </div>

  <div class="profile-card">
    ${profileAvatarEditableHTML(currentUser)}
    <div class="profile-info"><h3>${currentUser.name}</h3><p>${currentUser.email}</p><p>Administrator · ${currentUser.username}</p></div>
  </div>


  <div class="settings-section">
    <div class="settings-section-header"><h4>Admin Profile</h4></div>
    <div class="settings-section-body">
      <div class="grid-2">
        <div class="form-group"><label>Full Name</label><input id="s_name" value="${currentUser.name}"/></div>
        <div class="form-group"><label>Email</label><input id="s_email" value="${currentUser.email}"/></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="confirmSaveAdminProfile()">Save Profile</button>
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-header"><h4>Change Password</h4></div>
    <div class="settings-section-body">
      <div class="grid-2">
        <div class="form-group"><label>New Password</label><input id="s_newpass" type="password" placeholder="New password..."/></div>
        <div class="form-group"><label>Confirm Password</label><input id="s_confpass" type="password" placeholder="Confirm password..."/></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="confirmChangeAdminPassword()">Update Password</button>
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-header"><h4>System Preferences</h4></div>
    <div class="settings-section-body">
      <div class="settings-row">
        <div>
          <div class="settings-label">Monthly Dues Rate Per Sqm</div>
          <div style="font-size:0.78rem;color:var(--text-3)">Used by Auto-Generate Dues: lot area x rate</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <input id="duesRateInput" type="number" min="0" step="0.001" value="${getDuesRatePerSqm()}" style="width:120px">
          <button class="btn btn-primary btn-sm" onclick="saveDuesRateSetting()">Save</button>
        </div>
      </div>
      <div class="settings-row">
        <div><div class="settings-label">Dark Mode</div></div>
        <label class="toggle-switch">
          <input type="checkbox" id="darkToggle" ${document.documentElement.dataset.theme === 'dark' ? 'checked' : ''} onchange="toggleDarkMode()">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="settings-row">
        <div><div class="settings-label">Email Notifications</div><div style="font-size:0.78rem;color:var(--text-3)">Mock setting — no real emails</div></div>
        <label class="toggle-switch"><input type="checkbox" checked><span class="toggle-slider"></span></label>
      </div>
      <div class="settings-row">
        <div><div class="settings-label">Auto-generate Monthly Dues</div><div style="font-size:0.78rem;color:var(--text-3)">Automatically create dues on the 1st</div></div>
        <label class="toggle-switch"><input type="checkbox"><span class="toggle-slider"></span></label>
      </div>
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-header"><h4>Danger Zone</h4></div>
    <div class="settings-section-body">
      <div class="settings-row">
        <div><div class="settings-label" style="color:var(--red-600)">Reset All Data</div><div style="font-size:0.78rem;color:var(--text-3)">Clears the MySQL database and restores demo data</div></div>
        <button class="btn btn-danger btn-sm" onclick="confirmResetData()">Reset Data</button>
      </div>
    </div>
  </div>`;
}

function confirmSaveAdminProfile() {
  const name = document.getElementById('s_name').value.trim() || currentUser.name;
  openConfirm('Save Profile', `Are you sure you want to update your profile to <strong>${name}</strong>?`, saveAdminProfile);
}

function saveAdminProfile() {
  currentUser.name = document.getElementById('s_name').value.trim() || currentUser.name;
  currentUser.email = document.getElementById('s_email').value.trim() || currentUser.email;
  db.save('users', currentUser);
  buildSidebar();
  showToast('success', 'Saved', 'Profile updated.');
}

function confirmChangeAdminPassword() {
  const np = document.getElementById('s_newpass').value.trim();
  const cp = document.getElementById('s_confpass').value.trim();
  if (!np || !cp) { showToast('error', 'Empty Fields', 'Enter and confirm new password.'); return; }
  if (np !== cp) { showToast('error', 'Mismatch', 'Passwords do not match.'); return; }
  if (np.length < 6) { showToast('error', 'Too Short', 'Password must be at least 6 characters.'); return; }
  openConfirm('Change Password', 'Are you sure you want to update your password?', changeAdminPassword);
}

function changeAdminPassword() {
  const np = document.getElementById('s_newpass').value.trim();
  currentUser.password = np;
  db.save('users', currentUser);
  showToast('success', 'Password Changed', 'Your password has been updated.');
}

function saveDuesRateSetting() {
  const rate = parseFloat(document.getElementById('duesRateInput').value);
  if (!Number.isFinite(rate) || rate <= 0) {
    showToast('error', 'Invalid Rate', 'Enter a valid amount per square meter.');
    return;
  }
  db.save('appSettings', { id: 'duesRatePerSqm', value: rate.toString() });
  showToast('success', 'Rate Saved', `Monthly dues rate set to PHP ${rate.toLocaleString()} per sqm.`);
}

function confirmResetData() {
  openModal('Reset All Data', '<p style="color:var(--red-600)"><strong>Warning:</strong> This will delete all data and re-seed the system. You will be logged out.</p>', [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Reset', cls: 'btn-danger', action: async () => {
      localStorage.removeItem('sah_session');
      await api.reset();
      closeModal();
      performLogout();
      showToast('success', 'Reset', 'Data has been reset.');
    }},
  ]);
}


// SECTION 15: HOMEOWNER VIEWS


function renderHODashboard() {
  syncHomeownerBalances();
  const myBillings = db.get('billings').filter(b => b.assignedTo.includes(currentUser.id));
  const myPayments = db.get('payments').filter(p => p.homeownerId === currentUser.id);
  const myComplaints = db.get('complaints').filter(c => c.homeownerId === currentUser.id);
  const approved = myPayments.filter(p => p.status === 'approved');
  const pending  = myPayments.filter(p => p.status === 'pending');
  const today = getLocalDateValue();
  const upcoming = myBillings.filter(b => b.dueDate >= today).sort((a,b) => a.dueDate.localeCompare(b.dueDate)).slice(0,3);
  const announcements = db.get('announcements').slice(-3).reverse();
  const openComplaints = myComplaints.filter(c => ['Reviewed', 'In Progress'].includes(normalizeComplaintStatus(c.status)));

  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>My Dashboard</h2><p>Welcome, ${currentUser.name}. Your account overview.</p></div>
  </div>
  <div class="stat-grid">
    <div class="stat-card" style="--card-accent:#dc2626;--card-accent-bg:#fee2e2">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-credit"/></svg></div>
      <div class="stat-value">₱${(currentUser.balance||0).toLocaleString()}</div>
      <div class="stat-label">Outstanding Balance</div>
    </div>
    <div class="stat-card" style="--card-accent:#2271c3;--card-accent-bg:#eef5fd">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-file"/></svg></div>
      <div class="stat-value">${myBillings.length}</div>
      <div class="stat-label">Bills Assigned</div>
    </div>
    <div class="stat-card" style="--card-accent:#16a34a;--card-accent-bg:#dcfce7">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-check"/></svg></div>
      <div class="stat-value">${approved.length}</div>
      <div class="stat-label">Payments Approved</div>
    </div>
    <div class="stat-card" style="--card-accent:#d97706;--card-accent-bg:#fef3c7">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-flag"/></svg></div>
      <div class="stat-value">${openComplaints.length}</div>
      <div class="stat-label">Active Complaints</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
    <div class="section-card">
      <div class="section-card-header"><div><h3>Upcoming Due Dates</h3></div></div>
      <div class="section-card-body">
        ${upcoming.length ? upcoming.map(b => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-weight:600;font-size:0.88rem">${b.title}</div>
              <div style="font-size:0.78rem;color:var(--text-3)">Due: ${b.dueDate}</div>
            </div>
            <div class="amount-due">₱${b.amount.toLocaleString()}</div>
          </div>`).join('') : '<div class="text-muted text-center">No upcoming bills.</div>'}
      </div>
    </div>
    <div class="section-card">
      <div class="section-card-header"><div><h3>Recent Announcements</h3></div></div>
      <div class="section-card-body" style="padding:0">
        ${announcements.map(a => `
          <div style="padding:14px 20px;border-bottom:1px solid var(--border)">
            <div style="font-weight:600;font-size:0.88rem">${a.title} ${a.urgent ? '<span class="badge badge-red">Urgent</span>' : ''}</div>
            <div style="font-size:0.78rem;color:var(--text-3);margin-top:3px">${a.date} · ${a.category}</div>
          </div>`).join('')}
      </div>
    </div>
  </div>

  ${openComplaints.length > 0 ? `
  <div class="section-card" style="margin-top:18px">
    <div class="section-card-header">
      <div><h3>My Active Complaints</h3><p>Complaints pending resolution</p></div>
      <button class="btn btn-secondary btn-sm" onclick="navigate('ho-complaints')">View All</button>
    </div>
    <div class="section-card-body" style="padding:0">
      ${openComplaints.slice(0,3).map(c => `
        <div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div>
            <div style="font-weight:600;font-size:0.85rem">${c.category} Complaint</div>
            <div style="font-size:0.78rem;color:var(--text-3);margin-top:2px">${c.description.substring(0,60)}${c.description.length>60?'…':''}</div>
          </div>
          ${complaintStatusBadge(c.status)}
        </div>`).join('')}
    </div>
  </div>` : ''}`;
}

function renderHOBilling() {
  syncHomeownerBalances();
  const myBillings = db.get('billings').filter(b => b.assignedTo.includes(currentUser.id));
  const myPayments = db.get('payments').filter(p => p.homeownerId === currentUser.id);
  const today = getLocalDateValue();
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header"><div class="page-header-left"><h2>My Bills</h2><p>View your assigned billing records.</p></div></div>
  <div class="section-card">
    <div class="section-card-body no-pad">
      <table class="data-table">
        <thead><tr><th>Billing</th><th>Amount</th><th>Due Date</th><th>Payment Status</th><th>Action</th></tr></thead>
        <tbody>
          ${myBillings.map(b => {
            const paid = myPayments.find(p => p.billingId === b.id && p.status === 'approved');
            const pend = myPayments.find(p => p.billingId === b.id && p.status === 'pending');
            const overdue = b.dueDate < today && !paid;
            let statusBadge = paid ? badgeHtml('approved') : pend ? badgeHtml('pending') : overdue ? '<span class="badge badge-red">Overdue</span>' : '<span class="badge badge-gray">Unpaid</span>';
            return `<tr class="${overdue ? 'overdue-row' : ''}">
              <td>
                <strong>${b.title}</strong>
                ${b.description ? `<div style="font-size:0.78rem;color:var(--text-3);margin-top:3px">${b.description}</div>` : ''}
              </td>
              <td class="amount-due">₱${b.amount.toLocaleString()}</td>
              <td>${b.dueDate}${overdue ? ' — Overdue' : ''}</td>
              <td>${statusBadge}</td>
              <td>${!paid && !pend ? `<button class="btn btn-primary btn-sm" onclick="navigate('ho-payments')">Pay Now</button>` : '—'}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="5"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-file"/></svg>No bills assigned.</div></td></tr>'}
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderHOPayments() {
  const myBillings = db.get('billings').filter(b => b.assignedTo.includes(currentUser.id));
  const myPayments = db.get('payments').filter(p => p.homeownerId === currentUser.id);
  const unpaid = myBillings.filter(b => !myPayments.find(p => p.billingId === b.id && (p.status === 'approved' || p.status === 'pending')));
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header"><div class="page-header-left"><h2>Submit Payment</h2><p>Upload your payment receipt for admin approval.</p></div></div>
  <div class="section-card">
    <div class="section-card-body">
      <div class="form-group"><label>Select Billing *</label>
        <select id="pay_bill">
          <option value="">-- Select a billing --</option>
          ${unpaid.map(b => `<option value="${b.id}">₱${b.amount.toLocaleString()} — ${b.title} (Due: ${b.dueDate})</option>`).join('')}
        </select>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>Amount Paid (₱) *</label><input id="pay_amount" type="number" placeholder="e.g. 1500"/></div>
        <div class="form-group"><label>Reference Number *</label><input id="pay_ref" placeholder="e.g. GCH-2025-0123"/></div>
      </div>
      <div class="form-group"><label>Upload Receipt (simulated)</label>
        <input type="file" id="pay_receipt" accept="image/*" style="padding:8px;border:1.5px dashed var(--border);border-radius:var(--radius);width:100%;background:var(--surface-2)"/>
        <div style="font-size:0.78rem;color:var(--text-3);margin-top:4px">Accepted: JPG, PNG, PDF. Max 5MB. (Demo mode — file not actually uploaded)</div>
      </div>
      <div class="form-group"><label>Additional Notes</label><textarea id="pay_notes" placeholder="Optional..."></textarea></div>
      <button class="btn btn-primary" onclick="confirmSubmitPayment()">Submit Payment</button>
    </div>
  </div>`;
}

function confirmSubmitPayment() {
  const billingId = document.getElementById('pay_bill').value;
  const amount = parseFloat(document.getElementById('pay_amount').value);
  const refNum = document.getElementById('pay_ref').value.trim();
  if (!billingId || isNaN(amount) || !refNum) { showToast('error', 'Missing Fields', 'Please fill in all required fields.'); return; }
  const bill = db.getOne('billings', billingId);
  pendingPaymentSubmission = { billingId, amount, refNum };
  openConfirm('Submit Payment', `Are you sure you want to submit a payment of <strong>₱${amount.toLocaleString()}</strong> for <strong>${bill ? bill.title : ''}</strong>? Reference: ${refNum}`, submitPayment);
}

function submitPayment() {
  if (!document.getElementById('pay_bill') && pendingPaymentSubmission) {
    const { billingId, amount, refNum } = pendingPaymentSubmission;
    pendingPaymentSubmission = null;
    return savePaymentSubmission(billingId, amount, refNum);
  }
  const billingId = document.getElementById('pay_bill').value;
  const amount = parseFloat(document.getElementById('pay_amount').value);
  const refNum = document.getElementById('pay_ref').value.trim();
  const payment = {
    id: db.newId('p'),
    homeownerId: currentUser.id,
    billingId, amount, refNum,
    status: 'pending', receipt: null,
    submittedAt: getLocalDateValue(),
    remarks: '', reviewedAt: null,
  };
  db.save('payments', payment);
  const bill = db.getOne('billings', billingId);
  addNotification('Payment Submitted', `${currentUser.name} submitted a payment for "${bill ? bill.title : ''}".`, { roles: ['admin', 'treasurer'] });
  addNotification('Payment Submitted', `Your payment for "${bill ? bill.title : ''}" is under review.`);
  showLoading();
  setTimeout(() => {
    hideLoading();
    showToast('success', 'Payment Submitted', 'Your payment is now pending admin approval.');
    navigate('ho-history');
  }, 800);
}

function savePaymentSubmission(billingId, amount, refNum) {
  const payment = {
    id: db.newId('p'),
    homeownerId: currentUser.id,
    billingId, amount, refNum,
    status: 'pending', receipt: null,
    submittedAt: getLocalDateValue(),
    remarks: '', reviewedAt: null,
  };
  db.save('payments', payment);
  const bill = db.getOne('billings', billingId);
  addNotification('Payment Submitted', `${currentUser.name} submitted a payment for "${bill ? bill.title : ''}".`, { roles: ['admin', 'treasurer'] });
  addNotification('Payment Submitted', `Your payment for "${bill ? bill.title : ''}" is under review.`);
  showLoading();
  setTimeout(() => {
    hideLoading();
    showToast('success', 'Payment Submitted', 'Your payment is now pending admin approval.');
    navigate('ho-history');
  }, 800);
}

function renderHOHistory() {
  const myPayments = db.get('payments').filter(p => p.homeownerId === currentUser.id);
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header"><div class="page-header-left"><h2>Payment History</h2><p>All your payment transactions.</p></div></div>
  <div class="section-card">
    <div class="section-card-body no-pad">
      <table class="data-table">
        <thead><tr><th>Billing</th><th>Amount</th><th>Reference #</th><th>Submitted</th><th>Status</th><th>Remarks</th></tr></thead>
        <tbody>
          ${[...myPayments].sort((a,b) => b.submittedAt.localeCompare(a.submittedAt)).map(p => {
            const bill = db.getOne('billings', p.billingId);
            return `<tr>
              <td>${bill ? bill.title : 'N/A'}</td>
              <td>₱${p.amount.toLocaleString()}</td>
              <td style="font-family:monospace;font-size:0.82rem">${p.refNum}</td>
              <td>${p.submittedAt}</td>
              <td>${badgeHtml(p.status)}</td>
              <td style="font-size:0.82rem;color:var(--text-3)">${p.remarks || '—'}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="6"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-history"/></svg>No transactions yet.</div></td></tr>'}
        </tbody>
      </table>
    </div>
  </div>`;
}

// SECTION 16: HOMEOWNER — COMPLAINTS
function renderHOComplaints() {
  const myComplaints = db.get('complaints').filter(c => c.homeownerId === currentUser.id);
  const area = document.getElementById('contentArea');

  const reviewed   = myComplaints.filter(c => normalizeComplaintStatus(c.status) === 'Reviewed').length;
  const inProgress = myComplaints.filter(c => c.status === 'In Progress').length;
  const resolved   = myComplaints.filter(c => c.status === 'Resolved').length;
  const rejected   = myComplaints.filter(c => c.status === 'Rejected').length;

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>My Complaints</h2><p>File and track your submitted complaints.</p></div>
    <div class="page-header-actions">
      <button class="btn btn-primary" onclick="openFileComplaintForm()">
        <svg class="btn-ico"><use href="#ico-plus"/></svg> File a Complaint
      </button>
    </div>
  </div>

  <div class="stat-grid" style="margin-bottom:22px">
    <div class="stat-card" style="--card-accent:#dc2626;--card-accent-bg:#fee2e2">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-flag"/></svg></div>
      <div class="stat-value">${reviewed}</div>
      <div class="stat-label">Reviewed</div>
    </div>
    <div class="stat-card" style="--card-accent:#d97706;--card-accent-bg:#fef3c7">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-clock"/></svg></div>
      <div class="stat-value">${inProgress}</div>
      <div class="stat-label">In Progress</div>
    </div>
    <div class="stat-card" style="--card-accent:#16a34a;--card-accent-bg:#dcfce7">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-check"/></svg></div>
      <div class="stat-value">${resolved}</div>
      <div class="stat-label">Resolved</div>
    </div>
    <div class="stat-card" style="--card-accent:#991b1b;--card-accent-bg:#fee2e2">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-x"/></svg></div>
      <div class="stat-value">${rejected}</div>
      <div class="stat-label">Rejected</div>
    </div>
    <div class="stat-card" style="--card-accent:#177a80;--card-accent-bg:#d0f4f6">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-file"/></svg></div>
      <div class="stat-value">${myComplaints.length}</div>
      <div class="stat-label">Total Filed</div>
    </div>
  </div>

  <div id="hoComplaintsList">
    ${myComplaints.length === 0 ? `
      <div class="section-card">
        <div class="section-card-body" style="text-align:center;padding:48px 20px">
          <svg style="width:48px;height:48px;color:var(--text-3);margin-bottom:14px"><use href="#ico-flag"/></svg>
          <h3 style="font-size:1.1rem;color:var(--text-2);margin-bottom:8px">No Complaints Filed</h3>
          <p style="color:var(--text-3);font-size:0.88rem;margin-bottom:20px">You haven't submitted any complaints yet.</p>
          <button class="btn btn-primary" onclick="openFileComplaintForm()">File Your First Complaint</button>
        </div>
      </div>` : renderHOComplaintCards(myComplaints)}
  </div>`;
}

function renderHOComplaintCards(complaints) {
  const sorted = [...complaints].sort((a, b) => b.dateFiled.localeCompare(a.dateFiled));
  const catColors = { Maintenance: '#2271c3', Noise: '#d97706', Security: '#177a80', Others: '#8795a8' };
  return sorted.map(c => `
    <div class="announcement-card" style="--card-accent:${catColors[c.category] || '#8795a8'};margin-bottom:14px">
      <div class="announcement-header">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
            ${complaintCategoryBadge(c.category)}
            ${complaintStatusBadge(c.status)}
            <span style="font-size:0.78rem;color:var(--text-3)">Filed: ${c.dateFiled}</span>
            ${c.updatedAt ? `<span style="font-size:0.78rem;color:var(--text-3)">· Updated: ${c.updatedAt}</span>` : ''}
          </div>
          <div style="font-size:0.9rem;color:var(--text-2);line-height:1.6">${c.description}</div>
        </div>
      </div>
      ${c.adminResponse ? `
        <div style="margin-top:14px;padding:12px 14px;background:var(--teal-50);border-radius:var(--radius);border-left:3px solid var(--teal-500)">
          <div style="font-size:0.75rem;font-weight:700;color:var(--teal-600);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px">
            <svg width="12" height="12" style="vertical-align:middle;margin-right:4px"><use href="#ico-megaphone"/></svg> Admin Response
          </div>
          <div style="font-size:0.86rem;color:var(--text-2);line-height:1.6">${c.adminResponse}</div>
        </div>` : `
        <div style="margin-top:14px;padding:10px 14px;background:var(--surface-2);border-radius:var(--radius);border-left:3px solid var(--border)">
          <div style="font-size:0.82rem;color:var(--text-3);font-style:italic">Awaiting admin response…</div>
        </div>`}
    </div>`).join('');
}

function openFileComplaintForm() {
  openModal('File a Complaint', `
    <div style="background:var(--gold-50);border:1px solid var(--gold-100);border-left:3px solid var(--gold-400);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:18px;font-size:0.84rem;color:var(--text-2);line-height:1.6">
      Please provide complete and accurate information. Your complaint will be reviewed by the HOA administration.
    </div>
    <div class="form-group">
      <label>Category *</label>
      <select id="hc_category">
        <option value="">-- Select a category --</option>
        <option value="Maintenance">Maintenance</option>
        <option value="Noise">Noise</option>
        <option value="Security">Security</option>
        <option value="Others">Others</option>
      </select>
    </div>
    <div class="form-group">
      <label>Description *</label>
      <textarea id="hc_description" placeholder="Describe your complaint in detail. Include location, time, and any relevant information…" style="min-height:120px"></textarea>
      <div style="text-align:right;font-size:0.75rem;color:var(--text-3);margin-top:4px" id="hc_charCount">0 / 500 characters</div>
    </div>
    <div class="form-group">
      <label>Date Filed</label>
      <input type="text" value="${getLocalDateValue()}" disabled style="background:var(--surface-2);color:var(--text-3);cursor:not-allowed"/>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Submit Complaint', cls: 'btn-primary', action: confirmSubmitComplaint },
  ]);

  setTimeout(() => {
    const ta = document.getElementById('hc_description');
    const counter = document.getElementById('hc_charCount');
    if (ta && counter) {
      ta.addEventListener('input', () => {
        const len = ta.value.length;
        counter.textContent = `${len} / 500 characters`;
        counter.style.color = len > 450 ? 'var(--red-600)' : 'var(--text-3)';
        if (len > 500) ta.value = ta.value.substring(0, 500);
      });
    }
  }, 50);
}

function confirmSubmitComplaint() {
  const category    = document.getElementById('hc_category').value;
  const description = document.getElementById('hc_description').value.trim();

  if (!category) {
    showToast('error', 'Category Required', 'Please select a complaint category.');
    return;
  }
  if (!description) {
    showToast('error', 'Description Required', 'Please describe your complaint before submitting.');
    return;
  }
  if (description.length < 10) {
    showToast('error', 'Too Short', 'Please provide a more detailed description (at least 10 characters).');
    return;
  }

  openConfirm(
    'Submit Complaint',
    `Are you sure you want to submit this <strong>${category}</strong> complaint? It will be sent to the HOA administration for review.`,
    () => submitHOComplaint(category, description)
  );
}

function submitHOComplaint(category, description) {
  const complaint = {
    id:            db.newId('c'),
    homeownerId:   currentUser.id,
    category,
    description,
    status:        'Reviewed',
    adminResponse: '',
    dateFiled:     getLocalDateValue(),
    updatedAt:     null,
    resolvedAt:    null,
  };

  db.save('complaints', complaint);
  addNotification('New Complaint Submitted', `${currentUser.name} filed a ${category} complaint for review.`, { roles: ['admin', 'president', 'security'] });
  logAction && logAction(`Homeowner ${currentUser.name} filed a ${category} complaint`);

  showLoading();
  setTimeout(() => {
    hideLoading();
    closeModal();
    showToast('success', 'Complaint Filed', 'Your complaint has been submitted. The HOA will review it shortly.');
    navigate('ho-complaints');
  }, 600);
}

function renderHOAnnouncements() {
  const area = document.getElementById('contentArea');
  if (!area) return;

  const announcements = [...db.get('announcements')].reverse();

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <h2>Announcements</h2>
      <p>Latest official notices, announcements, and community discussions from San Alfonso Homes.</p>
    </div>
  </div>

  <div class="community-feed-container">
    <div id="hoAnnouncementsList">
      ${!announcements.length ? `
        <div class="no-results" style="padding:40px 20px;">
          <svg style="width:2.5rem;height:2.5rem;color:var(--text-3);margin-bottom:10px;"><use href="#ico-megaphone"/></svg>
          <br><strong>No community announcements at this time.</strong>
        </div>
      ` : announcements.map(a => communityPostCardHTML(a, false)).join('')}
    </div>
  </div>`;

  // Fetch and render MySQL comments for residents
  announcements.forEach(a => {
    loadAndRenderComments(a.id);
  });
}

function renderHOProfile() {
  syncHomeownerBalances();
  const u = currentUser;
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header"><div class="page-header-left"><h2>My Profile</h2><p>View and update your personal information.</p></div></div>
  <div class="profile-card">
    ${profileAvatarEditableHTML(u)}
    <div class="profile-info"><h3>${u.name}</h3><p>${u.email}</p><p>${u.block||''} ${u.lot||''} · ${u.contact||'No contact'}</p></div>
  </div>
  <div class="settings-section">
    <div class="settings-section-header"><h4>Edit Profile</h4></div>
    <div class="settings-section-body">
      <div class="grid-2">
        <div class="form-group"><label>Full Name</label><input id="hp_name" value="${u.name}"/></div>
        <div class="form-group"><label>Email</label><input id="hp_email" value="${u.email}"/></div>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>Contact</label><input id="hp_contact" value="${u.contact||''}"/></div>
        <div class="form-group"><label>Block / Lot</label><input id="hp_bloc" value="${(u.block||'')+' '+(u.lot||'')}"/></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="confirmSaveHOProfile()">Save Changes</button>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-section-header"><h4>Change Password</h4></div>
    <div class="settings-section-body">
      <div class="grid-2">
        <div class="form-group"><label>New Password</label><input id="hp_newpass" type="password" placeholder="New password..."/></div>
        <div class="form-group"><label>Confirm</label><input id="hp_confpass" type="password" placeholder="Confirm..."/></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="confirmSaveHOPassword()">Update Password</button>
    </div>
  </div>`;
}

function confirmSaveHOProfile() {
  const name = document.getElementById('hp_name').value.trim() || currentUser.name;
  openConfirm('Save Profile', `Are you sure you want to save your profile changes for <strong>${name}</strong>?`, saveHOProfile);
}

function saveHOProfile() {
  currentUser.name = document.getElementById('hp_name').value.trim() || currentUser.name;
  currentUser.email = document.getElementById('hp_email').value.trim() || currentUser.email;
  currentUser.contact = document.getElementById('hp_contact').value.trim();
  db.save('users', currentUser);
  buildSidebar();
  showToast('success', 'Saved', 'Profile updated.');
}

function confirmSaveHOPassword() {
  const np = document.getElementById('hp_newpass').value.trim();
  const cp = document.getElementById('hp_confpass').value.trim();
  if (!np || !cp) { showToast('error', 'Empty', 'Enter both fields.'); return; }
  if (np !== cp) { showToast('error', 'Mismatch', 'Passwords do not match.'); return; }
  if (np.length < 6) { showToast('error', 'Too Short', 'Min 6 characters.'); return; }
  openConfirm('Change Password', 'Are you sure you want to update your password?', saveHOPassword);
}

function saveHOPassword() {
  const np = document.getElementById('hp_newpass').value.trim();
  currentUser.password = np;
  db.save('users', currentUser);
  showToast('success', 'Updated', 'Password changed.');
}


// SECTION 17: COMPLAINT HELPERS


function complaintStatusBadge(status) {
  const normalized = normalizeComplaintStatus(status);
  const map = {
    'Reviewed':    '<span class="badge badge-blue">Reviewed</span>',
    'In Progress': '<span class="badge badge-yellow">In Progress</span>',
    'Resolved':    '<span class="badge badge-green">Resolved</span>',
    'Rejected':    '<span class="badge badge-red">Rejected</span>',
  };
  return map[normalized] || `<span class="badge badge-gray">${normalized}</span>`;
}

function normalizeComplaintStatus(status) {
  return status === 'Open' ? 'Reviewed' : status;
}

function complaintCategoryBadge(category) {
  const map = {
    'Maintenance': '<span class="badge badge-blue">Maintenance</span>',
    'Noise':       '<span class="badge badge-amber">Noise</span>',
    'Security':    '<span class="badge" style="background:var(--teal-100);color:var(--teal-700)">Security</span>',
    'Others':      '<span class="badge badge-gray">Others</span>',
  };
  return map[category] || `<span class="badge badge-gray">${category}</span>`;
}


// SECTION 18: MODAL ENGINE


function openModal(title, bodyHtml, buttons = []) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  const footer = document.getElementById('modalFooter');
  footer.innerHTML = '';
  buttons.forEach(btn => {
    const el = document.createElement('button');
    el.className = `btn ${btn.cls}`;
    el.textContent = btn.label;
    el.addEventListener('click', btn.action);
    footer.appendChild(el);
  });
  document.getElementById('modalOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  if (pendingPhotoFile || pendingPhotoPreviewUrl) {
    cancelProfilePhotoSelect();
  }
  document.getElementById('modalOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

function openConfirm(title, message, onConfirm) {
  openModal(title, `<p style="color:var(--text-2);line-height:1.6">${message}</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Confirm', cls: 'btn-primary', action: () => { closeModal(); onConfirm(); } },
  ]);
}


// SECTION 19: TOAST NOTIFICATIONS


function showToast(type, title, message) {
  const colors = { success: '#16a34a', error: '#dc2626', warning: '#d97706', info: '#2271c3' };
  const icons  = { success: '<svg width="16" height="16"><use href="#ico-check"/></svg>', error: '<svg width="16" height="16"><use href="#ico-x"/></svg>', warning: '<svg width="16" height="16"><use href="#ico-shield"/></svg>', info: '<svg width="16" height="16"><use href="#ico-megaphone"/></svg>' };
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.setProperty('--toast-color', colors[type] || colors.info);
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${message}</div>
    </div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}


// SECTION 20: NOTIFICATION SYSTEM


function normalizeNotificationList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function getNotificationSeenKey() {
  return currentUser ? `sah_notifications_seen_${currentUser.id}_${currentUser.role}` : '';
}

function loadSeenNotificationIds() {
  const key = getNotificationSeenKey();
  if (!key) return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveSeenNotificationIds(ids) {
  const key = getNotificationSeenKey();
  if (key) localStorage.setItem(key, JSON.stringify([...new Set(ids.filter(Boolean))]));
}

function addNotification(title, message, options = {}) {
  const stored = db.get('notifications');
  const hasAudience = Boolean(options.audience || options.roles || options.userIds);
  const notification = {
    id: db.newId('n'),
    title,
    message,
    time: new Date().toLocaleTimeString(),
    audience: options.audience || (options.roles ? 'roles' : 'users'),
    targetIds: normalizeNotificationList(options.roles || options.userIds || (hasAudience ? [] : [currentUser?.id])),
    dismissedBy: [],
  };

  if (notification.audience === 'all') notification.targetIds = [];
  if (notification.audience === 'users') notification.targetIds = notification.targetIds.filter(Boolean);

  stored.unshift(notification);
  db.save('notifications', notification);
  const panel = document.getElementById('notifPanel');
  if (panel && !panel.classList.contains('hidden')) {
    renderNotificationList();
    markVisibleNotificationsSeen();
  }
  updateNotifBadge();
}

function canSeeNotification(notification) {
  if (!currentUser) return false;
  const dismissedBy = normalizeNotificationList(notification.dismissedBy);
  if (dismissedBy.includes(currentUser.id)) return false;

  const audience = notification.audience || 'all';
  const targetIds = normalizeNotificationList(notification.targetIds);

  if (audience === 'all') return true;
  if (audience === 'roles') return targetIds.includes(currentUser.role);
  if (audience === 'users') return targetIds.includes(currentUser.id);
  return true;
}

function getVisibleNotifications() {
  return db.get('notifications').filter(canSeeNotification).slice(0, 20);
}

function getUnreadNotifications() {
  const seenIds = new Set(loadSeenNotificationIds());
  return getVisibleNotifications().filter(notification => !seenIds.has(notification.id));
}

function markVisibleNotificationsSeen() {
  if (!currentUser) return;
  const seenIds = loadSeenNotificationIds();
  const visibleIds = getVisibleNotifications().map(notification => notification.id);
  saveSeenNotificationIds([...seenIds, ...visibleIds]);
}

function renderNotificationList() {
  const list = document.getElementById('notifList');
  if (!list) return;
  const notifs = getVisibleNotifications();
  list.innerHTML = notifs.length ? notifs.map(n => `
    <div class="notif-item">
      <strong>${n.title}</strong>
      ${n.message}
      <div class="notif-time">${n.time}</div>
    </div>`).join('') : '<p class="empty-note">No notifications</p>';
}

function updateNotifBadge() {
  const notifs = getUnreadNotifications();
  const badge = document.getElementById('notifBadge');
  if (badge) badge.textContent = notifs.length > 0 ? notifs.length : '0';
}

async function refreshNotifications() {
  if (!currentUser) return;
  try {
    dbCache.notifications = await api.request('/api/notifications');
    const panel = document.getElementById('notifPanel');
    if (panel && !panel.classList.contains('hidden')) {
      renderNotificationList();
      markVisibleNotificationsSeen();
    }
    updateNotifBadge();
  } catch (error) {
    console.warn('Could not refresh notifications', error);
  }
}

function startNotificationRefresh() {
  if (notificationRefreshTimer) clearInterval(notificationRefreshTimer);
  notificationRefreshTimer = setInterval(refreshNotifications, 10000);
}

function stopNotificationRefresh() {
  if (!notificationRefreshTimer) return;
  clearInterval(notificationRefreshTimer);
  notificationRefreshTimer = null;
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    renderNotificationList();
    markVisibleNotificationsSeen();
    updateNotifBadge();
    refreshNotifications();
  }
}

function clearNotifications() {
  if (!currentUser) return;
  const stored = db.get('notifications').map(notification => {
    if (!canSeeNotification(notification)) return notification;
    const dismissedBy = normalizeNotificationList(notification.dismissedBy);
    return { ...notification, dismissedBy: [...new Set([...dismissedBy, currentUser.id])] };
  });
  db.set('notifications', stored);
  document.getElementById('notifList').innerHTML = '<p class="empty-note">No notifications</p>';
  updateNotifBadge();
}


// SECTION 21: AUDIT LOG HELPER


function logAction(action) {
  const log = {
    id: db.newId('l'),
    action,
    adminId: currentUser.id,
    timestamp: new Date().toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' }),
  };
  const logs = db.get('auditLog');
  logs.push(log);
  db.set('auditLog', logs);
}


// SECTION 22: UI HELPERS


function badgeHtml(status) {
  const map = {
    approved: '<span class="badge badge-green">Approved</span>',
    pending:  '<span class="badge badge-yellow">Pending</span>',
    rejected: '<span class="badge badge-red">Rejected</span>',
    paid:     '<span class="badge badge-green">Paid</span>',
    active:   '<span class="badge badge-blue">Active</span>',
    inactive: '<span class="badge badge-gray">Inactive</span>',
    overdue:  '<span class="badge badge-red">Overdue</span>',
  };
  return map[status] || `<span class="badge badge-gray">${status}</span>`;
}

function showLoading() { document.getElementById('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.add('hidden'); }

function toggleDarkMode() {
  const html = document.documentElement;
  const isDark = html.dataset.theme === 'dark';
  html.dataset.theme = isDark ? 'light' : 'dark';
  localStorage.setItem('sah_theme', html.dataset.theme);
  const icon = document.getElementById('darkModeIcon');
  const label = document.getElementById('darkModeLabel');
  if (icon) { icon.innerHTML = isDark ? '<use href="#ico-moon"/>' : '<use href="#ico-sun"/>'; icon.setAttribute('width','16'); icon.setAttribute('height','16'); }
  if (label) label.textContent = isDark ? 'Dark Mode' : 'Light Mode';
  const toggleEl = document.getElementById('darkToggle');
  if (toggleEl) toggleEl.checked = !isDark;
}

function applyStoredTheme() {
  const t = localStorage.getItem('sah_theme') || 'light';
  document.documentElement.dataset.theme = t;
  const icon = document.getElementById('darkModeIcon');
  const label = document.getElementById('darkModeLabel');
  if (icon) { icon.innerHTML = t === 'dark' ? '<use href="#ico-sun"/>' : '<use href="#ico-moon"/>'; icon.setAttribute('width','16'); icon.setAttribute('height','16'); }
  if (label) label.textContent = t === 'dark' ? 'Light Mode' : 'Dark Mode';
}


// SECTION 23: KEYBOARD & GLOBAL EVENTS


document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeProfileAvatarMenu();
    closeModal();
    closeLoginModal();
    const np = document.getElementById('notifPanel');
    if (np) np.classList.add('hidden');
  }
  if (e.key === 'Enter') {
    const lm = document.getElementById('loginModal');
    if (lm && !lm.classList.contains('hidden')) handleLogin();
  }
});

document.addEventListener('click', e => {
  const avatarMenu = document.getElementById('profileAvatarMenu');
  const avatarBtn = document.getElementById('profileAvatarEditBtn');
  if (avatarMenu && !avatarMenu.classList.contains('hidden')) {
    if (!avatarMenu.contains(e.target) && !avatarBtn?.contains(e.target)) {
      closeProfileAvatarMenu();
    }
  }
  const panel = document.getElementById('notifPanel');
  const bell = document.querySelector('.notif-bell');
  if (panel && !panel.classList.contains('hidden') && !panel.contains(e.target) && bell && !bell.contains(e.target)) {
    panel.classList.add('hidden');
  }
});

window.addEventListener('scroll', () => {
  const nav = document.getElementById('pubNav');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
});


// SECTION 24: LANDING PAGE FUNCTIONS


function openLoginModal(role) {
  currentRole = role || null;
  const lu = document.getElementById('loginUser');
  const lp = document.getElementById('loginPass');
  const le = document.getElementById('loginError');
  if (lu) lu.value = '';
  if (lp) lp.value = '';
  if (le) le.classList.add('hidden');
  if (lu) lu.placeholder = 'Enter your username';
  document.getElementById('loginModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => { if (lu) lu.focus(); }, 100);
}

function openAmenityBookingLogin() {
  pendingPostLoginView = 'ho-amenities';
  openLoginModal();
}

function closeLoginModal() {
  const lm = document.getElementById('loginModal');
  if (lm) lm.classList.add('hidden');
  document.body.style.overflow = '';
}

function closeLoginModalOutside(e) {
  if (e.target === document.getElementById('loginModal')) closeLoginModal();
}

function pubScrollTo(e, sectionId) {
  if (e && e.preventDefault) e.preventDefault();
  const el = document.getElementById(sectionId);
  if (el) {
    const offset = 72;
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
  document.querySelectorAll('.pub-nav-link').forEach(l => l.classList.remove('active'));
  const mapping = { hero: 0, announcements: 1, lostfound: 2, about: 3, contact: 4 };
  const links = document.querySelectorAll('.pub-nav-link');
  const idx = mapping[sectionId];
  if (idx !== undefined && links[idx]) links[idx].classList.add('active');
}

function togglePubNav() {
  const mn = document.getElementById('pubMobileNav');
  if (mn) mn.classList.toggle('hidden');
}

function renderPublicAnnouncements() {
  const grid = document.getElementById('pubAnnGrid');
  if (!grid) return;
  const announcements = db.get('announcements').slice(-6).reverse();
  const catColors = { Maintenance: '#2271c3', Emergency: '#dc2626', Events: '#16a34a', Security: '#d97706', General: '#177a80' };
  if (!announcements.length) {
    grid.innerHTML = `<div class="no-results" style="grid-column:1/-1"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-megaphone"/></svg>No announcements at this time.</div>`;
    return;
  }
  grid.innerHTML = announcements.map(a => {
    const accentColor = catColors[a.category] || '#177a80';
    const images = getAnnouncementImages(a);
    const hasImages = images.length > 0;
    return `
    <div class="pub-ann-card" style="--ann-color:${accentColor}">
      <div class="pub-ann-card-top">
        <div class="pub-ann-card-title">${escapeHtml(a.title)}</div>
        <div style="flex-shrink:0">${a.urgent ? '<span class="badge badge-red">Urgent</span>' : ''}</div>
      </div>
      ${hasImages ? `
        <div style="position:relative;width:100%;height:150px;overflow:hidden;border-radius:6px;margin:10px 0;cursor:pointer;" onclick="openAnnouncementLightbox('${a.id}', 0)">
          <img src="${escapeHtml(images[0])}" alt="${escapeHtml(a.title)}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy" />
          ${images.length > 1 ? `
            <div style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,0.7);color:#fff;font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:10px;">
              📷 ${images.length} photos
            </div>
          ` : ''}
        </div>
      ` : ''}
      <div class="pub-ann-card-body">${escapeHtml(a.content || a.description || '')}</div>
      <div class="pub-ann-card-meta">
        <span>${formatCommunityDate(a.created_at || a.date)}</span>
        <span class="badge" style="background:${accentColor}18;color:${accentColor};font-weight:700;">${escapeHtml(a.category || 'General')}</span>
      </div>
    </div>`;
  }).join('');
}

function updateHeroStat() {
  const el = document.getElementById('heroStatHO');
  if (el) {
    const count = db.get('users').filter(u => u.role === 'homeowner').length;
    el.textContent = count;
  }
}

function showLandingPage() {
  document.getElementById('landingPage').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
  renderPublicAnnouncements();
  renderPublicLostFound();
  updateHeroStat();
  applyStoredTheme();
}

function performLogout() {
  localStorage.removeItem('sah_session');
  stopNotificationRefresh();
  currentUser = null;
  document.getElementById('appShell').classList.add('hidden');
  showLandingPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleLogout() {
  openConfirm('Sign Out', 'Are you sure you want to sign out?', performLogout);
}




// SECTION 25: BOOTSTRAP


(async function init() {
  try {
    await seedData();
  } catch (error) {
    document.body.innerHTML = `
      <div style="font-family:Arial,sans-serif;max-width:720px;margin:80px auto;padding:24px;line-height:1.6">
        <h1>Start the Node.js server first</h1>
        <p>This app now uses MySQL through an Express backend. Open this folder in VS Code, run <strong>npm install</strong>, then run <strong>npm start</strong>.</p>
        <p>After the server starts, open <strong>http://localhost:3000</strong>.</p>
      </div>`;
    console.error(error);
    return;
  }
  applyStoredTheme();
  if (restoreSession()) {
    document.getElementById('landingPage').classList.add('hidden');
    initApp();
  } else {
    showLandingPage();
  }
})();
