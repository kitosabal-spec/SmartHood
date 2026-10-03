// SECTION 6: ADMIN — DASHBOARD

const REVENUE_YEAR_STORAGE_KEYS_LIST = [
  'sah_revenue_year',
  'monthlyRevenueYear',
  'monthly_revenue_year',
  'revenue_year',
  'adminRevenueYear',
  'sah_monthly_revenue_year'
];

function readSavedRevenueYear() {
  try {
    if (typeof localStorage === 'undefined') return null;
    for (const k of REVENUE_YEAR_STORAGE_KEYS_LIST) {
      const v = localStorage.getItem(k);
      if (v !== null && v !== '') {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 1900 && n <= 2100) return n;
      }
    }
  } catch (e) {}
  return null;
}

function writeSavedRevenueYear(year) {
  try {
    if (typeof localStorage === 'undefined') return;
    const s = String(year);
    for (const k of REVENUE_YEAR_STORAGE_KEYS_LIST) {
      localStorage.setItem(k, s);
    }
  } catch (e) {}
}

let adminRevenueYear = readSavedRevenueYear();

function toggleRevenueYearDropdown(event) {
  if (event) {
    event.stopPropagation();
  }
  const dropdown = document.getElementById('revenueYearDropdown');
  const btn = document.getElementById('revenueYearDisplay');
  if (!dropdown) return;
  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    dropdown.classList.remove('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  } else {
    dropdown.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}

function closeRevenueYearDropdown() {
  const dropdown = document.getElementById('revenueYearDropdown');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    dropdown.classList.add('hidden');
    const btn = document.getElementById('revenueYearDisplay');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}

function setAdminRevenueYear(year, event) {
  if (event) {
    event.stopPropagation();
  }
  const numYear = Number(year);
  if (!Number.isFinite(numYear)) return;

  const payments = db.get('payments');
  const billings = db.get('billings');
  const getAvailYearsFn = typeof getAvailableRevenueYears === 'function'
    ? getAvailableRevenueYears
    : (typeof window !== 'undefined' && typeof window.getAvailableRevenueYears === 'function' ? window.getAvailableRevenueYears : null);
  const years = typeof getAvailYearsFn === 'function'
    ? getAvailYearsFn(payments, billings)
    : [numYear];
  if (!years.length) return;

  const minYear = years[0];
  const maxYear = years[years.length - 1];
  const targetYear = Math.max(minYear, Math.min(maxYear, numYear));

  adminRevenueYear = targetYear;
  writeSavedRevenueYear(targetYear);
  if (typeof window !== 'undefined') {
    window.adminRevenueYear = adminRevenueYear;
  }

  const buildMonthlyRevenueDataFn = typeof buildMonthlyRevenueData === 'function'
    ? buildMonthlyRevenueData
    : (typeof window !== 'undefined' && typeof window.buildMonthlyRevenueData === 'function' ? window.buildMonthlyRevenueData : () => []);
  const monthlyData = buildMonthlyRevenueDataFn(payments, adminRevenueYear);

  const renderChartFn = typeof renderMonthlyBarChart === 'function'
    ? renderMonthlyBarChart
    : (typeof window !== 'undefined' && typeof window.renderMonthlyBarChart === 'function' ? window.renderMonthlyBarChart : () => {});
  renderChartFn('barChart', monthlyData, adminRevenueYear);

  const textEl = document.getElementById('revenueYearText');
  if (textEl) textEl.textContent = String(adminRevenueYear);

  const prevBtn = document.getElementById('revenuePrevYearBtn');
  if (prevBtn) {
    prevBtn.disabled = adminRevenueYear <= minYear;
  }

  const nextBtn = document.getElementById('revenueNextYearBtn');
  if (nextBtn) {
    nextBtn.disabled = adminRevenueYear >= maxYear;
  }

  const select = document.getElementById('revenueYearSelect');
  if (select && select.value !== String(adminRevenueYear)) {
    select.value = String(adminRevenueYear);
  }

  document.querySelectorAll('.chart-year-option').forEach(opt => {
    opt.classList.toggle('active', Number(opt.dataset.year) === adminRevenueYear);
  });

  closeRevenueYearDropdown();
}

function changeAdminRevenueYear(delta) {
  const payments = db.get('payments');
  const billings = db.get('billings');
  const getAvailYearsFn = typeof getAvailableRevenueYears === 'function'
    ? getAvailableRevenueYears
    : (typeof window !== 'undefined' && typeof window.getAvailableRevenueYears === 'function' ? window.getAvailableRevenueYears : null);
  const years = typeof getAvailYearsFn === 'function'
    ? getAvailYearsFn(payments, billings)
    : (adminRevenueYear ? [adminRevenueYear] : [new Date().getFullYear()]);
  if (!years.length) return;

  const saved = readSavedRevenueYear();
  const currentYear = adminRevenueYear !== null
    ? adminRevenueYear
    : (saved !== null && years.includes(saved) ? saved : years[years.length - 1]);
  const currentIndex = years.indexOf(currentYear);
  if (currentIndex === -1) {
    setAdminRevenueYear(years[0]);
    return;
  }

  const newIndex = currentIndex + delta;
  if (newIndex >= 0 && newIndex < years.length) {
    setAdminRevenueYear(years[newIndex]);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('monthlyRevenueYearSelector');
    if (wrap && !wrap.contains(e.target)) {
      closeRevenueYearDropdown();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeRevenueYearDropdown();
    }
  });
}

if (typeof window !== 'undefined') {
  window.adminRevenueYear = adminRevenueYear;
  window.toggleRevenueYearDropdown = toggleRevenueYearDropdown;
  window.closeRevenueYearDropdown = closeRevenueYearDropdown;
  window.setAdminRevenueYear = setAdminRevenueYear;
  window.changeAdminRevenueYear = changeAdminRevenueYear;
  window.getSavedRevenueYear = readSavedRevenueYear;
  window.saveRevenueYear = writeSavedRevenueYear;
  window.renderAdminDashboard = renderAdminDashboard;
}



function renderAdminDashboard() {
  syncHomeownerBalances();
  const homeowners = getHomeowners();
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

  const getAnalysisYearFn = typeof getAnalysisYear === 'function'
    ? getAnalysisYear
    : (typeof window !== 'undefined' && typeof window.getAnalysisYear === 'function' ? window.getAnalysisYear : () => new Date().getFullYear());
  const analysisYear = getAnalysisYearFn(payments, billings);

  const getAvailYearsFn = typeof getAvailableRevenueYears === 'function'
    ? getAvailableRevenueYears
    : (typeof window !== 'undefined' && typeof window.getAvailableRevenueYears === 'function' ? window.getAvailableRevenueYears : null);
  const availableYears = typeof getAvailYearsFn === 'function'
    ? getAvailYearsFn(payments, billings)
    : [analysisYear];

  const defaultYear = availableYears.includes(analysisYear)
    ? analysisYear
    : availableYears[availableYears.length - 1];

  const savedYear = readSavedRevenueYear();
  if (savedYear !== null) {
    if (!availableYears.includes(savedYear) && Number.isInteger(savedYear) && savedYear >= 2000 && savedYear <= 2100) {
      availableYears.push(savedYear);
      availableYears.sort((a, b) => a - b);
    }
    adminRevenueYear = availableYears.includes(savedYear) ? savedYear : defaultYear;
  } else {
    adminRevenueYear = defaultYear;
  }

  if (typeof window !== 'undefined') {
    window.adminRevenueYear = adminRevenueYear;
  }

  const buildMonthlyRevenueDataFn = typeof buildMonthlyRevenueData === 'function'
    ? buildMonthlyRevenueData
    : (typeof window !== 'undefined' && typeof window.buildMonthlyRevenueData === 'function' ? window.buildMonthlyRevenueData : () => []);
  const monthlyData = buildMonthlyRevenueDataFn(payments, adminRevenueYear);
  const paymentCounts = paymentStatusCounts(payments);
  const paymentTotal = paymentCounts.approved + paymentCounts.pending + paymentCounts.rejected;

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <h2>Dashboard</h2>
      <p>Welcome back, ${currentUser?.name || currentUser?.username || 'Admin'}. Here's your overview.</p>
    </div>
  </div>

  <div class="stat-grid admin-stat-grid">
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
      <div class="chart-header">
        <h4>Monthly Revenue</h4>
        <div class="chart-year-selector" id="monthlyRevenueYearSelector">
          <button type="button" class="chart-year-btn chart-year-prev" id="revenuePrevYearBtn" onclick="changeAdminRevenueYear(-1)" title="Previous year" aria-label="Previous year" ${adminRevenueYear <= availableYears[0] ? 'disabled' : ''}>&lt;</button>
          <div class="chart-year-dropdown-wrap">
            <button type="button" class="chart-year-display" id="revenueYearDisplay" onclick="toggleRevenueYearDropdown(event)" aria-haspopup="listbox" aria-expanded="false" title="Select year">
              <span id="revenueYearText">${adminRevenueYear}</span>
            </button>
            <div class="chart-year-dropdown hidden" id="revenueYearDropdown" role="listbox">
              ${[...availableYears].reverse().map(y => `
                <button type="button" class="chart-year-option ${y === adminRevenueYear ? 'active' : ''}" data-year="${y}" onclick="setAdminRevenueYear(${y}, event)">${y}</button>
              `).join('')}
            </div>
            <select class="chart-year-select" id="revenueYearSelect" onchange="setAdminRevenueYear(Number(this.value))" aria-label="Select year">
              ${availableYears.map(y => `
                <option value="${y}" ${y === adminRevenueYear ? 'selected' : ''}>${y}</option>
              `).join('')}
            </select>
          </div>
          <button type="button" class="chart-year-btn chart-year-next" id="revenueNextYearBtn" onclick="changeAdminRevenueYear(1)" title="Next year" aria-label="Next year" ${adminRevenueYear >= availableYears[availableYears.length - 1] ? 'disabled' : ''}>&gt;</button>
        </div>
      </div>
      <div class="chart-bars" id="barChart"></div>
      <div style="display:flex;gap:8px;margin-top:6px" class="chart-month-labels" id="barChartMonthLabels">
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

  <div class="grid-2" style="gap:18px">
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

  const renderChartFn = typeof renderMonthlyBarChart === 'function'
    ? renderMonthlyBarChart
    : (typeof window !== 'undefined' && typeof window.renderMonthlyBarChart === 'function' ? window.renderMonthlyBarChart : () => {});
  renderChartFn('barChart', monthlyData, adminRevenueYear);
  const total = paymentTotal;
  renderDonut('donutChart', [
    { value: paymentCounts.approved, color: '#16a34a' },
    { value: paymentCounts.pending, color: '#eab308' },
    { value: paymentCounts.rejected, color: '#dc2626' },
  ], total, 'Total', total);

  const tbody = document.getElementById('recentPaymentsTable');
  const recentP = [...payments].sort((a,b) => (b.submittedAt || '').localeCompare(a.submittedAt || '')).slice(0, 5);
  recentP.forEach(p => {
    const ho = getHomeownerById(p.homeownerId);
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
      const ho = getHomeownerById(c.homeownerId);
      cmpPanel.innerHTML += `
        <div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div>
            <div style="font-weight:600;font-size:0.85rem;color:var(--text)">${ho ? ho.name : 'Unknown'} — ${c.category}</div>
            <div style="font-size:0.78rem;color:var(--text-3);margin-top:2px">${c.dateOfOccurrence ? `Occurred: ${typeof formatComplaintDate === 'function' ? formatComplaintDate(c.dateOfOccurrence) : c.dateOfOccurrence} · ` : ''}Filed: ${typeof formatComplaintDate === 'function' ? formatComplaintDate(c.dateFiled) : c.dateFiled}</div>
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



// ══════════════════════════════════════════════════════════════
// RESPONSIVE MOBILE TABLE UTILITY (AUTO DATA-LABEL ATTRIBUTION)
// ══════════════════════════════════════════════════════════════

function applyResponsiveTableLabels(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const tables = root.querySelectorAll('table.data-table');
  tables.forEach(table => {
    const headers = [];
    table.querySelectorAll('thead th').forEach(th => {
      // Clean header text (exclude any trailing icons/subtext)
      const text = (th.textContent || '').replace(/\s+/g, ' ').trim();
      headers.push(text);
    });
    if (!headers.length) return;

    table.querySelectorAll('tbody tr').forEach(tr => {
      // Don't label single full-width informational rows (e.g. colspan="6")
      if (tr.querySelector('td[colspan]')) return;
      const cells = tr.querySelectorAll('td');
      cells.forEach((td, i) => {
        if (!td.hasAttribute('data-label') && headers[i]) {
          td.setAttribute('data-label', headers[i]);
        }
      });
    });
  });
}
if (typeof window !== 'undefined') {
  window.applyResponsiveTableLabels = applyResponsiveTableLabels;
  // Initialize automatic observer so dynamically rendered tables receive data-label immediately
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    const observer = new MutationObserver(mutations => {
      let shouldScan = false;
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) {
        applyResponsiveTableLabels(document);
      }
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
        applyResponsiveTableLabels(document);
      });
    }
  }
}

// ══════════════════════════════════════════════════════════════
// TABLE PAGINATION UTILITY COMPONENT
// ══════════════════════════════════════════════════════════════

function renderPaginationComponent(config) {
  const {
    containerId,
    currentPage,
    pageSize,
    totalItems,
    pageSizeOptions = [10, 25, 50, 100],
    onPageChangeFn,
    onPageSizeChangeFn,
    itemLabel = 'entries',
  } = config;

  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, currentPage), totalPages);
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  // Generate page numbers array with smart ellipsis
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    const startPage = Math.max(2, page - 1);
    const endPage = Math.min(totalPages - 1, page + 1);
    for (let i = startPage; i <= endPage; i++) {
      if (!pages.includes(i)) pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    if (!pages.includes(totalPages)) pages.push(totalPages);
  }

  container.innerHTML = `
    <div class="table-pagination-wrapper">
      <div class="table-pagination-info">
        Showing <span class="table-pagination-highlight">${start}</span> to <span class="table-pagination-highlight">${end}</span> of <span class="table-pagination-highlight">${totalItems.toLocaleString()}</span> ${escapeHtml(itemLabel)}
      </div>
      <div class="table-pagination-actions">
        <div class="table-pagination-size">
          <span>Show</span>
          <select class="table-pagination-size-select" onchange="${onPageSizeChangeFn}(Number(this.value))">
            ${pageSizeOptions.map(sz => `<option value="${sz}" ${sz === pageSize ? 'selected' : ''}>${sz}</option>`).join('')}
          </select>
          <span>per page</span>
        </div>
        <div class="table-pagination-nav">
          <button class="table-pagination-btn" onclick="${onPageChangeFn}(1)" ${page === 1 ? 'disabled' : ''} title="First Page">«</button>
          <button class="table-pagination-btn" onclick="${onPageChangeFn}(${page - 1})" ${page === 1 ? 'disabled' : ''} title="Previous Page">‹</button>
          <div class="pagination-numbers" style="display:inline-flex;gap:4px;">
            ${pages.map(p => {
              if (p === '...') return `<span class="table-pagination-ellipsis">…</span>`;
              const isActive = p === page;
              return `<button class="table-pagination-btn ${isActive ? 'active' : ''}" onclick="${onPageChangeFn}(${p})" ${isActive ? 'disabled' : ''}>${p}</button>`;
            }).join('')}
          </div>
          <button class="table-pagination-btn" onclick="${onPageChangeFn}(${page + 1})" ${page === totalPages ? 'disabled' : ''} title="Next Page">›</button>
          <button class="table-pagination-btn" onclick="${onPageChangeFn}(${totalPages})" ${page === totalPages ? 'disabled' : ''} title="Last Page">»</button>
        </div>
      </div>
    </div>
  `;
}


// SECTION 15: HOMEOWNER VIEWS


function renderHODashboard() {
  syncHomeownerBalances();
  const myBillings = db.get('billings').filter(b => getAssignedHomeownerIds(b).includes(getCurrentHomeownerId()));
  const homeownerId = getCurrentHomeownerId();
  const myPayments = db.get('payments').filter(p => p.homeownerId === homeownerId);
  const myComplaints = db.get('complaints').filter(c => c.homeownerId === homeownerId);
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
  <div class="stat-grid resident-stat-grid">
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

  <div class="grid-2" style="gap:18px">
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
