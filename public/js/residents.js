// SECTION 7: ADMIN — HOMEOWNERS


let hoPaginationState = { page: 1, pageSize: 10 };
let currentHOFilteredList = null;

function changeHOPage(page) {
  hoPaginationState.page = page;
  renderHOTable(currentHOFilteredList, false);
}
window.changeHOPage = changeHOPage;

function changeHOPageSize(pageSize) {
  hoPaginationState.pageSize = pageSize;
  hoPaginationState.page = 1;
  renderHOTable(currentHOFilteredList, false);
}
window.changeHOPageSize = changeHOPageSize;

function renderHomeowners() {
  syncHomeownerBalances();
  hoPaginationState.page = 1;
  currentHOFilteredList = null;

  const area = document.getElementById('contentArea');
  const blockOptions = [...new Set(getHomeowners()
    .filter(u => u.block)
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
        <thead><tr><th>#</th><th>Homeowner</th><th>Block / Lot</th><th>Balance</th><th>Account Status</th><th>Details</th><th>Actions</th></tr></thead>
        <tbody id="hoTableBody"></tbody>
      </table></div>
    </div>
    <div id="hoPagination"></div>
  </div>`;

  document.getElementById('hoSearch').addEventListener('input', filterHomeowners);
  renderHOTable();
}

function renderHOTable(filtered = null, resetPage = false) {
  if (filtered !== null) {
    currentHOFilteredList = filtered;
  } else if (currentHOFilteredList === null) {
    currentHOFilteredList = getHomeowners();
  }
  const users = currentHOFilteredList || [];
  const tbody = document.getElementById('hoTableBody');
  if (!tbody) return;

  if (resetPage) hoPaginationState.page = 1;

  const totalItems = users.length;
  const pageSize = hoPaginationState.pageSize || 10;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (hoPaginationState.page > totalPages) hoPaginationState.page = totalPages;
  if (hoPaginationState.page < 1) hoPaginationState.page = 1;

  if (!totalItems) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-users"/></svg>No homeowners found.</div></td></tr>`;
    renderPaginationComponent({
      containerId: 'hoPagination',
      currentPage: 1,
      pageSize,
      totalItems: 0,
      onPageChangeFn: 'changeHOPage',
      onPageSizeChangeFn: 'changeHOPageSize',
      itemLabel: 'homeowners',
    });
    return;
  }

  const startIndex = (hoPaginationState.page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pageItems = users.slice(startIndex, endIndex);

  tbody.innerHTML = pageItems.map((u, i) => `
    <tr>
      <td>${startIndex + i + 1}</td>
      <td><div class="homeowner-name-cell">${avatarHTML(u, 'avatar-sm')}<strong>${escapeHtml(u.name)}</strong></div></td>
      <td>${escapeHtml(u.block || '—')}, ${escapeHtml(u.lot || '—')}</td>
      <td class="${(u.balance||0) > 0 ? 'amount-due' : 'amount-paid'}">₱${(u.balance||0).toLocaleString()}</td>
      <td><span class="${u.accountStatus === 'Registered' ? 'badge-status-active' : 'badge-status-inactive'}">${escapeHtml(u.accountStatus || 'No Account')}</span></td>
      <td><button class="ho-info-btn" onclick="openViewHO('${u.id}')" title="View details">i</button></td>
      <td><div class="td-actions">
        ${u.accountStatus === 'Registered'
          ? `<button class="btn btn-secondary btn-sm" onclick="openResetPasswordModal('${u.id}')">Reset Password</button>`
          : `<button class="btn btn-primary btn-sm" onclick="openRegisterAccountModal('${u.id}')">Register Account</button>`}
        <button class="btn btn-secondary btn-sm" onclick="openEditHO('${u.id}')">Edit</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="confirmDeleteHO('${u.id}')" title="Delete"><svg width="14" height="14"><use href="#ico-trash"/></svg></button>
      </div></td>
    </tr>`).join('');

  renderPaginationComponent({
    containerId: 'hoPagination',
    currentPage: hoPaginationState.page,
    pageSize,
    totalItems,
    onPageChangeFn: 'changeHOPage',
    onPageSizeChangeFn: 'changeHOPageSize',
    itemLabel: 'homeowners',
  });
}

function filterHomeowners() {
  const q = (document.getElementById('hoSearch')?.value || '').toLowerCase();
  const blk = document.getElementById('hoFilter')?.value || '';
  let users = getHomeowners();
  if (q) users = users.filter(u =>
    u.name.toLowerCase().includes(q)
    || (u.email || '').toLowerCase().includes(q)
    || (u.block || '').toLowerCase().includes(q)
    || (u.lot || '').toLowerCase().includes(q)
  );
  if (blk) users = users.filter(u => u.block === blk);
  renderHOTable(users, true);
}

function openAddHomeownerModal() {
  openModal('Add Homeowner', `
    <div class="form-group"><label>Full Name *</label><input id="f_name" placeholder="e.g. Juan Dela Cruz"/></div>
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

async function saveAddHomeowner() {
  const name = document.getElementById('f_name').value.trim();
  if (!name) { showToast('error', 'Missing Name', 'Full Name is required.'); return; }
  const lotAreaValue = document.getElementById('f_lotArea').value.trim();
  const lotArea = lotAreaValue ? Number(lotAreaValue) : 0;
  if (!Number.isFinite(lotArea) || lotArea < 0) { showToast('error', 'Invalid Lot Area', 'Please enter a valid lot area.'); return; }
  const newUser = {
    id: db.newId('h'),
    name,
    block: formatLocationPart(document.getElementById('f_block').value, 'Block'),
    lot: formatLocationPart(document.getElementById('f_lot').value, 'Lot'),
    lotArea,
    contact: document.getElementById('f_contact').value.trim(),
    balance: 0,
    accountStatus: 'No Account',
  };
  showLoading();
  try {
    await db.save('homeowners', newUser);
    await api.loadAll();
    logAction(`Added homeowner record ${name} (${newUser.id})`);
    closeModal();
    hideLoading();
    showToast('success', 'Homeowner Added', `${name} was added with No Account status.`);
    renderHomeowners();
  } catch (err) {
    hideLoading();
    showToast('error', 'Failed', err.message || 'Could not add homeowner.');
  }
}

function openViewHO(id) {
  const u = getHomeownerById(id);
  if (!u) return;
  const payments = db.get('payments').filter(p => p.homeownerId === id);
  const billings = db.get('billings').filter(b => getAssignedHomeownerIds(b).includes(id));
  const complaints = db.get('complaints').filter(c => c.homeownerId === id);
  openModal(`Profile: ${u.name}`, `
    <div class="profile-card" style="margin-bottom:16px">
      <div class="profile-avatar-big">${avatarHTML(u, 'avatar-xl')}</div>
      <div class="profile-info"><h3>${escapeHtml(u.name)}</h3><p>${escapeHtml(u.email || 'No SmartHood account')}</p><p>${escapeHtml(u.block||'')} ${escapeHtml(u.lot||'')}</p></div>
    </div>
    <div class="report-summary-grid" style="gap:10px;margin-bottom:0">
      <div class="report-summary-item"><div class="r-val">${billings.length}</div><div class="r-lbl">Bills Assigned</div></div>
      <div class="report-summary-item"><div class="r-val">${payments.filter(p=>p.status==='approved').length}</div><div class="r-lbl">Approved Payments</div></div>
      <div class="report-summary-item"><div class="r-val">${complaints.length}</div><div class="r-lbl">Complaints Filed</div></div>
    </div>
    <p style="margin-top:14px;font-size:0.85rem;color:var(--text-3)">Lot Area: <strong>${u.lotArea || 0} sqm</strong> | Contact: ${u.contact||'N/A'} | Balance: <strong style="color:var(--red-600)">₱${(u.balance||0).toLocaleString()}</strong></p>
    <p style="margin-top:14px;font-size:0.85rem;color:var(--text-3)">Account Status: <strong>${escapeHtml(u.accountStatus || 'No Account')}</strong>${u.email ? ` | Login Email: <strong>${escapeHtml(u.email)}</strong>` : ''}</p>
  `, [{ label: 'Close', cls: 'btn-secondary', action: closeModal }]);
}

function openEditHO(id) {
  const u = getHomeownerById(id);
  if (!u) return;
  openModal('Edit Homeowner', `
    <div class="form-group"><label>Full Name</label><input id="e_name" value="${u.name}"/></div>
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
  const u = getHomeownerById(id);
  if (!u) return;
  u.name = document.getElementById('e_name').value.trim() || u.name;
  u.block = formatLocationPart(document.getElementById('e_block').value, 'Block');
  u.lot = formatLocationPart(document.getElementById('e_lot').value, 'Lot');
  u.contact = document.getElementById('e_contact').value.trim();
  db.save('homeowners', u);
  logAction(`Updated homeowner profile: ${u.name}`);
  closeModal();
  showToast('success', 'Profile Updated', `${u.name}'s profile saved.`);
  renderHomeowners();
}

function confirmDeleteHO(id) {
  const u = getHomeownerById(id);
  if (!u) return;
  openModal('Confirm Delete', `<p>Are you sure you want to delete <strong>${u.name}</strong>? This action cannot be undone.</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Delete', cls: 'btn-danger', action: async () => { try { await db.delete('homeowners', id); logAction(`Deleted homeowner: ${u.name}`); closeModal(); showToast('success', 'Deleted', `${u.name} removed.`); renderHomeowners(); } catch (err) { showToast('error', 'Cannot Delete', err.message); } } },
  ]);
}

function openRegisterAccountModal(id) {
  const homeowner = getHomeownerById(id);
  if (!homeowner || homeowner.accountStatus === 'Registered') return;
  openModal('Register SmartHood Account', `
    <div class="grid-2">
      <div class="form-group"><label>Homeowner Name</label><input value="${escapeHtml(homeowner.name)}" readonly/></div>
      <div class="form-group"><label>Block / Lot</label><input value="${escapeHtml([homeowner.block, homeowner.lot].filter(Boolean).join(' / ') || '—')}" readonly/></div>
    </div>
    <div class="form-group"><label>Email Address *</label><input id="ra_email" type="email" placeholder="resident@example.com" autocomplete="off"/></div>
    <div class="form-group"><label>Mobile Number *</label><input id="ra_mobile" inputmode="tel" value="${escapeHtml(homeowner.contact || '')}" placeholder="e.g. 09171234567"/></div>
    <div class="form-group"><label>Initial Password *</label><input id="ra_password" type="password" placeholder="Minimum 12 characters" autocomplete="new-password"/></div>
    <small style="color:var(--text-3)">The email address becomes the homeowner's login ID. The password is hashed and will never be displayed.</small>
    <label class="legal-consent" for="ra_legal_consent">
      <input id="ra_legal_consent" type="checkbox"/>
      <span class="legal-consent-copy">I confirm that the homeowner has been given an opportunity to read and has agreed to the <a href="/terms-and-conditions" onclick="openLegalPage('terms', event)">Terms &amp; Conditions</a> and acknowledges the <a href="/privacy-policy" onclick="openLegalPage('privacy', event)">Privacy Policy</a>.</span>
    </label>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Register Account', cls: 'btn-primary', action: () => registerHomeownerAccount(id) },
  ]);
}

async function registerHomeownerAccount(id) {
  const email = (document.getElementById('ra_email')?.value || '').trim().toLowerCase();
  const mobile = (document.getElementById('ra_mobile')?.value || '').trim();
  const password = (document.getElementById('ra_password')?.value || '').trim();
  const legalConsent = Boolean(document.getElementById('ra_legal_consent')?.checked);
  if (!email || !mobile || !password) {
    showToast('error', 'Missing Fields', 'Email Address, Mobile Number, and Initial Password are required.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('error', 'Invalid Email', 'Enter a valid email address.');
    return;
  }
  if (!/^[0-9+()\-\s]{7,20}$/.test(mobile)) {
    showToast('error', 'Invalid Mobile Number', 'Enter a valid mobile number.');
    return;
  }
  if (password.length < 12) {
    showToast('error', 'Weak Password', 'Initial Password must be at least 12 characters.');
    return;
  }
  if (!legalConsent) {
    showToast('error', 'Consent Required', 'The Terms & Conditions and Privacy Policy must be accepted before registration.');
    return;
  }
  showLoading();
  try {
    await api.registerHomeownerAccount(id, {
      email,
      mobile,
      password,
      termsAccepted: true,
      privacyAcknowledged: true,
      policyVersion: window.LEGAL_POLICY_VERSION,
    });
    await api.loadAll();
    closeModal();
    hideLoading();
    showToast('success', 'Account Registered', 'The homeowner can now sign in using their email address and password.');
    renderHomeowners();
  } catch (err) {
    hideLoading();
    showToast('error', 'Registration Failed', err.message || 'Could not register the account.');
  }
}

function openResetPasswordModal(id) {
  const homeowner = getHomeownerById(id);
  if (!homeowner || homeowner.accountStatus !== 'Registered') return;
  openModal('Reset Password', `
    <p style="margin-bottom:14px;color:var(--text-2)">Set a new password for <strong>${escapeHtml(homeowner.name)}</strong>. The existing password cannot be viewed.</p>
    <div class="form-group"><label>New Password *</label><input id="rp_password" type="password" placeholder="Minimum 12 characters" autocomplete="new-password"/></div>
    <div class="form-group"><label>Confirm New Password *</label><input id="rp_confirm" type="password" placeholder="Repeat the new password" autocomplete="new-password"/></div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Reset Password', cls: 'btn-primary', action: () => resetHomeownerPassword(id) },
  ]);
}

async function resetHomeownerPassword(id) {
  const password = (document.getElementById('rp_password')?.value || '').trim();
  const confirmation = (document.getElementById('rp_confirm')?.value || '').trim();
  if (password.length < 12) {
    showToast('error', 'Weak Password', 'New Password must be at least 12 characters.');
    return;
  }
  if (password !== confirmation) {
    showToast('error', 'Password Mismatch', 'The password confirmation does not match.');
    return;
  }
  showLoading();
  try {
    await api.resetHomeownerPassword(id, password);
    closeModal();
    hideLoading();
    showToast('success', 'Password Reset', 'The new password is active. The old password will no longer work.');
  } catch (err) {
    hideLoading();
    showToast('error', 'Reset Failed', err.message || 'Could not reset the password.');
  }
}
