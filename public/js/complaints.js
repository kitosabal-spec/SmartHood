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

