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
