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
  staff: 'Staff Member',
  homeowner: 'Homeowner',
};

const MODULE_PERMISSIONS = [
  { id: 'dashboard',      label: 'Dashboard',            section: 'MAIN',        icon: 'ico-dashboard',  desc: 'Overview stats, collection trends, recent activity' },
  { id: 'homeowners',     label: 'Homeowners',           section: 'MAIN',        icon: 'ico-users',      desc: 'Resident directory, contact details, balance info' },
  { id: 'announcements',  label: 'Announcements',        section: 'MANAGEMENT',  icon: 'ico-megaphone',  desc: 'Post notices, multi-photo updates, comments' },
  { id: 'billing',        label: 'Billing',              section: 'MANAGEMENT',  icon: 'ico-file',       desc: 'Create invoices, auto-generate dues, assign rates' },
  { id: 'payments',       label: 'Payments',             section: 'MANAGEMENT',  icon: 'ico-credit',     desc: 'Verify receipts, approve/reject homeowner payments' },
  { id: 'complaints',     label: 'Complaints',           section: 'MANAGEMENT',  icon: 'ico-flag',       desc: 'Review complaints, post admin responses, resolve' },
  { id: 'amenities',      label: 'Amenity Bookings',     section: 'MANAGEMENT',  icon: 'ico-building',   desc: 'Facility reservation approvals and schedules' },
  { id: 'vehicles',       label: 'Vehicle Management',   section: 'MANAGEMENT',  icon: 'ico-parking',    desc: 'Approve vehicle registrations and RFID stickers' },
  { id: 'lostfound',      label: 'Lost and Found',        section: 'MANAGEMENT',  icon: 'ico-search',     desc: 'Manage community lost & found listings' },
  { id: 'announcements',  label: 'Announcements',        section: 'MANAGEMENT',  icon: 'ico-megaphone',  desc: 'Post notices, multi-photo updates, comments' },
  { id: 'board',          label: 'Board of Directors',   section: 'MANAGEMENT',  icon: 'ico-users',      desc: 'Manage elected HOA officers, terms, and leadership' },
  { id: 'reports',        label: 'Reports',              section: 'ANALYTICS',   icon: 'ico-chart',      desc: 'Financial summaries, payment collection charts' },
  { id: 'auditlog',       label: 'Audit Log',            section: 'ANALYTICS',   icon: 'ico-log',        desc: 'Audit trail of administrative system actions' },
  { id: 'users',          label: 'Accounts & Roles',      section: 'SYSTEM',      icon: 'ico-shield',     desc: 'User management, custom roles, permission matrix' },
  { id: 'settings',       label: 'Settings',             section: 'SYSTEM',      icon: 'ico-settings',   desc: 'System preferences, dues rate, admin profile' },
];

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
  { id: 'board',          icon: 'ico-users',       label: 'Board of Directors', section: 'MANAGEMENT' },
  { id: 'reports',        icon: 'ico-chart',       label: 'Reports',         section: 'ANALYTICS' },
  { id: 'auditlog',       icon: 'ico-log',         label: 'Audit Log',       section: 'ANALYTICS' },
  { id: 'users',          icon: 'ico-shield',      label: 'Accounts & Roles', section: 'SYSTEM' },
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
  if (role === 'admin') return ADMIN_NAV;

  // If user has custom permissions array in MySQL, dynamically build their navigation
  if (currentUser && Array.isArray(currentUser.permissions) && currentUser.permissions.length > 0) {
    if (role === 'homeowner') {
      const perms = currentUser.permissions;
      return HOMEOWNER_NAV.filter(item => perms.includes(item.id) || perms.includes('*'));
    }
    const perms = currentUser.permissions;
    const permittedNav = ADMIN_NAV.filter(item => perms.includes(item.id) || perms.includes('*'));
    if (permittedNav.length > 0) return permittedNav;
  }

  const navMap = {
    admin: ADMIN_NAV,
    homeowner: HOMEOWNER_NAV,
    president: PRESIDENT_NAV,
    security: SECURITY_NAV,
    treasurer: TREASURER_NAV,
    auditor: AUDITOR_NAV,
    staff: ADMIN_NAV.filter(item => ['dashboard'].includes(item.id)),
  };
  return navMap[role] || HOMEOWNER_NAV;
}

function getDefaultViewForRole(role) {
  const nav = getNavForRole(role);
  if (nav && nav.length > 0) return nav[0].id;
  return role === 'homeowner' ? HOMEOWNER_NAV[0].id : ADMIN_NAV[0].id;
}

function userHasModulePermission(moduleId) {
  if (!currentUser) return false;
  if (currentUser.status === 'inactive' || currentUser.status === 'deactivated') return false;
  if (currentUser.role === 'admin') return true;
  if (Array.isArray(currentUser.permissions)) {
    if (currentUser.permissions.includes('*')) return true;
    if (currentUser.permissions.includes(moduleId)) return true;
  }
  return false;
}

function isAdmin() { return currentUser?.role === 'admin'; }
function canManageComplaints() { return isAdmin() || userHasModulePermission('complaints') || ['president'].includes(currentUser?.role); }
function canViewAdminComplaints() { return isAdmin() || userHasModulePermission('complaints') || ['president', 'security'].includes(currentUser?.role); }
function canManagePayments() { return isAdmin() || userHasModulePermission('payments'); }
function canViewPayments() { return isAdmin() || userHasModulePermission('payments') || ['treasurer'].includes(currentUser?.role); }
function canManageBilling() { return isAdmin() || userHasModulePermission('billing'); }
function canViewBillingStatus() { return isAdmin() || userHasModulePermission('billing') || ['auditor'].includes(currentUser?.role); }
function canViewReports() { return isAdmin() || userHasModulePermission('reports') || ['treasurer', 'auditor'].includes(currentUser?.role); }

function canAccessView(viewId) {
  if (!currentUser) return false;
  if (currentUser.status === 'inactive' || currentUser.status === 'deactivated') return false;
  if (isAdmin()) return true;

  if (Array.isArray(currentUser.permissions) && currentUser.permissions.length > 0) {
    if (currentUser.permissions.includes('*')) return true;
    if (currentUser.permissions.includes(viewId)) return true;
  }

  return getNavForRole(currentUser.role).some(item => item.id === viewId);
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
    renderAccessDenied(viewId);
    return;
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

function renderAccessDenied(viewId) {
  const area = document.getElementById('contentArea');
  if (!area) return;
  document.getElementById('topbarTitle').textContent = 'Access Denied';
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const allNav = [...ADMIN_NAV, ...HOMEOWNER_NAV, ...PRESIDENT_NAV, ...SECURITY_NAV, ...TREASURER_NAV, ...AUDITOR_NAV];
  const targetItem = allNav.find(n => n.id === viewId);
  const targetLabel = targetItem ? targetItem.label : viewId;
  const defaultView = getDefaultViewForRole(currentUser ? currentUser.role : 'homeowner');

  area.innerHTML = `
    <div class="access-denied-container">
      <div class="access-denied-card">
        <div class="access-denied-icon">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h2 class="access-denied-title">Access Denied</h2>
        <p class="access-denied-desc">
          You do not have permission to access the <strong>${escapeHtml(targetLabel)}</strong> module.
        </p>
        <p class="access-denied-subdesc">
          Your account access permissions are configured by the SmartHood administrator. If you require access to this section, please contact your HOA admin.
        </p>
        <button class="btn btn-primary" onclick="navigate('${defaultView}')" style="margin-top:16px;">
          Return to ${currentUser && currentUser.role === 'admin' ? 'Dashboard' : 'Authorized Area'}
        </button>
      </div>
    </div>
  `;
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
    'board':             renderBoardOfDirectorsManagement,
    'reports':           renderReports,
    'auditlog':          renderAuditLog,
    'users':             renderUserManagement,
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
    <div class="section-card-header">
      <div>
        <h3>Homeowner Balance Report</h3>
        <p style="font-size:0.8rem;color:var(--text-3);margin-top:2px;">Overview of resident account dues and payment clearance status.</p>
      </div>
      <div class="filters-row">
        <div class="search-box">
          <span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span>
          <input id="hoBalanceSearch" type="text" placeholder="Search homeowner or block..." oninput="filterHOBalanceReport()"/>
        </div>
        <select class="filter-select" id="hoBalanceStatusFilter" onchange="filterHOBalanceReport()">
          <option value="">All Statuses</option>
          <option value="due">With Balance</option>
          <option value="clear">Clear</option>
        </select>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>#</th><th>Name</th><th>Block/Lot</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody id="hoBalanceTableBody"></tbody>
        </table>
      </div>
    </div>
    <div id="hoBalancePagination"></div>
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

  hoBalancePaginationState.page = 1;
  currentHOBalanceFiltered = null;
  renderHOBalanceReportTable();
}

let hoBalancePaginationState = { page: 1, pageSize: 10 };
let currentHOBalanceFiltered = null;

function changeHOBalancePage(page) {
  hoBalancePaginationState.page = page;
  renderHOBalanceReportTable(currentHOBalanceFiltered, false);
}
window.changeHOBalancePage = changeHOBalancePage;

function changeHOBalancePageSize(size) {
  hoBalancePaginationState.pageSize = size;
  hoBalancePaginationState.page = 1;
  renderHOBalanceReportTable(currentHOBalanceFiltered, false);
}
window.changeHOBalancePageSize = changeHOBalancePageSize;

function renderHOBalanceReportTable(filtered = null, resetPage = false) {
  const tbody = document.getElementById('hoBalanceTableBody');
  if (!tbody) return;

  if (filtered !== null) {
    currentHOBalanceFiltered = filtered;
  } else if (currentHOBalanceFiltered === null) {
    currentHOBalanceFiltered = db.get('users').filter(u => u.role === 'homeowner');
  }
  const users = currentHOBalanceFiltered || [];

  if (resetPage) hoBalancePaginationState.page = 1;

  const totalItems = users.length;
  const pageSize = hoBalancePaginationState.pageSize || 10;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (hoBalancePaginationState.page > totalPages) hoBalancePaginationState.page = totalPages;
  if (hoBalancePaginationState.page < 1) hoBalancePaginationState.page = 1;

  if (!totalItems) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="no-results" style="padding:24px;"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-users"/></svg><p style="margin-top:6px;">No homeowners found matching your criteria.</p></div></td></tr>`;
    renderPaginationComponent({
      containerId: 'hoBalancePagination',
      currentPage: 1,
      pageSize,
      totalItems: 0,
      onPageChangeFn: 'changeHOBalancePage',
      onPageSizeChangeFn: 'changeHOBalancePageSize',
      itemLabel: 'homeowners',
    });
    return;
  }

  const startIndex = (hoBalancePaginationState.page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pageItems = users.slice(startIndex, endIndex);

  tbody.innerHTML = pageItems.map((u, i) => `
    <tr>
      <td>${startIndex + i + 1}</td>
      <td>
        <div class="homeowner-name-cell">
          ${avatarHTML(u, 'avatar-sm')}
          <strong>${escapeHtml(u.name)}</strong>
        </div>
      </td>
      <td>${escapeHtml(u.block || '—')}, ${escapeHtml(u.lot || '—')}</td>
      <td class="${(u.balance || 0) > 0 ? 'amount-due' : 'amount-paid'}">₱${(u.balance || 0).toLocaleString()}</td>
      <td>${(u.balance || 0) > 0 ? '<span class="badge badge-red">With Balance</span>' : '<span class="badge badge-green">Clear</span>'}</td>
    </tr>
  `).join('');

  renderPaginationComponent({
    containerId: 'hoBalancePagination',
    currentPage: hoBalancePaginationState.page,
    pageSize,
    totalItems,
    onPageChangeFn: 'changeHOBalancePage',
    onPageSizeChangeFn: 'changeHOBalancePageSize',
    itemLabel: 'homeowners',
  });
}

function filterHOBalanceReport() {
  const q = (document.getElementById('hoBalanceSearch')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('hoBalanceStatusFilter')?.value || '';

  let users = db.get('users').filter(u => u.role === 'homeowner');
  if (q) {
    users = users.filter(u =>
      (u.name || '').toLowerCase().includes(q)
      || (u.username || '').toLowerCase().includes(q)
      || (u.email || '').toLowerCase().includes(q)
      || (u.block || '').toLowerCase().includes(q)
      || (u.lot || '').toLowerCase().includes(q)
    );
  }
  if (statusFilter === 'due') {
    users = users.filter(u => (u.balance || 0) > 0);
  } else if (statusFilter === 'clear') {
    users = users.filter(u => (u.balance || 0) <= 0);
  }

  renderHOBalanceReportTable(users, true);
}
window.filterHOBalanceReport = filterHOBalanceReport;


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


// SECTION 14B: ADMIN — ACCOUNTS, ROLES & PERMISSIONS
// ════════════════════════════════════════════════════════════

function renderUserManagement() {
  const area = document.getElementById('contentArea');
  if (!area) return;

  const users = db.get('users');
  const activeCount = users.filter(u => (u.status || 'active') === 'active').length;
  const staffCount = users.filter(u => u.role !== 'homeowner').length;
  const hoCount = users.filter(u => u.role === 'homeowner').length;

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <h2>Accounts &amp; Permissions</h2>
      <p>Create accounts, customize module access permissions, and manage user status.</p>
    </div>
    <div class="page-header-actions">
      <button class="btn btn-primary" onclick="openCreateAccountModal()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px;vertical-align:-2px"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        New Account
      </button>
    </div>
  </div>

  <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 20px;">
    <div class="stat-card">
      <div class="stat-icon" style="background:var(--teal-50);color:var(--teal-600);"><svg width="22" height="22"><use href="#ico-users"/></svg></div>
      <div class="stat-value">${users.length}</div>
      <div class="stat-label">Total Accounts</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:#dcfce7;color:#16a34a;"><svg width="22" height="22"><use href="#ico-shield"/></svg></div>
      <div class="stat-value">${activeCount}</div>
      <div class="stat-label">Active Accounts</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:#e0f2fe;color:#0284c7;"><svg width="22" height="22"><use href="#ico-user"/></svg></div>
      <div class="stat-value">${staffCount}</div>
      <div class="stat-label">Staff / Admin Accounts</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:#fef3c7;color:#d97706;"><svg width="22" height="22"><use href="#ico-home"/></svg></div>
      <div class="stat-value">${hoCount}</div>
      <div class="stat-label">Homeowner Residents</div>
    </div>
  </div>

  <div class="section-card">
    <div class="section-card-header">
      <div class="filters-row">
        <div class="search-box">
          <span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span>
          <input id="userMgmtSearch" type="text" placeholder="Search by name, username, email, role..." oninput="filterUserManagementTable()"/>
        </div>
        <select class="filter-select" id="userRoleFilter" onchange="filterUserManagementTable()">
          <option value="">All Roles</option>
          <option value="admin">Administrator</option>
          <option value="president">President</option>
          <option value="treasurer">Treasurer</option>
          <option value="auditor">Auditor</option>
          <option value="security">Security Guard</option>
          <option value="staff">Staff Member</option>
          <option value="homeowner">Homeowner</option>
        </select>
        <select class="filter-select" id="userStatusFilter" onchange="filterUserManagementTable()">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </select>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>User</th>
              <th>Username / Email</th>
              <th>Role</th>
              <th>Assigned Permissions</th>
              <th>Status</th>
              <th style="text-align:right">Actions</th>
            </tr>
          </thead>
          <tbody id="userMgmtTableBody"></tbody>
        </table>
      </div>
    </div>
    <div id="userMgmtPagination"></div>
  </div>`;

  userMgmtPaginationState.page = 1;
  currentUserMgmtFilteredList = null;
  renderUserManagementRows();
}

let userMgmtPaginationState = { page: 1, pageSize: 10 };
let currentUserMgmtFilteredList = null;

function changeUserMgmtPage(page) {
  userMgmtPaginationState.page = page;
  renderUserManagementRows(currentUserMgmtFilteredList, false);
}
window.changeUserMgmtPage = changeUserMgmtPage;

function changeUserMgmtPageSize(size) {
  userMgmtPaginationState.pageSize = size;
  userMgmtPaginationState.page = 1;
  renderUserManagementRows(currentUserMgmtFilteredList, false);
}
window.changeUserMgmtPageSize = changeUserMgmtPageSize;

function renderUserManagementRows(filteredUsers = null, resetPage = false) {
  const tbody = document.getElementById('userMgmtTableBody');
  if (!tbody) return;

  if (filteredUsers !== null) {
    currentUserMgmtFilteredList = filteredUsers;
  } else if (currentUserMgmtFilteredList === null) {
    currentUserMgmtFilteredList = db.get('users');
  }
  const users = currentUserMgmtFilteredList || [];

  if (resetPage) userMgmtPaginationState.page = 1;

  const totalItems = users.length;
  const pageSize = userMgmtPaginationState.pageSize || 10;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (userMgmtPaginationState.page > totalPages) userMgmtPaginationState.page = totalPages;
  if (userMgmtPaginationState.page < 1) userMgmtPaginationState.page = 1;

  if (!totalItems) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="no-results" style="padding:30px;"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-users"/></svg><p style="margin-top:6px;">No accounts found matching your filters.</p></div></td></tr>`;
    renderPaginationComponent({
      containerId: 'userMgmtPagination',
      currentPage: 1,
      pageSize,
      totalItems: 0,
      onPageChangeFn: 'changeUserMgmtPage',
      onPageSizeChangeFn: 'changeUserMgmtPageSize',
      itemLabel: 'accounts',
    });
    return;
  }

  const roleColors = {
    admin: '#dc2626',
    president: '#177a80',
    treasurer: '#059669',
    auditor: '#7c3aed',
    security: '#d97706',
    staff: '#0284c7',
    homeowner: '#64748b',
  };

  const startIndex = (userMgmtPaginationState.page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pageItems = users.slice(startIndex, endIndex);

  tbody.innerHTML = pageItems.map((u, idx) => {
    const roleLabel = ROLE_LABELS[u.role] || u.role;
    const roleColor = roleColors[u.role] || '#177a80';
    const status = u.status || 'active';
    const isActive = status === 'active';
    const isPrimaryAdmin = u.id === 'u001';

    // Format permissions preview
    let permsHtml = '';
    if (u.role === 'admin') {
      permsHtml = '<span class="perm-pill" style="background:#16a34a18;color:#16a34a;border-color:#16a34a40;font-weight:700;">★ Full Access (All Modules)</span>';
    } else {
      const perms = Array.isArray(u.permissions) ? u.permissions : [];
      if (!perms.length) {
        permsHtml = '<span style="color:var(--text-3);font-size:0.75rem;font-style:italic;">No custom modules assigned</span>';
      } else {
        const visible = perms.slice(0, 3);
        const remaining = perms.length - 3;
        permsHtml = visible.map(pid => {
          const mod = MODULE_PERMISSIONS.find(m => m.id === pid);
          return `<span class="perm-pill">${escapeHtml(mod ? mod.label : pid)}</span>`;
        }).join('');
        if (remaining > 0) {
          permsHtml += `<span class="perm-pill" style="color:var(--teal-600);font-weight:700;">+${remaining} more</span>`;
        }
      }
    }

    return `
    <tr id="user-row-${u.id}">
      <td>${startIndex + idx + 1}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          ${avatarHTML(u, 'avatar-sm')}
          <div>
            <div style="font-weight:700;color:var(--text);font-size:0.88rem;">${escapeHtml(u.name)}</div>
            ${u.contact ? `<div style="font-size:0.75rem;color:var(--text-3);">${escapeHtml(u.contact)}</div>` : ''}
          </div>
        </div>
      </td>
      <td>
        <div style="font-size:0.84rem;font-weight:600;color:var(--text-2);">@${escapeHtml(u.username || '—')}</div>
        <div style="font-size:0.75rem;color:var(--text-3);">${escapeHtml(u.email || '—')}</div>
      </td>
      <td>
        <span class="badge" style="background:${roleColor}18;color:${roleColor};font-weight:700;padding:3px 8px;border-radius:12px;font-size:0.73rem;">
          ${escapeHtml(roleLabel)}
        </span>
      </td>
      <td>${permsHtml}</td>
      <td>
        <span class="${isActive ? 'badge-status-active' : 'badge-status-inactive'}">
          ● ${isActive ? 'Active' : 'Deactivated'}
        </span>
      </td>
      <td style="text-align:right;">
        <div class="td-actions" style="justify-content:flex-end;">
          <button class="btn btn-secondary btn-sm" onclick="openEditUserPermissionsModal('${u.id}')" title="Configure Permissions">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right:3px;vertical-align:-1px;"><path d="M21 2l-2 2m-2-2l2 2m7 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"></path></svg>
            Permissions
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openEditUserAccountModal('${u.id}')" title="Edit Profile">
            Edit
          </button>
          ${!isPrimaryAdmin ? `
            <button class="btn ${isActive ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="confirmToggleUserStatus('${u.id}')" title="${isActive ? 'Deactivate account' : 'Activate account'}">
              ${isActive ? 'Deactivate' : 'Activate'}
            </button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="confirmDeleteUserAccount('${u.id}')" title="Delete Account">
              <svg width="13" height="13"><use href="#ico-trash"/></svg>
            </button>
          ` : `
            <span style="font-size:0.72rem;color:var(--text-3);padding:0 6px;font-style:italic;">Protected</span>
          `}
        </div>
      </td>
    </tr>`;
  }).join('');

  renderPaginationComponent({
    containerId: 'userMgmtPagination',
    currentPage: userMgmtPaginationState.page,
    pageSize,
    totalItems,
    onPageChangeFn: 'changeUserMgmtPage',
    onPageSizeChangeFn: 'changeUserMgmtPageSize',
    itemLabel: 'accounts',
  });
}

function filterUserManagementTable() {
  const q = (document.getElementById('userMgmtSearch')?.value || '').toLowerCase().trim();
  const roleFilter = document.getElementById('userRoleFilter')?.value || '';
  const statusFilter = document.getElementById('userStatusFilter')?.value || '';

  let users = db.get('users');
  if (q) {
    users = users.filter(u =>
      (u.name || '').toLowerCase().includes(q)
      || (u.username || '').toLowerCase().includes(q)
      || (u.email || '').toLowerCase().includes(q)
      || (ROLE_LABELS[u.role] || '').toLowerCase().includes(q)
    );
  }
  if (roleFilter) {
    users = users.filter(u => u.role === roleFilter);
  }
  if (statusFilter) {
    users = users.filter(u => (u.status || 'active') === statusFilter);
  }

  renderUserManagementRows(users, true);
}

// ── Account Creation with Custom Permissions ──

function openCreateAccountModal() {
  openModal('Create New Account', `
    <div class="grid-2">
      <div class="form-group">
        <label>Full Name *</label>
        <input id="ca_name" placeholder="e.g. Maria Santos"/>
      </div>
      <div class="form-group">
        <label>Username *</label>
        <input id="ca_user" placeholder="e.g. mariasantos"/>
      </div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Email Address *</label>
        <input id="ca_email" type="email" placeholder="e.g. maria@example.com"/>
      </div>
      <div class="form-group">
        <label>Initial Password *</label>
        <input id="ca_pass" type="password" placeholder="Min. 6 characters"/>
      </div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>User Role *</label>
        <select id="ca_role" onchange="handleCreateAccountRoleChange()">
          <option value="staff" selected>Staff Member</option>
          <option value="admin">Administrator (Full Access)</option>
          <option value="president">President</option>
          <option value="treasurer">Treasurer</option>
          <option value="auditor">Auditor</option>
          <option value="security">Security Guard</option>
          <option value="homeowner">Homeowner / Resident</option>
        </select>
      </div>
      <div class="form-group">
        <label>Contact Number (Optional)</label>
        <input id="ca_contact" placeholder="e.g. 09171234567"/>
      </div>
    </div>

    <!-- Homeowner-specific inputs (hidden by default) -->
    <div id="ca_ho_fields" class="hidden">
      <div class="grid-2">
        <div class="form-group"><label>Block</label><input id="ca_block" placeholder="e.g. Block 2"/></div>
        <div class="form-group"><label>Lot</label><input id="ca_lot" placeholder="e.g. Lot 5"/></div>
      </div>
      <div class="form-group"><label>Lot Area (sqm)</label><input id="ca_lotArea" type="number" min="0" step="0.01" placeholder="e.g. 120"/></div>
    </div>

    <!-- Custom Permissions Checklist -->
    <div class="permissions-section-wrap" style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div>
          <label style="margin-bottom:2px;font-weight:700;font-size:0.92rem;color:var(--text);">Module Access Permissions</label>
          <div style="font-size:0.76rem;color:var(--text-3);">Select the modules this account is allowed to access and manage.</div>
        </div>
        <button type="button" class="btn btn-secondary btn-xs" id="btnSelectAllPerms" onclick="toggleSelectAllPermissions('ca_perms_grid', this)">
          Select All
        </button>
      </div>

      <div id="ca_admin_notice" class="hidden" style="background:var(--teal-50);border:1px solid var(--teal-500);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:0.82rem;color:var(--teal-800);font-weight:600;">
        ★ Administrator role has unrestricted access to all current and future modules.
      </div>

      <div class="permission-grid" id="ca_perms_grid">
        ${MODULE_PERMISSIONS.map(p => `
          <label class="permission-card" for="perm_${p.id}">
            <input type="checkbox" id="perm_${p.id}" value="${p.id}" class="perm-checkbox" onchange="updatePermissionCardState(this)" />
            <div class="permission-info">
              <div class="permission-title">
                <svg width="14" height="14" style="margin-right:4px;vertical-align:-2px;"><use href="#${p.icon}"/></svg>
                ${escapeHtml(p.label)}
              </div>
              <div class="permission-desc">${escapeHtml(p.desc)}</div>
            </div>
          </label>
        `).join('')}
      </div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Create Account', cls: 'btn-primary', action: saveCreateAccount },
  ]);

  // Default preselection for staff
  handleCreateAccountRoleChange();
}

function handleCreateAccountRoleChange() {
  const role = document.getElementById('ca_role')?.value;
  const hoFields = document.getElementById('ca_ho_fields');
  const adminNotice = document.getElementById('ca_admin_notice');
  const grid = document.getElementById('ca_perms_grid');
  const btnSelectAll = document.getElementById('btnSelectAllPerms');
  if (!role) return;

  if (hoFields) hoFields.classList.toggle('hidden', role !== 'homeowner');

  const checkboxes = document.querySelectorAll('#ca_perms_grid .perm-checkbox');

  if (role === 'admin') {
    if (adminNotice) adminNotice.classList.remove('hidden');
    if (btnSelectAll) btnSelectAll.disabled = true;
    checkboxes.forEach(cb => {
      cb.checked = true;
      cb.disabled = true;
      updatePermissionCardState(cb);
    });
    return;
  }

  if (adminNotice) adminNotice.classList.add('hidden');
  if (btnSelectAll) btnSelectAll.disabled = false;
  checkboxes.forEach(cb => { cb.disabled = false; });

  // Recommended role defaults
  const roleDefaults = {
    staff: ['dashboard', 'announcements', 'complaints'],
    president: ['complaints', 'announcements'],
    treasurer: ['payments', 'reports'],
    auditor: ['billing', 'reports'],
    security: ['complaints', 'vehicles', 'lostfound'],
    homeowner: ['announcements', 'lostfound'],
  };

  const defaults = roleDefaults[role] || ['dashboard'];
  checkboxes.forEach(cb => {
    cb.checked = defaults.includes(cb.value);
    updatePermissionCardState(cb);
  });
}

function updatePermissionCardState(checkbox) {
  const card = checkbox.closest('.permission-card');
  if (card) {
    card.classList.toggle('selected', checkbox.checked);
  }
}

function toggleSelectAllPermissions(containerId, buttonEl) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const checkboxes = Array.from(container.querySelectorAll('.perm-checkbox:not(:disabled)'));
  if (!checkboxes.length) return;

  const allChecked = checkboxes.every(cb => cb.checked);
  checkboxes.forEach(cb => {
    cb.checked = !allChecked;
    updatePermissionCardState(cb);
  });

  if (buttonEl) {
    buttonEl.textContent = allChecked ? 'Select All' : 'Deselect All';
  }
}

async function saveCreateAccount() {
  const name = (document.getElementById('ca_name')?.value || '').trim();
  const username = (document.getElementById('ca_user')?.value || '').trim().toLowerCase();
  const email = (document.getElementById('ca_email')?.value || '').trim();
  const password = (document.getElementById('ca_pass')?.value || '').trim();
  const role = document.getElementById('ca_role')?.value;
  const contact = (document.getElementById('ca_contact')?.value || '').trim();

  if (!name || !username || !email || !password) {
    showToast('error', 'Missing Fields', 'Please fill in Name, Username, Email, and Password.');
    return;
  }
  if (password.length < 6) {
    showToast('error', 'Weak Password', 'Password must be at least 6 characters.');
    return;
  }

  const existingUser = db.get('users').find(u => (u.username || '').toLowerCase() === username);
  if (existingUser) {
    showToast('error', 'Username Taken', 'That username is already registered. Please choose another.');
    return;
  }

  // Collect selected permissions
  let permissions = [];
  if (role === 'admin') {
    permissions = ['*'];
  } else {
    document.querySelectorAll('#ca_perms_grid .perm-checkbox:checked').forEach(cb => {
      permissions.push(cb.value);
    });
  }

  const newUser = {
    id: db.newId('u'),
    name,
    username,
    email,
    password,
    role,
    contact: contact || null,
    permissions,
    status: 'active',
    balance: 0,
    profile_photo: null,
  };

  if (role === 'homeowner') {
    newUser.block = formatLocationPart(document.getElementById('ca_block')?.value, 'Block');
    newUser.lot = formatLocationPart(document.getElementById('ca_lot')?.value, 'Lot');
    const lotAreaVal = document.getElementById('ca_lotArea')?.value;
    newUser.lotArea = lotAreaVal ? Number(lotAreaVal) : 0;
  }

  showLoading();
  try {
    await db.save('users', newUser);
    logAction(`Created account: "${name}" (@${username}) with role: ${role}`);
    closeModal();
    hideLoading();
    showToast('success', 'Account Created', `Account for ${name} has been created.`);
    renderUserManagement();
  } catch (err) {
    hideLoading();
    showToast('error', 'Failed', err.message || 'Could not create account.');
  }
}

// ── Edit User Permissions Modal ──

function openEditUserPermissionsModal(userId) {
  const u = db.getOne('users', userId);
  if (!u) return;

  const isPrimaryAdmin = u.id === 'u001';
  const roleLabel = ROLE_LABELS[u.role] || u.role;
  const currentPerms = Array.isArray(u.permissions) ? u.permissions : [];
  const hasWildcard = currentPerms.includes('*') || u.role === 'admin';

  openModal(`Permissions: ${escapeHtml(u.name)}`, `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
      ${avatarHTML(u, 'avatar-md')}
      <div style="flex:1;">
        <div style="font-weight:700;font-size:1rem;color:var(--text);">${escapeHtml(u.name)}</div>
        <div style="font-size:0.8rem;color:var(--text-3);">@${escapeHtml(u.username)} &bull; ${escapeHtml(u.email)}</div>
        <div style="margin-top:4px;">
          <span class="badge badge-teal" style="font-size:0.72rem;font-weight:700;">${escapeHtml(roleLabel)}</span>
          <span class="${(u.status || 'active') === 'active' ? 'badge-status-active' : 'badge-status-inactive'}" style="margin-left:6px;">
            ● ${(u.status || 'active') === 'active' ? 'Active' : 'Deactivated'}
          </span>
        </div>
      </div>
    </div>

    ${isPrimaryAdmin ? `
      <div style="background:#16a34a12;border:1px solid #16a34a40;border-radius:8px;padding:12px 16px;margin-bottom:16px;color:#16a34a;font-size:0.85rem;font-weight:600;">
        ★ Primary Administrator has unrestricted full access to all system modules and features.
      </div>
    ` : `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <label style="margin-bottom:0;font-weight:700;font-size:0.88rem;color:var(--text);">Configure Module Permissions</label>
        <button type="button" class="btn btn-secondary btn-xs" id="btnEditSelectAll" onclick="toggleSelectAllPermissions('edit_perms_grid', this)">
          ${MODULE_PERMISSIONS.every(p => currentPerms.includes(p.id) || hasWildcard) ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div class="permission-grid" id="edit_perms_grid">
        ${MODULE_PERMISSIONS.map(p => {
          const isChecked = hasWildcard || currentPerms.includes(p.id);
          return `
            <label class="permission-card ${isChecked ? 'selected' : ''}" for="edit_perm_${p.id}">
              <input type="checkbox" id="edit_perm_${p.id}" value="${p.id}" class="perm-checkbox" ${isChecked ? 'checked' : ''} onchange="updatePermissionCardState(this)" />
              <div class="permission-info">
                <div class="permission-title">
                  <svg width="14" height="14" style="margin-right:4px;vertical-align:-2px;"><use href="#${p.icon}"/></svg>
                  ${escapeHtml(p.label)}
                </div>
                <div class="permission-desc">${escapeHtml(p.desc)}</div>
              </div>
            </label>
          `;
        }).join('')}
      </div>
    `}
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    ...(!isPrimaryAdmin ? [
      { label: 'Save Permissions', cls: 'btn-primary', action: () => saveEditUserPermissions(userId) }
    ] : [])
  ]);
}

async function saveEditUserPermissions(userId) {
  const u = db.getOne('users', userId);
  if (!u) return;

  const newPermissions = [];
  document.querySelectorAll('#edit_perms_grid .perm-checkbox:checked').forEach(cb => {
    newPermissions.push(cb.value);
  });

  u.permissions = newPermissions;

  showLoading();
  try {
    await db.save('users', u);
    logAction(`Updated permissions for user: ${u.name} (@${u.username})`);

    // If updating current user's permissions, refresh sidebar immediately
    if (currentUser && currentUser.id === u.id) {
      currentUser.permissions = newPermissions;
      buildSidebar();
    }

    closeModal();
    hideLoading();
    showToast('success', 'Permissions Updated', `Permissions saved for ${u.name}.`);
    renderUserManagement();
  } catch (err) {
    hideLoading();
    showToast('error', 'Failed', err.message || 'Could not update permissions.');
  }
}

// ── Edit User Account Details Modal ──

function openEditUserAccountModal(userId) {
  const u = db.getOne('users', userId);
  if (!u) return;

  const isHomeowner = u.role === 'homeowner';

  openModal(`Edit Account: ${escapeHtml(u.name)}`, `
    <div class="grid-2">
      <div class="form-group">
        <label>Full Name *</label>
        <input id="ea_name" value="${escapeHtml(u.name)}"/>
      </div>
      <div class="form-group">
        <label>Username</label>
        <input id="ea_user" value="${escapeHtml(u.username || '')}" ${u.id === 'u001' ? 'disabled' : ''}/>
      </div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Email Address</label>
        <input id="ea_email" type="email" value="${escapeHtml(u.email || '')}"/>
      </div>
      <div class="form-group">
        <label>Contact Number</label>
        <input id="ea_contact" value="${escapeHtml(u.contact || '')}"/>
      </div>
    </div>

    ${isHomeowner ? `
      <div class="grid-2">
        <div class="form-group"><label>Block</label><input id="ea_block" value="${escapeHtml(u.block || '')}"/></div>
        <div class="form-group"><label>Lot</label><input id="ea_lot" value="${escapeHtml(u.lot || '')}"/></div>
      </div>
      <div class="form-group"><label>Lot Area (sqm)</label><input id="ea_lotArea" type="number" step="0.01" value="${u.lotArea || 0}"/></div>
    ` : ''}

    <div class="form-group" style="margin-top:10px;border-top:1px solid var(--border);padding-top:12px;">
      <label>Change Password (Leave blank to keep current)</label>
      <input id="ea_newpass" type="password" placeholder="New password (min. 6 characters)..."/>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Save Changes', cls: 'btn-primary', action: () => saveEditUserAccount(userId) },
  ]);
}

async function saveEditUserAccount(userId) {
  const u = db.getOne('users', userId);
  if (!u) return;

  const name = (document.getElementById('ea_name')?.value || '').trim();
  const username = (document.getElementById('ea_user')?.value || '').trim().toLowerCase();
  const email = (document.getElementById('ea_email')?.value || '').trim();
  const contact = (document.getElementById('ea_contact')?.value || '').trim();
  const newPass = (document.getElementById('ea_newpass')?.value || '').trim();

  if (!name) {
    showToast('error', 'Missing Name', 'Full name cannot be empty.');
    return;
  }

  // Check username uniqueness if changed
  if (username && username !== (u.username || '').toLowerCase()) {
    const duplicate = db.get('users').find(x => x.id !== userId && (x.username || '').toLowerCase() === username);
    if (duplicate) {
      showToast('error', 'Username Taken', 'That username is already taken by another account.');
      return;
    }
    u.username = username;
  }

  if (newPass) {
    if (newPass.length < 6) {
      showToast('error', 'Weak Password', 'New password must be at least 6 characters.');
      return;
    }
    u.password = newPass;
  }

  u.name = name;
  u.email = email;
  u.contact = contact;

  if (u.role === 'homeowner') {
    u.block = formatLocationPart(document.getElementById('ea_block')?.value, 'Block');
    u.lot = formatLocationPart(document.getElementById('ea_lot')?.value, 'Lot');
    const lotAreaVal = document.getElementById('ea_lotArea')?.value;
    u.lotArea = lotAreaVal ? Number(lotAreaVal) : 0;
  }

  showLoading();
  try {
    await db.save('users', u);
    logAction(`Updated account profile: ${u.name}`);

    if (currentUser && currentUser.id === u.id) {
      currentUser.name = u.name;
      currentUser.email = u.email;
      buildSidebar();
    }

    closeModal();
    hideLoading();
    showToast('success', 'Profile Saved', `Account for ${u.name} updated.`);
    renderUserManagement();
  } catch (err) {
    hideLoading();
    showToast('error', 'Failed', err.message || 'Could not update account.');
  }
}

// ── Activate / Deactivate Account Status ──

function confirmToggleUserStatus(userId) {
  const u = db.getOne('users', userId);
  if (!u) return;

  if (u.id === 'u001') {
    showToast('error', 'Protected Account', 'The primary administrator account cannot be deactivated.');
    return;
  }

  const isCurrentlyActive = (u.status || 'active') === 'active';
  const targetAction = isCurrentlyActive ? 'deactivate' : 'activate';
  const title = isCurrentlyActive ? 'Deactivate Account?' : 'Activate Account?';
  const message = isCurrentlyActive
    ? `Are you sure you want to deactivate <strong>${escapeHtml(u.name)}</strong> (@${escapeHtml(u.username)})?<br/><br/><span style="color:var(--red-600);font-size:0.84rem;">The user will be immediately blocked from logging in and accessing the system.</span>`
    : `Are you sure you want to reactivate <strong>${escapeHtml(u.name)}</strong> (@${escapeHtml(u.username)})?<br/><br/>The user will regain login access with their assigned permissions.`;

  openModal(title, `<p style="color:var(--text-2);line-height:1.6">${message}</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    {
      label: isCurrentlyActive ? 'Deactivate Account' : 'Activate Account',
      cls: isCurrentlyActive ? 'btn-danger' : 'btn-primary',
      action: async () => {
        closeModal();
        showLoading();
        try {
          u.status = isCurrentlyActive ? 'inactive' : 'active';
          await db.save('users', u);
          logAction(`${isCurrentlyActive ? 'Deactivated' : 'Activated'} user account: ${u.name}`);
          hideLoading();
          showToast('success', isCurrentlyActive ? 'Account Deactivated' : 'Account Activated', `${u.name} is now ${u.status}.`);
          renderUserManagement();
        } catch (err) {
          hideLoading();
          showToast('error', 'Failed', err.message || 'Could not update account status.');
        }
      }
    }
  ]);
}

// ── Delete Account with Confirmation ──

function confirmDeleteUserAccount(userId) {
  const u = db.getOne('users', userId);
  if (!u) return;

  if (u.id === 'u001') {
    showToast('error', 'Protected Account', 'The primary administrator account cannot be deleted.');
    return;
  }

  openModal('Delete User Account?', `
    <p style="color:var(--text-2);line-height:1.6">
      Are you sure you want to permanently delete <strong>${escapeHtml(u.name)}</strong> (@${escapeHtml(u.username)})?
    </p>
    <p style="color:var(--red-600);font-size:0.83rem;margin-top:8px;">
      This action cannot be undone. All associated account permissions and profile data will be permanently removed.
    </p>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    {
      label: 'Delete Account',
      cls: 'btn-danger',
      action: async () => {
        closeModal();
        showLoading();
        try {
          await db.delete('users', userId);
          logAction(`Deleted user account: ${u.name} (@${u.username})`);
          hideLoading();
          showToast('success', 'Account Deleted', `Account for ${u.name} has been removed.`);
          renderUserManagement();
        } catch (err) {
          hideLoading();
          showToast('error', 'Failed', err.message || 'Could not delete account.');
        }
      }
    }
  ]);
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
  const mapping = { hero: 0, announcements: 1, lostfound: 2, board: 3, about: 4, contact: 5 };
  const links = document.querySelectorAll('.pub-nav-link');
  const idx = mapping[sectionId];
  if (idx !== undefined && links[idx]) links[idx].classList.add('active');
}

function togglePubNav() {
  const mn = document.getElementById('pubMobileNav');
  if (mn) mn.classList.toggle('hidden');
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
  renderPublicBoardOfDirectors();
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


async function init() {
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
    if (window.location.hash) {
      const hashSec = window.location.hash.replace('#', '');
      const el = document.getElementById(hashSec);
      if (el) {
        const offset = 72;
        const y = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: y, behavior: 'instant' });
      }
      pubScrollTo(null, hashSec);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
