// SECTION 8: ADMIN — BILLING

if (typeof parseMonthFromTitle !== 'function') {
  function parseMonthFromTitle(title) {
    if (!title || typeof title !== 'string') return null;
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const regex = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i;
    const match = title.match(regex);
    if (match) {
      const monthIdx = monthNames.indexOf(match[1].toLowerCase());
      if (monthIdx !== -1) {
        const year = match[2];
        return `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
      }
    }
    return null;
  }
  if (typeof window !== 'undefined') window.parseMonthFromTitle = parseMonthFromTitle;
}

if (typeof getAssignedHomeownerIds !== 'function') {
  function getAssignedHomeownerIds(billing) {
    if (Array.isArray(billing?.assignedTo)) return billing.assignedTo;
    if (!billing?.assignedTo) return [];
    if (typeof billing.assignedTo !== 'string') return [String(billing.assignedTo)];
    try {
      let parsed = JSON.parse(billing.assignedTo);
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { parsed = parsed.split(',').map(id => id.trim()).filter(Boolean); }
      }
      return Array.isArray(parsed) ? parsed : (parsed ? [String(parsed)] : []);
    } catch {
      return billing.assignedTo.split(',').map(id => id.trim()).filter(Boolean);
    }
  }
  if (typeof window !== 'undefined') window.getAssignedHomeownerIds = getAssignedHomeownerIds;
}

if (typeof formatBillingMonth !== 'function') {
  function formatBillingMonth(value) {
    if (!value || typeof value !== 'string') return '';
    const parts = value.split('-');
    if (parts.length < 2) return value;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthIdx = parseInt(parts[1], 10) - 1;
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${monthNames[monthIdx]} ${parts[0]}`;
    }
    return value;
  }
  if (typeof window !== 'undefined') window.formatBillingMonth = formatBillingMonth;
}

if (typeof escapeHtml !== 'function') {
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  if (typeof window !== 'undefined') window.escapeHtml = escapeHtml;
}

if (typeof getLocalDateValue !== 'function') {
  function getLocalDateValue(date = new Date()) {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
  }
  if (typeof window !== 'undefined') window.getLocalDateValue = getLocalDateValue;
}


let billingPaginationState = { page: 1, pageSize: 10 };
let currentBillingFilteredList = null;

function changeBillingPage(page) {
  billingPaginationState.page = page;
  renderBillingTable(currentBillingFilteredList, false);
}
if (typeof window !== 'undefined') window.changeBillingPage = changeBillingPage;

function changeBillingPageSize(pageSize) {
  billingPaginationState.pageSize = pageSize;
  billingPaginationState.page = 1;
  renderBillingTable(currentBillingFilteredList, false);
}
if (typeof window !== 'undefined') window.changeBillingPageSize = changeBillingPageSize;

function parseBillingFilterDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  const dateOnly = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  const d = new Date(str);
  return Number.isFinite(d.getTime()) ? d : null;
}
if (typeof window !== 'undefined') window.parseBillingFilterDate = parseBillingFilterDate;

function getBillingRecordDates(billing) {
  const dates = [];
  if (billing?.dueDate) {
    const d = parseBillingFilterDate(billing.dueDate);
    if (d) dates.push(d);
  }
  if (billing?.createdAt) {
    const d = parseBillingFilterDate(billing.createdAt);
    if (d) dates.push(d);
  }
  if (!dates.length && billing?.monthly_dues_month) {
    const d = parseBillingFilterDate(`${billing.monthly_dues_month}-01`);
    if (d) dates.push(d);
  }
  return dates;
}

function filterBillings(resetPage = true) {
  if (resetPage) {
    billingPaginationState.page = 1;
  }
  const q = (document.getElementById('billSearch')?.value || '').trim().toLowerCase();
  const statusFilter = (document.getElementById('billStatusFilter')?.value || 'all').toLowerCase();
  const datePreset = (document.getElementById('billDateFilter')?.value || 'all').toLowerCase();
  const dateInput = document.getElementById('billDate');
  const startInput = document.getElementById('billStartDate');
  const endInput = document.getElementById('billEndDate');

  const now = new Date();
  let rangeStart = null;
  let rangeEnd = null;

  if (datePreset === 'today') {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (datePreset === 'week') {
    const day = now.getDay() || 7; // Monday is the start of the week
    rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1, 0, 0, 0, 0);
    rangeEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + 6, 23, 59, 59, 999);
  } else if (datePreset === 'month') {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (datePreset === 'year') {
    rangeStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    rangeEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else if (datePreset === 'date') {
    const d = parseBillingFilterDate(dateInput?.value);
    if (d) {
      rangeStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      rangeEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    }
  } else if (datePreset === 'range') {
    const s = parseBillingFilterDate(startInput?.value);
    const e = parseBillingFilterDate(endInput?.value);
    if (s) rangeStart = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
    if (e) rangeEnd = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999);
    if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
      const tmp = rangeStart;
      rangeStart = rangeEnd;
      rangeEnd = tmp;
    }
  }

  const allBillings = db.get('billings') || [];
  const users = db.get('users') || [];
  const userMap = new Map(users.map(u => [u.id, u]));

  const filtered = allBillings.filter(b => {
    // 1. Search filter: resident name or billing information
    if (q) {
      const assignedIds = getAssignedHomeownerIds(b);
      const residentMatch = assignedIds.some(id => {
        const u = userMap.get(id);
        if (!u) return false;
        return (u.name || '').toLowerCase().includes(q)
          || (u.username || '').toLowerCase().includes(q)
          || (u.email || '').toLowerCase().includes(q)
          || (u.block || '').toLowerCase().includes(q)
          || (u.lot || '').toLowerCase().includes(q);
      });

      const amt = Number(b.amount || 0);
      const amountFormatted = amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const monthText = b.monthly_dues_month ? formatBillingMonth(b.monthly_dues_month) : '';
      const billingMatch = (b.title || '').toLowerCase().includes(q)
        || (b.description || '').toLowerCase().includes(q)
        || (b.dueDate || '').toLowerCase().includes(q)
        || (b.createdAt || '').toLowerCase().includes(q)
        || (b.billing_type || '').toLowerCase().includes(q)
        || (b.id || '').toLowerCase().includes(q)
        || String(b.amount || '').includes(q)
        || amountFormatted.includes(q)
        || `₱${amountFormatted}`.toLowerCase().includes(q)
        || (b.monthly_dues_month || '').toLowerCase().includes(q)
        || monthText.toLowerCase().includes(q);

      if (!residentMatch && !billingMatch) return false;
    }

    // 2. Status filter: All, Paid, Unpaid, Overdue
    if (statusFilter && statusFilter !== 'all') {
      const colStatus = getBillingCollectionStatus(b);
      const isPaid = colStatus === 'paid' || b.status === 'paid';
      const isOverdue = colStatus === 'overdue' || (b.dueDate && b.dueDate < getLocalDateValue() && !isPaid);

      if (statusFilter === 'paid') {
        if (!isPaid) return false;
      } else if (statusFilter === 'overdue') {
        if (!isOverdue) return false;
      } else if (statusFilter === 'unpaid') {
        if (isPaid || isOverdue) return false;
      }
    }

    // 3. Date filter
    if (datePreset !== 'all' && (rangeStart || rangeEnd)) {
      const bDates = getBillingRecordDates(b);
      if (!bDates.length) return false;
      const matchesDate = bDates.some(d => {
        if (rangeStart && d < rangeStart) return false;
        if (rangeEnd && d > rangeEnd) return false;
        return true;
      });
      if (!matchesDate) return false;
    }

    return true;
  });

  renderBillingTable(filtered, resetPage);
}
if (typeof window !== 'undefined') window.filterBillings = filterBillings;

function onBillingDateFilterChange() {
  const mode = document.getElementById('billDateFilter')?.value || 'all';
  const dateWrap = document.getElementById('billDateWrap');
  const rangeWrap = document.getElementById('billRangeWrap');
  const dateInput = document.getElementById('billDate');
  const startInput = document.getElementById('billStartDate');
  const endInput = document.getElementById('billEndDate');

  if (dateWrap) dateWrap.style.display = (mode === 'date') ? 'inline-flex' : 'none';
  if (rangeWrap) rangeWrap.style.display = (mode === 'range') ? 'inline-flex' : 'none';

  if (mode === 'date' && dateInput && !dateInput.value) {
    dateInput.value = getLocalDateValue();
  }
  if (mode === 'range') {
    if (startInput && !startInput.value) {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      startInput.value = getLocalDateValue(d);
    }
    if (endInput && !endInput.value) {
      endInput.value = getLocalDateValue();
    }
  }

  filterBillings(true);
}
if (typeof window !== 'undefined') window.onBillingDateFilterChange = onBillingDateFilterChange;

function resetBillingFilters() {
  const searchInput = document.getElementById('billSearch');
  const statusFilter = document.getElementById('billStatusFilter');
  const dateFilter = document.getElementById('billDateFilter');
  const dateInput = document.getElementById('billDate');
  const startInput = document.getElementById('billStartDate');
  const endInput = document.getElementById('billEndDate');
  const dateWrap = document.getElementById('billDateWrap');
  const rangeWrap = document.getElementById('billRangeWrap');

  if (searchInput) searchInput.value = '';
  if (statusFilter) statusFilter.value = 'all';
  if (dateFilter) dateFilter.value = 'all';
  if (dateInput) dateInput.value = '';
  if (startInput) startInput.value = '';
  if (endInput) endInput.value = '';
  if (dateWrap) dateWrap.style.display = 'none';
  if (rangeWrap) rangeWrap.style.display = 'none';

  filterBillings(true);
}
if (typeof window !== 'undefined') window.resetBillingFilters = resetBillingFilters;

function renderBilling() {
  if (canManageBilling()) {
    syncHomeownerBalances();
  }
  billingPaginationState.page = 1;
  currentBillingFilteredList = null;

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
      <div class="filters-row" style="align-items:center;">
        <div class="search-box">
          <span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span>
          <input id="billSearch" type="text" placeholder="Search by resident name or billing information..." oninput="filterBillings()"/>
        </div>
        <select class="filter-select" id="billStatusFilter" onchange="filterBillings()">
          <option value="all">All Statuses</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="overdue">Overdue</option>
        </select>
        <select class="filter-select" id="billDateFilter" onchange="onBillingDateFilterChange()">
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="date">Choose Date</option>
          <option value="range">Date Range</option>
        </select>
        <div id="billDateWrap" class="date-input-group" style="display:none;">
          <input type="date" class="filter-select" id="billDate" onchange="filterBillings()" title="Select specific date"/>
        </div>
        <div id="billRangeWrap" class="date-input-group" style="display:none;">
          <input type="date" class="filter-select" id="billStartDate" onchange="filterBillings()" title="Start date" placeholder="Start Date"/>
          <span class="date-range-sep">to</span>
          <input type="date" class="filter-select" id="billEndDate" onchange="filterBillings()" title="End date" placeholder="End Date"/>
        </div>
        <button class="btn btn-secondary btn-sm" id="billResetBtn" onclick="resetBillingFilters()" title="Reset all filters">
          Reset
        </button>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Title</th><th>Amount</th><th>Due Date</th><th>Assigned</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="billTableBody"></tbody>
      </table></div>
    </div>
    <div id="billingPagination"></div>
  </div>`;

  filterBillings(false);
}

function renderBillingTable(billings = null, resetPage = false) {
  if (billings !== null) {
    currentBillingFilteredList = billings;
  } else if (currentBillingFilteredList === null) {
    currentBillingFilteredList = db.get('billings') || [];
  }
  const list = currentBillingFilteredList || [];
  const tbody = document.getElementById('billTableBody');
  if (!tbody) return;

  if (resetPage) billingPaginationState.page = 1;

  const totalItems = list.length;
  const pageSize = billingPaginationState.pageSize || 10;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (billingPaginationState.page > totalPages) billingPaginationState.page = totalPages;
  if (billingPaginationState.page < 1) billingPaginationState.page = 1;

  if (!totalItems) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-file"/></svg>No billings found.</div></td></tr>`;
    if (typeof renderPaginationComponent === 'function') {
      renderPaginationComponent({
        containerId: 'billingPagination',
        currentPage: 1,
        pageSize,
        totalItems: 0,
        pageSizeOptions: [5, 10, 20, 50],
        onPageChangeFn: 'changeBillingPage',
        onPageSizeChangeFn: 'changeBillingPageSize',
        itemLabel: 'billings',
      });
    }
    return;
  }

  const startIndex = (billingPaginationState.page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pageItems = list.slice(startIndex, endIndex);

  tbody.innerHTML = pageItems.map(b => {
    const assignedIds = getAssignedHomeownerIds(b);
    const collectionStatus = getBillingCollectionStatus(b);
    const overdue = collectionStatus === 'overdue';
    const amountStr = Number(b.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const monthText = b.monthly_dues_month ? formatBillingMonth(b.monthly_dues_month) : '';
    return `<tr class="${overdue ? 'overdue-row' : ''}">
      <td>
        <strong>${escapeHtml(b.title)}</strong>${overdue ? ' <span class="badge badge-red">Overdue</span>' : ''}
        ${monthText ? `<div style="font-size:0.75rem;color:var(--teal-700);font-weight:600;margin-top:2px">Monthly Dues: ${escapeHtml(monthText)}</div>` : ''}
      </td>
      <td class="amount-due">₱${amountStr}</td>
      <td>${escapeHtml(b.dueDate || '—')}</td>
      <td>${assignedIds.length} homeowner(s)</td>
      <td>${badgeHtml(collectionStatus)}</td>
      <td><div class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="viewBillingDetail('${b.id}')">View</button>
        ${canManageBilling() ? `<button class="btn btn-danger btn-sm btn-icon" onclick="confirmDeleteBilling('${b.id}')" title="Delete"><svg width="14" height="14"><use href="#ico-trash"/></svg></button>` : ''}
      </div></td>
    </tr>`;
  }).join('');

  if (typeof renderPaginationComponent === 'function') {
    renderPaginationComponent({
      containerId: 'billingPagination',
      currentPage: billingPaginationState.page,
      pageSize,
      totalItems,
      pageSizeOptions: [5, 10, 20, 50],
      onPageChangeFn: 'changeBillingPage',
      onPageSizeChangeFn: 'changeBillingPageSize',
      itemLabel: 'billings',
    });
  }
}
if (typeof window !== 'undefined') window.renderBillingTable = renderBillingTable;

function openAddBillingModal() {
  const homeowners = db.get('users').filter(u => u.role === 'homeowner');
  const currentMonthValue = getLocalMonthValue();
  const defaultDueDate = getLocalDateValue(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
  openModal('Create Billing', `
    <div class="form-group"><label>Title *</label><input id="bf_title" value="Monthly Association Dues" placeholder="e.g. Monthly Dues – April"/></div>
    <div class="grid-2">
      <div class="form-group"><label>Amount (₱) *</label><input id="bf_amount" type="number" placeholder="1500"/></div>
      <div class="form-group"><label>Due Date *</label><input id="bf_due" type="date" value="${defaultDueDate}"/></div>
    </div>
    <div class="form-group"><label>Billing Month *</label><input id="bf_month" type="month" value="${currentMonthValue}"/></div>
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
  const currentMonthValue = getLocalMonthValue();
  const defaultDueDate = getLocalDateValue(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
  const payments = db.get('payments');

  openModal('Create Billing', `
    <div class="billing-form">
      <section class="billing-form-section">
        <div class="billing-form-kicker">Billing details</div>
        <div class="form-group">
          <label>Billing Type *</label>
          <select id="bf_billing_type" class="form-control">
            <option value="Monthly Association Dues">Monthly Association Dues</option>
            <option value="Other Billing">Other Billing</option>
          </select>
        </div>
        <div class="form-group" id="bf_title_group">
          <label>Title *</label>
          <input id="bf_title" value="Monthly Association Dues" placeholder="Monthly Association Dues"/>
        </div>
        <div class="form-group" id="bf_month_group">
          <label>Billing Month *</label>
          <input id="bf_month" type="month" value="${currentMonthValue}"/>
        </div>
        <div class="grid-2 billing-compact-grid">
          <div class="form-group">
            <label>Amount (PHP) *</label>
            <input id="bf_amount" type="number" min="0" step="0.01" placeholder="1500.00"/>
            <div class="billing-helper-text" id="bf_amountHint"></div>
          </div>
          <div class="form-group">
            <label>Due Date *</label>
            <input id="bf_due" type="date" value="${defaultDueDate}"/>
          </div>
        </div>
        <div class="form-group billing-desc-group" id="bf_desc_group">
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
        <div class="billing-homeowner-list" id="bf_homeownerList">
          ${homeowners.map(u => {
            const alreadyPaid = payments.some(p => p.homeownerId === u.id && p.monthly_dues_month === currentMonthValue && p.status === 'approved');
            return `
            <label class="billing-homeowner-row ${alreadyPaid ? 'is-paid-advance' : ''}" data-search="${`${u.name} ${u.block || ''} ${u.lot || ''} ${u.username || ''}`.toLowerCase()}">
              <input type="checkbox" class="ho-cb" value="${u.id}" onchange="updateProfessionalBillingSummary()">
              <span class="billing-homeowner-main">
                <span class="billing-homeowner-name">${escapeHtml(u.name)}${alreadyPaid ? ' <span class="badge badge-teal paid-advance-badge" style="font-size:0.7rem;padding:2px 6px;margin-left:6px">Paid in advance</span>' : ''}</span>
                <span class="billing-homeowner-meta">${escapeHtml(u.block || 'No block')} | ${escapeHtml(u.lot || 'No lot')}${u.lotArea ? ` (${u.lotArea} sqm)` : ''}</span>
              </span>
            </label>`;
          }).join('')}
        </div>
      </section>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Create Billing', cls: 'btn-primary', action: saveAddBilling },
  ]);

  setupProfessionalBillingSearch();
  setupBillingAmountAutoFill();
  setupBillingTypeSwitcher();
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

function refreshHomeownerPaymentBadges() {
  const monthInput = document.getElementById('bf_month');
  const selectedMonth = monthInput ? monthInput.value : '';
  const isMonthly = getSelectedBillingType() === BILLING_TYPE_MONTHLY_DUES;
  const payments = db.get('payments');
  document.querySelectorAll('.billing-homeowner-row').forEach(row => {
    const cb = row.querySelector('.ho-cb');
    if (!cb) return;
    const uid = cb.value;
    const paidBadge = row.querySelector('.paid-advance-badge');
    const alreadyPaid = Boolean(isMonthly && selectedMonth && payments.some(p => p.homeownerId === uid && p.monthly_dues_month === selectedMonth && p.status === 'approved'));
    if (alreadyPaid) {
      if (!paidBadge) {
        const nameEl = row.querySelector('.billing-homeowner-name');
        if (nameEl) {
          const badge = document.createElement('span');
          badge.className = 'badge badge-teal paid-advance-badge';
          badge.style.cssText = 'font-size:0.7rem;padding:2px 6px;margin-left:6px';
          badge.textContent = 'Paid in advance';
          nameEl.appendChild(badge);
        }
      }
    } else if (paidBadge) {
      paidBadge.remove();
    }
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

const BILLING_TYPE_MONTHLY_DUES = 'Monthly Association Dues';
const BILLING_TYPE_OTHER = 'Other Billing';

function getSelectedBillingType() {
  return document.getElementById('bf_billing_type')?.value || BILLING_TYPE_MONTHLY_DUES;
}

function isMonthlyAssociationDuesBillingRecord(billing) {
  if (!billing) return false;
  if (billing.billing_type === BILLING_TYPE_MONTHLY_DUES) return true;
  if (billing.billing_type === BILLING_TYPE_OTHER) return false;
  return Boolean(billing.monthly_dues_month && isMonthlyDuesTitle(billing.title));
}

function setupBillingTypeSwitcher() {
  const typeInput = document.getElementById('bf_billing_type');
  if (!typeInput) return;
  typeInput.addEventListener('change', updateBillingTypeFields);
  updateBillingTypeFields();
}

function updateBillingTypeFields() {
  const billingType = getSelectedBillingType();
  const isMonthly = billingType === BILLING_TYPE_MONTHLY_DUES;
  const titleGroup = document.getElementById('bf_title_group');
  const titleInput = document.getElementById('bf_title');
  const monthGroup = document.getElementById('bf_month_group');
  const descInput = document.getElementById('bf_desc');

  if (titleGroup) titleGroup.style.display = isMonthly ? 'none' : '';
  if (monthGroup) monthGroup.style.display = isMonthly ? '' : 'none';
  if (titleInput) {
    if (isMonthly) {
      titleInput.value = BILLING_TYPE_MONTHLY_DUES;
      titleInput.placeholder = BILLING_TYPE_MONTHLY_DUES;
    } else {
      titleInput.value = titleInput.value === BILLING_TYPE_MONTHLY_DUES ? '' : titleInput.value;
      titleInput.placeholder = 'e.g. Vehicle Sticker Fee';
    }
  }
  if (descInput) {
    descInput.placeholder = isMonthly
      ? 'Optional notes for this monthly dues billing...'
      : 'Describe the charge, damage, service, or fee...';
  }

  refreshHomeownerPaymentBadges();
  updateBillingAmountForMonthlyDues();
}

function setupBillingAmountAutoFill() {
  const titleInput = document.getElementById('bf_title');
  const monthInput = document.getElementById('bf_month');
  const typeInput = document.getElementById('bf_billing_type');
  if (titleInput) titleInput.addEventListener('input', updateBillingAmountForMonthlyDues);
  if (typeInput) typeInput.addEventListener('change', updateBillingAmountForMonthlyDues);
  if (monthInput) {
    monthInput.addEventListener('change', () => {
      refreshHomeownerPaymentBadges();
      updateBillingAmountForMonthlyDues();
    });
  }
  updateBillingAmountForMonthlyDues();
}

function updateBillingAmountForMonthlyDues() {
  const amountInput = document.getElementById('bf_amount');
  const hint = document.getElementById('bf_amountHint');
  if (!amountInput) return;

  const monthlyDues = getSelectedBillingType() === BILLING_TYPE_MONTHLY_DUES;
  const selectedIds = [...document.querySelectorAll('.ho-cb:checked')].map(c => c.value);

  amountInput.readOnly = false;
  if (hint) hint.textContent = '';

  if (!monthlyDues) return;

  if (selectedIds.length === 1) {
    const user = db.getOne('users', selectedIds[0]);
    const rate = getDuesRatePerSqm();
    const amount = calculateMonthlyDues(user, rate);
    if (!amountInput.value || amountInput.dataset.autofilled === 'true') {
      amountInput.value = amount.toFixed(2);
      amountInput.dataset.autofilled = 'true';
    }
    if (hint) hint.textContent = `${user?.lotArea || 0} sqm x PHP ${rate.toLocaleString()} per sqm`;
  } else if (selectedIds.length > 1) {
    if (amountInput.dataset.autofilled === 'true') {
      delete amountInput.dataset.autofilled;
    }
    if (hint) hint.textContent = 'Enter the dues amount to apply to each selected homeowner.';
  }
}

async function saveAddBilling() {
  try {
    const billingType = getSelectedBillingType();
    const isMonthlyDues = billingType === BILLING_TYPE_MONTHLY_DUES;
    const enteredTitle = (document.getElementById('bf_title')?.value || '').trim();
    const due = (document.getElementById('bf_due')?.value || '').trim();
    const rawMonthInput = (document.getElementById('bf_month')?.value || '').trim();
    const billingMonth = isMonthlyDues ? formatBillingMonth(rawMonthInput) : '';
    const description = (document.getElementById('bf_desc')?.value || '').trim();

    if (!billingType || ![BILLING_TYPE_MONTHLY_DUES, BILLING_TYPE_OTHER].includes(billingType)) {
      showToast('error', 'Missing Billing Type', 'Select a valid billing type.');
      return;
    }

    if (!due) {
      showToast('error', 'Missing Due Date', 'Due Date is required.');
      return;
    }

    if (isMonthlyDues && !rawMonthInput) {
      showToast('error', 'Missing Billing Month', 'Billing Month is required for Monthly Association Dues.');
      return;
    }

    if (isMonthlyDues && !billingMonth) {
      showToast('error', 'Invalid Month', 'Please select a valid billing month.');
      return;
    }

    if (!isMonthlyDues && !enteredTitle) {
      showToast('error', 'Missing Title', 'Billing Title is required for Other Billing.');
      return;
    }

    const checked = [...document.querySelectorAll('.ho-cb:checked')].map(c => c.value);
    if (!checked.length) {
      showToast('error', 'No Assignment', 'Select at least one homeowner.');
      return;
    }

    const amountInput = document.getElementById('bf_amount');
    const amount = parseFloat(amountInput ? amountInput.value : '');
    if (isNaN(amount) || amount <= 0) {
      showToast('error', 'Invalid Amount', 'Enter a valid billing amount.');
      return;
    }

    if (isMonthlyDues) {
      const billings = db.get('billings');
      const payments = db.get('payments');
      const paidResident = checked.map(uid => db.getOne('users', uid)).find(u =>
        payments.some(p => p.homeownerId === u?.id && p.monthly_dues_month === rawMonthInput && p.status === 'approved')
      );
      if (paidResident) {
        showToast('error', 'Already Paid', 'This homeowner has already paid the Monthly Association Dues for this month.');
        return;
      }

      const duplicateResident = checked.map(uid => db.getOne('users', uid)).find(u =>
        billings.some(b =>
          isMonthlyAssociationDuesBillingRecord(b) &&
          b.monthly_dues_month === rawMonthInput &&
          getAssignedHomeownerIds(b).includes(u?.id)
        )
      );
      if (duplicateResident) {
        showToast('error', 'Duplicate Billing', `Monthly Association Dues billing already exists for ${duplicateResident.name || 'this homeowner'} for ${billingMonth}.`);
        return;
      }
    }

    const finalTitle = isMonthlyDues
      ? `${BILLING_TYPE_MONTHLY_DUES} - ${billingMonth}`
      : enteredTitle;

    let finalDesc = '';
    if (isMonthlyDues) {
      finalDesc = description ? `Billing month: ${billingMonth}. ${description}` : `Billing month: ${billingMonth}.`;
    } else {
      finalDesc = description;
    }

    const bill = {
      id: db.newId('b'),
      title: finalTitle,
      amount,
      dueDate: due,
      description: finalDesc,
      assignedTo: checked,
      status: 'active',
      createdAt: getLocalDateValue(),
      monthly_dues_month: isMonthlyDues ? rawMonthInput : null,
      billing_type: billingType,
    };

    showLoading();
    // 1. Persist to MySQL and wait for response
    await db.save('billings', bill);

    // 2. Reload fresh data from backend
    await api.loadAll();

    // 3. Synchronize homeowner balances from actual billings and approved payments
    if (canManageBilling()) {
      await syncHomeownerBalances();
      await api.loadAll();
    }

    if (typeof logAction === 'function') {
      logAction(`Created billing: ${finalTitle} for ${checked.length} homeowner(s)`);
    }
    closeModal();
    hideLoading();
    showToast('success', 'Billing Created', `"${finalTitle}" has been created.`);
    renderBilling();
  } catch (err) {
    hideLoading();
    console.error('Failed to create billing:', err);
    showToast('error', 'Creation Failed', err.message || 'Could not save billing.');
  }
}

function viewBillingDetail(id) {
  const b = db.getOne('billings', id);
  if (!b) return;
  const users = db.get('users');
  const assignedIds = getAssignedHomeownerIds(b);
  const assignedNames = assignedIds.map(uid => { const u = users.find(x => x.id === uid); return u ? u.name : uid; });
  const amountStr = Number(b.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const monthText = b.monthly_dues_month ? formatBillingMonth(b.monthly_dues_month) : '';
  openModal(b.title, `
    <p style="color:var(--text-2);margin-bottom:16px">${escapeHtml(b.description || 'No description.')}</p>
    ${monthText ? `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center"><span style="color:var(--text-3);font-size:0.84rem">Monthly Dues Month:</span><strong style="color:var(--teal-700)">${escapeHtml(monthText)}</strong></div>` : ''}
    <div class="grid-2 mb-16">
      <div class="report-summary-item"><div class="r-val">₱${amountStr}</div><div class="r-lbl">Amount</div></div>
      <div class="report-summary-item"><div class="r-val">${escapeHtml(b.dueDate || '—')}</div><div class="r-lbl">Due Date (Created: ${escapeHtml(b.createdAt || '—')})</div></div>
    </div>
    <strong style="font-size:0.82rem;color:var(--text-3)">ASSIGNED TO (${assignedNames.length})</strong>
    <div style="margin-top:8px;max-height:180px;overflow-y:auto">
      ${assignedNames.map(n => `<div style="padding:6px 0;font-size:0.88rem;border-bottom:1px solid var(--border);color:var(--text-2)">- ${escapeHtml(n)}</div>`).join('')}
    </div>
  `, [{ label: 'Close', cls: 'btn-secondary', action: closeModal }]);
}

function confirmDeleteBilling(id) {
  if (!canManageBilling()) { showToast('error', 'Access Denied', 'Only the admin can delete billings.'); return; }
  const b = db.getOne('billings', id);
  if (!b) return;
  openModal('Delete Billing', `<p>Delete <strong>${escapeHtml(b.title)}</strong>? This cannot be undone.</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Delete', cls: 'btn-danger', action: async () => {
      try {
        showLoading();
        await db.delete('billings', id);
        await api.loadAll();
        if (canManageBilling()) {
          await syncHomeownerBalances();
          await api.loadAll();
        }
        logAction(`Deleted billing: ${b.title}`);
        closeModal();
        hideLoading();
        showToast('success', 'Deleted', 'Billing removed and balances updated.');
        renderBilling();
      } catch (err) {
        hideLoading();
        console.error(err);
        showToast('error', 'Delete Failed', err.message || 'Could not delete billing.');
      }
    } },
  ]);
}

async function autoGenerateMonthlyDues() {
  const month = new Date().toLocaleString('default', { month: 'long' });
  const year = new Date().getFullYear();
  const title = `Monthly Dues – ${month} ${year}`;
  const homeowners = db.get('users').filter(u => u.role === 'homeowner');
  const existing = db.get('billings').find(b => b.title === title);
  if (existing) { showToast('warning', 'Already Exists', `Dues for ${month} already created.`); return; }
  const lastDay = getLocalDateValue(new Date(year, new Date().getMonth() + 1, 0));
  const bill = { id: db.newId('b'), title, amount: 1500, dueDate: lastDay, description: 'Auto-generated monthly dues.', assignedTo: homeowners.map(u => u.id), status: 'active', createdAt: getLocalDateValue() };
  try {
    showLoading();
    await db.save('billings', bill);
    await api.loadAll();
    if (canManageBilling()) {
      await syncHomeownerBalances();
      await api.loadAll();
    }
    logAction(`Auto-generated monthly dues: ${title}`);
    hideLoading();
    showToast('success', 'Generated', `${title} created for ${homeowners.length} homeowners.`);
    renderBilling();
  } catch (err) {
    hideLoading();
    console.error(err);
    showToast('error', 'Failed', err.message || 'Could not auto-generate dues.');
  }
}

function autoGenerateLotAreaMonthlyDues() {
  if (!canManageBilling()) { showToast('error', 'Access Denied', 'Only the admin can generate billings.'); return; }

  const now = new Date();
  const currentMonthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  openModal('Generate Monthly Dues', `
    <div style="padding:4px 0">
      <p style="color:var(--text-2);margin-bottom:16px;font-size:0.9rem">
        Select the month for this billing. Homeowners with an approved advance payment for the selected month will be automatically excluded.
      </p>
      <div class="form-group">
        <label style="font-weight:700">Select Month *</label>
        <input type="month" id="gen_dues_month" class="form-control" value="${currentMonthValue}" style="width:100%;padding:10px;font-size:1rem;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface);color:var(--text)" />
      </div>
      <div style="background:var(--surface-2);border-radius:var(--radius);padding:12px;margin-top:14px;border:1px solid var(--border);font-size:0.82rem;color:var(--text-3)">
        <div style="font-weight:700;color:var(--text-2);margin-bottom:4px">Smart Dues Generation Rules:</div>
        <div>✓ <strong>Approved Advance Payments:</strong> Excluded from billing automatically.</div>
        <div style="margin-top:2px">⏳ <strong>Pending Payments:</strong> Homeowner is billed with a note noting the pending submission.</div>
        <div style="margin-top:2px">🛡️ <strong>Duplicate Protection:</strong> Will not create duplicate billings if already generated.</div>
      </div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Generate Billing', cls: 'btn-primary', action: executeAutoGenerateMonthlyDues },
  ]);
}

async function executeAutoGenerateMonthlyDues() {
  const monthInput = document.getElementById('gen_dues_month');
  const selectedMonth = monthInput ? monthInput.value.trim() : '';
  if (!selectedMonth || !/^\d{4}-\d{2}$/.test(selectedMonth)) {
    showToast('error', 'Select Month', 'Please select a valid month.');
    return;
  }

  showLoading();
  try {
    const res = await api.request('/api/billings/generate-monthly-dues', {
      method: 'POST',
      body: JSON.stringify({ month: selectedMonth }),
    });

    await api.loadAll();
    if (canManageBilling()) {
      await syncHomeownerBalances();
      await api.loadAll();
    }

    closeModal();
    hideLoading();

    const monthDisplay = formatBillingMonth(selectedMonth);
    if (res.createdCount > 0) {
      const excludedMsg = res.excludedCount > 0 ? ` (${res.excludedCount} homeowner(s) excluded because dues were already paid in advance)` : '';
      showToast('success', 'Monthly Dues Generated', `Created ${res.createdCount} billing(s) for ${monthDisplay}${excludedMsg}.`);
    } else if (res.excludedCount > 0) {
      showToast('info', 'Already Paid', `All eligible homeowners have already paid their dues for ${monthDisplay} in advance (${res.excludedCount} excluded).`);
    } else {
      showToast('warning', 'Already Generated', `Monthly dues for ${monthDisplay} have already been generated for all homeowners.`);
    }

    renderBilling();
  } catch (err) {
    hideLoading();
    console.error('Failed to generate monthly dues:', err);
    showToast('error', 'Generation Failed', err.message || 'Could not auto-generate dues.');
  }
}

// SECTION 9: ADMIN — PAYMENTS



// SECTION 9: PAYMENTS & GCASH INTEGRATION

function renderPayments() {
  if (!canViewPayments()) { showToast('error', 'Access Denied', 'You do not have access to payment records.'); return; }
  const managePayments = canManagePayments();
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <h2>${managePayments ? 'Payment Management' : 'Payment Records'}</h2>
      <p>${managePayments ? 'Review, verify, and approve resident GCash payment submissions.' : 'View payment records.'}</p>
    </div>
    ${managePayments ? `
      <div class="page-header-actions">
        <button class="btn btn-primary" onclick="openCreateManualPaymentModal()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:-2px"><use href="#ico-plus"/></svg>
          Create Payment
        </button>
        <button class="btn btn-primary" onclick="openPaymentSettingsModal()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:-2px"><use href="#ico-settings"/></svg>
          Payment Settings
        </button>
      </div>
    ` : ''}
  </div>
  <div class="section-card">
    <div class="section-card-header">
      <div class="filters-row" style="align-items:center;">
        <div class="search-box">
          <span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span>
          <input id="paySearch" type="text" placeholder="Search by resident name or reference number..." oninput="filterPayments()"/>
        </div>
        <select class="filter-select" id="payFilter" onchange="filterPayments()">
          <option value="">All Statuses</option>
          <option value="pending">Pending Verification</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select class="filter-select" id="payDateFilter" onchange="onPaymentDateFilterChange()">
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="date">Choose Date</option>
          <option value="range">Date Range</option>
        </select>
        <div id="payDateWrap" class="date-input-group" style="display:none;">
          <input type="date" class="filter-select" id="payDate" onchange="filterPayments()" title="Select specific date"/>
        </div>
        <div id="payRangeWrap" class="date-input-group" style="display:none;">
          <input type="date" class="filter-select" id="payStartDate" onchange="filterPayments()" title="Start date" placeholder="Start Date"/>
          <span class="date-range-sep">to</span>
          <input type="date" class="filter-select" id="payEndDate" onchange="filterPayments()" title="End date" placeholder="End Date"/>
        </div>
        <button class="btn btn-secondary btn-sm" id="payResetBtn" onclick="resetPaymentFilters()" title="Reset all filters">
          Reset
        </button>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Resident</th>
              <th>Block/Lot</th>
              <th>Billing Period</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Reference #</th>
              <th>Payment Date</th>
              <th>Status</th>
              <th>Submitted Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="payTableBody"></tbody>
        </table>
      </div>
    </div>
  </div>`;

  document.getElementById('paySearch').addEventListener('input', filterPayments);
  renderPaymentTable();
}

function renderPaymentTable(filtered = null) {
  const payments = filtered !== null ? filtered : db.get('payments');
  const tbody = document.getElementById('payTableBody');
  if (!tbody) return;
  if (!payments.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-credit"/></svg>No payments found.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = [...payments]
    .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || '') || (b.id || '').localeCompare(a.id || ''))
    .map(p => {
      const ho = db.getOne('users', p.homeownerId);
      const bill = db.getOne('billings', p.billingId);
      let billTitleDisplay = bill ? bill.title : '';
      if (!billTitleDisplay && p.monthly_dues_month) {
        billTitleDisplay = `Monthly Dues - ${formatBillingMonth(p.monthly_dues_month)}`;
      }
      if (!billTitleDisplay) billTitleDisplay = 'N/A';
      const isAdvance = Boolean(!p.billingId && p.monthly_dues_month);
      const blockLot = [ho?.block, ho?.lot].filter(Boolean).join(' ') || '—';
      const formattedAmount = '₱' + Number(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const methodBadge = `<span class="badge ${p.payment_method === 'Cash' ? 'badge-cash' : 'badge-gcash'}">${escapeHtml(p.payment_method || 'GCash')}</span>`;
      const statusBadge = p.status === 'pending'
        ? '<span class="badge badge-yellow">Pending</span>'
        : (p.status === 'approved' ? '<span class="badge badge-green">Approved</span>' : '<span class="badge badge-red">Rejected</span>');

      return `<tr>
        <td><strong>${escapeHtml(ho ? ho.name : 'Unknown')}</strong></td>
        <td>${escapeHtml(blockLot)}</td>
        <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(billTitleDisplay)}">
          ${escapeHtml(billTitleDisplay)}${isAdvance ? ' <span class="badge badge-teal" style="font-size:0.68rem;padding:1px 6px">Advance</span>' : ''}
        </td>
        <td class="amount-paid">${formattedAmount}</td>
        <td>${methodBadge}</td>
        <td><code style="font-size:0.84rem;font-weight:700;color:var(--text)">${escapeHtml(p.refNum || '—')}</code></td>
        <td>${escapeHtml(p.payment_date || p.submittedAt || '—')}</td>
        <td>${statusBadge}</td>
        <td>${escapeHtml(p.submittedAt || '—')}</td>
        <td>
          <div class="td-actions">
            <button class="btn btn-secondary btn-sm" onclick="viewPaymentDetail('${p.id}')">Review</button>
            ${canManagePayments() && p.status === 'pending' ? `
              <button class="btn btn-success btn-sm btn-icon" onclick="confirmApprovePayment('${p.id}')" title="Approve Payment">&#10003;</button>
              <button class="btn btn-danger btn-sm btn-icon" onclick="openRejectPaymentModal('${p.id}')" title="Reject Payment">&#10007;</button>
            ` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
}

function getPaymentRecordDates(payment) {
  const dates = [];
  if (payment?.payment_date) {
    const d = parseBillingFilterDate(payment.payment_date);
    if (d) dates.push(d);
  }
  if (payment?.submittedAt) {
    const d = parseBillingFilterDate(payment.submittedAt);
    if (d) dates.push(d);
  }
  if (!dates.length) {
    if (payment?.createdAt || payment?.created_at) {
      const d = parseBillingFilterDate(payment.createdAt || payment.created_at);
      if (d) dates.push(d);
    }
    if (payment?.reviewedAt) {
      const d = parseBillingFilterDate(payment.reviewedAt);
      if (d) dates.push(d);
    }
  }
  return dates;
}
if (typeof window !== 'undefined') window.getPaymentRecordDates = getPaymentRecordDates;

function onPaymentDateFilterChange() {
  const mode = document.getElementById('payDateFilter')?.value || 'all';
  const dateWrap = document.getElementById('payDateWrap');
  const rangeWrap = document.getElementById('payRangeWrap');
  const dateInput = document.getElementById('payDate');
  const startInput = document.getElementById('payStartDate');
  const endInput = document.getElementById('payEndDate');

  if (dateWrap) dateWrap.style.display = (mode === 'date') ? 'inline-flex' : 'none';
  if (rangeWrap) rangeWrap.style.display = (mode === 'range') ? 'inline-flex' : 'none';

  if (mode === 'date' && dateInput && !dateInput.value) {
    dateInput.value = getLocalDateValue();
  }
  if (mode === 'range') {
    if (startInput && !startInput.value) {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      startInput.value = getLocalDateValue(d);
    }
    if (endInput && !endInput.value) {
      endInput.value = getLocalDateValue();
    }
  }

  filterPayments();
}
if (typeof window !== 'undefined') window.onPaymentDateFilterChange = onPaymentDateFilterChange;

function resetPaymentFilters() {
  const searchInput = document.getElementById('paySearch');
  const statusFilter = document.getElementById('payFilter');
  const dateFilter = document.getElementById('payDateFilter');
  const dateInput = document.getElementById('payDate');
  const startInput = document.getElementById('payStartDate');
  const endInput = document.getElementById('payEndDate');
  const dateWrap = document.getElementById('payDateWrap');
  const rangeWrap = document.getElementById('payRangeWrap');

  if (searchInput) searchInput.value = '';
  if (statusFilter) statusFilter.value = '';
  if (dateFilter) dateFilter.value = 'all';
  if (dateInput) dateInput.value = '';
  if (startInput) startInput.value = '';
  if (endInput) endInput.value = '';
  if (dateWrap) dateWrap.style.display = 'none';
  if (rangeWrap) rangeWrap.style.display = 'none';

  filterPayments();
}
if (typeof window !== 'undefined') window.resetPaymentFilters = resetPaymentFilters;

function filterPayments() {
  const q = (document.getElementById('paySearch')?.value || '').toLowerCase().trim();
  const status = document.getElementById('payFilter')?.value || '';
  const datePreset = (document.getElementById('payDateFilter')?.value || 'all').toLowerCase();
  const dateInput = document.getElementById('payDate');
  const startInput = document.getElementById('payStartDate');
  const endInput = document.getElementById('payEndDate');

  const now = new Date();
  let rangeStart = null;
  let rangeEnd = null;

  if (datePreset === 'today') {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (datePreset === 'week') {
    const day = now.getDay() || 7; // Monday is the start of the week
    rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1, 0, 0, 0, 0);
    rangeEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + 6, 23, 59, 59, 999);
  } else if (datePreset === 'month') {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (datePreset === 'year') {
    rangeStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    rangeEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else if (datePreset === 'date') {
    const d = parseBillingFilterDate(dateInput?.value);
    if (d) {
      rangeStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      rangeEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    }
  } else if (datePreset === 'range') {
    const s = parseBillingFilterDate(startInput?.value);
    const e = parseBillingFilterDate(endInput?.value);
    if (s) rangeStart = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
    if (e) rangeEnd = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999);
    if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
      const tmp = rangeStart;
      rangeStart = rangeEnd;
      rangeEnd = tmp;
    }
  }

  let payments = db.get('payments') || [];
  if (status) payments = payments.filter(p => p.status === status);
  if (q) {
    const users = db.get('users') || [];
    const billings = db.get('billings') || [];
    payments = payments.filter(p => {
      const ho = users.find(u => u.id === p.homeownerId);
      const bill = billings.find(b => b.id === p.billingId);
      const blockLot = [ho?.block, ho?.lot].filter(Boolean).join(' ');
      const amountStr = String(p.amount || '');
      return (
        (ho && (ho.name || '').toLowerCase().includes(q)) ||
        (blockLot && blockLot.toLowerCase().includes(q)) ||
        (p.refNum && p.refNum.toLowerCase().includes(q)) ||
        (bill && (bill.title || '').toLowerCase().includes(q)) ||
        (p.monthly_dues_month && p.monthly_dues_month.toLowerCase().includes(q)) ||
        (p.payment_method && p.payment_method.toLowerCase().includes(q)) ||
        amountStr.includes(q)
      );
    });
  }

  if (datePreset !== 'all' && (rangeStart || rangeEnd)) {
    payments = payments.filter(p => {
      const pDates = getPaymentRecordDates(p);
      if (!pDates.length) return false;
      return pDates.some(d => {
        if (rangeStart && d < rangeStart) return false;
        if (rangeEnd && d > rangeEnd) return false;
        return true;
      });
    });
  }

  renderPaymentTable(payments);
}
if (typeof window !== 'undefined') window.filterPayments = filterPayments;

// ── ADMIN MANUAL PAYMENT ──

let manualPaymentSubmitting = false;

function getEligibleManualBillings(homeownerId) {
  if (!homeownerId) return [];
  const payments = db.get('payments');
  return db.get('billings').filter(billing => {
    if (!getAssignedHomeownerIds(billing).includes(homeownerId) || billing.status === 'inactive') return false;
    return !payments.some(payment =>
      payment.homeownerId === homeownerId &&
      payment.billingId === billing.id &&
      ['pending', 'approved'].includes(payment.status)
    );
  });
}

function manualBillingOptionLabel(billing) {
  const type = billing.billing_type || (billing.monthly_dues_month ? 'Monthly Association Dues' : 'Other Billing');
  const period = billing.monthly_dues_month ? formatBillingMonth(billing.monthly_dues_month) : billing.title;
  const amount = Number(billing.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${type} — ${period} — ₱${amount} — Due ${billing.dueDate || '—'}`;
}

function openCreateManualPaymentModal() {
  if (!canManagePayments()) { showToast('error', 'Access Denied', 'Only authorized managers can create payments.'); return; }
  manualPaymentSubmitting = false;
  const homeowners = db.get('users')
    .filter(user => user.role === 'homeowner' && !['inactive', 'deactivated'].includes(user.status))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  openModal('Create Payment', `
    <div class="payment-flow-modal">
      <p style="margin:0 0 16px;color:var(--text-2);font-size:0.88rem">Record an in-person payment against an existing billing. The payment is immediately marked as paid.</p>
      <div class="form-group" style="position:relative;">
        <label for="manual_payment_homeowner_search">Resident / Homeowner *</label>
        <input type="hidden" id="manual_payment_homeowner" value="">
        <div class="manual-payment-resident-box">
          <div class="manual-payment-search-wrap">
            <span class="manual-payment-search-icon">
              <svg width="15" height="15"><use href="#ico-search"/></svg>
            </span>
            <input 
              id="manual_payment_homeowner_search" 
              type="text" 
              class="form-control manual-payment-search-input" 
              placeholder="Type to search resident by letters or name..." 
              autocomplete="off"
            />
            <div class="manual-payment-search-controls">
              <button type="button" id="manual_payment_clear_btn" class="manual-payment-btn-clear" style="display:none;" title="Clear resident selection">&#10005;</button>
              <button type="button" id="manual_payment_dropdown_toggle" class="manual-payment-btn-toggle" title="Show all residents" aria-label="Show all residents"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button>
            </div>
          </div>
          <div id="manual_payment_resident_dropdown" class="manual-payment-resident-dropdown" style="display:none;"></div>
        </div>
        <div id="manual_payment_connected_resident_card" style="display:none;"></div>
      </div>
      <div class="form-group">
        <label for="manual_payment_billing">Billing *</label>
        <select id="manual_payment_billing" disabled onchange="updateManualPaymentSummary()">
          <option value="">Select a resident first</option>
        </select>
        <div id="manual_payment_billing_info" style="font-size:0.78rem;color:var(--text-3);margin-top:6px">Only unpaid billings assigned to the selected resident are available.</div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label for="manual_payment_amount">Payment Amount</label>
          <input id="manual_payment_amount" type="text" readonly placeholder="Select a billing"/>
          <div style="font-size:0.75rem;color:var(--text-3);margin-top:4px">Uses the exact billing amount; partial payments are not supported.</div>
        </div>
        <div class="form-group">
          <label for="manual_payment_method">Payment Method *</label>
          <select id="manual_payment_method" onchange="updateManualPaymentSummary()">
            <option value="Cash">Cash</option>
            <option value="GCash">GCash</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label for="manual_payment_date">Payment Date *</label>
          <input id="manual_payment_date" type="date" value="${getLocalDateValue()}" onchange="updateManualPaymentSummary()"/>
        </div>
        <div class="form-group">
          <label for="manual_payment_reference">Reference / Receipt Number</label>
          <input id="manual_payment_reference" type="text" maxlength="191" placeholder="Optional for cash" onchange="updateManualPaymentSummary()"/>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label for="manual_payment_notes">Notes</label>
        <textarea id="manual_payment_notes" placeholder="e.g., Paid personally at HOA office." onchange="updateManualPaymentSummary()"></textarea>
      </div>
      <div id="manual_payment_summary" style="border:1px solid var(--border);background:var(--surface-2);border-radius:var(--radius);padding:14px;font-size:0.86rem;color:var(--text-2)">
        Select a resident and billing to review this payment before creating it.
      </div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Create Payment', cls: 'btn-primary', action: executeCreateManualPayment },
  ]);

  setupManualPaymentResidentSearch(homeowners);
}

function setupManualPaymentResidentSearch(homeowners) {
  const hiddenInput = document.getElementById('manual_payment_homeowner');
  const searchInput = document.getElementById('manual_payment_homeowner_search');
  const clearBtn = document.getElementById('manual_payment_clear_btn');
  const toggleBtn = document.getElementById('manual_payment_dropdown_toggle');
  const dropdown = document.getElementById('manual_payment_resident_dropdown');
  const connectedCard = document.getElementById('manual_payment_connected_resident_card');
  if (!hiddenInput || !searchInput || !dropdown) return;

  let activeIndex = -1;
  let filteredHomeowners = [...homeowners];

  function highlightMatches(text, query) {
    if (!text) return '';
    if (!query) return escapeHtml(text);
    const words = query.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return escapeHtml(text);
    const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp(`(${escapedWords})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark class="manual-payment-search-highlight">$1</mark>');
  }

  function renderDropdown(query = '') {
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    filteredHomeowners = homeowners.filter(u => {
      if (!words.length) return true;
      const hay = `${u.name || ''} ${u.block || ''} ${u.lot || ''} ${u.username || ''} ${u.email || ''}`.toLowerCase();
      return words.every(word => hay.includes(word));
    });

    activeIndex = -1;

    if (!filteredHomeowners.length) {
      dropdown.innerHTML = `
        <div class="manual-payment-empty">
          No resident found matching "<strong>${escapeHtml(query.trim())}</strong>"
        </div>
      `;
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = filteredHomeowners.map((user, idx) => {
      const location = [user.block, user.lot].filter(Boolean).join(' ');
      const unpaidBillings = getEligibleManualBillings(user.id);
      const unpaidCount = unpaidBillings.length;
      return `
        <div class="manual-payment-resident-item" data-index="${idx}" data-id="${escapeHtml(user.id)}">
          <div class="resident-info-left">
            <div class="resident-item-name">${highlightMatches(user.name, q)}</div>
            <div class="resident-item-meta">
              ${location ? `<span>${highlightMatches(location, q)}</span>` : ''}
              ${user.username ? `<span>@${highlightMatches(user.username, q)}</span>` : ''}
            </div>
          </div>
          <div class="resident-item-badge">
            <span class="badge ${unpaidCount > 0 ? 'badge-amber' : 'badge-gray'}" style="font-size:0.72rem;padding:2px 7px;">
              ${unpaidCount} unpaid ${unpaidCount === 1 ? 'bill' : 'bills'}
            </span>
          </div>
        </div>
      `;
    }).join('');

    dropdown.querySelectorAll('.manual-payment-resident-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(item.getAttribute('data-index'), 10);
        if (filteredHomeowners[idx]) {
          selectResident(filteredHomeowners[idx]);
        }
      });
    });

    dropdown.style.display = 'block';
  }

  function selectResident(user) {
    hiddenInput.value = user.id;
    const location = [user.block, user.lot].filter(Boolean).join(' ');
    searchInput.value = `${user.name}${location ? ` (${location})` : ''}`;
    if (clearBtn) clearBtn.style.display = 'inline-flex';
    dropdown.style.display = 'none';

    // Render connected resident card
    if (connectedCard) {
      const unpaidBillings = getEligibleManualBillings(user.id);
      const unpaidCount = unpaidBillings.length;
      connectedCard.innerHTML = `
        <div class="manual-payment-connected-card">
          <div class="connected-card-header">
            <div class="connected-left">
              <div class="connected-icon">&#10003;</div>
              <div style="min-width:0;">
                <div class="connected-title">Connected Resident</div>
                <div class="connected-name">${escapeHtml(user.name)}</div>
                <div class="connected-sub">${escapeHtml([user.block, user.lot].filter(Boolean).join(' · ') || 'No block/lot')}${user.username ? ` · @${escapeHtml(user.username)}` : ''}${user.email ? ` · ${escapeHtml(user.email)}` : ''}</div>
              </div>
            </div>
            <div class="connected-right">
              <span class="badge ${unpaidCount > 0 ? 'badge-teal' : 'badge-gray'}" style="font-size:0.74rem;padding:3px 8px;">
                ${unpaidCount > 0 ? `${unpaidCount} unpaid ${unpaidCount === 1 ? 'billing' : 'billings'}` : 'No unpaid billings'}
              </span>
              <button type="button" class="btn btn-secondary btn-sm" id="manual_payment_change_resident" style="padding:3px 8px;font-size:0.75rem;">Change</button>
            </div>
          </div>
        </div>
      `;
      connectedCard.style.display = 'block';

      const changeBtn = document.getElementById('manual_payment_change_resident');
      if (changeBtn) {
        changeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          searchInput.focus();
          searchInput.select();
          renderDropdown('');
        });
      }
    }

    updateManualPaymentBillings();

    // Auto-select first unpaid billing if only one is available
    const billings = getEligibleManualBillings(user.id);
    const billingSelect = document.getElementById('manual_payment_billing');
    if (billingSelect && billings.length === 1) {
      billingSelect.value = billings[0].id;
      updateManualPaymentSummary();
    }
  }

  function clearResident() {
    hiddenInput.value = '';
    searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (connectedCard) {
      connectedCard.innerHTML = '';
      connectedCard.style.display = 'none';
    }
    dropdown.style.display = 'none';
    updateManualPaymentBillings();
  }

  searchInput.addEventListener('input', () => {
    if (hiddenInput.value) {
      hiddenInput.value = '';
      if (connectedCard) connectedCard.style.display = 'none';
      updateManualPaymentBillings();
    }
    if (searchInput.value.trim()) {
      if (clearBtn) clearBtn.style.display = 'inline-flex';
    } else {
      if (clearBtn) clearBtn.style.display = 'none';
    }
    renderDropdown(searchInput.value);
  });

  searchInput.addEventListener('focus', () => {
    renderDropdown(searchInput.value);
  });

  searchInput.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.manual-payment-resident-item');
    if (!items.length || dropdown.style.display === 'none') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        renderDropdown(searchInput.value);
        return;
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActiveItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
      updateActiveItem(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && filteredHomeowners[activeIndex]) {
        selectResident(filteredHomeowners[activeIndex]);
      } else if (filteredHomeowners.length > 0) {
        selectResident(filteredHomeowners[0]);
      }
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
    }
  });

  function updateActiveItem(items) {
    items.forEach((it, i) => {
      if (i === activeIndex) {
        it.classList.add('active');
        it.scrollIntoView({ block: 'nearest' });
      } else {
        it.classList.remove('active');
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearResident();
      searchInput.focus();
    });
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
      } else {
        searchInput.focus();
        renderDropdown('');
      }
    });
  }

  const outsideClickListener = (e) => {
    if (!dropdown.isConnected) {
      document.removeEventListener('click', outsideClickListener);
      return;
    }
    if (!e.target.closest('.manual-payment-resident-box')) {
      dropdown.style.display = 'none';
    }
  };
  document.addEventListener('click', outsideClickListener);
}

function updateManualPaymentBillings() {
  const homeownerId = document.getElementById('manual_payment_homeowner')?.value;
  const select = document.getElementById('manual_payment_billing');
  if (!select) return;
  const billings = getEligibleManualBillings(homeownerId);
  select.disabled = !homeownerId || !billings.length;
  select.innerHTML = !homeownerId
    ? '<option value="">Select a resident first</option>'
    : (!billings.length
      ? '<option value="">No eligible unpaid billings</option>'
      : `<option value="">-- Select billing --</option>${billings.map(billing => `<option value="${escapeHtml(billing.id)}">${escapeHtml(manualBillingOptionLabel(billing))}</option>`).join('')}`);
  if (billings.length === 1) {
    select.value = billings[0].id;
  }
  updateManualPaymentSummary();
}

function updateManualPaymentSummary() {
  const homeownerId = document.getElementById('manual_payment_homeowner')?.value;
  const billingId = document.getElementById('manual_payment_billing')?.value;
  const amountInput = document.getElementById('manual_payment_amount');
  const info = document.getElementById('manual_payment_billing_info');
  const summary = document.getElementById('manual_payment_summary');
  const homeowner = db.getOne('users', homeownerId);
  const billing = db.getOne('billings', billingId);
  if (!homeowner || !billing) {
    if (amountInput) amountInput.value = '';
    if (summary) summary.textContent = 'Select a resident and billing to review this payment before creating it.';
    return;
  }
  const amount = Number(billing.amount || 0);
  const paymentDate = document.getElementById('manual_payment_date')?.value || '—';
  const method = document.getElementById('manual_payment_method')?.value || '—';
  const type = billing.billing_type || (billing.monthly_dues_month ? 'Monthly Association Dues' : 'Other Billing');
  const period = billing.monthly_dues_month ? formatBillingMonth(billing.monthly_dues_month) : billing.title;
  if (amountInput) amountInput.value = `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (info) info.innerHTML = `<strong>${escapeHtml(type)}</strong> · ${escapeHtml(period)} · Due ${escapeHtml(billing.dueDate || '—')} · Current status: <strong>${billing.dueDate && billing.dueDate < getLocalDateValue() ? 'Overdue' : 'Unpaid'}</strong>`;
  if (summary) summary.innerHTML = `<strong>Review payment</strong><br>Resident: ${escapeHtml(homeowner.name)}<br>Billing: ${escapeHtml(period)} - ${escapeHtml(type)}<br>Amount: <strong>₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><br>Payment Method: ${escapeHtml(method)}<br>Payment Date: ${escapeHtml(paymentDate)}`;
}

async function executeCreateManualPayment() {
  if (manualPaymentSubmitting) return;
  const homeownerId = document.getElementById('manual_payment_homeowner')?.value || '';
  const billingId = document.getElementById('manual_payment_billing')?.value || '';
  const billing = db.getOne('billings', billingId);
  if (!homeownerId) { showToast('error', 'Resident Required', 'Select the resident who made this payment.'); return; }
  if (!billing) { showToast('error', 'Billing Required', 'Select an existing eligible billing.'); return; }

  manualPaymentSubmitting = true;
  showLoading();
  try {
    await api.createManualPayment({
      homeownerId,
      billingId,
      amount: Number(billing.amount),
      payment_method: document.getElementById('manual_payment_method')?.value,
      payment_date: document.getElementById('manual_payment_date')?.value,
      refNum: document.getElementById('manual_payment_reference')?.value?.trim(),
      remarks: document.getElementById('manual_payment_notes')?.value?.trim(),
    });
    await api.loadAll();
    await syncHomeownerBalances();
    hideLoading();
    closeModal();
    showToast('success', 'Payment Created', 'The manual payment was recorded and the billing is now paid for this resident.');
    renderPayments();
  } catch (error) {
    hideLoading();
    manualPaymentSubmitting = false;
    showToast('error', 'Create Payment Failed', error.message || 'Could not create the manual payment.');
  }
}

// ── ADMIN PAYMENT REVIEW MODAL ──

function viewPaymentDetail(id) {
  const p = db.getOne('payments', id);
  if (!p) { showToast('error', 'Error', 'Payment record not found.'); return; }
  const ho = db.getOne('users', p.homeownerId);
  const bill = db.getOne('billings', p.billingId);
  const recordedBy = db.getOne('users', p.recorded_by);
  const isManual = p.payment_source === 'manual_admin';
  const formattedAmount = '₱' + Number(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const blockLot = [ho?.block, ho?.lot].filter(Boolean).join(' ') || 'Not specified';
  const statusBadge = p.status === 'pending'
    ? '<span class="badge badge-yellow">Pending Verification</span>'
    : (p.status === 'approved' ? '<span class="badge badge-green">Approved / Paid</span>' : '<span class="badge badge-red">Rejected</span>');

  const buttons = [];
  buttons.push({ label: 'Close', cls: 'btn-secondary', action: closeModal });

  if (p.status === 'pending' && canManagePayments()) {
    buttons.push({
      label: 'Reject Payment',
      cls: 'btn-danger',
      action: () => { closeModal(); openRejectPaymentModal(p.id); }
    });
    buttons.push({
      label: 'Approve Payment',
      cls: 'btn-primary',
      action: () => { closeModal(); confirmApprovePayment(p.id); }
    });
  }

  openModal(isManual ? 'Review Manual Payment' : 'Review Payment Submission', `
    <div class="payment-flow-modal">
      <div class="grid-2 mb-16">
        <div class="report-summary-item">
          <div class="r-val" style="color:var(--teal-700)">${formattedAmount}</div>
          <div class="r-lbl">Amount Submitted</div>
        </div>
        <div class="report-summary-item">
          <div class="r-val">${statusBadge}</div>
          <div class="r-lbl">Current Status</div>
        </div>
      </div>

      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:14px">
        <h4 style="margin:0 0 10px 0;font-size:0.86rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-3)">Resident &amp; Billing Details</h4>
        <table style="width:100%;font-size:0.88rem;border-collapse:collapse">
          <tr><td style="padding:5px 0;color:var(--text-3);width:140px">Resident Name:</td><td style="font-weight:700">${escapeHtml(ho ? ho.name : 'Unknown')}</td></tr>
          <tr><td style="padding:5px 0;color:var(--text-3)">Block &amp; Lot:</td><td>${escapeHtml(blockLot)}</td></tr>
          <tr><td style="padding:5px 0;color:var(--text-3)">Contact Number:</td><td>${escapeHtml(ho?.contact || '—')}</td></tr>
          <tr><td style="padding:5px 0;color:var(--text-3)">Billing Title:</td><td><strong>${escapeHtml(bill ? bill.title : (p.monthly_dues_month ? `Monthly Dues - ${formatBillingMonth(p.monthly_dues_month)}` : 'N/A'))}</strong></td></tr>
          ${p.monthly_dues_month ? `<tr><td style="padding:5px 0;color:var(--text-3)">Monthly Dues Month:</td><td><strong>${escapeHtml(formatBillingMonth(p.monthly_dues_month))}</strong>${!p.billingId ? ' <span class="badge badge-teal" style="font-size:0.75rem;padding:2px 6px">Advance Payment</span>' : ''}</td></tr>` : ''}
          <tr><td style="padding:5px 0;color:var(--text-3)">Due Date:</td><td>${escapeHtml(bill?.dueDate || '—')}</td></tr>
          <tr><td style="padding:5px 0;color:var(--text-3)">Payment Method:</td><td><span class="badge ${p.payment_method === 'Cash' ? 'badge-cash' : 'badge-gcash'}">${escapeHtml(p.payment_method || 'GCash')}</span></td></tr>
          ${isManual ? `<tr><td style="padding:5px 0;color:var(--text-3)">Recorded By:</td><td>Admin${recordedBy ? ` — ${escapeHtml(recordedBy.name)}` : ''}</td></tr><tr><td style="padding:5px 0;color:var(--text-3)">Payment Source:</td><td><span class="badge badge-teal">Manual / Admin Recorded</span></td></tr>` : ''}
          <tr><td style="padding:5px 0;color:var(--text-3)">${isManual ? 'Reference / Receipt #:' : 'GCash Reference #:'}</td><td><code style="font-weight:800;font-size:0.95rem;color:var(--gcash-blue)">${escapeHtml(p.refNum || '—')}</code></td></tr>
          <tr><td style="padding:5px 0;color:var(--text-3)">Payment Date:</td><td>${escapeHtml(p.payment_date || p.submittedAt || '—')}</td></tr>
          <tr><td style="padding:5px 0;color:var(--text-3)">Date Submitted:</td><td>${escapeHtml(p.submittedAt || '—')}</td></tr>
          ${p.remarks && p.status !== 'rejected' ? `<tr><td style="padding:5px 0;color:var(--text-3)">${isManual ? 'Notes:' : 'Resident Note:'}</td><td>${escapeHtml(p.remarks)}</td></tr>` : ''}
        </table>
      </div>

      ${p.status === 'rejected' ? `
        <div class="rejection-reason-callout">
          <strong>Rejection Reason:</strong>
          <div style="margin-top:4px">${escapeHtml(p.rejection_reason || p.remarks || 'No reason specified')}</div>
        </div>
      ` : ''}

      ${!isManual ? `<div>
        <label style="font-size:0.82rem;font-weight:700;color:var(--text);margin-bottom:6px;display:block">Uploaded GCash Receipt / Screenshot</label>
        ${p.receipt ? `
          <div class="review-receipt-container">
            <img src="${p.receipt}" class="review-receipt-img" alt="GCash Receipt Screenshot" onclick="openReceiptLightbox('${p.receipt}')" title="Click to view full size"/>
            <div style="margin-top:8px">
              <a href="${p.receipt}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="display:inline-flex;align-items:center;gap:5px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Open Full Size in New Tab
              </a>
            </div>
          </div>
        ` : `
          <div style="padding:16px;background:var(--surface-2);border-radius:var(--radius);color:var(--text-3);text-align:center;font-size:0.85rem">
            No receipt image attached to this payment record.
          </div>
        `}
      </div>` : ''}
    </div>
  `, buttons);
}

function openReceiptLightbox(imgUrl) {
  const existing = document.getElementById('receiptLightbox');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'receiptLightbox';
  overlay.className = 'receipt-lightbox-overlay';
  overlay.onclick = () => overlay.remove();
  overlay.innerHTML = `
    <img src="${imgUrl}" class="receipt-lightbox-img" alt="Enlarged Receipt Screenshot" onclick="event.stopPropagation()"/>
    <button style="position:absolute;top:20px;right:20px;background:#fff;border:0;border-radius:50%;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4)" onclick="document.getElementById('receiptLightbox').remove()">
      <svg width="18" height="18"><use href="#ico-x"/></svg>
    </button>
  `;
  document.body.appendChild(overlay);
}

// ── ADMIN PAYMENT APPROVAL & REJECTION ──

function confirmApprovePayment(id) {
  if (!canManagePayments()) { showToast('error', 'Access Denied', 'Only authorized managers can approve payments.'); return; }
  const p = db.getOne('payments', id);
  if (!p) return;
  const ho = db.getOne('users', p.homeownerId);
  const bill = db.getOne('billings', p.billingId);
  const formattedAmount = '₱' + Number(p.amount || 0).toLocaleString();

  openConfirm(
    'Approve GCash Payment',
    `Are you sure you want to approve the payment of <strong>${formattedAmount}</strong> from <strong>${escapeHtml(ho ? ho.name : 'Unknown')}</strong> for <strong>${escapeHtml(bill ? bill.title : 'N/A')}</strong>?<br><br><span style="font-size:0.82rem;color:var(--text-3)">This will officially mark the resident's bill as Paid, update their outstanding balance, and notify the resident.</span>`,
    () => executeApprovePayment(id)
  );
}

async function executeApprovePayment(id) {
  showLoading();
  try {
    await api.approvePayment(id);
    await api.loadAll();
    syncHomeownerBalances();
    hideLoading();
    closeModal();
    showToast('success', 'Payment Approved', 'The payment was approved and the resident has been notified.');
    renderPayments();
  } catch (error) {
    hideLoading();
    showToast('error', 'Approval Failed', error.message || 'Could not approve payment.');
  }
}

function openRejectPaymentModal(id) {
  if (!canManagePayments()) { showToast('error', 'Access Denied', 'Only authorized managers can reject payments.'); return; }
  const p = db.getOne('payments', id);
  if (!p) return;
  const ho = db.getOne('users', p.homeownerId);
  const bill = db.getOne('billings', p.billingId);

  const predefinedReasons = [
    'Incorrect amount',
    'Invalid reference number',
    'Payment cannot be verified',
    'Duplicate payment',
    'Incorrect payment',
    'Receipt is unclear',
    'Other',
  ];

  openModal('Reject GCash Payment', `
    <div class="payment-flow-modal">
      <p style="color:var(--text-2);margin:0;font-size:0.88rem">
        Rejecting payment from <strong>${escapeHtml(ho ? ho.name : 'Unknown')}</strong> for <strong>${escapeHtml(bill ? bill.title : 'N/A')}</strong> (Ref: <code>${escapeHtml(p.refNum)}</code>).
      </p>

      <div class="form-group" style="margin-bottom:12px">
        <label>Reason for Rejection *</label>
        <select id="reject_reason_select" class="filter-select" style="width:100%" onchange="handleRejectReasonChange()">
          <option value="">-- Select a reason --</option>
          ${predefinedReasons.map(r => `<option value="${r}">${r}</option>`).join('')}
        </select>
      </div>

      <div class="form-group" id="reject_custom_wrap" style="margin-bottom:0">
        <label>Additional Notes / Explanation</label>
        <textarea id="reject_custom_notes" placeholder="Explain details so the resident can correct and resubmit..."></textarea>
      </div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Reject Payment', cls: 'btn-danger', action: () => executeRejectPayment(id) },
  ]);
}

function handleRejectReasonChange() {
  const sel = document.getElementById('reject_reason_select')?.value;
  const customNotes = document.getElementById('reject_custom_notes');
  if (sel === 'Other' && customNotes) {
    customNotes.placeholder = 'Please enter the specific rejection reason here... (Required)';
    customNotes.focus();
  }
}

async function executeRejectPayment(id) {
  const sel = document.getElementById('reject_reason_select')?.value || '';
  const notes = (document.getElementById('reject_custom_notes')?.value || '').trim();

  if (!sel) {
    showToast('error', 'Reason Required', 'Please select a reason for rejecting the payment.');
    return;
  }

  let finalReason = sel;
  if (sel === 'Other') {
    if (!notes) {
      showToast('error', 'Reason Required', 'Please explain the rejection reason in the notes field.');
      return;
    }
    finalReason = notes;
  } else if (notes) {
    finalReason = `${sel}: ${notes}`;
  }

  showLoading();
  try {
    await api.rejectPayment(id, finalReason);
    await api.loadAll();
    syncHomeownerBalances();
    hideLoading();
    closeModal();
    showToast('warning', 'Payment Rejected', 'The payment was marked as rejected and the resident was notified.');
    renderPayments();
  } catch (error) {
    hideLoading();
    showToast('error', 'Rejection Failed', error.message || 'Could not reject payment.');
  }
}

// ── ADMIN PAYMENT SETTINGS MODAL ──

async function openPaymentSettingsModal() {
  if (!canManagePayments()) { showToast('error', 'Access Denied', 'Only authorized managers can configure payment settings.'); return; }
  showLoading();

  let setting;
  try {
    setting = await api.getPaymentSettings();
  } catch {
    setting = db.get('payment_settings').find(s => s.payment_method === 'gcash') || {
      account_name: 'San Alfonso Homes HOA',
      account_number: '09171234567',
      instructions: '1. Open GCash.\n2. Scan the QR code or enter the GCash mobile number.\n3. Pay the exact amount shown in SmartHood.\n4. Save your GCash receipt or take a screenshot.\n5. Submit the payment reference number and receipt in SmartHood.',
      is_active: 1,
      qr_code_path: null,
    };
  }
  hideLoading();

  const isChecked = setting.is_active ? 'checked' : '';

  openModal('GCash Payment Settings', `
    <div class="payment-flow-modal">
      <div style="background:var(--gcash-light);border:1px solid var(--gcash-border);border-radius:var(--radius);padding:14px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <strong style="color:var(--gcash-blue);font-size:0.95rem">GCash Payment Method</strong>
          <div style="font-size:0.78rem;color:var(--text-3)">Allow residents to view GCash details &amp; pay via GCash in their portal</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="ps_active" ${isChecked}>
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label>GCash Account Name *</label>
          <input id="ps_account_name" value="${escapeHtml(setting.account_name || 'San Alfonso Homes HOA')}" placeholder="e.g. San Alfonso Homes HOA"/>
        </div>
        <div class="form-group">
          <label>GCash Mobile Number *</label>
          <input id="ps_account_number" value="${escapeHtml(setting.account_number || '09171234567')}" placeholder="e.g. 09171234567"/>
        </div>
      </div>

      <div class="form-group">
        <label>Payment Instructions</label>
        <textarea id="ps_instructions" style="min-height:90px" placeholder="Enter clear step-by-step instructions for residents...">${escapeHtml(setting.instructions || '')}</textarea>
        <div style="font-size:0.75rem;color:var(--text-3);margin-top:4px">Shown to residents in the Pay Now modal.</div>
      </div>

      <div class="form-group">
        <label>GCash QR Code Image</label>
        <div class="gcash-qr-section" style="margin-top:6px">
          ${setting.qr_code_path ? `
            <div class="gcash-qr-frame" id="ps_qr_display_frame">
              <img src="${setting.qr_code_path}" class="gcash-qr-img" id="ps_qr_preview_img" alt="Current GCash QR Code"/>
            </div>
            <div style="display:flex;gap:8px;margin-top:8px">
              <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('ps_qr_file_input').click()">Replace QR Image</button>
              <button type="button" class="btn btn-danger btn-sm" onclick="removePaymentQrImage()">Remove QR</button>
            </div>
          ` : `
            <div class="gcash-qr-placeholder" id="ps_qr_placeholder">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span>No QR Code Image Uploaded</span>
            </div>
            <div style="margin-top:8px">
              <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('ps_qr_file_input').click()">Upload QR Code Image</button>
            </div>
          `}
          <input type="file" id="ps_qr_file_input" accept=".jpg,.jpeg,.png,.webp" style="display:none" onchange="uploadPaymentQrImage(this.files[0])"/>
          <div style="font-size:0.74rem;color:var(--text-3);margin-top:4px">Accepted formats: JPG, JPEG, PNG, WebP (Max 10 MB).</div>
        </div>
      </div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Save Settings', cls: 'btn-primary', action: savePaymentSettings },
  ]);
}

async function uploadPaymentQrImage(file) {
  if (!file) return;
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!allowed.includes(ext)) {
    showToast('error', 'Invalid File', 'Only JPG, JPEG, PNG, or WebP images are allowed.');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('error', 'File Too Large', 'QR Code image must be 10 MB or smaller.');
    return;
  }

  const formData = new FormData();
  formData.append('qr', file);

  showLoading();
  try {
    await api.uploadPaymentQr(formData);
    await api.loadAll();
    hideLoading();
    showToast('success', 'QR Code Updated', 'GCash QR code image was successfully uploaded.');
    openPaymentSettingsModal();
  } catch (error) {
    hideLoading();
    showToast('error', 'Upload Failed', error.message || 'Could not upload QR code image.');
  }
}

async function removePaymentQrImage() {
  openConfirm('Remove QR Code', 'Are you sure you want to remove the GCash QR code image? Residents will not see a QR code until a new one is uploaded.', async () => {
    showLoading();
    try {
      await api.deletePaymentQr();
      await api.loadAll();
      hideLoading();
      showToast('warning', 'QR Code Removed', 'The GCash QR code image was removed.');
      openPaymentSettingsModal();
    } catch (error) {
      hideLoading();
      showToast('error', 'Removal Failed', error.message || 'Could not remove QR code.');
    }
  });
}

async function savePaymentSettings() {
  const account_name = (document.getElementById('ps_account_name')?.value || '').trim();
  const account_number = (document.getElementById('ps_account_number')?.value || '').trim();
  const instructions = (document.getElementById('ps_instructions')?.value || '').trim();
  const is_active = document.getElementById('ps_active')?.checked ? 1 : 0;

  if (!account_name || !account_number) {
    showToast('error', 'Required Fields', 'Please enter both GCash Account Name and GCash Mobile Number.');
    return;
  }

  showLoading();
  try {
    await api.updatePaymentSettings({
      account_name,
      account_number,
      instructions,
      is_active,
    });
    await api.loadAll();
    hideLoading();
    closeModal();
    showToast('success', 'Settings Saved', 'GCash payment settings have been saved successfully.');
  } catch (error) {
    hideLoading();
    showToast('error', 'Save Failed', error.message || 'Could not save payment settings.');
  }
}

// ── RESIDENT PORTAL: MY BILLS & PAY NOW FLOW ──

function renderHOBilling() {
  if (canManageBilling()) {
    syncHomeownerBalances();
  }
  const myBillings = db.get('billings').filter(b => getAssignedHomeownerIds(b).includes(currentUser?.id));
  const myPayments = db.get('payments').filter(p => p.homeownerId === currentUser?.id);
  const today = getLocalDateValue();
  const area = document.getElementById('contentArea');

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <h2>My Bills</h2>
      <p>View your billing records and submit payments via GCash.</p>
    </div>
    <div class="page-header-actions">
      <button class="btn btn-primary" onclick="navigate('ho-pay-now')">
        <svg width="15" height="15"><use href="#ico-credit"/></svg> Pay Dues in Advance
      </button>
    </div>
  </div>

  <div class="section-card" style="margin-bottom:16px;background:linear-gradient(135deg,var(--surface) 0%,var(--surface-2) 100%);border-left:4px solid var(--teal-600)">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:16px">
      <div>
        <h4 style="margin:0 0 4px 0;color:var(--text);font-size:0.98rem">Advance Monthly Dues Payment</h4>
        <p style="margin:0;font-size:0.83rem;color:var(--text-3)">You can pay your monthly association dues in advance before billing is generated. Approved payments exclude you from future duplicate billings.</p>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="navigate('ho-pay-now')">
        Go to Pay Now &rarr;
      </button>
    </div>
  </div>
  <div class="section-card">
    <div class="section-card-body no-pad">
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Billing</th>
              <th>Amount Due</th>
              <th>Due Date</th>
              <th>Payment Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${myBillings.map(b => {
              const paid = myPayments.find(p => p.billingId === b.id && p.status === 'approved');
              const pend = myPayments.find(p => p.billingId === b.id && p.status === 'pending');
              const rej = myPayments.find(p => p.billingId === b.id && p.status === 'rejected');
              const overdue = b.dueDate && b.dueDate < today && !paid;

              let statusBadge = '<span class="badge badge-gray">Unpaid</span>';
              if (paid) {
                statusBadge = '<span class="badge badge-green">Paid</span>';
              } else if (pend) {
                statusBadge = '<span class="badge badge-yellow">Pending Verification</span>';
              } else if (rej) {
                statusBadge = `<span class="badge badge-red" title="Rejection Reason: ${escapeHtml(rej.rejection_reason || rej.remarks || '')}">Rejected</span>`;
              } else if (overdue) {
                statusBadge = '<span class="badge badge-red">Overdue</span>';
              }

              let actionBtn = '—';
              if (!paid && !pend) {
                actionBtn = `<button class="btn btn-primary btn-sm" onclick="openPayNowModal('${b.id}')">Pay Now</button>`;
              } else if (pend) {
                actionBtn = `<button class="btn btn-secondary btn-sm" onclick="viewPaymentDetail('${pend.id}')">View Details</button>`;
              } else if (paid) {
                actionBtn = `<button class="btn btn-secondary btn-sm" onclick="viewPaymentDetail('${paid.id}')">Receipt</button>`;
              }

              return `<tr class="${overdue ? 'overdue-row' : ''}">
                <td>
                  <strong>${escapeHtml(b.title)}</strong>
                  ${b.description ? `<div style="font-size:0.78rem;color:var(--text-3);margin-top:3px">${escapeHtml(b.description)}</div>` : ''}
                  ${rej && !paid && !pend ? `<div style="font-size:0.76rem;color:var(--red-600);margin-top:4px">⚠️ Previous submission was rejected: ${escapeHtml(rej.rejection_reason || rej.remarks || 'Check history')}</div>` : ''}
                </td>
                <td class="amount-due">₱${Number(b.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>${escapeHtml(b.dueDate || '—')}${overdue ? ' <span style="color:var(--red-600);font-weight:700">— Overdue</span>' : ''}</td>
                <td>${statusBadge}</td>
                <td>${actionBtn}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="5"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-file"/></svg>No bills assigned.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function openPayNowModal(billingIdOrOpts) {
  let bill = null;
  let billingId = null;
  let month = null;
  let amount = 0;
  let title = '';
  let description = '';
  let dueDate = '';

  if (typeof billingIdOrOpts === 'object' && billingIdOrOpts !== null) {
    billingId = billingIdOrOpts.billingId || null;
    month = billingIdOrOpts.month || null;
    amount = Number(billingIdOrOpts.amount || 0);
    title = billingIdOrOpts.title || (month ? `Monthly Dues - ${formatBillingMonth(month)}` : 'Monthly HOA Dues');
    description = billingIdOrOpts.description || '';
    dueDate = billingIdOrOpts.dueDate || (month ? `Due for ${formatBillingMonth(month)}` : '—');
    if (billingId) {
      bill = db.getOne('billings', billingId);
      if (bill) {
        amount = Number(bill.amount || amount);
        title = bill.title || title;
        description = bill.description || description;
        dueDate = bill.dueDate || dueDate;
        month = bill.monthly_dues_month || parseMonthFromTitle(bill.title) || month;
      }
    }
  } else if (typeof billingIdOrOpts === 'string') {
    billingId = billingIdOrOpts;
    bill = db.getOne('billings', billingId);
    if (!bill) { showToast('error', 'Error', 'Billing record not found.'); return; }
    amount = Number(bill.amount || 0);
    title = bill.title;
    description = bill.description || '';
    dueDate = bill.dueDate || '—';
    month = bill.monthly_dues_month || parseMonthFromTitle(bill.title);
  } else {
    showToast('error', 'Error', 'Invalid billing selection.');
    return;
  }

  const gcash = db.get('payment_settings').find(s => s.payment_method === 'gcash') || {
    account_name: 'San Alfonso Homes HOA',
    account_number: '09171234567',
    instructions: '1. Open GCash.\n2. Scan the QR code or enter the GCash mobile number.\n3. Pay the exact amount shown in SmartHood.\n4. Save your GCash receipt or take a screenshot.\n5. Submit the payment reference number and receipt in SmartHood.',
    is_active: 1,
    qr_code_path: null,
  };

  const formattedAmount = '₱' + Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rawInstructions = gcash.instructions || '1. Open GCash.\n2. Scan the QR code.\n3. Pay the exact amount shown in SmartHood.\n4. Save your receipt.\n5. Submit your reference number and receipt screenshot.';
  const instructionItems = rawInstructions.split('\n').filter(line => line.trim().length > 0);

  if (!gcash.is_active) {
    openModal('GCash Payment', `
      <div class="payment-flow-modal">
        <div class="payment-bill-summary">
          <div class="payment-bill-meta">
            <h4>${escapeHtml(title)}</h4>
            <p>Due Date / Period: ${escapeHtml(dueDate)}</p>
          </div>
          <div class="payment-amount-badge">
            <div class="pay-label">Amount Due</div>
            <div class="pay-val">${formattedAmount}</div>
          </div>
        </div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:var(--radius);padding:18px;text-align:center;color:#991b1b">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin:0 auto 8px auto;display:block"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <strong>GCash Payments Temporarily Unavailable</strong>
          <p style="margin:6px 0 0 0;font-size:0.84rem;color:#7f1d1d">GCash payments are currently disabled by the HOA administrator. Please pay directly at the HOA office or check back later.</p>
        </div>
      </div>
    `, [{ label: 'Close', cls: 'btn-secondary', action: closeModal }]);
    return;
  }

  const payloadOpts = { billingId, month, amount, title, description, dueDate };

  openModal('Pay Bill via GCash', `
    <div class="payment-flow-modal">
      <div class="payment-bill-summary">
        <div class="payment-bill-meta">
          <h4>${escapeHtml(title)}</h4>
          <p>${escapeHtml(description || 'Monthly HOA billing dues')}</p>
          <p style="margin-top:2px">Due Date / Period: <strong>${escapeHtml(dueDate)}</strong></p>
        </div>
        <div class="payment-amount-badge">
          <div class="pay-label">Amount Due</div>
          <div class="pay-val">${formattedAmount}</div>
        </div>
      </div>

      <div class="gcash-info-card">
        <div class="gcash-brand-header">
          <div class="gcash-logo-text">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>
            GCash Payment Details
          </div>
          <span class="gcash-status-pill">Active</span>
        </div>

        <div class="gcash-details-grid">
          <div class="gcash-field">
            <span class="gcash-field-label">Account Name</span>
            <span class="gcash-field-val">${escapeHtml(gcash.account_name || 'San Alfonso Homes HOA')}</span>
          </div>
          <div class="gcash-field">
            <span class="gcash-field-label">GCash Mobile Number</span>
            <div class="gcash-number-wrap">
              <span class="gcash-number-val">${escapeHtml(gcash.account_number || '09171234567')}</span>
              <button type="button" class="btn-copy-number" id="copyGcashBtn" onclick="copyGcashNumber('${escapeHtml(gcash.account_number || '09171234567')}')" title="Copy Number">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copy
              </button>
            </div>
          </div>
        </div>

        <div class="gcash-qr-section">
          ${gcash.qr_code_path ? `
            <div class="gcash-qr-frame">
              <img src="${gcash.qr_code_path}" class="gcash-qr-img" alt="Scan GCash QR Code" onclick="openReceiptLightbox('${gcash.qr_code_path}')" title="Click to view large"/>
            </div>
            <div class="gcash-qr-hint">Scan with GCash app or transfer to the mobile number above</div>
          ` : `
            <div class="gcash-qr-placeholder">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span>Please send payment to the GCash mobile number above</span>
            </div>
          `}
        </div>

        <div class="gcash-instructions-box">
          <div class="gcash-instructions-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            Payment Instructions
          </div>
          <ol class="gcash-instructions-list">
            ${instructionItems.map(item => `<li>${escapeHtml(item.replace(/^\d+[\.\)]\s*/, ''))}</li>`).join('')}
          </ol>
        </div>

        <div style="margin-top:12px;text-align:center;font-size:0.82rem;font-weight:700;color:var(--teal-700)">
          Please pay the exact amount shown above (${formattedAmount}).
        </div>
      </div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    {
      label: "I've Paid — Submit Payment",
      cls: 'btn-primary',
      action: () => { closeModal(); openSubmitPaymentForm(payloadOpts); }
    },
  ]);
}

function fallbackCopyText(text, callback) {
  try {
    const tempInput = document.createElement('input');
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    if (callback) callback();
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast('info', 'GCash Number', text);
    }
  }
}

function copyGcashNumber(number) {
  const onSuccess = () => {
    const btn = document.getElementById('copyGcashBtn');
    if (btn) {
      btn.classList.add('copied');
      btn.innerHTML = '&#10003; Copied!';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
      }, 2000);
    }
    if (typeof showToast === 'function') {
      showToast('success', 'Copied to Clipboard', `GCash number ${number} copied.`);
    }
  };

  if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(number).then(onSuccess).catch(() => {
      fallbackCopyText(number, onSuccess);
    });
  } else {
    fallbackCopyText(number, onSuccess);
  }
}


// ── RESIDENT PAYMENT SUBMISSION FORM ──

let selectedPaymentReceiptFile = null;

function openSubmitPaymentForm(billingIdOrOpts) {
  let bill = null;
  let billingId = null;
  let month = null;
  let title = '';
  let amount = 0;

  if (typeof billingIdOrOpts === 'object' && billingIdOrOpts !== null) {
    billingId = billingIdOrOpts.billingId || null;
    month = billingIdOrOpts.month || null;
    amount = Number(billingIdOrOpts.amount || 0);
    title = billingIdOrOpts.title || (month ? `Monthly Dues - ${formatBillingMonth(month)}` : 'Monthly Dues');
    if (billingId) {
      bill = db.getOne('billings', billingId);
      if (bill) {
        amount = Number(bill.amount || amount);
        title = bill.title || title;
        month = bill.monthly_dues_month || parseMonthFromTitle(bill.title) || month;
      }
    }
  } else if (typeof billingIdOrOpts === 'string') {
    billingId = billingIdOrOpts;
    bill = db.getOne('billings', billingId);
    if (!bill) { showToast('error', 'Error', 'Billing record not found.'); return; }
    amount = Number(bill.amount || 0);
    title = bill.title;
    month = bill.monthly_dues_month || parseMonthFromTitle(bill.title);
  }

  selectedPaymentReceiptFile = null;
  const formattedAmount = '₱' + Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = getLocalDateValue();
  const payloadOpts = { billingId, month, amount, title };

  openModal('Submit Payment Proof', `
    <div class="payment-flow-modal">
      <div class="payment-bill-summary">
        <div class="payment-bill-meta">
          <h4>${escapeHtml(title)}</h4>
          <p>${billingId ? `Bill ID: <code>${escapeHtml(billingId)}</code>` : `Period: <strong>${escapeHtml(formatBillingMonth(month) || 'Monthly Association Dues')}</strong>`}</p>
        </div>
        <div class="payment-amount-badge">
          <div class="pay-label">Amount Required</div>
          <div class="pay-val">${formattedAmount}</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label>Payment Method</label>
          <input value="GCash" readonly style="background:var(--surface-2);cursor:not-allowed;font-weight:700;color:var(--gcash-blue)"/>
        </div>
        <div class="form-group">
          <label>Payment Amount</label>
          <input value="${formattedAmount}" readonly style="background:var(--surface-2);cursor:not-allowed;font-weight:800;color:var(--teal-700)"/>
          <small style="font-size:0.72rem;color:var(--text-3);display:block;margin-top:3px">Locked to official billing dues.</small>
        </div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label>GCash Reference Number *</label>
          <input id="sub_ref_num" placeholder="e.g. 1002345678912" required style="font-family:monospace;font-weight:700;letter-spacing:0.04em"/>
          <small style="font-size:0.72rem;color:var(--text-3);display:block;margin-top:3px">Found on your GCash receipt/SMS.</small>
        </div>
        <div class="form-group">
          <label>Payment Date *</label>
          <input type="date" id="sub_pay_date" value="${today}" max="${today}" required/>
        </div>
      </div>

      <div class="form-group">
        <label>Upload GCash Receipt / Screenshot *</label>
        <div class="receipt-upload-zone" id="receiptUploadZone" onclick="document.getElementById('sub_receipt_file').click()">
          <input type="file" id="sub_receipt_file" class="receipt-file-input" accept=".jpg,.jpeg,.png,.webp" onchange="handleReceiptFileSelect(this.files[0])"/>
          <div class="receipt-upload-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <div class="receipt-upload-text">Click or drag &amp; drop your receipt screenshot here</div>
          <div class="receipt-upload-subtext">JPG, JPEG, PNG, or WebP (Max 10 MB)</div>
        </div>

        <div class="receipt-preview-card hidden" id="receiptPreviewCard">
          <img id="receiptPreviewThumb" class="receipt-preview-thumb" alt="Receipt preview"/>
          <div class="receipt-preview-actions">
            <span id="receiptPreviewMeta" style="color:var(--text-2);font-weight:600"></span>
            <button type="button" class="btn btn-secondary btn-sm" onclick="clearSelectedReceiptFile()">Remove</button>
          </div>
        </div>
      </div>

      <div class="form-group" style="margin-bottom:0">
        <label>Additional Notes (Optional)</label>
        <textarea id="sub_remarks" placeholder="Optional notes for HOA management..."></textarea>
      </div>
    </div>
  `, [
    { label: 'Back to QR', cls: 'btn-secondary', action: () => { closeModal(); openPayNowModal(payloadOpts); } },
    { label: 'Submit Payment Proof', cls: 'btn-primary', action: () => executeSubmitPaymentProof(payloadOpts) },
  ]);

  setupReceiptDragDrop();
}

function setupReceiptDragDrop() {
  const zone = document.getElementById('receiptUploadZone');
  if (!zone) return;
  ['dragenter', 'dragover'].forEach(eventName => {
    zone.addEventListener(eventName, e => { e.preventDefault(); zone.classList.add('dragover'); }, false);
  });
  ['dragleave', 'drop'].forEach(eventName => {
    zone.addEventListener(eventName, e => { e.preventDefault(); zone.classList.remove('dragover'); }, false);
  });
  zone.addEventListener('drop', e => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files[0]) {
      handleReceiptFileSelect(dt.files[0]);
    }
  });
}

function handleReceiptFileSelect(file) {
  if (!file) return;
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!allowed.includes(ext)) {
    showToast('error', 'Unsupported Format', 'Please upload a JPG, PNG, or WebP receipt image.');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('error', 'File Too Large', 'Receipt file size must be 10 MB or smaller.');
    return;
  }

  selectedPaymentReceiptFile = file;

  const reader = new FileReader();
  reader.onload = e => {
    const thumb = document.getElementById('receiptPreviewThumb');
    const meta = document.getElementById('receiptPreviewMeta');
    const card = document.getElementById('receiptPreviewCard');
    const zone = document.getElementById('receiptUploadZone');

    if (thumb) thumb.src = e.target.result;
    if (meta) meta.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    if (card) card.classList.remove('hidden');
    if (zone) zone.classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

function clearSelectedReceiptFile() {
  selectedPaymentReceiptFile = null;
  const card = document.getElementById('receiptPreviewCard');
  const zone = document.getElementById('receiptUploadZone');
  const fileInput = document.getElementById('sub_receipt_file');
  if (card) card.classList.add('hidden');
  if (zone) zone.classList.remove('hidden');
  if (fileInput) fileInput.value = '';
}

async function executeSubmitPaymentProof(billingIdOrOpts) {
  let billingId = null;
  let month = null;
  let amount = 0;

  if (typeof billingIdOrOpts === 'object' && billingIdOrOpts !== null) {
    billingId = billingIdOrOpts.billingId || null;
    month = billingIdOrOpts.month || null;
    amount = Number(billingIdOrOpts.amount || 0);
  } else if (typeof billingIdOrOpts === 'string') {
    billingId = billingIdOrOpts;
    const b = db.getOne('billings', billingId);
    if (b) {
      amount = Number(b.amount || 0);
      month = b.monthly_dues_month || parseMonthFromTitle(b.title) || null;
    }
  }

  const refNum = (document.getElementById('sub_ref_num')?.value || '').trim();
  const paymentDate = (document.getElementById('sub_pay_date')?.value || '').trim();
  const remarks = (document.getElementById('sub_remarks')?.value || '').trim();

  if (!refNum) {
    showToast('error', 'Reference Required', 'Please enter your GCash reference number.');
    document.getElementById('sub_ref_num')?.focus();
    return;
  }
  if (refNum.length < 5) {
    showToast('error', 'Invalid Reference', 'Please enter a valid GCash reference number (at least 5 characters).');
    return;
  }
  if (!selectedPaymentReceiptFile) {
    showToast('error', 'Receipt Required', 'Please upload a screenshot or photo of your GCash receipt.');
    return;
  }

  const formData = new FormData();
  if (billingId) formData.append('billingId', billingId);
  if (month) formData.append('monthly_dues_month', month);
  formData.append('amount', amount);
  formData.append('refNum', refNum);
  formData.append('payment_date', paymentDate || getLocalDateValue());
  formData.append('payment_method', 'GCash');
  formData.append('remarks', remarks);
  formData.append('receipt', selectedPaymentReceiptFile);

  showLoading();
  try {
    const res = await api.submitPayment(formData);
    await api.loadAll();
    syncHomeownerBalances();
    hideLoading();
    closeModal();
    selectedPaymentReceiptFile = null;
    showToast('success', 'Payment Submitted', 'Your payment proof has been submitted and is pending admin verification.');

    // If currently on ho-pay-now or ho-billing, refresh dynamically
    const contentArea = document.getElementById('contentArea');
    if (contentArea && contentArea.querySelector('.paynow-table-wrap, .paynow-hero-card')) {
      renderHOPayNow();
    } else if (contentArea && contentArea.querySelector('.data-table')) {
      renderHOBilling();
    } else {
      navigate('ho-history');
    }
  } catch (error) {
    hideLoading();
    showToast('error', 'Submission Failed', error.message || 'Could not submit payment. Please verify your reference number.');
  }
}

// ── RESIDENT PAYMENT HISTORY ──

function renderHOHistory() {
  const myPayments = db.get('payments').filter(p => p.homeownerId === currentUser.id);
  const area = document.getElementById('contentArea');

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <h2>Payment History</h2>
      <p>Track your submitted GCash payments and review verification statuses.</p>
    </div>
  </div>
  <div class="section-card">
    <div class="section-card-body no-pad">
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Billing Title</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Reference #</th>
              <th>Payment Date</th>
              <th>Status</th>
              <th>Admin Remarks / Reason</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            ${[...myPayments]
              .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || '') || (b.id || '').localeCompare(a.id || ''))
              .map(p => {
                const bill = db.getOne('billings', p.billingId);
                let billTitleDisplay = bill ? bill.title : '';
                if (!billTitleDisplay && p.monthly_dues_month) {
                  billTitleDisplay = `Monthly Dues - ${formatBillingMonth(p.monthly_dues_month)}`;
                }
                if (!billTitleDisplay) billTitleDisplay = 'N/A';
                const isAdvance = Boolean(!p.billingId && p.monthly_dues_month);
                const formattedAmount = '₱' + Number(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                let statusBadge = '<span class="badge badge-yellow">Pending</span>';
                if (p.status === 'approved') statusBadge = '<span class="badge badge-green">Approved</span>';
                if (p.status === 'rejected') statusBadge = '<span class="badge badge-red">Rejected</span>';

                let remarksDisplay = '—';
                if (p.status === 'rejected') {
                  remarksDisplay = `<strong style="color:var(--red-600)">${escapeHtml(p.rejection_reason || p.remarks || 'Rejected by admin')}</strong>`;
                } else if (p.remarks) {
                  remarksDisplay = escapeHtml(p.remarks);
                }

                return `<tr>
                  <td>
                    <strong>${escapeHtml(billTitleDisplay)}</strong>
                    ${isAdvance ? ' <span class="badge badge-teal" style="font-size:0.68rem;padding:1px 6px">Advance</span>' : ''}
                  </td>
                  <td class="amount-paid">${formattedAmount}</td>
                  <td><span class="badge ${p.payment_method === 'Cash' ? 'badge-cash' : 'badge-gcash'}">${escapeHtml(p.payment_method || 'GCash')}</span></td>
                  <td><code style="font-size:0.84rem;font-weight:700;color:var(--text)">${escapeHtml(p.refNum)}</code></td>
                  <td>${escapeHtml(p.payment_date || p.submittedAt || '—')}</td>
                  <td>${statusBadge}</td>
                  <td style="font-size:0.82rem;max-width:220px">${remarksDisplay}</td>
                  <td>
                    ${p.receipt ? `
                      <button class="btn btn-secondary btn-sm" onclick="openReceiptLightbox('${p.receipt}')">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View
                      </button>
                    ` : '—'}
                  </td>
                </tr>`;
              }).join('') || '<tr><td colspan="8"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-history"/></svg>No payment transactions found.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function renderHOPayments() {
  renderHOPayNow();
}

// // ── RESIDENT PORTAL: PAY NOW (ANNUAL DUES PORTAL) ──

let currentSelectedPayNowYear = null;

function getPayNowAvailableYears(myBillings, myPayments) {
  const currentYear = new Date().getFullYear();
  const yearsSet = new Set([currentYear]);

  // Extract years from myBillings
  (myBillings || []).forEach(b => {
    if (!b) return;
    if (b.monthly_dues_month && typeof b.monthly_dues_month === 'string' && /^\d{4}-\d{2}$/.test(b.monthly_dues_month)) {
      const yr = Number(b.monthly_dues_month.split('-')[0]);
      if (!isNaN(yr) && yr > 2000 && yr < 2100) yearsSet.add(yr);
    }
    const parsed = typeof parseMonthFromTitle === 'function' ? parseMonthFromTitle(b.title) : null;
    if (parsed) {
      const yr = Number(parsed.split('-')[0]);
      if (!isNaN(yr) && yr > 2000 && yr < 2100) yearsSet.add(yr);
    }
    if (b.createdAt) {
      const yr = new Date(b.createdAt).getFullYear();
      if (!isNaN(yr) && yr > 2000 && yr < 2100) yearsSet.add(yr);
    }
    if (b.dueDate && b.dueDate !== '—' && b.dueDate !== 'Advance Payment') {
      const yr = new Date(b.dueDate).getFullYear();
      if (!isNaN(yr) && yr > 2000 && yr < 2100) yearsSet.add(yr);
    }
  });

  // Extract years from myPayments
  (myPayments || []).forEach(p => {
    if (!p) return;
    if (p.monthly_dues_month && typeof p.monthly_dues_month === 'string' && /^\d{4}-\d{2}$/.test(p.monthly_dues_month)) {
      const yr = Number(p.monthly_dues_month.split('-')[0]);
      if (!isNaN(yr) && yr > 2000 && yr < 2100) yearsSet.add(yr);
    }
    const dt = p.payment_date || p.submittedAt || p.reviewedAt;
    if (dt && dt !== '—') {
      const yr = new Date(dt).getFullYear();
      if (!isNaN(yr) && yr > 2000 && yr < 2100) yearsSet.add(yr);
    }
  });

  return Array.from(yearsSet).sort((a, b) => b - a);
}

function handlePayNowYearChange(year) {
  currentSelectedPayNowYear = Number(year);
  renderHOPayNow();
}

function getPreviousMonthKey(year, monthIdx) {
  const prevDate = new Date(year, monthIdx - 2, 1);
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
}

function openAdvancePayModal(monthKey, amountDue) {
  const monthLabel = typeof formatBillingMonth === 'function' ? (formatBillingMonth(monthKey) || monthKey) : monthKey;
  openPayNowModal({
    billingId: null,
    month: monthKey,
    amount: Number(amountDue),
    title: `Monthly Dues - ${monthLabel}`,
    description: `Advance monthly association dues for ${monthLabel}`,
    dueDate: 'Advance Payment',
  });
}

function renderHOPayNow() {
  if (typeof canManageBilling === 'function' && canManageBilling()) {
    if (typeof syncHomeownerBalances === 'function') syncHomeownerBalances();
  }

  const area = document.getElementById('contentArea');
  if (!area) return;

  const currentUserId = currentUser?.id || currentUser?.user_id || '';
  const myPayments = (db.get('payments') || []).filter(p => p.homeownerId === currentUserId);
  const myBillings = (db.get('billings') || []).filter(b => {
    const ids = typeof getAssignedHomeownerIds === 'function' ? getAssignedHomeownerIds(b) : [];
    return ids.includes(currentUserId);
  });

  const availableYears = getPayNowAvailableYears(myBillings, myPayments);
  const currentCalendarYear = new Date().getFullYear();

  if (!currentSelectedPayNowYear || !availableYears.includes(Number(currentSelectedPayNowYear))) {
    currentSelectedPayNowYear = currentCalendarYear;
  }
  const selectedYear = Number(currentSelectedPayNowYear);

  const rate = typeof getDuesRatePerSqm === 'function' ? getDuesRatePerSqm() : 5.725;
  const calculatedDues = typeof calculateMonthlyDues === 'function' ? calculateMonthlyDues(currentUser, rate) : 0;
  const defaultMonthlyDues = calculatedDues > 0 ? calculatedDues : 1500;

  // Process all 12 months for the selected year
  const monthsData = [];
  let totalPaidYear = 0;
  let totalBilledOutstanding = 0;
  let paidMonthsCount = 0;
  let pendingCount = 0;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  for (let m = 1; m <= 12; m++) {
    const monthKey = `${selectedYear}-${String(m).padStart(2, '0')}`;
    const monthName = monthNames[m - 1];
    const fullMonthLabel = `${monthName} ${selectedYear}`;

    // 1. Check if a billing record exists for this month
    const matchingBill = myBillings.find(b =>
      b.monthly_dues_month === monthKey || (typeof parseMonthFromTitle === 'function' && parseMonthFromTitle(b.title) === monthKey)
    );

    // 2. Check for payments associated with this month
    const paidPayment = myPayments.find(p =>
      p.status === 'approved' &&
      (p.monthly_dues_month === monthKey || (matchingBill && p.billingId === matchingBill.id))
    );

    const pendingPayment = myPayments.find(p =>
      p.status === 'pending' &&
      (p.monthly_dues_month === monthKey || (matchingBill && p.billingId === matchingBill.id))
    );

    const rejectedPayment = myPayments.find(p =>
      p.status === 'rejected' &&
      (p.monthly_dues_month === monthKey || (matchingBill && p.billingId === matchingBill.id))
    );

    // 3. Status Determination Logic
    let status = 'not_billed';
    let amountDue = null;
    let dueDateDisplay = '—';
    let isAdvanceUnbilled = false;

    if (paidPayment || (matchingBill && matchingBill.status === 'paid')) {
      status = 'paid';
      paidMonthsCount++;
      const paidAmt = Number(paidPayment?.amount || matchingBill?.amount || 0);
      totalPaidYear += paidAmt;
      amountDue = paidAmt;
      dueDateDisplay = matchingBill?.dueDate || (paidPayment?.payment_date ? `Paid ${paidPayment.payment_date}` : 'Paid');
    } else if (pendingPayment) {
      status = 'pending';
      pendingCount++;
      amountDue = Number(pendingPayment.amount || matchingBill?.amount || defaultMonthlyDues);
      dueDateDisplay = matchingBill?.dueDate || (pendingPayment.submittedAt ? `Submitted ${pendingPayment.submittedAt}` : 'Under Review');
    } else if (matchingBill) {
      status = 'pay_now';
      amountDue = Number(matchingBill.amount || 0);
      dueDateDisplay = matchingBill.dueDate || '—';
      totalBilledOutstanding += amountDue;
    } else {
      // Month is not billed yet by administrator
      // Rule: If the preceding month is already paid, the resident is permitted to pay the next month in advance
      const prevMonthKey = getPreviousMonthKey(selectedYear, m);
      const prevMonthPaid = myPayments.some(p => p.status === 'approved' && p.monthly_dues_month === prevMonthKey) ||
        myBillings.some(b =>
          (b.monthly_dues_month === prevMonthKey || (typeof parseMonthFromTitle === 'function' && parseMonthFromTitle(b.title) === prevMonthKey)) &&
          (b.status === 'paid' || myPayments.some(p => p.billingId === b.id && p.status === 'approved'))
        );

      if (prevMonthPaid) {
        status = 'pay_now';
        amountDue = defaultMonthlyDues;
        dueDateDisplay = 'Advance Dues';
        isAdvanceUnbilled = true;
      } else {
        status = 'not_billed';
        amountDue = null;
        dueDateDisplay = '—';
      }
    }

    monthsData.push({
      monthNum: m,
      monthKey,
      monthName,
      fullMonthLabel,
      status,
      amountDue,
      dueDateDisplay,
      matchingBill,
      paidPayment,
      pendingPayment,
      rejectedPayment,
      isAdvanceUnbilled,
    });
  }

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <h2>Pay Monthly Dues</h2>
      <p>Review association dues statuses and pay monthly dues securely via GCash.</p>
    </div>
    <div class="page-header-actions">
      <button class="btn btn-secondary btn-sm" onclick="navigate('ho-history')">
        <svg width="14" height="14" style="margin-right:4px"><use href="#ico-history"/></svg> Payment History
      </button>
    </div>
  </div>

  <!-- Hero & Year Selection Card -->
  <div class="paynow-hero-card">
    <div class="paynow-hero-content">
      <h3>Monthly Dues Schedule — ${selectedYear}</h3>
      <p>Select a year to review billing statuses. Unbilled months are marked as <em>Not Billed Yet</em>. Once billed or when preceding months are paid, you can pay online with immediate proof submission.</p>
    </div>
    <div class="paynow-year-control">
      <label for="payNowYearSelect" class="paynow-year-label">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Year:
      </label>
      <select id="payNowYearSelect" class="paynow-year-select" onchange="handlePayNowYearChange(this.value)">
        ${availableYears.map(yr => `
          <option value="${yr}" ${yr === selectedYear ? 'selected' : ''}>
            ${yr}${yr === currentCalendarYear ? ' (Current Year)' : ''}
          </option>
        `).join('')}
      </select>
    </div>
  </div>

  <!-- Summary Metric Strip for Selected Year -->
  <div class="paynow-stats-grid">
    <div class="paynow-stat-card">
      <div class="paynow-stat-icon green">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="paynow-stat-info">
        <span class="paynow-stat-label">Months Paid</span>
        <span class="paynow-stat-value">${paidMonthsCount} / 12</span>
        <span class="paynow-stat-sub">${selectedYear} Annual Progress</span>
      </div>
    </div>

    <div class="paynow-stat-card">
      <div class="paynow-stat-icon blue">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      </div>
      <div class="paynow-stat-info">
        <span class="paynow-stat-label">Total Paid in ${selectedYear}</span>
        <span class="paynow-stat-value">₱${totalPaidYear.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <span class="paynow-stat-sub">Verified & Approved Dues</span>
      </div>
    </div>

    <div class="paynow-stat-card">
      <div class="paynow-stat-icon amber">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div class="paynow-stat-info">
        <span class="paynow-stat-label">Outstanding Dues</span>
        <span class="paynow-stat-value">₱${totalBilledOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <span class="paynow-stat-sub">Currently Billed & Unpaid</span>
      </div>
    </div>

    <div class="paynow-stat-card">
      <div class="paynow-stat-icon purple">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <div class="paynow-stat-info">
        <span class="paynow-stat-label">Under Review</span>
        <span class="paynow-stat-value">${pendingCount}</span>
        <span class="paynow-stat-sub">Pending Admin Verification</span>
      </div>
    </div>
  </div>

  <!-- 12-Month Schedule Table -->
  <div class="paynow-table-wrap">
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:240px">Month</th>
            <th style="width:140px">Amount Due</th>
            <th style="width:150px">Due Date</th>
            <th style="width:170px">Status</th>
            <th style="width:160px;text-align:right;padding-right:20px">Action</th>
          </tr>
        </thead>
        <tbody>
          ${monthsData.map(m => {
            let statusBadge = '';
            let actionBtn = '<span style="color:var(--text-3);padding-right:10px">—</span>';
            let formattedAmt = '—';

            if (m.amountDue !== null && m.amountDue !== undefined) {
              formattedAmt = '₱' + Number(m.amountDue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }

            if (m.status === 'paid') {
              statusBadge = '<span class="badge badge-green"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:3px"><polyline points="20 6 9 17 4 12"/></svg> Paid</span>';
              if (m.paidPayment) {
                actionBtn = `<button class="btn btn-secondary btn-sm" onclick="viewPaymentDetail('${m.paidPayment.id}')">Receipt</button>`;
              } else {
                actionBtn = '<span class="badge badge-green" style="font-size:0.75rem">Settled</span>';
              }
            } else if (m.status === 'pending') {
              statusBadge = '<span class="badge badge-yellow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:3px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Pending Verification</span>';
              if (m.pendingPayment) {
                actionBtn = `<button class="btn btn-secondary btn-sm" onclick="viewPaymentDetail('${m.pendingPayment.id}')">View Details</button>`;
              }
            } else if (m.status === 'pay_now') {
              statusBadge = '<span class="badge-pay-now"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg> Pay Now</span>';
              if (m.matchingBill) {
                actionBtn = `<button class="btn btn-primary btn-sm btn-pay-now" onclick="openPayNowModal('${m.matchingBill.id}')">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Pay Now
                </button>`;
              } else {
                // Advance unbilled month payable because preceding month is paid
                actionBtn = `<button class="btn btn-primary btn-sm btn-pay-now" onclick="openAdvancePayModal('${m.monthKey}', ${m.amountDue})">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Pay Now
                </button>`;
              }
            } else {
              // Not Billed Yet
              statusBadge = '<span class="badge-not-billed"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Not Billed Yet</span>';
              actionBtn = '<span style="color:var(--text-3);padding-right:10px">—</span>';
            }

            const isCurrentCalendarMonth = m.monthKey === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

            return `
            <tr>
              <td>
                <div class="paynow-month-cell">
                  <div class="paynow-month-num">${String(m.monthNum).padStart(2, '0')}</div>
                  <div>
                    <div class="paynow-month-name">
                      ${escapeHtml(m.monthName)}
                      ${isCurrentCalendarMonth ? ' <span class="badge badge-blue" style="font-size:0.68rem;padding:1px 6px">Current</span>' : ''}
                    </div>
                    <div class="paynow-month-desc">${m.matchingBill ? escapeHtml(m.matchingBill.title) : (m.isAdvanceUnbilled ? 'Advance month eligible' : 'No billing created yet')}</div>
                    ${m.rejectedPayment && m.status === 'pay_now' ? `
                      <div style="font-size:0.75rem;color:var(--red-600);margin-top:3px">
                        ⚠️ Previous payment rejected: ${escapeHtml(m.rejectedPayment.rejection_reason || m.rejectedPayment.remarks || 'Check history')}. You may submit again.
                      </div>
                    ` : ''}
                  </div>
                </div>
              </td>
              <td class="amount-due" style="font-weight:700">${formattedAmt}</td>
              <td>${escapeHtml(m.dueDateDisplay)}</td>
              <td>${statusBadge}</td>
              <td style="text-align:right;padding-right:16px">${actionBtn}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

if (typeof window !== 'undefined') {
  window.renderHOPayNow = renderHOPayNow;
  window.renderHOBilling = renderHOBilling;
  window.renderHOHistory = renderHOHistory;
  window.renderHOPayments = renderHOPayments;
  window.openPayNowModal = openPayNowModal;
  window.openAdvancePayModal = openAdvancePayModal;
  window.handlePayNowYearChange = handlePayNowYearChange;
  window.copyGcashNumber = copyGcashNumber;
  window.openSubmitPaymentForm = openSubmitPaymentForm;
  window.openCreateManualPaymentModal = openCreateManualPaymentModal;
  window.updateManualPaymentBillings = updateManualPaymentBillings;
  window.updateManualPaymentSummary = updateManualPaymentSummary;
  window.setupReceiptDragDrop = setupReceiptDragDrop;
  window.handleReceiptFileSelect = handleReceiptFileSelect;
  window.clearSelectedReceiptFile = clearSelectedReceiptFile;
  window.executeSubmitPaymentProof = executeSubmitPaymentProof;
}
