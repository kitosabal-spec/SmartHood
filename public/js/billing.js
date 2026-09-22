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
        <button class="btn btn-primary" onclick="openPaymentSettingsModal()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:-2px"><use href="#ico-settings"/></svg>
          Payment Settings
        </button>
      </div>
    ` : ''}
  </div>
  <div class="section-card">
    <div class="section-card-header">
      <div class="filters-row">
        <div class="search-box">
          <span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span>
          <input id="paySearch" type="text" placeholder="Search by resident name or reference number..."/>
        </div>
        <select class="filter-select" id="payFilter" onchange="filterPayments()">
          <option value="">All Statuses</option>
          <option value="pending">Pending Verification</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
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
      const blockLot = [ho?.block, ho?.lot].filter(Boolean).join(' ') || '—';
      const formattedAmount = '₱' + Number(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const methodBadge = `<span class="badge badge-gcash">${escapeHtml(p.payment_method || 'GCash')}</span>`;
      const statusBadge = p.status === 'pending'
        ? '<span class="badge badge-yellow">Pending</span>'
        : (p.status === 'approved' ? '<span class="badge badge-green">Approved</span>' : '<span class="badge badge-red">Rejected</span>');

      return `<tr>
        <td><strong>${escapeHtml(ho ? ho.name : 'Unknown')}</strong></td>
        <td>${escapeHtml(blockLot)}</td>
        <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(bill ? bill.title : 'N/A')}">${escapeHtml(bill ? bill.title : 'N/A')}</td>
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

function filterPayments() {
  const q = (document.getElementById('paySearch')?.value || '').toLowerCase().trim();
  const status = document.getElementById('payFilter')?.value || '';
  let payments = db.get('payments');
  if (status) payments = payments.filter(p => p.status === status);
  if (q) {
    const users = db.get('users');
    const billings = db.get('billings');
    payments = payments.filter(p => {
      const ho = users.find(u => u.id === p.homeownerId);
      const bill = billings.find(b => b.id === p.billingId);
      return (
        (ho && (ho.name || '').toLowerCase().includes(q)) ||
        (p.refNum && p.refNum.toLowerCase().includes(q)) ||
        (bill && (bill.title || '').toLowerCase().includes(q))
      );
    });
  }
  renderPaymentTable(payments);
}

// ── ADMIN PAYMENT REVIEW MODAL ──

function viewPaymentDetail(id) {
  const p = db.getOne('payments', id);
  if (!p) { showToast('error', 'Error', 'Payment record not found.'); return; }
  const ho = db.getOne('users', p.homeownerId);
  const bill = db.getOne('billings', p.billingId);
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

  openModal('Review Payment Submission', `
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
          <tr><td style="padding:5px 0;color:var(--text-3)">Billing Title:</td><td><strong>${escapeHtml(bill ? bill.title : 'N/A')}</strong></td></tr>
          <tr><td style="padding:5px 0;color:var(--text-3)">Due Date:</td><td>${escapeHtml(bill?.dueDate || '—')}</td></tr>
          <tr><td style="padding:5px 0;color:var(--text-3)">Payment Method:</td><td><span class="badge badge-gcash">${escapeHtml(p.payment_method || 'GCash')}</span></td></tr>
          <tr><td style="padding:5px 0;color:var(--text-3)">GCash Reference #:</td><td><code style="font-weight:800;font-size:0.95rem;color:var(--gcash-blue)">${escapeHtml(p.refNum)}</code></td></tr>
          <tr><td style="padding:5px 0;color:var(--text-3)">Payment Date:</td><td>${escapeHtml(p.payment_date || p.submittedAt || '—')}</td></tr>
          <tr><td style="padding:5px 0;color:var(--text-3)">Date Submitted:</td><td>${escapeHtml(p.submittedAt || '—')}</td></tr>
          ${p.remarks && p.status !== 'rejected' ? `<tr><td style="padding:5px 0;color:var(--text-3)">Resident Note:</td><td>${escapeHtml(p.remarks)}</td></tr>` : ''}
        </table>
      </div>

      ${p.status === 'rejected' ? `
        <div class="rejection-reason-callout">
          <strong>Rejection Reason:</strong>
          <div style="margin-top:4px">${escapeHtml(p.rejection_reason || p.remarks || 'No reason specified')}</div>
        </div>
      ` : ''}

      <div>
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
      </div>
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
  syncHomeownerBalances();
  const myBillings = db.get('billings').filter(b => b.assignedTo.includes(currentUser.id));
  const myPayments = db.get('payments').filter(p => p.homeownerId === currentUser.id);
  const today = getLocalDateValue();
  const area = document.getElementById('contentArea');

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <h2>My Bills</h2>
      <p>View your billing records and submit payments via GCash.</p>
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
              const overdue = b.dueDate < today && !paid;

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
                <td>${escapeHtml(b.dueDate)}${overdue ? ' <span style="color:var(--red-600);font-weight:700">— Overdue</span>' : ''}</td>
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

function openPayNowModal(billingId) {
  const bill = db.getOne('billings', billingId);
  if (!bill) { showToast('error', 'Error', 'Billing record not found.'); return; }

  const gcash = db.get('payment_settings').find(s => s.payment_method === 'gcash') || {
    account_name: 'San Alfonso Homes HOA',
    account_number: '09171234567',
    instructions: '1. Open GCash.\n2. Scan the QR code or enter the GCash mobile number.\n3. Pay the exact amount shown in SmartHood.\n4. Save your GCash receipt or take a screenshot.\n5. Submit the payment reference number and receipt in SmartHood.',
    is_active: 1,
    qr_code_path: null,
  };

  const formattedAmount = '₱' + Number(bill.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rawInstructions = gcash.instructions || '1. Open GCash.\n2. Scan the QR code.\n3. Pay the exact amount shown in SmartHood.\n4. Save your receipt.\n5. Submit your reference number and receipt screenshot.';
  const instructionItems = rawInstructions.split('\n').filter(line => line.trim().length > 0);

  if (!gcash.is_active) {
    openModal('GCash Payment', `
      <div class="payment-flow-modal">
        <div class="payment-bill-summary">
          <div class="payment-bill-meta">
            <h4>${escapeHtml(bill.title)}</h4>
            <p>Due Date: ${escapeHtml(bill.dueDate)}</p>
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

  openModal('Pay Bill via GCash', `
    <div class="payment-flow-modal">
      <div class="payment-bill-summary">
        <div class="payment-bill-meta">
          <h4>${escapeHtml(bill.title)}</h4>
          <p>${escapeHtml(bill.description || 'Monthly HOA billing dues')}</p>
          <p style="margin-top:2px">Due Date: <strong>${escapeHtml(bill.dueDate)}</strong></p>
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
      action: () => { closeModal(); openSubmitPaymentForm(bill.id); }
    },
  ]);
}

function copyGcashNumber(number) {
  navigator.clipboard.writeText(number).then(() => {
    const btn = document.getElementById('copyGcashBtn');
    if (btn) {
      btn.classList.add('copied');
      btn.innerHTML = '&#10003; Copied!';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
      }, 2000);
    }
    showToast('success', 'Copied to Clipboard', `GCash number ${number} copied.`);
  }).catch(() => {
    showToast('info', 'Copy Number', number);
  });
}

// ── RESIDENT PAYMENT SUBMISSION FORM ──

let selectedPaymentReceiptFile = null;

function openSubmitPaymentForm(billingId) {
  const bill = db.getOne('billings', billingId);
  if (!bill) { showToast('error', 'Error', 'Billing record not found.'); return; }
  selectedPaymentReceiptFile = null;

  const formattedAmount = '₱' + Number(bill.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = getLocalDateValue();

  openModal('Submit Payment Proof', `
    <div class="payment-flow-modal">
      <div class="payment-bill-summary">
        <div class="payment-bill-meta">
          <h4>${escapeHtml(bill.title)}</h4>
          <p>Bill ID: <code>${escapeHtml(bill.id)}</code></p>
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
    { label: 'Back to QR', cls: 'btn-secondary', action: () => { closeModal(); openPayNowModal(billingId); } },
    { label: 'Submit Payment Proof', cls: 'btn-primary', action: () => executeSubmitPaymentProof(billingId) },
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

async function executeSubmitPaymentProof(billingId) {
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
  formData.append('billingId', billingId);
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
    showToast('success', 'Payment Submitted', 'Your payment proof has been submitted and is pending admin verification.');
    navigate('ho-history');
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
                  <td><strong>${escapeHtml(bill ? bill.title : 'N/A')}</strong></td>
                  <td class="amount-paid">${formattedAmount}</td>
                  <td><span class="badge badge-gcash">${escapeHtml(p.payment_method || 'GCash')}</span></td>
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
  const myBillings = db.get('billings').filter(b => b.assignedTo.includes(currentUser.id));
  const myPayments = db.get('payments').filter(p => p.homeownerId === currentUser.id);
  const unpaid = myBillings.filter(b => !myPayments.find(p => p.billingId === b.id && (p.status === 'approved' || p.status === 'pending')));

  if (unpaid.length === 0) {
    const area = document.getElementById('contentArea');
    area.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <h2>Submit Payment</h2>
          <p>Pay your association dues via GCash.</p>
        </div>
      </div>
      <div class="section-card">
        <div class="section-card-body" style="text-align:center;padding:40px 20px">
          <svg style="width:3.5rem;height:3.5rem;color:var(--green-600);margin-bottom:12px"><use href="#ico-check"/></svg>
          <h3 style="margin:0 0 8px 0;color:var(--text)">You Have No Unpaid Bills</h3>
          <p style="color:var(--text-3);max-width:400px;margin:0 auto 16px auto">All your assigned bills have been paid or are currently pending admin verification.</p>
          <button class="btn btn-secondary" onclick="navigate('ho-history')">View Payment History</button>
        </div>
      </div>
    `;
    return;
  }

  // If resident has unpaid bills, open pay now for the first unpaid bill
  openPayNowModal(unpaid[0].id);
}

