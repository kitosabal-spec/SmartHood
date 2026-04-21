/* ═══════════════════════════════════════════════
   SAN ALFONSO HOMES — MANAGEMENT SYSTEM
   script.js — Complete Application Logic
═══════════════════════════════════════════════ */

'use strict';

// ════════════════════════════════════════════════
// SECTION 1: STATE & CONSTANTS
// ════════════════════════════════════════════════

let currentUser = null;
let currentRole = 'admin';
let currentView = 'dashboard';
let notifications = [];

const ROLES = { ADMIN: 'admin', HOMEOWNER: 'homeowner' };

const ADMIN_NAV = [
  { id: 'dashboard',      icon: 'ico-dashboard',  label: 'Dashboard',       section: 'MAIN' },
  { id: 'homeowners',     icon: 'ico-users',      label: 'Homeowners',      section: 'MAIN' },
  { id: 'billing',        icon: 'ico-file',       label: 'Billing',         section: 'MANAGEMENT' },
  { id: 'payments',       icon: 'ico-credit',     label: 'Payments',        section: 'MANAGEMENT' },
  { id: 'announcements',  icon: 'ico-megaphone',  label: 'Announcements',   section: 'MANAGEMENT' },
  { id: 'reports',        icon: 'ico-chart',      label: 'Reports',         section: 'ANALYTICS' },
  { id: 'auditlog',       icon: 'ico-log',        label: 'Audit Log',       section: 'ANALYTICS' },
  { id: 'settings',       icon: 'ico-settings',   label: 'Settings',        section: 'SYSTEM' },
];

const HOMEOWNER_NAV = [
  { id: 'ho-dashboard',     icon: 'ico-dashboard',  label: 'Dashboard',       section: 'MAIN' },
  { id: 'ho-billing',       icon: 'ico-file',       label: 'My Bills',        section: 'ACCOUNT' },
  { id: 'ho-payments',      icon: 'ico-upload',     label: 'Submit Payment',  section: 'ACCOUNT' },
  { id: 'ho-history',       icon: 'ico-history',    label: 'Payment History', section: 'ACCOUNT' },
  { id: 'ho-announcements', icon: 'ico-megaphone',  label: 'Announcements',   section: 'INFO' },
  { id: 'ho-profile',       icon: 'ico-user',       label: 'My Profile',      section: 'ACCOUNT' },
];

// ════════════════════════════════════════════════
// SECTION 2: SEED DATA
// ════════════════════════════════════════════════

function seedData() {
  if (!localStorage.getItem('sah_seeded')) {
    const users = [
      { id: 'u001', username: 'admin', password: 'admin123', role: 'admin', name: 'Maria Santos', email: 'admin@sanalfonsoHomes.com' },
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
    db.set('auditLog', auditLog);
    localStorage.setItem('sah_seeded', '1');
  }
}

// ════════════════════════════════════════════════
// SECTION 3: DATABASE (localStorage wrapper)
// ════════════════════════════════════════════════

const db = {
  get(key) {
    try { return JSON.parse(localStorage.getItem('sah_' + key)) || []; }
    catch { return []; }
  },
  set(key, val) {
    localStorage.setItem('sah_' + key, JSON.stringify(val));
  },
  getOne(key, id) {
    return this.get(key).find(x => x.id === id);
  },
  save(key, item) {
    const arr = this.get(key);
    const idx = arr.findIndex(x => x.id === item.id);
    if (idx >= 0) arr[idx] = item; else arr.push(item);
    this.set(key, arr);
  },
  delete(key, id) {
    this.set(key, this.get(key).filter(x => x.id !== id));
  },
  newId(prefix) {
    return prefix + Date.now().toString(36).toUpperCase();
  }
};

// ════════════════════════════════════════════════
// SECTION 4: AUTH
// ════════════════════════════════════════════════

function selectRole(role) {
  currentRole = role;
  document.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-role="${role}"]`).classList.add('active');
}

function handleLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value.trim();
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.classList.add('hidden');

  if (!username || !password) {
    showLoginError('Please enter both username and password.');
    return;
  }

  showLoading();
  setTimeout(() => {
    const users = db.get('users');
    const user = users.find(u => u.username === username && u.password === password && u.role === currentRole);
    hideLoading();
    if (!user) {
      showLoginError('Invalid credentials or wrong role selected.');
      return;
    }
    currentUser = user;
    localStorage.setItem('sah_session', JSON.stringify({ id: user.id, role: user.role }));
    // Hide landing page & login modal
    closeLoginModal();
    document.getElementById('landingPage').classList.add('hidden');
    initApp();
  }, 700);
}

// handleLogout defined in Section 21

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

// ════════════════════════════════════════════════
// SECTION 5: APP INIT & NAV
// ════════════════════════════════════════════════

function initApp() {
  const landing = document.getElementById('landingPage');
  if (landing) landing.classList.add('hidden');
  const loginModal = document.getElementById('loginModal');
  if (loginModal) loginModal.classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.body.style.overflow = '';
  buildSidebar();
  setupSidebarOverlay();
  const defaultView = currentUser.role === 'admin' ? 'dashboard' : 'ho-dashboard';
  navigate(defaultView);
  updateNotifBadge();
}

function buildSidebar() {
  const nav = currentUser.role === 'admin' ? ADMIN_NAV : HOMEOWNER_NAV;
  const initials = currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  document.getElementById('sidebarAvatar').textContent = initials;
  document.getElementById('topbarAvatar').textContent = initials;
  document.getElementById('sidebarName').textContent = currentUser.name;
  document.getElementById('sidebarRole').textContent = currentUser.role === 'admin' ? 'Administrator' : 'Homeowner';

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
    el.innerHTML = `<span class="nav-icon"><svg width="17" height="17"><use href="#${item.icon}"/></svg></span><span>${item.label}</span>`;
    el.addEventListener('click', () => navigate(item.id));
    navEl.appendChild(el);
  });
}

function navigate(viewId) {
  currentView = viewId;
  // Update active nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewId);
  });
  // Update topbar title
  const allNav = [...ADMIN_NAV, ...HOMEOWNER_NAV];
  const navItem = allNav.find(n => n.id === viewId);
  document.getElementById('topbarTitle').textContent = navItem ? navItem.label : 'Dashboard';
  // Render view
  renderView(viewId);
  // Close sidebar on mobile
  if (window.innerWidth <= 900) closeSidebar();
  // Close notif panel
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
    'announcements':     renderAnnouncements,
    'reports':           renderReports,
    'auditlog':          renderAuditLog,
    'settings':          renderSettings,
    'ho-dashboard':      renderHODashboard,
    'ho-billing':        renderHOBilling,
    'ho-payments':       renderHOPayments,
    'ho-history':        renderHOHistory,
    'ho-announcements':  renderHOAnnouncements,
    'ho-profile':        renderHOProfile,
  };
  if (renders[viewId]) renders[viewId]();
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

// ════════════════════════════════════════════════
// SECTION 6: ADMIN — DASHBOARD
// ════════════════════════════════════════════════

function renderAdminDashboard() {
  const homeowners = db.get('users').filter(u => u.role === 'homeowner');
  const payments = db.get('payments');
  const approved = payments.filter(p => p.status === 'approved');
  const pending  = payments.filter(p => p.status === 'pending');
  const totalCollected = approved.reduce((s, p) => s + p.amount, 0);
  const billings = db.get('billings');
  const area = document.getElementById('contentArea');

  // Monthly revenue (fake monthly groupings)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const monthlyData = months.map((m, i) => {
    const base = [12000, 9500, 14500, 11000, 8500, 13000][i];
    return { m, v: base };
  });
  const maxMonthly = Math.max(...monthlyData.map(d => d.v));

  const paidCount = approved.length;
  const totalBillingCount = billings.reduce((s, b) => s + b.assignedTo.length, 0);

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
    <div class="stat-card" style="--card-accent:#eab308;--card-accent-bg:#fef9c3">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-clock"/></svg></div>
      <div class="stat-value">${pending.length}</div>
      <div class="stat-label">Pending Approvals</div>
    </div>
    <div class="stat-card" style="--card-accent:#d97706;--card-accent-bg:#fef3c7">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-file"/></svg></div>
      <div class="stat-value">${billings.length}</div>
      <div class="stat-label">Active Billings</div>
    </div>
  </div>

  <div class="charts-row">
    <div class="chart-card" style="grid-column: span 2">
      <h4>Monthly Revenue (2025)</h4>
      <div class="chart-bars" id="barChart"></div>
      <div style="display:flex;gap:8px;margin-top:6px">
        ${monthlyData.map(d => `<div style="flex:1;text-align:center;font-size:0.72rem;color:var(--text-3)">${d.m}</div>`).join('')}
      </div>
    </div>
    <div class="chart-card">
      <h4>Payment Status</h4>
      <div class="donut-wrap" id="donutChart"></div>
      <div class="donut-legend">
        <div class="legend-item"><div class="legend-dot" style="background:#16a34a"></div> Approved (${paidCount})</div>
        <div class="legend-item"><div class="legend-dot" style="background:#eab308"></div> Pending (${pending.length})</div>
        <div class="legend-item"><div class="legend-dot" style="background:#dc2626"></div> Rejected (${payments.filter(p=>p.status==='rejected').length})</div>
      </div>
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
      <div class="section-card-header"><div><h3>Recent Announcements</h3><p>Latest posts</p></div></div>
      <div id="recentAnnouncements" style="padding:8px 0"></div>
    </div>
  </div>`;

  // Render bar chart
  const barWrap = document.getElementById('barChart');
  monthlyData.forEach(d => {
    const pct = (d.v / maxMonthly) * 100;
    barWrap.innerHTML += `
      <div class="chart-bar-wrap">
        <div class="chart-bar" style="height:${pct}%;background:linear-gradient(180deg,#2271c3,#4a90d9)" data-val="₱${d.v.toLocaleString()}"></div>
      </div>`;
  });

  // Donut chart
  const total = paidCount + pending.length + payments.filter(p=>p.status==='rejected').length || 1;
  renderDonut('donutChart', [
    { value: paidCount, color: '#16a34a' },
    { value: pending.length, color: '#eab308' },
    { value: payments.filter(p=>p.status==='rejected').length, color: '#dc2626' },
  ], total, 'Total', total);

  // Recent payments table
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

  // Recent announcements
  const annWrap = document.getElementById('recentAnnouncements');
  db.get('announcements').slice(-3).reverse().forEach(a => {
    annWrap.innerHTML += `
      <div style="padding:12px 22px;border-bottom:1px solid var(--border)">
        <div style="font-weight:600;font-size:0.88rem;color:var(--text)">${a.title} ${a.urgent ? '<span class="badge badge-red">Urgent</span>' : ''}</div>
        <div style="font-size:0.78rem;color:var(--text-3);margin-top:3px">${a.date} · ${a.category}</div>
      </div>`;
  });
}

function renderDonut(containerId, segments, total, centerLabel, centerVal) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const r = 54, cx = 70, cy = 70;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  let paths = '';
  segments.forEach(seg => {
    const frac = total > 0 ? seg.value / total : 0;
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

// ════════════════════════════════════════════════
// SECTION 7: ADMIN — HOMEOWNERS
// ════════════════════════════════════════════════

function renderHomeowners() {
  const area = document.getElementById('contentArea');
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
          <option value="Block 1">Block 1</option>
          <option value="Block 2">Block 2</option>
          <option value="Block 3">Block 3</option>
          <option value="Block 4">Block 4</option>
        </select>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>#</th><th>Name</th><th>Block / Lot</th><th>Contact</th><th>Email</th><th>Balance</th><th>Actions</th></tr></thead>
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
  if (!users.length) { tbody.innerHTML = `<tr><td colspan="7"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-users"/></svg>No homeowners found.</div></td></tr>`; return; }
  tbody.innerHTML = users.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${u.name}</strong></td>
      <td>${u.block || '—'}, ${u.lot || '—'}</td>
      <td>${u.contact || '—'}</td>
      <td>${u.email}</td>
      <td class="${(u.balance||0) > 0 ? 'amount-due' : 'amount-paid'}">₱${(u.balance||0).toLocaleString()}</td>
      <td><div class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="openViewHO('${u.id}')">View</button>
        <button class="btn btn-secondary btn-sm" onclick="openEditHO('${u.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteHO('${u.id}')">Del</button>
      </div></td>
    </tr>`).join('');
}

function filterHomeowners() {
  const q = (document.getElementById('hoSearch')?.value || '').toLowerCase();
  const blk = document.getElementById('hoFilter')?.value || '';
  let users = db.get('users').filter(u => u.role === 'homeowner');
  if (q) users = users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.block||'').toLowerCase().includes(q));
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
      <div class="form-group"><label>Block</label><input id="f_block" placeholder="e.g. Block 3"/></div>
      <div class="form-group"><label>Lot</label><input id="f_lot" placeholder="e.g. Lot 7"/></div>
    </div>
    <div class="form-group"><label>Contact Number</label><input id="f_contact" placeholder="e.g. 09171234567"/></div>
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
  const newUser = {
    id: db.newId('u'),
    username, password, role: 'homeowner', name, email,
    block: document.getElementById('f_block').value.trim(),
    lot: document.getElementById('f_lot').value.trim(),
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
  openModal(`Profile: ${u.name}`, `
    <div class="profile-card" style="margin-bottom:16px">
      <div class="profile-avatar-big">${u.name.split(' ').map(n=>n[0]).join('').substring(0,2)}</div>
      <div class="profile-info"><h3>${u.name}</h3><p>${u.email}</p><p>${u.block||''} ${u.lot||''}</p></div>
    </div>
    <div class="grid-2">
      <div class="report-summary-item"><div class="r-val">${billings.length}</div><div class="r-lbl">Bills Assigned</div></div>
      <div class="report-summary-item"><div class="r-val">${payments.filter(p=>p.status==='approved').length}</div><div class="r-lbl">Approved Payments</div></div>
    </div>
    <p style="margin-top:14px;font-size:0.85rem;color:var(--text-3)">Contact: ${u.contact||'N/A'} · Balance: <strong style="color:var(--red-600)">₱${(u.balance||0).toLocaleString()}</strong></p>
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
    { label: 'Save Changes', cls: 'btn-primary', action: () => saveEditHO(id) },
  ]);
}

function saveEditHO(id) {
  const u = db.getOne('users', id);
  if (!u) return;
  u.name = document.getElementById('e_name').value.trim() || u.name;
  u.email = document.getElementById('e_email').value.trim() || u.email;
  u.block = document.getElementById('e_block').value.trim();
  u.lot = document.getElementById('e_lot').value.trim();
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

// ════════════════════════════════════════════════
// SECTION 8: ADMIN — BILLING
// ════════════════════════════════════════════════

function renderBilling() {
  const billings = db.get('billings');
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Billing Management</h2><p>Create and manage billing records for homeowners.</p></div>
    <div class="page-header-actions">
      <button class="btn btn-secondary" onclick="autoGenerateMonthlyDues()">Auto-Generate Dues</button>
      <button class="btn btn-primary" onclick="openAddBillingModal()">Create Billing</button>
    </div>
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
  const today = new Date().toISOString().split('T')[0];
  if (!billings.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-file"/></svg>No billings found.</div></td></tr>`; return; }
  tbody.innerHTML = billings.map(b => {
    const overdue = b.dueDate < today;
    return `<tr class="${overdue ? 'overdue-row' : ''}">
      <td><strong>${b.title}</strong>${overdue ? ' <span class="badge badge-red">Overdue</span>' : ''}</td>
      <td class="amount-due">₱${b.amount.toLocaleString()}</td>
      <td>${b.dueDate}</td>
      <td>${b.assignedTo.length} homeowner(s)</td>
      <td>${badgeHtml(b.status === 'active' ? 'active' : 'inactive')}</td>
      <td><div class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="viewBillingDetail('${b.id}')">View</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteBilling('${b.id}')">Del</button>
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

function saveAddBilling() {
  const title = document.getElementById('bf_title').value.trim();
  const amount = parseFloat(document.getElementById('bf_amount').value);
  const due = document.getElementById('bf_due').value;
  if (!title || isNaN(amount) || !due) { showToast('error', 'Missing Fields', 'Fill all required fields.'); return; }
  const checked = [...document.querySelectorAll('.ho-cb:checked')].map(c => c.value);
  if (!checked.length) { showToast('error', 'No Assignment', 'Select at least one homeowner.'); return; }
  const bill = {
    id: db.newId('b'),
    title, amount, dueDate: due,
    description: document.getElementById('bf_desc').value.trim(),
    assignedTo: checked, status: 'active',
    createdAt: new Date().toISOString().split('T')[0],
  };
  db.save('billings', bill);
  logAction(`Created billing: ${title} for ${checked.length} homeowner(s)`);
  addNotification('New Billing Created', `"${title}" assigned to ${checked.length} homeowner(s).`);
  closeModal();
  showToast('success', 'Billing Created', `"${title}" has been created.`);
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
      ${assignedNames.map(n => `<div style="padding:6px 0;font-size:0.88rem;border-bottom:1px solid var(--border);color:var(--text-2)">• ${n}</div>`).join('')}
    </div>
  `, [{ label: 'Close', cls: 'btn-secondary', action: closeModal }]);
}

function confirmDeleteBilling(id) {
  const b = db.getOne('billings', id);
  if (!b) return;
  openModal('Delete Billing', `<p>Delete <strong>${b.title}</strong>? This cannot be undone.</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Delete', cls: 'btn-danger', action: () => { db.delete('billings', id); logAction(`Deleted billing: ${b.title}`); closeModal(); showToast('success', 'Deleted', 'Billing removed.'); renderBilling(); } },
  ]);
}

function autoGenerateMonthlyDues() {
  const month = new Date().toLocaleString('default', { month: 'long' });
  const year = new Date().getFullYear();
  const title = `Monthly Dues – ${month} ${year}`;
  const homeowners = db.get('users').filter(u => u.role === 'homeowner');
  const existing = db.get('billings').find(b => b.title === title);
  if (existing) { showToast('warning', 'Already Exists', `Dues for ${month} already created.`); return; }
  const lastDay = new Date(year, new Date().getMonth() + 1, 0).toISOString().split('T')[0];
  const bill = { id: db.newId('b'), title, amount: 1500, dueDate: lastDay, description: 'Auto-generated monthly dues.', assignedTo: homeowners.map(u => u.id), status: 'active', createdAt: new Date().toISOString().split('T')[0] };
  db.save('billings', bill);
  logAction(`Auto-generated monthly dues: ${title}`);
  showToast('success', 'Generated', `${title} created for ${homeowners.length} homeowners.`);
  renderBilling();
}

// ════════════════════════════════════════════════
// SECTION 9: ADMIN — PAYMENTS
// ════════════════════════════════════════════════

function renderPayments() {
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Payment Management</h2><p>Review and process homeowner payment submissions.</p></div>
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
        ${p.status === 'pending' ? `
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
  const p = db.getOne('payments', id);
  if (!p) return;
  p.status = 'approved';
  p.reviewedAt = new Date().toISOString().split('T')[0];
  db.save('payments', p);
  const ho = db.getOne('users', p.homeownerId);
  if (ho) { ho.balance = Math.max(0, (ho.balance || 0) - p.amount); db.save('users', ho); }
  const bill = db.getOne('billings', p.billingId);
  logAction(`Approved payment from ${ho ? ho.name : 'Unknown'} for "${bill ? bill.title : 'N/A'}"`);
  addNotification('Payment Approved', `Payment from ${ho ? ho.name : 'Unknown'} approved.`);
  showToast('success', 'Approved', 'Payment has been approved.');
  renderPayments();
}

function openRejectPayment(id) {
  openModal('Reject Payment', `
    <p style="color:var(--text-2);margin-bottom:16px">Please provide a reason for rejection.</p>
    <div class="form-group"><label>Remarks</label><textarea id="reject_remarks" placeholder="e.g. Blurry receipt image..."></textarea></div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Reject', cls: 'btn-danger', action: () => rejectPayment(id) },
  ]);
}

function rejectPayment(id) {
  const p = db.getOne('payments', id);
  if (!p) return;
  p.status = 'rejected';
  p.remarks = document.getElementById('reject_remarks').value.trim() || 'Rejected by admin.';
  p.reviewedAt = new Date().toISOString().split('T')[0];
  db.save('payments', p);
  const ho = db.getOne('users', p.homeownerId);
  logAction(`Rejected payment from ${ho ? ho.name : 'Unknown'}: ${p.remarks}`);
  closeModal();
  showToast('warning', 'Rejected', 'Payment rejected.');
  renderPayments();
}

// ════════════════════════════════════════════════
// SECTION 10: ADMIN — ANNOUNCEMENTS
// ════════════════════════════════════════════════

function renderAnnouncements() {
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Announcements</h2><p>Post and manage community notices.</p></div>
    <div class="page-header-actions"><button class="btn btn-primary" onclick="openAddAnnouncementModal()">New Announcement</button></div>
  </div>
  <div id="announcementsList"></div>`;
  renderAnnouncementCards();
}

function renderAnnouncementCards() {
  const list = document.getElementById('announcementsList');
  if (!list) return;
  const announcements = db.get('announcements').reverse();
  if (!announcements.length) { list.innerHTML = `<div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-megaphone"/></svg>No announcements yet.</div>`; return; }
  const catColors = { Maintenance: '#2271c3', Emergency: '#dc2626', Events: '#16a34a', Security: '#d97706', General: '#8795a8' };
  list.innerHTML = announcements.map(a => `
    <div class="announcement-card" style="--card-accent:${catColors[a.category]||'#2271c3'}">
      <div class="announcement-header">
        <div>
          <div class="announcement-title">${a.title}</div>
          <div class="announcement-meta">
            <span>${a.date}</span>
            <span class="badge badge-blue">${a.category}</span>
            ${a.urgent ? '<span class="badge badge-red">Urgent</span>' : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteAnnouncement('${a.id}')">Del</button>
        </div>
      </div>
      <div class="announcement-body">${a.description}</div>
    </div>`).join('');
}

function openAddAnnouncementModal() {
  openModal('New Announcement', `
    <div class="form-group"><label>Title *</label><input id="af_title" placeholder="Announcement title..."/></div>
    <div class="grid-2">
      <div class="form-group"><label>Category</label>
        <select id="af_cat">
          <option>General</option><option>Maintenance</option><option>Emergency</option><option>Events</option><option>Security</option>
        </select>
      </div>
      <div class="form-group"><label>Date</label><input id="af_date" type="date" value="${new Date().toISOString().split('T')[0]}"/></div>
    </div>
    <div class="form-group"><label>Description *</label><textarea id="af_desc" placeholder="Announcement details..." style="min-height:100px"></textarea></div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
      <input type="checkbox" id="af_urgent"> <label for="af_urgent" style="font-size:0.88rem;cursor:pointer;color:var(--text-2)">Mark as Urgent</label>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Post Announcement', cls: 'btn-primary', action: saveAnnouncement },
  ]);
}

function saveAnnouncement() {
  const title = document.getElementById('af_title').value.trim();
  const desc = document.getElementById('af_desc').value.trim();
  if (!title || !desc) { showToast('error', 'Missing Fields', 'Title and description are required.'); return; }
  const ann = {
    id: db.newId('a'),
    title, description: desc,
    category: document.getElementById('af_cat').value,
    date: document.getElementById('af_date').value,
    urgent: document.getElementById('af_urgent').checked,
    createdBy: currentUser.id,
  };
  db.save('announcements', ann);
  logAction(`Posted announcement: "${title}"`);
  addNotification('New Announcement', title);
  closeModal();
  showToast('success', 'Posted', 'Announcement published.');
  renderAnnouncements();
}

function confirmDeleteAnnouncement(id) {
  const a = db.getOne('announcements', id);
  if (!a) return;
  openModal('Delete Announcement', `<p>Delete "<strong>${a.title}</strong>"?</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Delete', cls: 'btn-danger', action: () => { db.delete('announcements', id); logAction(`Deleted announcement: "${a.title}"`); closeModal(); showToast('success', 'Deleted', 'Announcement removed.'); renderAnnouncements(); } },
  ]);
}

// ════════════════════════════════════════════════
// SECTION 11: ADMIN — REPORTS
// ════════════════════════════════════════════════

function renderReports() {
  const payments = db.get('payments');
  const billings = db.get('billings');
  const users = db.get('users').filter(u => u.role === 'homeowner');
  const approved = payments.filter(p => p.status === 'approved');
  const pending  = payments.filter(p => p.status === 'pending');
  const rejected = payments.filter(p => p.status === 'rejected');
  const totalDue = billings.reduce((s, b) => s + b.amount * b.assignedTo.length, 0);
  const totalPaid = approved.reduce((s, p) => s + p.amount, 0);

  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Reports & Analytics</h2><p>Financial summaries and collection reports.</p></div>
    <div class="page-header-actions"><button class="btn btn-secondary" onclick="window.print()">Print Report</button></div>
  </div>
  <div class="report-summary-grid">
    <div class="report-summary-item"><div class="r-val">₱${totalDue.toLocaleString()}</div><div class="r-lbl">Total Billed</div></div>
    <div class="report-summary-item"><div class="r-val" style="color:var(--green-600)">₱${totalPaid.toLocaleString()}</div><div class="r-lbl">Total Collected</div></div>
    <div class="report-summary-item"><div class="r-val" style="color:var(--red-600)">₱${(totalDue - totalPaid).toLocaleString()}</div><div class="r-lbl">Outstanding</div></div>
    <div class="report-summary-item"><div class="r-val">${users.length}</div><div class="r-lbl">Total Homeowners</div></div>
  </div>
  <div class="charts-row">
    <div class="chart-card">
      <h4>Paid vs Unpaid</h4>
      <div class="donut-wrap" id="reportDonut"></div>
      <div class="donut-legend">
        <div class="legend-item"><div class="legend-dot" style="background:#16a34a"></div> Approved (${approved.length})</div>
        <div class="legend-item"><div class="legend-dot" style="background:#eab308"></div> Pending (${pending.length})</div>
        <div class="legend-item"><div class="legend-dot" style="background:#dc2626"></div> Rejected (${rejected.length})</div>
      </div>
    </div>
    <div class="chart-card" style="flex:2">
      <h4>Collection by Billing</h4>
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Billing</th><th>Assigned</th><th>Collected</th><th>Rate</th></tr></thead>
        <tbody>
          ${billings.map(b => {
            const billPayments = payments.filter(p => p.billingId === b.id && p.status === 'approved');
            const rate = b.assignedTo.length > 0 ? Math.round((billPayments.length / b.assignedTo.length) * 100) : 0;
            return `<tr>
              <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.title}</td>
              <td>${b.assignedTo.length}</td>
              <td>${billPayments.length}</td>
              <td><div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:6px;background:var(--border);border-radius:99px;overflow:hidden">
                  <div style="height:100%;width:${rate}%;background:${rate >= 70 ? 'var(--green-600)' : rate >= 40 ? 'var(--amber-500)' : 'var(--red-600)'};border-radius:99px;transition:width 0.6s ease"></div>
                </div>
                <span style="font-size:0.78rem;font-weight:700;color:var(--text-2)">${rate}%</span>
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>
  </div>
  <div class="section-card">
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
  </div>`;

  const total = approved.length + pending.length + rejected.length || 1;
  renderDonut('reportDonut', [
    { value: approved.length, color: '#16a34a' },
    { value: pending.length, color: '#eab308' },
    { value: rejected.length, color: '#dc2626' },
  ], total, 'Payments', total);
}

// ════════════════════════════════════════════════
// SECTION 12: ADMIN — AUDIT LOG
// ════════════════════════════════════════════════

function renderAuditLog() {
  const logs = db.get('auditLog').reverse();
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

// ════════════════════════════════════════════════
// SECTION 13: ADMIN — SETTINGS
// ════════════════════════════════════════════════

function renderSettings() {
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Settings</h2><p>System preferences and admin profile.</p></div>
  </div>

  <div class="profile-card">
    <div class="profile-avatar-big">${currentUser.name.split(' ').map(n=>n[0]).join('').substring(0,2)}</div>
    <div class="profile-info"><h3>${currentUser.name}</h3><p>${currentUser.email}</p><p>Administrator · ${currentUser.username}</p></div>
  </div>

  <div class="settings-section">
    <div class="settings-section-header"><h4>Admin Profile</h4></div>
    <div class="settings-section-body">
      <div class="grid-2">
        <div class="form-group"><label>Full Name</label><input id="s_name" value="${currentUser.name}"/></div>
        <div class="form-group"><label>Email</label><input id="s_email" value="${currentUser.email}"/></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="saveAdminProfile()">Save Profile</button>
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-header"><h4>Change Password</h4></div>
    <div class="settings-section-body">
      <div class="grid-2">
        <div class="form-group"><label>New Password</label><input id="s_newpass" type="password" placeholder="New password..."/></div>
        <div class="form-group"><label>Confirm Password</label><input id="s_confpass" type="password" placeholder="Confirm password..."/></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="changeAdminPassword()">Update Password</button>
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-header"><h4>System Preferences</h4></div>
    <div class="settings-section-body">
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
        <div><div class="settings-label" style="color:var(--red-600)">Reset All Data</div><div style="font-size:0.78rem;color:var(--text-3)">Clears all localStorage data and re-seeds</div></div>
        <button class="btn btn-danger btn-sm" onclick="confirmResetData()">Reset Data</button>
      </div>
    </div>
  </div>`;
}

function saveAdminProfile() {
  currentUser.name = document.getElementById('s_name').value.trim() || currentUser.name;
  currentUser.email = document.getElementById('s_email').value.trim() || currentUser.email;
  db.save('users', currentUser);
  buildSidebar();
  showToast('success', 'Saved', 'Profile updated.');
}

function changeAdminPassword() {
  const np = document.getElementById('s_newpass').value.trim();
  const cp = document.getElementById('s_confpass').value.trim();
  if (!np || !cp) { showToast('error', 'Empty Fields', 'Enter and confirm new password.'); return; }
  if (np !== cp) { showToast('error', 'Mismatch', 'Passwords do not match.'); return; }
  if (np.length < 6) { showToast('error', 'Too Short', 'Password must be at least 6 characters.'); return; }
  currentUser.password = np;
  db.save('users', currentUser);
  showToast('success', 'Password Changed', 'Your password has been updated.');
}

function confirmResetData() {
  openModal('Reset All Data', '<p style="color:var(--red-600)"><strong>Warning:</strong> This will delete all data and re-seed the system. You will be logged out.</p>', [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Reset', cls: 'btn-danger', action: () => {
      localStorage.clear();
      seedData();
      closeModal();
      handleLogout();
      showToast('success', 'Reset', 'Data has been reset.');
    }},
  ]);
}

// ════════════════════════════════════════════════
// SECTION 14: HOMEOWNER VIEWS
// ════════════════════════════════════════════════

function renderHODashboard() {
  const myBillings = db.get('billings').filter(b => b.assignedTo.includes(currentUser.id));
  const myPayments = db.get('payments').filter(p => p.homeownerId === currentUser.id);
  const approved = myPayments.filter(p => p.status === 'approved');
  const pending  = myPayments.filter(p => p.status === 'pending');
  const today = new Date().toISOString().split('T')[0];
  const upcoming = myBillings.filter(b => b.dueDate >= today).sort((a,b) => a.dueDate.localeCompare(b.dueDate)).slice(0,3);
  const announcements = db.get('announcements').slice(-3).reverse();

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
    <div class="stat-card" style="--card-accent:#eab308;--card-accent-bg:#fef9c3">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-clock"/></svg></div>
      <div class="stat-value">${pending.length}</div>
      <div class="stat-label">Pending Review</div>
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
  </div>`;
}

function renderHOBilling() {
  const myBillings = db.get('billings').filter(b => b.assignedTo.includes(currentUser.id));
  const myPayments = db.get('payments').filter(p => p.homeownerId === currentUser.id);
  const today = new Date().toISOString().split('T')[0];
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
              <td><strong>${b.title}</strong></td>
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
      <button class="btn btn-primary" onclick="submitPayment()">Submit Payment</button>
    </div>
  </div>`;
}

function submitPayment() {
  const billingId = document.getElementById('pay_bill').value;
  const amount = parseFloat(document.getElementById('pay_amount').value);
  const refNum = document.getElementById('pay_ref').value.trim();
  if (!billingId || isNaN(amount) || !refNum) { showToast('error', 'Missing Fields', 'Please fill in all required fields.'); return; }
  const payment = {
    id: db.newId('p'),
    homeownerId: currentUser.id,
    billingId, amount, refNum,
    status: 'pending', receipt: null,
    submittedAt: new Date().toISOString().split('T')[0],
    remarks: '', reviewedAt: null,
  };
  db.save('payments', payment);
  const bill = db.getOne('billings', billingId);
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

function renderHOAnnouncements() {
  const announcements = db.get('announcements').reverse();
  const area = document.getElementById('contentArea');
  const catColors = { Maintenance: '#2271c3', Emergency: '#dc2626', Events: '#16a34a', Security: '#d97706', General: '#8795a8' };
  area.innerHTML = `
  <div class="page-header"><div class="page-header-left"><h2>Announcements</h2><p>Latest notices from San Alfonso Homes.</p></div></div>
  ${announcements.map(a => `
    <div class="announcement-card" style="--card-accent:${catColors[a.category]||'#2271c3'}">
      <div class="announcement-header">
        <div>
          <div class="announcement-title">${a.title}</div>
          <div class="announcement-meta">
            <span>${a.date}</span>
            <span class="badge badge-blue">${a.category}</span>
            ${a.urgent ? '<span class="badge badge-red">Urgent</span>' : ''}
          </div>
        </div>
      </div>
      <div class="announcement-body">${a.description}</div>
    </div>`).join('') || '<div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-megaphone"/></svg>No announcements.</div>'}`;
}

function renderHOProfile() {
  const u = currentUser;
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header"><div class="page-header-left"><h2>My Profile</h2><p>View and update your personal information.</p></div></div>
  <div class="profile-card">
    <div class="profile-avatar-big">${u.name.split(' ').map(n=>n[0]).join('').substring(0,2)}</div>
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
      <button class="btn btn-primary btn-sm" onclick="saveHOProfile()">Save Changes</button>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-section-header"><h4>Change Password</h4></div>
    <div class="settings-section-body">
      <div class="grid-2">
        <div class="form-group"><label>New Password</label><input id="hp_newpass" type="password" placeholder="New password..."/></div>
        <div class="form-group"><label>Confirm</label><input id="hp_confpass" type="password" placeholder="Confirm..."/></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="saveHOPassword()">Update Password</button>
    </div>
  </div>`;
}

function saveHOProfile() {
  currentUser.name = document.getElementById('hp_name').value.trim() || currentUser.name;
  currentUser.email = document.getElementById('hp_email').value.trim() || currentUser.email;
  currentUser.contact = document.getElementById('hp_contact').value.trim();
  db.save('users', currentUser);
  buildSidebar();
  showToast('success', 'Saved', 'Profile updated.');
}

function saveHOPassword() {
  const np = document.getElementById('hp_newpass').value.trim();
  const cp = document.getElementById('hp_confpass').value.trim();
  if (!np || !cp) { showToast('error', 'Empty', 'Enter both fields.'); return; }
  if (np !== cp) { showToast('error', 'Mismatch', 'Passwords do not match.'); return; }
  if (np.length < 6) { showToast('error', 'Too Short', 'Min 6 characters.'); return; }
  currentUser.password = np;
  db.save('users', currentUser);
  showToast('success', 'Updated', 'Password changed.');
}

// ════════════════════════════════════════════════
// SECTION 15: MODAL ENGINE
// ════════════════════════════════════════════════

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
  document.getElementById('modalOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

// ════════════════════════════════════════════════
// SECTION 16: TOAST NOTIFICATIONS
// ════════════════════════════════════════════════

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

// ════════════════════════════════════════════════
// SECTION 17: NOTIFICATION SYSTEM
// ════════════════════════════════════════════════

function addNotification(title, message) {
  const stored = JSON.parse(localStorage.getItem('sah_notifs') || '[]');
  stored.unshift({ title, message, time: new Date().toLocaleTimeString() });
  if (stored.length > 20) stored.pop();
  localStorage.setItem('sah_notifs', JSON.stringify(stored));
  updateNotifBadge();
}

function updateNotifBadge() {
  const notifs = JSON.parse(localStorage.getItem('sah_notifs') || '[]');
  const badge = document.getElementById('notifBadge');
  if (badge) badge.textContent = notifs.length > 0 ? notifs.length : '0';
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    const notifs = JSON.parse(localStorage.getItem('sah_notifs') || '[]');
    const list = document.getElementById('notifList');
    list.innerHTML = notifs.length ? notifs.map(n => `
      <div class="notif-item">
        <strong>${n.title}</strong>
        ${n.message}
        <div class="notif-time">${n.time}</div>
      </div>`).join('') : '<p class="empty-note">No notifications</p>';
  }
}

function clearNotifications() {
  localStorage.setItem('sah_notifs', '[]');
  document.getElementById('notifList').innerHTML = '<p class="empty-note">No notifications</p>';
  updateNotifBadge();
}

// ════════════════════════════════════════════════
// SECTION 18: AUDIT LOG HELPER
// ════════════════════════════════════════════════

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

// ════════════════════════════════════════════════
// SECTION 19: UI HELPERS
// ════════════════════════════════════════════════

function badgeHtml(status) {
  const map = {
    approved: '<span class="badge badge-green">Approved</span>',
    pending:  '<span class="badge badge-yellow">Pending</span>',
    rejected: '<span class="badge badge-red">Rejected</span>',
    active:   '<span class="badge badge-blue">Active</span>',
    inactive: '<span class="badge badge-gray">Inactive</span>',
    overdue:  '<span class="badge badge-red">Overdue</span>',
  };
  return map[status] || `<span class="badge badge-gray">${status}</span>`;
}

function showLoading() {
  document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

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
  if (icon) icon.innerHTML = t === 'dark' ? '<use href="#ico-sun"/>' : '<use href="#ico-moon"/>'; icon.setAttribute('width','16'); icon.setAttribute('height','16');
  if (label) label.textContent = t === 'dark' ? 'Light Mode' : 'Dark Mode';
}

// ════════════════════════════════════════════════
// SECTION 20: KEYBOARD & GLOBAL EVENTS
// ════════════════════════════════════════════════

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
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

// Close notif panel on outside click
document.addEventListener('click', e => {
  const panel = document.getElementById('notifPanel');
  const bell = document.querySelector('.notif-bell');
  if (panel && !panel.classList.contains('hidden') && !panel.contains(e.target) && bell && !bell.contains(e.target)) {
    panel.classList.add('hidden');
  }
});

// Navbar scroll effect
window.addEventListener('scroll', () => {
  const nav = document.getElementById('pubNav');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
});

// ════════════════════════════════════════════════
// SECTION 21: LANDING PAGE FUNCTIONS
// ════════════════════════════════════════════════

function openLoginModal(role) {
  currentRole = role || 'admin';
  // Sync role tabs
  document.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.role-tab[data-role="${currentRole}"]`);
  if (activeTab) activeTab.classList.add('active');
  // Clear fields
  const lu = document.getElementById('loginUser');
  const lp = document.getElementById('loginPass');
  const le = document.getElementById('loginError');
  if (lu) lu.value = '';
  if (lp) lp.value = '';
  if (le) le.classList.add('hidden');
  // Pre-fill hint
  if (lu) lu.placeholder = currentRole === 'admin' ? 'e.g. admin' : 'e.g. juandelacruz';
  document.getElementById('loginModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => { if (lu) lu.focus(); }, 100);
}

function closeLoginModal() {
  const lm = document.getElementById('loginModal');
  if (lm) lm.classList.add('hidden');
  document.body.style.overflow = '';
}

function closeLoginModalOutside(e) {
  if (e.target === document.getElementById('loginModal')) closeLoginModal();
}

function pubScrollTo(sectionId) {
  const el = document.getElementById(sectionId);
  if (el) {
    const offset = 72;
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
  // Update active nav link
  document.querySelectorAll('.pub-nav-link').forEach(l => l.classList.remove('active'));
  const mapping = { hero: 0, announcements: 1, about: 2, contact: 3 };
  const links = document.querySelectorAll('.pub-nav-link');
  const idx = mapping[sectionId];
  if (links[idx] !== undefined) links[idx].classList.add('active');
}

function togglePubNav() {
  const mn = document.getElementById('pubMobileNav');
  if (mn) mn.classList.toggle('hidden');
}

function renderPublicAnnouncements() {
  const grid = document.getElementById('pubAnnGrid');
  if (!grid) return;
  const announcements = db.get('announcements').slice(-6).reverse();
  const catColors = { Maintenance: '#2271c3', Emergency: '#dc2626', Events: '#16a34a', Security: '#d97706', General: '#8795a8' };
  if (!announcements.length) {
    grid.innerHTML = `<div class="no-results" style="grid-column:1/-1"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-megaphone"/></svg>No announcements at this time. Check back later.</div>`;
    return;
  }
  grid.innerHTML = announcements.map(a => `
    <div class="pub-ann-card" style="--ann-color:${catColors[a.category]||'#2271c3'}">
      <div class="pub-ann-card-top">
        <div class="pub-ann-card-title">${a.title}</div>
        <div style="flex-shrink:0">${a.urgent ? '<span class="badge badge-red">Urgent</span>' : ''}</div>
      </div>
      <div class="pub-ann-card-body">${a.description}</div>
      <div class="pub-ann-card-meta">
        <span>${a.date}</span>
        <span class="badge badge-blue">${a.category}</span>
      </div>
    </div>`).join('');
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
  updateHeroStat();
  applyStoredTheme();
}

// Override handleLogout to go back to landing page
function handleLogout() {
  localStorage.removeItem('sah_session');
  currentUser = null;
  document.getElementById('appShell').classList.add('hidden');
  showLandingPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ════════════════════════════════════════════════
// SECTION 22: BOOTSTRAP
// ════════════════════════════════════════════════

(function init() {
  seedData();
  applyStoredTheme();
  if (restoreSession()) {
    document.getElementById('landingPage').classList.add('hidden');
    initApp();
  } else {
    showLandingPage();
  }
})();