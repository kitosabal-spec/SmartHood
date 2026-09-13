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
    const totalAttachments = (Array.isArray(c.attachments) && c.attachments.length)
      ? c.attachments.length
      : ((c.attachment || c.media_url) ? 1 : 0);
    const mediaBadge = totalAttachments > 0 ? ` <span title="${totalAttachments} media attachment(s)" style="display:inline-flex;align-items:center;gap:3px;vertical-align:middle;margin-left:4px;color:var(--teal-600);font-size:0.75rem;font-weight:600"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>${totalAttachments > 1 ? `<span>${totalAttachments}</span>` : ''}</span>` : '';
    return `<tr>
      <td>${i + 1}</td>
      <td><div class="cell-user">${avatarHTML(ho, 'avatar-sm')}<div><strong>${ho ? ho.name : 'Unknown'}</strong><br><span style="font-size:0.75rem;color:var(--text-3)">${ho ? (ho.block || '') + ' ' + (ho.lot || '') : ''}</span></div></div></td>
      <td>${complaintCategoryBadge(c.category, c.otherCategory)}</td>
      <td style="max-width:200px;font-size:0.85rem;color:var(--text-2)">${shortDesc}${mediaBadge}</td>
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
  if (cat) {
    if (cat === 'Others') {
      complaints = complaints.filter(c => c.category === 'Others' || (c.category && c.category.startsWith('Others')));
    } else {
      complaints = complaints.filter(c => c.category === cat);
    }
  }
  if (q) {
    complaints = complaints.filter(c => {
      const ho = db.getOne('users', c.homeownerId);
      return (c.description && c.description.toLowerCase().includes(q))
        || (c.category && c.category.toLowerCase().includes(q))
        || (c.otherCategory && c.otherCategory.toLowerCase().includes(q))
        || (ho && ho.name && ho.name.toLowerCase().includes(q));
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
          <div>${complaintCategoryBadge(c.category, c.otherCategory)}</div>
          <div>${complaintStatusBadge(c.status)}</div>
        </div>
        <p style="font-size:0.9rem;color:var(--text-2);line-height:1.6">${c.description}</p>
        ${renderComplaintMediaPreview(c.attachment || c.media_url, c.media_type, c.attachments)}
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
          ${complaintCategoryBadge(c.category, c.otherCategory)}
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
      ${renderComplaintMediaPreview(c.attachment || c.media_url, c.media_type, c.attachments)}
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
            ${complaintCategoryBadge(c.category, c.otherCategory)}
            ${complaintStatusBadge(c.status)}
            <span style="font-size:0.78rem;color:var(--text-3)">Filed: ${c.dateFiled}</span>
            ${c.updatedAt ? `<span style="font-size:0.78rem;color:var(--text-3)">· Updated: ${c.updatedAt}</span>` : ''}
          </div>
          <div style="font-size:0.9rem;color:var(--text-2);line-height:1.6">${c.description}</div>
          ${renderComplaintMediaPreview(c.attachment || c.media_url, c.media_type, c.attachments)}
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

function normalizeComplaintAttachments(mediaUrl, mediaType, rawAttachments) {
  let list = [];
  if (Array.isArray(rawAttachments)) {
    list = rawAttachments.filter(Boolean);
  } else if (typeof rawAttachments === 'string' && rawAttachments.trim().startsWith('[')) {
    try {
      list = JSON.parse(rawAttachments);
    } catch {
      list = [];
    }
  }

  if (!list.length && mediaUrl) {
    const isVideo = mediaType === 'video' || /\.(mp4|mov|webm)$/i.test(mediaUrl);
    list = [{
      url: mediaUrl,
      media_url: mediaUrl,
      attachment: mediaUrl,
      media_type: isVideo ? 'video' : 'image',
    }];
  }

  return list;
}

function renderComplaintMediaPreview(mediaUrl, mediaType, rawAttachments) {
  const items = normalizeComplaintAttachments(mediaUrl, mediaType, rawAttachments);
  if (!items.length) return '';

  const imgCount = items.filter(item => item.media_type === 'image' || (!item.media_type && !/\.(mp4|mov|webm)$/i.test(item.url || item.media_url || ''))).length;
  const vidCount = items.length - imgCount;

  const headerLabel = items.length === 1
    ? (vidCount ? 'Video Evidence' : 'Photo Evidence')
    : `Attached Evidence (${items.length} item${items.length > 1 ? 's' : ''}${imgCount && vidCount ? `: ${imgCount} photo${imgCount > 1 ? 's' : ''}, ${vidCount} video${vidCount > 1 ? 's' : ''}` : ''})`;

  const itemsHtml = items.map((item, idx) => {
    const rawUrl = item.url || item.media_url || item.attachment || '';
    const url = typeof escapeHtml === 'function' ? escapeHtml(rawUrl) : rawUrl;
    const isVid = item.media_type === 'video' || /\.(mp4|mov|webm)$/i.test(rawUrl);
    const safeName = typeof escapeHtml === 'function' ? escapeHtml(item.originalname || `Evidence ${idx + 1}`) : (item.originalname || `Evidence ${idx + 1}`);

    if (isVid) {
      return `
        <div class="complaint-evidence-item">
          <video src="${url}" controls playsinline class="complaint-media-evidence-video"></video>
          <div class="complaint-evidence-caption">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            <span title="${safeName}">${safeName}</span>
          </div>
        </div>`;
    }

    return `
      <div class="complaint-evidence-item">
        <a href="${url}" target="_blank" rel="noopener noreferrer" title="Click to view full image">
          <img src="${url}" alt="${safeName}" class="complaint-media-evidence-thumb" />
        </a>
        <div class="complaint-evidence-caption">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span title="${safeName}">${safeName}</span>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="complaint-media-evidence-card">
      <div class="complaint-evidence-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span>${headerLabel}</span>
      </div>
      <div class="complaint-media-evidence-grid">
        ${itemsHtml}
      </div>
    </div>`;
}

function handleComplaintCategoryChange(select) {
  const otherGroup = document.getElementById('hc_other_group');
  const otherInput = document.getElementById('hc_other_category');
  if (!otherGroup) return;
  const isOther = select && select.value === 'Others';
  if (isOther) {
    otherGroup.classList.remove('hidden');
    otherGroup.style.display = 'block';
    if (otherInput) otherInput.focus();
  } else {
    otherGroup.classList.add('hidden');
    otherGroup.style.display = 'none';
    if (otherInput) otherInput.value = '';
  }
}

var pendingComplaintMediaFiles = [];
var pendingComplaintMediaFile = null;

const ALLOWED_COMPLAINT_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_COMPLAINT_VIDEO_EXTS = ['.mp4', '.mov', '.webm'];
const MAX_COMPLAINT_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_COMPLAINT_VIDEO_SIZE = 30 * 1024 * 1024;

function isComplaintFileImage(file) {
  const fileName = file?.name || '';
  const lastDot = fileName.lastIndexOf('.');
  const ext = lastDot !== -1 ? fileName.substring(lastDot).toLowerCase() : '';
  const mime = (file?.type || '').toLowerCase();
  return ALLOWED_COMPLAINT_IMAGE_EXTS.includes(ext) || mime.startsWith('image/');
}

function handleComplaintMediaSelect(input) {
  const errorEl = document.getElementById('hc_media_error');
  if (errorEl) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
    errorEl.innerHTML = '';
  }

  const selectedFiles = Array.from(input?.files || []);
  if (!selectedFiles.length) return;

  const errors = [];

  for (const file of selectedFiles) {
    const fileName = file.name || '';
    const lastDot = fileName.lastIndexOf('.');
    const ext = lastDot !== -1 ? fileName.substring(lastDot).toLowerCase() : '';
    const mime = (file.type || '').toLowerCase();

    const isImage = ALLOWED_COMPLAINT_IMAGE_EXTS.includes(ext) || mime.startsWith('image/');
    const isVideo = ALLOWED_COMPLAINT_VIDEO_EXTS.includes(ext) || mime.startsWith('video/');

    if (!isImage && !isVideo) {
      errors.push(`"${fileName}": Unsupported format. Please upload JPG, PNG, WEBP (Images) or MP4, MOV, WEBM (Videos).`);
      continue;
    }

    if (isImage && file.size > MAX_COMPLAINT_IMAGE_SIZE) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      errors.push(`Image "${fileName}" (${sizeMb} MB) exceeds the maximum allowed size of 5 MB.`);
      continue;
    }

    if (isVideo && file.size > MAX_COMPLAINT_VIDEO_SIZE) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      errors.push(`Video "${fileName}" (${sizeMb} MB) exceeds the maximum allowed size of 30 MB.`);
      continue;
    }

    const isDuplicate = pendingComplaintMediaFiles.some(existing =>
      existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified
    );
    if (!isDuplicate) {
      pendingComplaintMediaFiles.push(file);
    }
  }

  pendingComplaintMediaFile = pendingComplaintMediaFiles[0] || null;

  if (errors.length > 0) {
    if (errorEl) {
      errorEl.innerHTML = errors.map(err => typeof escapeHtml === 'function' ? escapeHtml(err) : err).join('<br>');
      errorEl.style.display = 'block';
    }
    showToast('error', 'File Upload Notice', errors[0]);
  }

  renderComplaintMediaPreviews();
  input.value = '';
}

function renderComplaintMediaPreviews() {
  const container = document.getElementById('hc_media_preview_container');
  const dropzone = document.getElementById('hc_media_dropzone');
  const list = document.getElementById('hc_media_preview_list');
  const countBadge = document.getElementById('hc_media_count_badge');

  if (!container || !list) return;

  if (!pendingComplaintMediaFiles.length) {
    container.style.display = 'none';
    if (dropzone) dropzone.style.display = 'flex';
    list.innerHTML = '';
    return;
  }

  if (dropzone) dropzone.style.display = 'none';
  container.style.display = 'block';

  const imgCount = pendingComplaintMediaFiles.filter(f => isComplaintFileImage(f)).length;
  const vidCount = pendingComplaintMediaFiles.length - imgCount;
  const summaryParts = [];
  if (imgCount) summaryParts.push(`${imgCount} photo${imgCount > 1 ? 's' : ''}`);
  if (vidCount) summaryParts.push(`${vidCount} video${vidCount > 1 ? 's' : ''}`);
  if (countBadge) {
    countBadge.textContent = `${pendingComplaintMediaFiles.length} file${pendingComplaintMediaFiles.length > 1 ? 's' : ''} attached (${summaryParts.join(', ')})`;
  }

  list.innerHTML = pendingComplaintMediaFiles.map((file, idx) => {
    const isImage = isComplaintFileImage(file);
    const objectUrl = URL.createObjectURL(file);
    const formattedSize = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${(file.size / 1024).toFixed(0)} KB`;
    const safeName = typeof escapeHtml === 'function' ? escapeHtml(file.name) : file.name;

    return `
      <div class="complaint-media-card" data-idx="${idx}">
        <button type="button" class="complaint-media-remove-btn" onclick="removeComplaintMediaFile(${idx})" title="Remove file">&times;</button>
        <div class="complaint-media-thumb-wrapper">
          ${isImage
            ? `<img src="${objectUrl}" class="complaint-media-thumb" alt="${safeName}" />`
            : `<video src="${objectUrl}" class="complaint-media-thumb" preload="metadata"></video>
               <div class="complaint-media-play-icon">
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
               </div>`
          }
        </div>
        <div class="complaint-media-card-info">
          <div class="complaint-media-card-name" title="${safeName}">${safeName}</div>
          <div class="complaint-media-card-size">${isImage ? 'Photo' : 'Video'} · ${formattedSize}</div>
        </div>
      </div>
    `;
  }).join('');
}

function removeComplaintMediaFile(index) {
  if (index >= 0 && index < pendingComplaintMediaFiles.length) {
    pendingComplaintMediaFiles.splice(index, 1);
    pendingComplaintMediaFile = pendingComplaintMediaFiles[0] || null;
    renderComplaintMediaPreviews();
  }
}

function clearSelectedComplaintMedia(keepError = false) {
  pendingComplaintMediaFiles = [];
  pendingComplaintMediaFile = null;
  const input = document.getElementById('hc_media_input');
  if (input) input.value = '';
  renderComplaintMediaPreviews();
  if (!keepError) {
    const errorEl = document.getElementById('hc_media_error');
    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
      errorEl.innerHTML = '';
    }
  }
}

function openFileComplaintForm() {
  pendingComplaintMediaFiles = [];
  pendingComplaintMediaFile = null;

  openModal('File a Complaint', `
    <div style="background:var(--gold-50);border:1px solid var(--gold-100);border-left:3px solid var(--gold-400);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:18px;font-size:0.84rem;color:var(--text-2);line-height:1.6">
      Please provide complete and accurate information. Your complaint will be reviewed by the HOA administration.
    </div>
    <div class="form-group">
      <label>Category *</label>
      <select id="hc_category" onchange="handleComplaintCategoryChange(this)">
        <option value="">-- Select a category --</option>
        <option value="Maintenance">Maintenance</option>
        <option value="Noise">Noise</option>
        <option value="Security">Security</option>
        <option value="Others">Others</option>
      </select>
    </div>
    <div class="form-group hidden" id="hc_other_group" style="display:none">
      <label>Specify Complaint *</label>
      <input type="text" id="hc_other_category" placeholder="Please specify your complaint…" />
    </div>
    <div class="form-group">
      <label>Description *</label>
      <textarea id="hc_description" placeholder="Describe your complaint in detail. Include location, time, and any relevant information…" style="min-height:120px"></textarea>
      <div style="text-align:right;font-size:0.75rem;color:var(--text-3);margin-top:4px" id="hc_charCount">0 / 500 characters</div>
    </div>
    <div class="form-group">
      <label>Evidence (Photos or Videos) <span style="color:var(--text-3);font-weight:400">(Optional)</span></label>
      <input type="file" id="hc_media_input" multiple accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" style="display:none" onchange="handleComplaintMediaSelect(this)" />
      
      <div id="hc_media_dropzone" class="complaint-media-dropzone" onclick="document.getElementById('hc_media_input').click()">
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;color:var(--teal-600);font-weight:600;font-size:0.88rem">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          <span id="hc_media_dropzone_label">Attach Photos or Video Evidence</span>
        </div>
        <div style="font-size:0.75rem;color:var(--text-3);margin-top:2px">
          Images: JPG, JPEG, PNG, WEBP (max 5 MB each) · Videos: MP4, MOV, WEBM (max 30 MB each)
        </div>
      </div>

      <div id="hc_media_error" style="display:none;color:var(--red-600);font-size:0.8rem;margin-top:6px;font-weight:500;line-height:1.4"></div>

      <div id="hc_media_preview_container" style="display:none;margin-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span id="hc_media_count_badge" style="font-size:0.78rem;font-weight:600;color:var(--text-2)"></span>
          <button type="button" class="complaint-media-add-more-btn" onclick="document.getElementById('hc_media_input').click()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add More
          </button>
        </div>
        <div id="hc_media_preview_list" class="complaint-media-preview-grid"></div>
      </div>
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
    const catSelect = document.getElementById('hc_category');
    if (catSelect) {
      catSelect.addEventListener('change', () => handleComplaintCategoryChange(catSelect));
    }
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
  const categorySelect = document.getElementById('hc_category');
  const category       = (categorySelect?.value || '').trim();
  const otherInput     = document.getElementById('hc_other_category');
  const otherText      = (otherInput?.value || '').trim();
  const description    = (document.getElementById('hc_description')?.value || '').trim();

  if (!category) {
    showToast('error', 'Category Required', 'Please select a complaint category.');
    return;
  }
  if (category === 'Others' && !otherText) {
    showToast('error', 'Specification Required', 'Please specify your complaint.');
    if (otherInput) otherInput.focus();
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

  const finalCategory = (category === 'Others' && otherText) ? `Others: ${otherText}` : category;
  const safeFinalCategory = typeof escapeHtml === 'function' ? escapeHtml(finalCategory) : finalCategory;
  const mediaFilesToUpload = [...pendingComplaintMediaFiles];
  const fileCount = mediaFilesToUpload.length;
  const mediaNote = fileCount > 0 ? `<br><span style="font-size:0.82rem;color:var(--teal-700)">(${fileCount} evidence file${fileCount > 1 ? 's' : ''} attached)</span>` : '';

  openConfirm(
    'Submit Complaint',
    `Are you sure you want to submit this <strong>${safeFinalCategory}</strong> complaint? It will be sent to the HOA administration for review.${mediaNote}`,
    () => submitHOComplaint(finalCategory, description, otherText, mediaFilesToUpload)
  );
}

async function submitHOComplaint(category, description, otherText = '', mediaFiles = []) {
  showLoading();
  let mediaUrl = null;
  let mediaType = null;
  let attachments = [];

  try {
    const filesToUpload = Array.isArray(mediaFiles) ? mediaFiles : (mediaFiles ? [mediaFiles] : []);

    if (filesToUpload.length > 0) {
      const formData = new FormData();
      for (const f of filesToUpload) {
        formData.append('media', f);
      }
      const headers = {};
      if (typeof currentUser !== 'undefined' && currentUser && currentUser.id) {
        headers['X-User-Id'] = currentUser.id;
      }
      const uploadRes = await fetch('/api/complaints/upload', {
        method: 'POST',
        headers,
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Failed to upload media evidence.');
      }
      const uploadData = await uploadRes.json();
      mediaUrl = uploadData.url || uploadData.media_url || uploadData.attachment;
      mediaType = uploadData.media_type;
      attachments = uploadData.files && uploadData.files.length ? uploadData.files : (mediaUrl ? [{
        url: mediaUrl,
        media_url: mediaUrl,
        attachment: mediaUrl,
        media_type: mediaType,
      }] : []);
    }

    const derivedOther = otherText || (category && category.startsWith('Others: ') ? category.substring(8).trim() : (category === 'Others' ? '' : null));
    const complaint = {
      id:            db.newId('c'),
      homeownerId:   currentUser.id,
      category,
      otherCategory: derivedOther || null,
      attachment:    mediaUrl || null,
      media_url:     mediaUrl || null,
      media_type:    mediaType || null,
      attachments:   attachments,
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

    pendingComplaintMediaFiles = [];
    pendingComplaintMediaFile = null;
    hideLoading();
    closeModal();
    showToast('success', 'Complaint Filed', 'Your complaint has been submitted. The HOA will review it shortly.');
    navigate('ho-complaints');
  } catch (err) {
    hideLoading();
    console.error(err);
    showToast('error', 'Submission Failed', err.message || 'Could not submit complaint.');
  }
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

function complaintCategoryBadge(category, otherCategory = '') {
  const safeText = typeof escapeHtml === 'function' ? escapeHtml : (str) => String(str ?? '');
  const map = {
    'Maintenance': '<span class="badge badge-blue">Maintenance</span>',
    'Noise':       '<span class="badge badge-amber">Noise</span>',
    'Security':    '<span class="badge" style="background:var(--teal-100);color:var(--teal-700)">Security</span>',
    'Others':      '<span class="badge badge-gray">Others</span>',
  };
  if (category === 'Others' && otherCategory) {
    return `<span class="badge badge-gray">${safeText(`Others: ${otherCategory}`)}</span>`;
  }
  if (category && category.startsWith('Others')) {
    return `<span class="badge badge-gray">${safeText(category)}</span>`;
  }
  return map[category] || `<span class="badge badge-gray">${safeText(category || 'Others')}</span>`;
}

