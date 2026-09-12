// SECTION 9C: LOST AND FOUND


function lostFoundStatusBadge(status) {
  const map = {
    Pending: '<span class="badge badge-yellow">Pending</span>',
    Approved: '<span class="badge badge-green">Approved</span>',
    Rejected: '<span class="badge badge-red">Rejected</span>',
    Claimed: '<span class="badge badge-gray">Claimed</span>',
  };
  return map[status] || `<span class="badge badge-gray">${status || 'Unknown'}</span>`;
}

function lostFoundTypeBadge(type) {
  return type === 'Found'
    ? '<span class="badge badge-green">Found</span>'
    : '<span class="badge badge-red">Lost</span>';
}

function getApprovedLostFoundPosts() {
  return db.get('lostFound')
    .filter(report => ['Approved', 'Posted'].includes(report.status))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function renderPublicLostFound() {
  const grid = document.getElementById('pubLostFoundGrid');
  if (!grid) return;
  const posts = getApprovedLostFoundPosts().slice(0, 6);
  if (!posts.length) {
    grid.innerHTML = `<div class="no-results" style="grid-column:1/-1"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-search"/></svg>No approved lost and found posts yet.</div>`;
    return;
  }

  grid.innerHTML = posts.map(report => `
    <article class="pub-lostfound-card">
      ${report.image ? `<div class="pub-lostfound-image"><img src="${report.image}" alt="${report.itemName}"></div>` : ''}
      <div class="pub-lostfound-body">
        <div class="pub-lostfound-meta">${lostFoundTypeBadge(report.reportType)}<span>${report.eventDate || 'No date'}</span></div>
        <h3>${report.itemName}</h3>
        <p>${report.description}</p>
        <div class="pub-lostfound-detail"><strong>Type:</strong> ${report.itemType}</div>
        <div class="pub-lostfound-detail"><strong>Location:</strong> ${report.location}</div>
        <div class="pub-lostfound-contact">${report.contactName} · ${report.contactNumber}</div>
      </div>
    </article>`).join('');
}

function openLostFoundReportModal(reportType) {
  const today = getLocalDateValue();
  const actionLabel = reportType === 'Found' ? 'Report Found Item' : 'Report Lost Item';
  openModal(actionLabel, `
    <div class="lostfound-form-note">
      Reports are reviewed by HOA staff before appearing on the public Lost and Found board.
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Item Type *</label>
        <input id="lf_itemType" placeholder="e.g. Wallet, Phone, Keys">
      </div>
      <div class="form-group">
        <label>Item Name *</label>
        <input id="lf_itemName" placeholder="Short item name">
      </div>
    </div>
    <div class="form-group">
      <label>Description *</label>
      <textarea id="lf_description" placeholder="Describe the item, color, marks, or other details..."></textarea>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Location *</label>
        <input id="lf_location" placeholder="Where it was lost or found">
      </div>
      <div class="form-group">
        <label>Date ${reportType === 'Found' ? 'Found' : 'Lost'} *</label>
        <input id="lf_eventDate" type="date" max="${today}" value="${today}">
      </div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Contact Name *</label>
        <input id="lf_contactName" placeholder="Person to contact">
      </div>
      <div class="form-group">
        <label>Contact Number *</label>
        <input id="lf_contactNumber" placeholder="Mobile or phone number">
      </div>
    </div>
    <div class="form-group">
      <label>Optional Image</label>
      <input id="lf_image" type="file" accept="image/*">
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Submit Report', cls: 'btn-primary', action: () => submitLostFoundReport(reportType) },
  ]);
}

function readImageInput(input) {
  return new Promise((resolve, reject) => {
    const file = input?.files?.[0];
    if (!file) {
      resolve('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please upload an image file.'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error('Image must be 2MB or smaller.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

async function submitLostFoundReport(reportType) {
  const itemType = document.getElementById('lf_itemType').value.trim();
  const itemName = document.getElementById('lf_itemName').value.trim();
  const description = document.getElementById('lf_description').value.trim();
  const location = document.getElementById('lf_location').value.trim();
  const eventDate = document.getElementById('lf_eventDate').value;
  const contactName = document.getElementById('lf_contactName').value.trim();
  const contactNumber = document.getElementById('lf_contactNumber').value.trim();

  if (!itemType || !itemName || !description || !location || !eventDate || !contactName || !contactNumber) {
    showToast('error', 'Missing Fields', 'Please complete all required lost and found fields.');
    return;
  }

  try {
    const today = getLocalDateValue();
    const image = await readImageInput(document.getElementById('lf_image'));
    const report = {
      id: db.newId('lf'),
      reportType,
      itemType,
      itemName,
      description,
      location,
      eventDate,
      contactName,
      contactNumber,
      image,
      status: 'Pending',
      remarks: '',
      createdAt: today,
      updatedAt: today,
      claimedAt: '',
    };
    db.save('lostFound', report);
    addNotification('Lost and Found Report', `${contactName} submitted a ${reportType.toLowerCase()} item: ${itemName}.`, { roles: ['admin', 'security'] });
    closeModal();
    showToast('success', 'Report Submitted', 'Your report is pending HOA review.');
  } catch (error) {
    showToast('error', 'Image Error', error.message || 'Could not submit the report.');
  }
}

function renderLostFoundManagement(filtered = null) {
  const source = filtered || db.get('lostFound');
  const reports = [...source].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const allReports = db.get('lostFound');
  const pending = allReports.filter(report => report.status === 'Pending').length;
  const approved = allReports.filter(report => ['Approved', 'Posted'].includes(report.status)).length;
  const claimed = allReports.filter(report => report.status === 'Claimed').length;
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Lost and Found</h2><p>Review, publish, and manage community lost and found reports.</p></div>
  </div>
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-clock"/></svg></div><div class="stat-info"><span class="stat-value">${pending}</span><span class="stat-label">Pending</span></div></div>
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-check"/></svg></div><div class="stat-info"><span class="stat-value">${approved}</span><span class="stat-label">Posted</span></div></div>
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-search"/></svg></div><div class="stat-info"><span class="stat-value">${claimed}</span><span class="stat-label">Claimed</span></div></div>
  </div>
  <div class="section-card">
    <div class="section-card-header">
      <div class="filters-row">
        <div class="search-box"><span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span><input id="lostFoundSearch" type="text" placeholder="Search item, location, contact..."/></div>
        <select class="filter-select" id="lostFoundStatusFilter" onchange="filterLostFoundReports()">
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          <option value="Claimed">Claimed</option>
        </select>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Item</th><th>Details</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${reports.map(report => `
            <tr>
              <td><strong>${report.itemName}</strong><br>${lostFoundTypeBadge(report.reportType)} <span style="font-size:0.78rem;color:var(--text-3)">${report.itemType}</span></td>
              <td>${report.location}<br><span style="font-size:0.78rem;color:var(--text-3)">${report.eventDate || ''}</span></td>
              <td>${report.contactName}<br><span style="font-size:0.78rem;color:var(--text-3)">${report.contactNumber}</span></td>
              <td>${lostFoundStatusBadge(report.status)}</td>
              <td><div class="td-actions">
                <button class="btn btn-secondary btn-sm" onclick="openLostFoundAdminModal('${report.id}')">Manage</button>
                <button class="btn btn-danger btn-sm" onclick="confirmDeleteLostFound('${report.id}')">Delete</button>
              </div></td>
            </tr>`).join('') || '<tr><td colspan="5"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-search"/></svg>No lost and found reports.</div></td></tr>'}
        </tbody>
      </table></div>
    </div>
  </div>`;

  const search = document.getElementById('lostFoundSearch');
  if (search) search.addEventListener('input', filterLostFoundReports);
}

function filterLostFoundReports() {
  const query = (document.getElementById('lostFoundSearch')?.value || '').trim().toLowerCase();
  const status = document.getElementById('lostFoundStatusFilter')?.value || '';
  const filtered = db.get('lostFound').filter(report => {
    const haystack = [
      report.reportType,
      report.itemType,
      report.itemName,
      report.description,
      report.location,
      report.contactName,
      report.contactNumber,
      report.status,
    ].join(' ').toLowerCase();
    return (!query || haystack.includes(query)) && (!status || report.status === status);
  });
  renderLostFoundManagement(filtered);
  const search = document.getElementById('lostFoundSearch');
  const statusEl = document.getElementById('lostFoundStatusFilter');
  if (search) search.value = query;
  if (statusEl) statusEl.value = status;
}

function openLostFoundAdminModal(id) {
  const report = db.getOne('lostFound', id);
  if (!report) return;
  openModal('Manage Lost and Found Report', `
    ${report.image ? `<img src="${report.image}" alt="${report.itemName}" class="lostfound-admin-image">` : ''}
    <div class="grid-2">
      <div class="form-group">
        <label>Report Type</label>
        <select id="lf_admin_reportType">
          <option value="Lost" ${report.reportType === 'Lost' ? 'selected' : ''}>Lost</option>
          <option value="Found" ${report.reportType === 'Found' ? 'selected' : ''}>Found</option>
        </select>
      </div>
      <div class="form-group"><label>Item Type</label><input id="lf_admin_itemType" value="${report.itemType || ''}"></div>
    </div>
    <div class="form-group"><label>Item Name</label><input id="lf_admin_itemName" value="${report.itemName || ''}"></div>
    <div class="form-group"><label>Description</label><textarea id="lf_admin_description">${report.description || ''}</textarea></div>
    <div class="grid-2">
      <div class="form-group"><label>Location</label><input id="lf_admin_location" value="${report.location || ''}"></div>
      <div class="form-group"><label>Date Lost/Found</label><input id="lf_admin_eventDate" type="date" value="${report.eventDate || ''}"></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>Contact Name</label><input id="lf_admin_contactName" value="${report.contactName || ''}"></div>
      <div class="form-group"><label>Contact Number</label><input id="lf_admin_contactNumber" value="${report.contactNumber || ''}"></div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Status</label>
        <select id="lf_admin_status">
          ${['Pending', 'Approved', 'Rejected', 'Claimed'].map(status => `<option value="${status}" ${report.status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Remarks</label><input id="lf_admin_remarks" value="${report.remarks || ''}" placeholder="Optional admin remarks"></div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Save Changes', cls: 'btn-primary', action: () => saveLostFoundAdminChanges(id) },
  ]);
}

function saveLostFoundAdminChanges(id) {
  const report = db.getOne('lostFound', id);
  if (!report) return;
  const required = ['lf_admin_itemType', 'lf_admin_itemName', 'lf_admin_description', 'lf_admin_location', 'lf_admin_eventDate', 'lf_admin_contactName', 'lf_admin_contactNumber'];
  if (required.some(id => !document.getElementById(id).value.trim())) {
    showToast('error', 'Missing Fields', 'Please complete all report details before saving.');
    return;
  }

  const today = getLocalDateValue();
  const newStatus = document.getElementById('lf_admin_status').value;
  report.reportType = document.getElementById('lf_admin_reportType').value;
  report.itemType = document.getElementById('lf_admin_itemType').value.trim();
  report.itemName = document.getElementById('lf_admin_itemName').value.trim();
  report.description = document.getElementById('lf_admin_description').value.trim();
  report.location = document.getElementById('lf_admin_location').value.trim();
  report.eventDate = document.getElementById('lf_admin_eventDate').value;
  report.contactName = document.getElementById('lf_admin_contactName').value.trim();
  report.contactNumber = document.getElementById('lf_admin_contactNumber').value.trim();
  report.status = newStatus;
  report.remarks = document.getElementById('lf_admin_remarks').value.trim();
  report.updatedAt = today;
  report.claimedAt = newStatus === 'Claimed' ? (report.claimedAt || today) : '';
  db.save('lostFound', report);
  logAction(`Updated lost and found report: ${report.itemName} (${report.status})`);
  closeModal();
  showToast('success', 'Report Saved', 'Lost and found report has been updated.');
  renderLostFoundManagement();
  renderPublicLostFound();
}

function confirmDeleteLostFound(id) {
  const report = db.getOne('lostFound', id);
  if (!report) return;
  openModal('Delete Lost and Found Report', `<p>Delete "<strong>${report.itemName}</strong>"? This cannot be undone.</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Delete', cls: 'btn-danger', action: () => {
      db.delete('lostFound', id);
      logAction(`Deleted lost and found report: ${report.itemName}`);
      closeModal();
      showToast('success', 'Deleted', 'Lost and found report removed.');
      renderLostFoundManagement();
      renderPublicLostFound();
    } },
  ]);
}
