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
    <div id="hoPagination"></div>
  </div>`;

  document.getElementById('hoSearch').addEventListener('input', filterHomeowners);
  renderHOTable();
}

function renderHOTable(filtered = null, resetPage = false) {
  if (filtered !== null) {
    currentHOFilteredList = filtered;
  } else if (currentHOFilteredList === null) {
    currentHOFilteredList = db.get('users').filter(u => u.role === 'homeowner');
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
    tbody.innerHTML = `<tr><td colspan="6"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-users"/></svg>No homeowners found.</div></td></tr>`;
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
      <td><button class="ho-info-btn" onclick="openViewHO('${u.id}')" title="View details">i</button></td>
      <td><div class="td-actions">
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
  let users = db.get('users').filter(u => u.role === 'homeowner');
  if (q) users = users.filter(u =>
    u.name.toLowerCase().includes(q)
    || (u.username || '').toLowerCase().includes(q)
    || u.email.toLowerCase().includes(q)
    || (u.block || '').toLowerCase().includes(q)
  );
  if (blk) users = users.filter(u => u.block === blk);
  renderHOTable(users, true);
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

async function saveAddHomeowner() {
  const name = document.getElementById('f_name').value.trim();
  const username = document.getElementById('f_user').value.trim().toLowerCase();
  const password = document.getElementById('f_pass').value.trim();
  const email = document.getElementById('f_email').value.trim().toLowerCase();
  if (!name || !username || !password || !email) { showToast('error', 'Missing Fields', 'Please fill in all required fields.'); return; }
  if (/\s/.test(username)) { showToast('error', 'Invalid Username', 'Username cannot contain whitespace.'); return; }
  if (username.length < 3) { showToast('error', 'Username Too Short', 'Username must be at least 3 characters.'); return; }
  if (password.length < 6) { showToast('error', 'Weak Password', 'Password must be at least 6 characters.'); return; }
  const users = db.get('users');
  if (users.find(u => (u.username || '').toLowerCase() === username)) { showToast('error', 'Duplicate Username', 'Username already exists. Please choose another username.'); return; }
  if (users.find(u => (u.email || '').toLowerCase() === email)) { showToast('error', 'Duplicate Email', 'Email address is already registered. Please choose another email.'); return; }
  const lotAreaValue = document.getElementById('f_lotArea').value.trim();
  const lotArea = lotAreaValue ? Number(lotAreaValue) : 0;
  if (!Number.isFinite(lotArea) || lotArea < 0) { showToast('error', 'Invalid Lot Area', 'Please enter a valid lot area.'); return; }
  const newUser = {
    id: db.newId('u'),
    username,
    password,
    role: 'homeowner',
    name,
    email,
    block: formatLocationPart(document.getElementById('f_block').value, 'Block'),
    lot: formatLocationPart(document.getElementById('f_lot').value, 'Lot'),
    lotArea,
    contact: document.getElementById('f_contact').value.trim(),
    balance: 0,
    permissions: ['resident'],
    status: 'active',
  };
  showLoading();
  try {
    await db.save('users', newUser);
    await api.loadAll();
    logAction(`Added homeowner ${name} (@${username})`);
    closeModal();
    hideLoading();
    showToast('success', 'Homeowner Added', `Account for ${name} has been created in MySQL. Login Username: "${username}"`);
    renderHomeowners();
  } catch (err) {
    hideLoading();
    showToast('error', 'Failed', err.message || 'Could not add homeowner.');
  }
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

