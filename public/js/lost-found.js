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

const ALLOWED_LF_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_LF_VIDEO_EXTS = ['.mp4', '.mov', '.webm'];
const MAX_LF_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_LF_VIDEO_SIZE = 30 * 1024 * 1024;

let pendingLostFoundMediaFiles = [];

function isLostFoundMediaVideo(url) {
  if (!url) return false;
  const clean = String(url).split('?')[0].toLowerCase();
  return clean.endsWith('.mp4') || clean.endsWith('.mov') || clean.endsWith('.webm');
}

function isLostFoundFileImage(file) {
  const name = (file?.name || '').toLowerCase();
  const mime = (file?.type || '').toLowerCase();
  return ALLOWED_LF_IMAGE_EXTS.some(ext => name.endsWith(ext)) || mime.startsWith('image/');
}

function isLostFoundFileVideo(file) {
  const name = (file?.name || '').toLowerCase();
  const mime = (file?.type || '').toLowerCase();
  return ALLOWED_LF_VIDEO_EXTS.some(ext => name.endsWith(ext)) || mime.startsWith('video/');
}

function handleLostFoundMediaSelect(input) {
  const files = Array.from(input?.files || []);
  handleLostFoundMediaFiles(files);
  if (input) input.value = '';
}

function handleLostFoundMediaFiles(selectedFiles) {
  const errorEl = document.getElementById('lf_media_error');
  if (errorEl) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
    errorEl.innerHTML = '';
  }

  if (!selectedFiles.length) return;

  const errors = [];

  for (const file of selectedFiles) {
    const fileName = file.name || '';
    const lastDot = fileName.lastIndexOf('.');
    const ext = lastDot !== -1 ? fileName.substring(lastDot).toLowerCase() : '';
    const mime = (file.type || '').toLowerCase();

    const isImage = ALLOWED_LF_IMAGE_EXTS.includes(ext) || mime.startsWith('image/');
    const isVideo = ALLOWED_LF_VIDEO_EXTS.includes(ext) || mime.startsWith('video/');

    if (!isImage && !isVideo) {
      errors.push(`"${fileName}": Unsupported format. Please upload JPG, PNG, WEBP (Images) or MP4, MOV, WEBM (Videos).`);
      continue;
    }

    if (isImage && file.size > MAX_LF_IMAGE_SIZE) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      errors.push(`Image "${fileName}" (${sizeMb} MB) exceeds the 5 MB limit.`);
      continue;
    }

    if (isVideo && file.size > MAX_LF_VIDEO_SIZE) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      errors.push(`Video "${fileName}" (${sizeMb} MB) exceeds the 30 MB limit.`);
      continue;
    }

    const isDuplicate = pendingLostFoundMediaFiles.some(existing =>
      existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified
    );
    if (!isDuplicate) {
      pendingLostFoundMediaFiles.push(file);
    }
  }

  if (errors.length > 0) {
    if (errorEl) {
      errorEl.innerHTML = errors.map(err => typeof escapeHtml === 'function' ? escapeHtml(err) : err).join('<br>');
      errorEl.style.display = 'block';
    }
    showToast('error', 'File Upload Notice', errors[0]);
  }

  renderLostFoundMediaPreviews();
}

function renderLostFoundMediaPreviews() {
  const container = document.getElementById('lf_media_preview_container');
  const dropzone = document.getElementById('lf_media_dropzone');
  const list = document.getElementById('lf_media_preview_list');
  const countBadge = document.getElementById('lf_media_count_badge');
  const countSummary = document.getElementById('lf_media_count_summary');

  if (!container || !list) return;

  if (!pendingLostFoundMediaFiles.length) {
    container.style.display = 'none';
    if (dropzone) dropzone.style.display = 'flex';
    if (countBadge) countBadge.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  if (dropzone) dropzone.style.display = 'none';
  container.style.display = 'block';

  const imgCount = pendingLostFoundMediaFiles.filter(f => isLostFoundFileImage(f)).length;
  const vidCount = pendingLostFoundMediaFiles.filter(f => isLostFoundFileVideo(f)).length;
  const summaryParts = [];
  if (imgCount) summaryParts.push(`${imgCount} photo${imgCount > 1 ? 's' : ''}`);
  if (vidCount) summaryParts.push(`${vidCount} video${vidCount > 1 ? 's' : ''}`);
  const summaryText = `${pendingLostFoundMediaFiles.length} file${pendingLostFoundMediaFiles.length > 1 ? 's' : ''} attached (${summaryParts.join(', ') || 'media'})`;

  if (countBadge) {
    countBadge.textContent = `${pendingLostFoundMediaFiles.length} file${pendingLostFoundMediaFiles.length > 1 ? 's' : ''}`;
    countBadge.style.display = 'inline-block';
  }
  if (countSummary) {
    countSummary.textContent = summaryText;
  }

  list.innerHTML = pendingLostFoundMediaFiles.map((file, idx) => {
    const isImage = isLostFoundFileImage(file);
    const objectUrl = URL.createObjectURL(file);
    const formattedSize = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${(file.size / 1024).toFixed(0)} KB`;
    const safeName = typeof escapeHtml === 'function' ? escapeHtml(file.name) : file.name;

    return `
      <div class="lostfound-media-card" data-idx="${idx}">
        <button type="button" class="lostfound-media-remove-btn" onclick="removeLostFoundMediaFile(${idx})" title="Remove file">&times;</button>
        <div class="lostfound-media-thumb-wrapper">
          ${isImage
            ? `<img src="${objectUrl}" class="lostfound-media-thumb" alt="${safeName}" />`
            : `<video src="${objectUrl}" class="lostfound-media-thumb" preload="metadata"></video>
               <div class="lostfound-media-play-icon">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
               </div>`
          }
        </div>
        <div class="lostfound-media-card-info">
          <div class="lostfound-media-card-name" title="${safeName}">${safeName}</div>
          <div class="lostfound-media-card-size">${isImage ? 'Photo' : 'Video'} · ${formattedSize}</div>
        </div>
      </div>
    `;
  }).join('');
}

function removeLostFoundMediaFile(index) {
  if (index >= 0 && index < pendingLostFoundMediaFiles.length) {
    pendingLostFoundMediaFiles.splice(index, 1);
    renderLostFoundMediaPreviews();
  }
}

function renderPublicLostFound() {
  const grid = document.getElementById('pubLostFoundGrid');
  if (!grid) return;
  const posts = getApprovedLostFoundPosts().slice(0, 6);
  if (!posts.length) {
    grid.innerHTML = `<div class="no-results" style="grid-column:1/-1"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-search"/></svg>No approved lost and found posts yet.</div>`;
    return;
  }

  grid.innerHTML = posts.map(report => {
    const isVideo = isLostFoundMediaVideo(report.image || '') || report.media_type === 'video';
    const safeName = typeof escapeHtml === 'function' ? escapeHtml(report.itemName || '') : (report.itemName || '');
    const mediaHTML = report.image ? `
      <div class="pub-lostfound-image">
        ${isVideo
          ? `<video src="${report.image}" controls preload="metadata" class="pub-lostfound-video"></video>`
          : `<img src="${report.image}" alt="${safeName}" style="cursor:pointer;" onclick="if(typeof openPhotoViewerModal==='function') openPhotoViewerModal('${report.image}', '${safeName.replace(/'/g, "\\'")}')">`
        }
      </div>
    ` : '';

    return `
    <article class="pub-lostfound-card">
      ${mediaHTML}
      <div class="pub-lostfound-body">
        <div class="pub-lostfound-meta">${lostFoundTypeBadge(report.reportType)}<span>${report.eventDate || 'No date'}</span></div>
        <h3>${safeName}</h3>
        <p>${typeof escapeHtml === 'function' ? escapeHtml(report.description || '') : (report.description || '')}</p>
        <div class="pub-lostfound-detail"><strong>Type:</strong> ${typeof escapeHtml === 'function' ? escapeHtml(report.itemType || '') : (report.itemType || '')}</div>
        <div class="pub-lostfound-detail"><strong>Location:</strong> ${typeof escapeHtml === 'function' ? escapeHtml(report.location || '') : (report.location || '')}</div>
        <div class="pub-lostfound-contact">${typeof escapeHtml === 'function' ? escapeHtml(report.contactName || '') : (report.contactName || '')} · ${typeof escapeHtml === 'function' ? escapeHtml(report.contactNumber || '') : (report.contactNumber || '')}</div>
      </div>
    </article>`;
  }).join('');
}

function openLostFoundReportModal(reportType) {
  const today = getLocalDateValue();
  const actionLabel = reportType === 'Found' ? 'Report Found Item' : 'Report Lost Item';
  pendingLostFoundMediaFiles = [];

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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <label style="margin-bottom:0;">Photos or Videos <span style="color:var(--text-3);font-weight:400">(Optional)</span></label>
        <span id="lf_media_count_badge" class="badge badge-gray" style="display:none;font-size:0.75rem;padding:2px 8px;">0 items</span>
      </div>

      <input type="file" id="lf_media_input" multiple accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" style="display:none" onchange="handleLostFoundMediaSelect(this)" />
      
      <div id="lf_media_dropzone" class="lostfound-media-dropzone" onclick="document.getElementById('lf_media_input').click()">
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;color:var(--teal-600);font-weight:600;font-size:0.88rem">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          <span id="lf_media_dropzone_label">Attach Photos or Video</span>
        </div>
        <div style="font-size:0.75rem;color:var(--text-3);margin-top:2px">
          Images: JPG, JPEG, PNG, WEBP (max 5 MB each) · Videos: MP4, MOV, WEBM (max 30 MB each)
        </div>
      </div>

      <div id="lf_media_error" style="display:none;color:var(--red-600);font-size:0.8rem;margin-top:6px;font-weight:500;line-height:1.4"></div>

      <div id="lf_media_preview_container" style="display:none;margin-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span id="lf_media_count_summary" style="font-size:0.78rem;font-weight:600;color:var(--text-2)"></span>
          <button type="button" class="lostfound-media-add-more-btn" onclick="document.getElementById('lf_media_input').click()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add More
          </button>
        </div>
        <div id="lf_media_preview_list" class="lostfound-media-preview-grid"></div>
      </div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Submit Report', cls: 'btn-primary', action: () => submitLostFoundReport(reportType) },
  ]);

  setTimeout(() => {
    const dz = document.getElementById('lf_media_dropzone');
    if (dz) {
      ['dragenter', 'dragover'].forEach(name => {
        dz.addEventListener(name, (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.add('drag-over'); });
      });
      ['dragleave', 'drop'].forEach(name => {
        dz.addEventListener(name, (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag-over'); });
      });
      dz.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt ? Array.from(dt.files) : [];
        if (files.length) {
          handleLostFoundMediaFiles(files);
        }
      });
    }
  }, 50);
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
    <div class="page-header-actions" style="display:flex;gap:8px;">
      <button class="btn btn-primary" onclick="openLostFoundReportModal('Lost')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Report Lost Item
      </button>
      <button class="btn btn-secondary" onclick="openLostFoundReportModal('Found')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Report Found Item
      </button>
    </div>
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
              <td>
                <strong>${typeof escapeHtml === 'function' ? escapeHtml(report.itemName) : report.itemName}</strong>
                ${report.image ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.72rem;color:var(--teal-600);margin-left:4px;" title="Media attached">${isLostFoundMediaVideo(report.image) ? '🎥 Video' : '📷 Photo'}</span>` : ''}
                <br>${lostFoundTypeBadge(report.reportType)} <span style="font-size:0.78rem;color:var(--text-3)">${typeof escapeHtml === 'function' ? escapeHtml(report.itemType) : report.itemType}</span>
              </td>
              <td>${typeof escapeHtml === 'function' ? escapeHtml(report.location) : report.location}<br><span style="font-size:0.78rem;color:var(--text-3)">${report.eventDate || ''}</span></td>
              <td>${typeof escapeHtml === 'function' ? escapeHtml(report.contactName) : report.contactName}<br><span style="font-size:0.78rem;color:var(--text-3)">${typeof escapeHtml === 'function' ? escapeHtml(report.contactNumber) : report.contactNumber}</span></td>
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
  const isVideo = isLostFoundMediaVideo(report.image || '') || report.media_type === 'video';
  const safeName = typeof escapeHtml === 'function' ? escapeHtml(report.itemName || '') : (report.itemName || '');
  openModal('Manage Lost and Found Report', `
    ${report.image ? (
      isVideo
        ? `<video src="${report.image}" controls class="lostfound-admin-image" style="background:#000;max-height:260px;"></video>`
        : `<img src="${report.image}" alt="${safeName}" class="lostfound-admin-image" style="cursor:pointer;" onclick="if(typeof openPhotoViewerModal==='function') openPhotoViewerModal('${report.image}', '${safeName.replace(/'/g, "\\'")}')">`
    ) : ''}
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
