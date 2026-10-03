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
  const today = typeof getLocalDateValue === 'function' ? getLocalDateValue() : new Date().toISOString().slice(0, 10);
  const selectedType = reportType === 'Found' ? 'Found' : 'Lost';
  const actionLabel = selectedType === 'Found' ? 'Report Found Item' : 'Report Lost Item';
  pendingLostFoundMediaFiles = [];

  const defaultName = (typeof currentUser !== 'undefined' && currentUser?.name) ? escapeHtml(currentUser.name) : '';
  const defaultPhone = (typeof currentUser !== 'undefined' && currentUser?.contact) ? escapeHtml(currentUser.contact) : '';

  openModal(actionLabel, `
    <div class="lostfound-form-note">
      <div style="font-weight:600;margin-bottom:2px;">Notice on Review & Approval</div>
      Submitted reports are set to <strong>Pending</strong> and must be reviewed and approved by HOA management before appearing to other residents on the community board.
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Report Type *</label>
        <select id="lf_reportType">
          <option value="Lost" ${selectedType === 'Lost' ? 'selected' : ''}>Lost Item</option>
          <option value="Found" ${selectedType === 'Found' ? 'selected' : ''}>Found Item</option>
        </select>
      </div>
      <div class="form-group">
        <label>Item Type / Category *</label>
        <input id="lf_itemType" placeholder="e.g. Wallet, Phone, Keys, Bag, Pet, Documents">
      </div>
    </div>
    <div class="form-group">
      <label>Item Name *</label>
      <input id="lf_itemName" placeholder="Short descriptive name (e.g. Brown Leather Wallet)">
    </div>
    <div class="form-group">
      <label>Description *</label>
      <textarea id="lf_description" placeholder="Describe the item, color, brand, distinguishing marks, or contents..."></textarea>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Location *</label>
        <input id="lf_location" placeholder="Where it was lost or found (e.g. Clubhouse, Park, Block 3)">
      </div>
      <div class="form-group">
        <label>Date Lost / Found *</label>
        <input id="lf_eventDate" type="date" max="${today}" value="${today}">
      </div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Contact Name *</label>
        <input id="lf_contactName" value="${defaultName}" placeholder="Person to contact">
      </div>
      <div class="form-group">
        <label>Contact Number *</label>
        <input id="lf_contactNumber" value="${defaultPhone}" placeholder="Mobile or phone number">
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
          Images: JPG, PNG, WEBP (max 5 MB) · Videos: MP4, MOV, WEBM (max 30 MB)
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
    { label: 'Submit Report', cls: 'btn-primary', action: () => submitLostFoundReport() },
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

async function submitLostFoundReport() {
  const reportType = document.getElementById('lf_reportType')?.value || 'Lost';
  const itemType = (document.getElementById('lf_itemType')?.value || '').trim();
  const itemName = (document.getElementById('lf_itemName')?.value || '').trim();
  const description = (document.getElementById('lf_description')?.value || '').trim();
  const location = (document.getElementById('lf_location')?.value || '').trim();
  const eventDate = (document.getElementById('lf_eventDate')?.value || '').trim();
  const contactName = (document.getElementById('lf_contactName')?.value || '').trim();
  const contactNumber = (document.getElementById('lf_contactNumber')?.value || '').trim();

  if (!itemType || !itemName || !description || !location || !eventDate || !contactName || !contactNumber) {
    showToast('error', 'Missing Information', 'Please complete all required fields (*).');
    return;
  }

  showLoading();

  let uploadedImageUrl = '';
  let uploadedFiles = [];
  let overallMediaType = 'image';

  try {
    if (pendingLostFoundMediaFiles && pendingLostFoundMediaFiles.length > 0) {
      const formData = new FormData();
      for (const file of pendingLostFoundMediaFiles) {
        formData.append('media', file);
      }
      const uploadRes = await fetch('/api/lostfound/upload', {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({ error: 'Media upload failed.' }));
        throw new Error(err.error || 'Failed to upload attached photos/videos.');
      }
      const uploadData = await uploadRes.json();
      uploadedImageUrl = uploadData.image || uploadData.media_url || uploadData.url || '';
      uploadedFiles = uploadData.files || [];
      overallMediaType = uploadData.media_type || (isLostFoundMediaVideo(uploadedImageUrl) ? 'video' : 'image');
    }

    const nowIso = new Date().toISOString();
    const homeownerId = (typeof currentUser !== 'undefined' && currentUser) ? getCurrentHomeownerId() : null;

    const newReport = {
      id: 'lf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      homeownerId: homeownerId,
      reportType,
      itemType,
      itemName,
      description,
      location,
      eventDate,
      contactName,
      contactNumber,
      image: uploadedImageUrl,
      images: uploadedFiles,
      media_type: overallMediaType,
      status: 'Pending',
      remarks: '',
      createdAt: nowIso,
      updatedAt: nowIso,
      claimedAt: '',
    };

    await db.save('lostFound', newReport);

    if (typeof logAction === 'function') {
      logAction(`Submitted lost and found report: ${itemName} (${reportType}) - Status: Pending`);
    }

    pendingLostFoundMediaFiles = [];
    closeModal();
    hideLoading();

    showToast(
      'success',
      'Report Submitted',
      'Your report has been submitted with status "Pending". It will appear to other residents once approved by an administrator.'
    );

    // Refresh whichever view is currently active
    if (document.getElementById('hoLostFoundContainer')) {
      renderHOLostFound('my-reports');
    } else if (document.getElementById('pendingLostFoundSection')) {
      renderLostFoundManagement();
    } else if (document.getElementById('pubLostFoundGrid')) {
      renderPublicLostFound();
    }
  } catch (err) {
    hideLoading();
    showToast('error', 'Submission Failed', err.message || 'Could not submit your report.');
  }
}

// ── RESIDENT SIDE: LOST & FOUND VIEW ──

let hoLostFoundActiveTab = 'community';

function renderHOLostFound(tab = null) {
  if (tab) hoLostFoundActiveTab = tab;
  const area = document.getElementById('contentArea');
  if (!area) return;

  const allReports = db.get('lostFound') || [];
  const currentUserId = (typeof currentUser !== 'undefined' && currentUser) ? getCurrentHomeownerId() : null;
  const myReports = allReports
    .filter(r => currentUserId && r.homeownerId === currentUserId)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const myPending = myReports.filter(r => r.status === 'Pending').length;
  const myApproved = myReports.filter(r => ['Approved', 'Posted'].includes(r.status)).length;
  const myRejected = myReports.filter(r => r.status === 'Rejected').length;
  const communityPosts = getApprovedLostFoundPosts();

  area.innerHTML = `
    <div id="hoLostFoundContainer">
      <div class="page-header">
        <div class="page-header-left">
          <h2>Lost &amp; Found</h2>
          <p>Browse approved community listings or submit a report for a lost or found item.</p>
        </div>
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
        <div class="stat-card" style="--card-accent:#16a34a;--card-accent-bg:#dcfce7">
          <div class="stat-icon"><svg width="22" height="22"><use href="#ico-check"/></svg></div>
          <div class="stat-info"><span class="stat-value">${communityPosts.length}</span><span class="stat-label">Community Items</span></div>
        </div>
        <div class="stat-card" style="--card-accent:#2271c3;--card-accent-bg:#eef5fd">
          <div class="stat-icon"><svg width="22" height="22"><use href="#ico-search"/></svg></div>
          <div class="stat-info"><span class="stat-value">${myReports.length}</span><span class="stat-label">My Submissions</span></div>
        </div>
        <div class="stat-card" style="--card-accent:#d97706;--card-accent-bg:#fef3c7">
          <div class="stat-icon"><svg width="22" height="22"><use href="#ico-clock"/></svg></div>
          <div class="stat-info">
            <span class="stat-value">${myPending}</span>
            <span class="stat-label">My Pending Reports</span>
          </div>
        </div>
        <div class="stat-card" style="--card-accent:#16a34a;--card-accent-bg:#dcfce7">
          <div class="stat-icon"><svg width="22" height="22"><use href="#ico-check"/></svg></div>
          <div class="stat-info"><span class="stat-value">${myApproved}</span><span class="stat-label">My Approved</span></div>
        </div>
      </div>

      <div class="lf-nav-tabs">
        <button class="lf-nav-tab ${hoLostFoundActiveTab === 'community' ? 'active' : ''}" onclick="switchHOLostFoundTab('community')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          Community Board
          <span class="badge badge-gray">${communityPosts.length}</span>
        </button>
        <button class="lf-nav-tab ${hoLostFoundActiveTab === 'my-reports' ? 'active' : ''}" onclick="switchHOLostFoundTab('my-reports')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          My Submitted Reports
          <span class="badge ${myPending > 0 ? 'badge-yellow' : 'badge-gray'}">${myReports.length}</span>
        </button>
      </div>

      <div id="hoLostFoundTabContent"></div>
    </div>
  `;

  renderHOLostFoundTabContent();
}

function switchHOLostFoundTab(tab) {
  hoLostFoundActiveTab = tab;
  document.querySelectorAll('.lf-nav-tab').forEach((el, idx) => {
    el.classList.toggle('active', (idx === 0 && tab === 'community') || (idx === 1 && tab === 'my-reports'));
  });
  renderHOLostFoundTabContent();
}

function renderHOLostFoundTabContent() {
  const container = document.getElementById('hoLostFoundTabContent');
  if (!container) return;

  if (hoLostFoundActiveTab === 'community') {
    renderHOCommunityBoard(container);
  } else {
    renderHOMyReports(container);
  }
}

function renderHOCommunityBoard(container) {
  const posts = getApprovedLostFoundPosts();
  container.innerHTML = `
    <div class="section-card">
      <div class="section-card-header">
        <div class="filters-row" style="width:100%;">
          <div class="search-box">
            <span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span>
            <input id="hoLfSearch" type="text" placeholder="Search approved items, locations, details..." oninput="filterHOCommunityPosts()"/>
          </div>
          <select class="filter-select" id="hoLfTypeFilter" onchange="filterHOCommunityPosts()">
            <option value="">All Types (Lost &amp; Found)</option>
            <option value="Lost">Lost Items Only</option>
            <option value="Found">Found Items Only</option>
          </select>
        </div>
      </div>
      <div class="section-card-body">
        <div id="hoLfGrid" class="pub-lostfound-grid" style="margin-top:0;"></div>
      </div>
    </div>
  `;
  renderHOCommunityCards(posts);
}

function filterHOCommunityPosts() {
  const query = (document.getElementById('hoLfSearch')?.value || '').trim().toLowerCase();
  const typeFilter = document.getElementById('hoLfTypeFilter')?.value || '';
  const posts = getApprovedLostFoundPosts().filter(report => {
    const haystack = [
      report.reportType,
      report.itemType,
      report.itemName,
      report.description,
      report.location,
      report.contactName,
      report.contactNumber,
    ].join(' ').toLowerCase();
    const matchQuery = !query || haystack.includes(query);
    const matchType = !typeFilter || report.reportType === typeFilter;
    return matchQuery && matchType;
  });
  renderHOCommunityCards(posts);
}

function renderHOCommunityCards(posts) {
  const grid = document.getElementById('hoLfGrid');
  if (!grid) return;

  if (!posts.length) {
    grid.innerHTML = `
      <div class="no-results" style="grid-column:1/-1;padding:36px 16px;">
        <svg style="width:2.2rem;height:2.2rem;color:var(--text-3);margin-bottom:8px;"><use href="#ico-search"/></svg>
        <br><strong>No approved lost and found posts match your filter.</strong>
      </div>
    `;
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
          <div class="pub-lostfound-meta">
            ${lostFoundTypeBadge(report.reportType)}
            <span>${report.eventDate || 'No date'}</span>
          </div>
          <h3>${safeName}</h3>
          <p>${typeof escapeHtml === 'function' ? escapeHtml(report.description || '') : (report.description || '')}</p>
          <div class="pub-lostfound-detail"><strong>Category:</strong> ${typeof escapeHtml === 'function' ? escapeHtml(report.itemType || '') : (report.itemType || '')}</div>
          <div class="pub-lostfound-detail"><strong>Location:</strong> ${typeof escapeHtml === 'function' ? escapeHtml(report.location || '') : (report.location || '')}</div>
          <div class="pub-lostfound-contact">
            <strong>Contact:</strong> ${typeof escapeHtml === 'function' ? escapeHtml(report.contactName || '') : (report.contactName || '')} · ${typeof escapeHtml === 'function' ? escapeHtml(report.contactNumber || '') : (report.contactNumber || '')}
          </div>
          <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="openLostFoundDetailModal('${report.id}')">
              View Full Details
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderHOMyReports(container) {
  const allReports = db.get('lostFound') || [];
  const currentUserId = (typeof currentUser !== 'undefined' && currentUser) ? getCurrentHomeownerId() : null;
  const myReports = allReports
    .filter(r => currentUserId && r.homeownerId === currentUserId)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  if (!myReports.length) {
    container.innerHTML = `
      <div class="section-card">
        <div class="section-card-body" style="padding:48px 20px;text-align:center;">
          <svg style="width:3rem;height:3rem;color:var(--text-3);margin-bottom:12px;"><use href="#ico-search"/></svg>
          <h3 style="margin-bottom:6px;">No Submitted Reports Yet</h3>
          <p style="color:var(--text-2);max-width:440px;margin:0 auto 18px;font-size:0.9rem;">
            You have not submitted any Lost &amp; Found reports. If you've lost an item or found someone's belonging, let the community know.
          </p>
          <div style="display:flex;gap:10px;justify-content:center;">
            <button class="btn btn-primary" onclick="openLostFoundReportModal('Lost')">Report Lost Item</button>
            <button class="btn btn-secondary" onclick="openLostFoundReportModal('Found')">Report Found Item</button>
          </div>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="section-card">
      <div class="section-card-header">
        <div>
          <h3>My Submitted Reports</h3>
          <p>Track the approval status of items you reported. Approved reports appear on the community board.</p>
        </div>
      </div>
      <div class="section-card-body no-pad">
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Item &amp; Type</th>
                <th>Location &amp; Date</th>
                <th>Status</th>
                <th>Remarks / Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${myReports.map(report => {
                const safeName = typeof escapeHtml === 'function' ? escapeHtml(report.itemName || '') : (report.itemName || '');
                const safeDesc = typeof escapeHtml === 'function' ? escapeHtml(report.description || '') : (report.description || '');
                const safeRemarks = typeof escapeHtml === 'function' ? escapeHtml(report.remarks || '') : (report.remarks || '');
                const isVideo = isLostFoundMediaVideo(report.image || '') || report.media_type === 'video';

                let statusHelp = '';
                if (report.status === 'Pending') {
                  statusHelp = '<div class="lf-status-desc"><span class="lf-badge-pulse"></span>Under review by HOA admin. Not yet visible to others.</div>';
                } else if (report.status === 'Approved' || report.status === 'Posted') {
                  statusHelp = '<div class="lf-status-desc" style="color:var(--green-700)">Approved &amp; visible on community board.</div>';
                } else if (report.status === 'Rejected') {
                  statusHelp = '<div class="lf-status-desc" style="color:var(--red-600)">Rejected. Not published publicly.</div>';
                } else if (report.status === 'Claimed') {
                  statusHelp = '<div class="lf-status-desc">Marked as claimed/resolved.</div>';
                }

                return `
                  <tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:10px;">
                        ${report.image ? `
                          ${isVideo
                            ? `<div class="lf-thumb-sm" style="display:flex;align-items:center;justify-content:center;background:#0f172a;color:#fff;"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`
                            : `<img src="${report.image}" class="lf-thumb-sm" alt="${safeName}" onclick="if(typeof openPhotoViewerModal==='function') openPhotoViewerModal('${report.image}', '${safeName.replace(/'/g, "\\'")}')" style="cursor:pointer;" />`
                          }
                        ` : ''}
                        <div>
                          <strong>${safeName}</strong>
                          <br>${lostFoundTypeBadge(report.reportType)}
                          <span style="font-size:0.78rem;color:var(--text-3);margin-left:4px;">${typeof escapeHtml === 'function' ? escapeHtml(report.itemType || '') : (report.itemType || '')}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      ${typeof escapeHtml === 'function' ? escapeHtml(report.location || '') : (report.location || '')}
                      <br><span style="font-size:0.78rem;color:var(--text-3);">${report.eventDate || ''}</span>
                    </td>
                    <td>
                      ${lostFoundStatusBadge(report.status)}
                      ${statusHelp}
                    </td>
                    <td style="max-width:240px;">
                      ${report.status === 'Rejected' && safeRemarks ? `
                        <div class="lf-rejection-box">
                          <strong>Admin Feedback:</strong><br>${safeRemarks}
                        </div>
                      ` : (safeRemarks ? `<span style="font-size:0.8rem;color:var(--text-2);">${safeRemarks}</span>` : '<span style="color:var(--text-3);font-size:0.8rem;">—</span>')}
                    </td>
                    <td>
                      <button class="btn btn-secondary btn-sm" onclick="openLostFoundDetailModal('${report.id}')">
                        View Details
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ── ITEM DETAIL MODAL (RESIDENT / ADMIN) ──

function openLostFoundDetailModal(id) {
  const report = db.getOne('lostFound', id);
  if (!report) {
    showToast('error', 'Error', 'Report not found.');
    return;
  }

  const isVideo = isLostFoundMediaVideo(report.image || '') || report.media_type === 'video';
  const safeName = typeof escapeHtml === 'function' ? escapeHtml(report.itemName || '') : (report.itemName || '');
  const safeDesc = typeof escapeHtml === 'function' ? escapeHtml(report.description || '') : (report.description || '');
  const safeRemarks = typeof escapeHtml === 'function' ? escapeHtml(report.remarks || '') : (report.remarks || '');

  let statusBanner = '';
  if (report.status === 'Pending') {
    statusBanner = `
      <div class="lf-status-banner pending">
        <strong>Status: Pending Review</strong><br>
        This report is currently being reviewed by HOA administration. It is not visible to other residents until approved.
      </div>
    `;
  } else if (report.status === 'Approved' || report.status === 'Posted') {
    statusBanner = `
      <div class="lf-status-banner approved">
        <strong>Status: Approved &amp; Published</strong><br>
        This item is approved and publicly visible on the San Alfonso Homes community board.
      </div>
    `;
  } else if (report.status === 'Rejected') {
    statusBanner = `
      <div class="lf-status-banner rejected">
        <strong>Status: Rejected</strong><br>
        This report was not approved by administration and is not posted to the community board.
        ${safeRemarks ? `<div style="margin-top:6px;font-weight:600;">Reason: ${safeRemarks}</div>` : ''}
      </div>
    `;
  }

  openModal(`Lost &amp; Found: ${safeName}`, `
    ${statusBanner}

    ${report.image ? `
      ${isVideo
        ? `<video src="${report.image}" controls class="lf-detail-modal-media" style="background:#000;"></video>`
        : `<img src="${report.image}" alt="${safeName}" class="lf-detail-modal-media" style="cursor:pointer;" onclick="if(typeof openPhotoViewerModal==='function') openPhotoViewerModal('${report.image}', '${safeName.replace(/'/g, "\\'")}')">`
      }
    ` : ''}

    <div class="grid-2" style="margin-bottom:12px;">
      <div>
        <label style="font-size:0.75rem;color:var(--text-3);text-transform:uppercase;font-weight:600;">Report Type</label>
        <div>${lostFoundTypeBadge(report.reportType)}</div>
      </div>
      <div>
        <label style="font-size:0.75rem;color:var(--text-3);text-transform:uppercase;font-weight:600;">Current Status</label>
        <div>${lostFoundStatusBadge(report.status)}</div>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:12px;">
      <div>
        <label style="font-size:0.75rem;color:var(--text-3);text-transform:uppercase;font-weight:600;">Item Category</label>
        <div style="font-weight:600;color:var(--text-1);">${typeof escapeHtml === 'function' ? escapeHtml(report.itemType || 'N/A') : (report.itemType || 'N/A')}</div>
      </div>
      <div>
        <label style="font-size:0.75rem;color:var(--text-3);text-transform:uppercase;font-weight:600;">Date Lost / Found</label>
        <div style="font-weight:600;color:var(--text-1);">${report.eventDate || 'N/A'}</div>
      </div>
    </div>

    <div class="form-group" style="margin-bottom:12px;">
      <label style="font-size:0.75rem;color:var(--text-3);text-transform:uppercase;font-weight:600;">Location</label>
      <div style="font-weight:500;color:var(--text-1);">${typeof escapeHtml === 'function' ? escapeHtml(report.location || 'N/A') : (report.location || 'N/A')}</div>
    </div>

    <div class="form-group" style="margin-bottom:14px;">
      <label style="font-size:0.75rem;color:var(--text-3);text-transform:uppercase;font-weight:600;">Item Description</label>
      <div style="background:var(--surface-2);padding:10px 12px;border-radius:var(--radius-sm);font-size:0.88rem;color:var(--text-1);line-height:1.5;white-space:pre-wrap;">${safeDesc || 'No description provided.'}</div>
    </div>

    <div class="grid-2" style="padding-top:12px;border-top:1px solid var(--border);">
      <div>
        <label style="font-size:0.75rem;color:var(--text-3);text-transform:uppercase;font-weight:600;">Contact Person</label>
        <div style="font-weight:600;color:var(--text-1);">${typeof escapeHtml === 'function' ? escapeHtml(report.contactName || 'N/A') : (report.contactName || 'N/A')}</div>
      </div>
      <div>
        <label style="font-size:0.75rem;color:var(--text-3);text-transform:uppercase;font-weight:600;">Contact Number</label>
        <div style="font-weight:600;color:var(--text-1);">${typeof escapeHtml === 'function' ? escapeHtml(report.contactNumber || 'N/A') : (report.contactNumber || 'N/A')}</div>
      </div>
    </div>
  `, [
    { label: 'Close', cls: 'btn-secondary', action: closeModal },
  ]);
}

// ── ADMIN SIDE: LOST & FOUND MANAGEMENT ──

function renderLostFoundManagement(filtered = null) {
  const allReports = db.get('lostFound') || [];
  const source = filtered || allReports;
  const reports = [...source].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const pendingReports = allReports
    .filter(report => report.status === 'Pending')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const approvedReports = allReports.filter(report => ['Approved', 'Posted'].includes(report.status));
  const claimedReports = allReports.filter(report => report.status === 'Claimed');
  const rejectedReports = allReports.filter(report => report.status === 'Rejected');

  const area = document.getElementById('contentArea');
  if (!area) return;

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <h2>Lost and Found Management</h2>
      <p>Review resident submissions, approve or reject reports, and manage public community listings.</p>
    </div>
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

  <div class="stats-grid lostfound-stats-grid">
    <div class="stat-card" style="--card-accent:#d97706;--card-accent-bg:#fef3c7">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-clock"/></svg></div>
      <div class="stat-info">
        <span class="stat-value">${pendingReports.length}</span>
        <span class="stat-label">Pending Review</span>
      </div>
    </div>
    <div class="stat-card" style="--card-accent:#16a34a;--card-accent-bg:#dcfce7">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-check"/></svg></div>
      <div class="stat-info">
        <span class="stat-value">${approvedReports.length}</span>
        <span class="stat-label">Posted / Approved</span>
      </div>
    </div>
    <div class="stat-card" style="--card-accent:#2271c3;--card-accent-bg:#eef5fd">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-search"/></svg></div>
      <div class="stat-info">
        <span class="stat-value">${claimedReports.length}</span>
        <span class="stat-label">Claimed</span>
      </div>
    </div>
    <div class="stat-card" style="--card-accent:#dc2626;--card-accent-bg:#fee2e2">
      <div class="stat-icon"><svg width="22" height="22"><use href="#ico-flag"/></svg></div>
      <div class="stat-info">
        <span class="stat-value">${rejectedReports.length}</span>
        <span class="stat-label">Rejected</span>
      </div>
    </div>
  </div>

  <!-- PENDING LOST & FOUND SECTION -->
  <div id="pendingLostFoundSection" class="section-card lf-pending-card">
    <div class="section-card-header" style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;">
          <h3 style="margin:0;">Pending Lost &amp; Found Reports</h3>
          <span class="badge ${pendingReports.length > 0 ? 'badge-yellow' : 'badge-gray'}">${pendingReports.length}</span>
        </div>
        <p style="margin:4px 0 0;font-size:0.82rem;color:var(--text-3);">
          Resident submissions awaiting review. Approve to publish to the community or reject to decline.
        </p>
      </div>
    </div>
    <div class="section-card-body no-pad">
      ${pendingReports.length > 0 ? `
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Submitter / Contact</th>
                <th>Location &amp; Date</th>
                <th>Date Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${pendingReports.map(report => {
                const safeName = typeof escapeHtml === 'function' ? escapeHtml(report.itemName || '') : (report.itemName || '');
                const safeType = typeof escapeHtml === 'function' ? escapeHtml(report.itemType || '') : (report.itemType || '');
                const safeLoc = typeof escapeHtml === 'function' ? escapeHtml(report.location || '') : (report.location || '');
                const safeContact = typeof escapeHtml === 'function' ? escapeHtml(report.contactName || '') : (report.contactName || '');
                const safePhone = typeof escapeHtml === 'function' ? escapeHtml(report.contactNumber || '') : (report.contactNumber || '');
                const isVideo = isLostFoundMediaVideo(report.image || '') || report.media_type === 'video';
                const submitterUser = report.homeownerId ? getHomeownerById(report.homeownerId) : null;
                const submitterDisplay = submitterUser ? `${escapeHtml(submitterUser.name)} (Resident)` : safeContact;

                return `
                  <tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:10px;">
                        ${report.image ? `
                          ${isVideo
                            ? `<div class="lf-thumb-sm" style="display:flex;align-items:center;justify-content:center;background:#0f172a;color:#fff;"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`
                            : `<img src="${report.image}" class="lf-thumb-sm" alt="${safeName}" onclick="if(typeof openPhotoViewerModal==='function') openPhotoViewerModal('${report.image}', '${safeName.replace(/'/g, "\\'")}')" style="cursor:pointer;" />`
                          }
                        ` : ''}
                        <div>
                          <strong>${safeName}</strong>
                          <br>${lostFoundTypeBadge(report.reportType)}
                          <span style="font-size:0.78rem;color:var(--text-3);margin-left:4px;">${safeType}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>${submitterDisplay}</strong>
                      <br><span style="font-size:0.78rem;color:var(--text-3);">${safeContact} · ${safePhone}</span>
                    </td>
                    <td>
                      ${safeLoc}
                      <br><span style="font-size:0.78rem;color:var(--text-3);">${report.eventDate || ''}</span>
                    </td>
                    <td>
                      <span style="font-size:0.8rem;color:var(--text-2);">${(report.createdAt || '').slice(0, 10)}</span>
                    </td>
                    <td>
                      <div class="td-actions">
                        <button class="btn btn-secondary btn-sm" onclick="openLostFoundAdminModal('${report.id}')" title="Review details">
                          Review
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="adminApproveLostFound('${report.id}')" title="Approve and post">
                          Approve
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="adminRejectLostFound('${report.id}')" title="Reject report">
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div style="padding:28px 20px;text-align:center;color:var(--text-3);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom:8px;color:var(--green-600);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <div style="font-weight:600;color:var(--text-1);font-size:0.95rem;">All Caught Up!</div>
          <div style="font-size:0.84rem;margin-top:2px;">No pending lost and found submissions waiting for review.</div>
        </div>
      `}
    </div>
  </div>

  <!-- ALL REPORTS SECTION -->
  <div class="section-card">
    <div class="section-card-header">
      <div class="filters-row" style="width:100%;">
        <div class="search-box">
          <span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span>
          <input id="lostFoundSearch" type="text" placeholder="Search item, location, contact..."/>
        </div>
        <select class="filter-select" id="lostFoundStatusFilter" onchange="filterLostFoundReports()">
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          <option value="Claimed">Claimed</option>
        </select>
        <select class="filter-select" id="lostFoundTypeFilter" onchange="filterLostFoundReports()">
          <option value="">All Types (Lost &amp; Found)</option>
          <option value="Lost">Lost Only</option>
          <option value="Found">Found Only</option>
        </select>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Details</th>
              <th>Contact / Submitter</th>
              <th>Status</th>
              <th>Remarks</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${reports.map(report => {
              const safeName = typeof escapeHtml === 'function' ? escapeHtml(report.itemName || '') : (report.itemName || '');
              const safeType = typeof escapeHtml === 'function' ? escapeHtml(report.itemType || '') : (report.itemType || '');
              const safeLoc = typeof escapeHtml === 'function' ? escapeHtml(report.location || '') : (report.location || '');
              const safeContact = typeof escapeHtml === 'function' ? escapeHtml(report.contactName || '') : (report.contactName || '');
              const safePhone = typeof escapeHtml === 'function' ? escapeHtml(report.contactNumber || '') : (report.contactNumber || '');
              const safeRemarks = typeof escapeHtml === 'function' ? escapeHtml(report.remarks || '') : (report.remarks || '');
              const isVideo = isLostFoundMediaVideo(report.image || '') || report.media_type === 'video';

              return `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:10px;">
                    ${report.image ? `
                      ${isVideo
                        ? `<div class="lf-thumb-sm" style="display:flex;align-items:center;justify-content:center;background:#0f172a;color:#fff;"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`
                        : `<img src="${report.image}" class="lf-thumb-sm" alt="${safeName}" onclick="if(typeof openPhotoViewerModal==='function') openPhotoViewerModal('${report.image}', '${safeName.replace(/'/g, "\\'")}')" style="cursor:pointer;" />`
                      }
                    ` : ''}
                    <div>
                      <strong>${safeName}</strong>
                      <br>${lostFoundTypeBadge(report.reportType)}
                      <span style="font-size:0.78rem;color:var(--text-3);margin-left:4px;">${safeType}</span>
                    </div>
                  </div>
                </td>
                <td>
                  ${safeLoc}
                  <br><span style="font-size:0.78rem;color:var(--text-3)">${report.eventDate || ''}</span>
                </td>
                <td>
                  ${safeContact}
                  <br><span style="font-size:0.78rem;color:var(--text-3)">${safePhone}</span>
                </td>
                <td>${lostFoundStatusBadge(report.status)}</td>
                <td style="max-width:200px;">
                  <span style="font-size:0.8rem;color:var(--text-2);">${safeRemarks || '<span style="color:var(--text-3)">—</span>'}</span>
                </td>
                <td>
                  <div class="td-actions">
                    <button class="btn btn-secondary btn-sm" onclick="openLostFoundAdminModal('${report.id}')">Manage</button>
                    <button class="btn btn-danger btn-sm" onclick="confirmDeleteLostFound('${report.id}')">Delete</button>
                  </div>
                </td>
              </tr>`;
            }).join('') || '<tr><td colspan="6"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-search"/></svg>No lost and found reports found.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;

  const search = document.getElementById('lostFoundSearch');
  if (search) search.addEventListener('input', filterLostFoundReports);
}

function filterLostFoundReports() {
  const query = (document.getElementById('lostFoundSearch')?.value || '').trim().toLowerCase();
  const status = document.getElementById('lostFoundStatusFilter')?.value || '';
  const type = document.getElementById('lostFoundTypeFilter')?.value || '';

  const filtered = (db.get('lostFound') || []).filter(report => {
    const haystack = [
      report.reportType,
      report.itemType,
      report.itemName,
      report.description,
      report.location,
      report.contactName,
      report.contactNumber,
      report.status,
      report.remarks,
    ].join(' ').toLowerCase();
    const matchQuery = !query || haystack.includes(query);
    const matchStatus = !status || report.status === status;
    const matchType = !type || report.reportType === type;
    return matchQuery && matchStatus && matchType;
  });

  renderLostFoundManagement(filtered);
  const search = document.getElementById('lostFoundSearch');
  const statusEl = document.getElementById('lostFoundStatusFilter');
  const typeEl = document.getElementById('lostFoundTypeFilter');
  if (search) search.value = query;
  if (statusEl) statusEl.value = status;
  if (typeEl) typeEl.value = type;
}

// ── ADMIN APPROVE & REJECT ACTIONS ──

async function adminApproveLostFound(id) {
  const report = db.getOne('lostFound', id);
  if (!report) return;

  const confirmed = await new Promise(resolve => {
    openConfirm(
      'Approve Lost &amp; Found Report',
      `Approve report for "<strong>${escapeHtml(report.itemName)}</strong>"?<br><br>Once approved, this item will immediately be published and visible to all residents.`,
      () => resolve(true),
      () => resolve(false)
    );
  });

  if (!confirmed) return;

  showLoading();
  try {
    if (typeof api !== 'undefined' && typeof api.approveLostFound === 'function') {
      await api.approveLostFound(id);
    } else {
      report.status = 'Approved';
      report.updatedAt = new Date().toISOString();
      await db.save('lostFound', report);
    }

    // Refresh database cache
    if (typeof api !== 'undefined' && typeof api.loadAll === 'function') {
      await api.loadAll();
    } else {
      report.status = 'Approved';
    }

    hideLoading();
    closeModal();
    showToast('success', 'Report Approved', `"${report.itemName}" has been approved and is now visible to all residents.`);
    renderLostFoundManagement();
    renderPublicLostFound();
  } catch (err) {
    hideLoading();
    showToast('error', 'Approval Failed', err.message || 'Could not approve report.');
  }
}

function adminRejectLostFound(id) {
  const report = db.getOne('lostFound', id);
  if (!report) return;

  openModal('Reject Lost &amp; Found Report', `
    <p style="color:var(--text-2);margin-bottom:14px;font-size:0.88rem;">
      You are rejecting the report for "<strong>${escapeHtml(report.itemName)}</strong>". Rejected reports will not be published to residents.
    </p>

    <div class="form-group" style="margin-bottom:12px;">
      <label>Rejection Reason *</label>
      <select id="lf_reject_reason_select" onchange="handleLostFoundRejectSelect(this)">
        <option value="Incomplete or inaccurate information">Incomplete or inaccurate information</option>
        <option value="Duplicate submission">Duplicate submission</option>
        <option value="Item already claimed or recovered">Item already claimed or recovered</option>
        <option value="Does not follow community posting guidelines">Does not follow community posting guidelines</option>
        <option value="Unclear or invalid photo attached">Unclear or invalid photo attached</option>
        <option value="Other">Other (specify below)</option>
      </select>
    </div>

    <div class="form-group" style="margin-bottom:8px;">
      <label>Admin Remarks / Reason Details</label>
      <textarea id="lf_reject_reason_text" placeholder="Explain the reason for rejection (this will be shown to the resident)...">Incomplete or inaccurate information</textarea>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Confirm Rejection', cls: 'btn-danger', action: () => confirmAdminRejectLostFound(id) },
  ]);
}

function handleLostFoundRejectSelect(select) {
  const textEl = document.getElementById('lf_reject_reason_text');
  if (!textEl) return;
  if (select.value === 'Other') {
    textEl.value = '';
    textEl.focus();
  } else {
    textEl.value = select.value;
  }
}

async function confirmAdminRejectLostFound(id) {
  const report = db.getOne('lostFound', id);
  if (!report) return;

  const reason = (document.getElementById('lf_reject_reason_text')?.value || '').trim() ||
                 (document.getElementById('lf_reject_reason_select')?.value || 'Rejected by administration');

  showLoading();
  try {
    if (typeof api !== 'undefined' && typeof api.rejectLostFound === 'function') {
      await api.rejectLostFound(id, reason);
    } else {
      report.status = 'Rejected';
      report.remarks = reason;
      report.updatedAt = new Date().toISOString();
      await db.save('lostFound', report);
    }

    if (typeof api !== 'undefined' && typeof api.loadAll === 'function') {
      await api.loadAll();
    } else {
      report.status = 'Rejected';
      report.remarks = reason;
    }

    hideLoading();
    closeModal();
    showToast('success', 'Report Rejected', `"${report.itemName}" has been rejected and will not appear on the community board.`);
    renderLostFoundManagement();
    renderPublicLostFound();
  } catch (err) {
    hideLoading();
    showToast('error', 'Rejection Failed', err.message || 'Could not reject report.');
  }
}

// ── ADMIN MANAGE MODAL ──

function openLostFoundAdminModal(id) {
  const report = db.getOne('lostFound', id);
  if (!report) return;
  const isVideo = isLostFoundMediaVideo(report.image || '') || report.media_type === 'video';
  const safeName = typeof escapeHtml === 'function' ? escapeHtml(report.itemName || '') : (report.itemName || '');
  const submitterUser = report.homeownerId ? getHomeownerById(report.homeownerId) : null;

  const modalButtons = [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
  ];

  if (report.status === 'Pending') {
    modalButtons.push({
      label: 'Reject Report',
      cls: 'btn-danger',
      action: () => {
        closeModal();
        adminRejectLostFound(id);
      }
    });
    modalButtons.push({
      label: 'Approve Report',
      cls: 'btn-primary',
      action: () => {
        closeModal();
        adminApproveLostFound(id);
      }
    });
  } else {
    modalButtons.push({
      label: 'Save Changes',
      cls: 'btn-primary',
      action: () => saveLostFoundAdminChanges(id)
    });
  }

  openModal('Manage Lost and Found Report', `
    ${report.image ? (
      isVideo
        ? `<video src="${report.image}" controls class="lostfound-admin-image" style="background:#000;max-height:260px;"></video>`
        : `<img src="${report.image}" alt="${safeName}" class="lostfound-admin-image" style="cursor:pointer;" onclick="if(typeof openPhotoViewerModal==='function') openPhotoViewerModal('${report.image}', '${safeName.replace(/'/g, "\\'")}')">`
    ) : ''}

    ${submitterUser ? `
      <div style="background:var(--surface-2);padding:10px 14px;border-radius:var(--radius-sm);margin-bottom:14px;border:1px solid var(--border);display:flex;align-items:center;gap:10px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--teal-600);flex-shrink:0;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <div>
          <div style="font-weight:600;font-size:0.88rem;color:var(--text-1);">Submitted by Homeowner: ${escapeHtml(submitterUser.name)}</div>
          <div style="font-size:0.78rem;color:var(--text-3);">${escapeHtml(submitterUser.email || '')} · Block ${escapeHtml(submitterUser.block || '')} Lot ${escapeHtml(submitterUser.lot || '')}</div>
        </div>
      </div>
    ` : ''}

    <div class="grid-2">
      <div class="form-group">
        <label>Report Type</label>
        <select id="lf_admin_reportType">
          <option value="Lost" ${report.reportType === 'Lost' ? 'selected' : ''}>Lost</option>
          <option value="Found" ${report.reportType === 'Found' ? 'selected' : ''}>Found</option>
        </select>
      </div>
      <div class="form-group"><label>Item Type / Category</label><input id="lf_admin_itemType" value="${report.itemType || ''}"></div>
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
      <div class="form-group"><label>Remarks / Rejection Reason</label><input id="lf_admin_remarks" value="${report.remarks || ''}" placeholder="Optional admin remarks or rejection note"></div>
    </div>
  `, modalButtons);
}

async function saveLostFoundAdminChanges(id) {
  const report = db.getOne('lostFound', id);
  if (!report) return;
  const required = ['lf_admin_itemType', 'lf_admin_itemName', 'lf_admin_description', 'lf_admin_location', 'lf_admin_eventDate', 'lf_admin_contactName', 'lf_admin_contactNumber'];
  if (required.some(fieldId => !document.getElementById(fieldId)?.value.trim())) {
    showToast('error', 'Missing Fields', 'Please complete all report details before saving.');
    return;
  }

  showLoading();
  const today = typeof getLocalDateValue === 'function' ? getLocalDateValue() : new Date().toISOString().slice(0, 10);
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

  try {
    await db.save('lostFound', report);
    if (typeof logAction === 'function') {
      logAction(`Updated lost and found report: ${report.itemName} (${report.status})`);
    }
    hideLoading();
    closeModal();
    showToast('success', 'Report Saved', 'Lost and found report has been updated.');
    renderLostFoundManagement();
    renderPublicLostFound();
  } catch (err) {
    hideLoading();
    showToast('error', 'Save Failed', err.message || 'Could not save report.');
  }
}

function confirmDeleteLostFound(id) {
  const report = db.getOne('lostFound', id);
  if (!report) return;
  openModal('Delete Lost and Found Report', `<p>Delete "<strong>${escapeHtml(report.itemName)}</strong>"? This cannot be undone.</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Delete', cls: 'btn-danger', action: async () => {
      showLoading();
      try {
        await db.delete('lostFound', id);
        if (typeof logAction === 'function') {
          logAction(`Deleted lost and found report: ${report.itemName}`);
        }
        hideLoading();
        closeModal();
        showToast('success', 'Deleted', 'Lost and found report removed.');
        renderLostFoundManagement();
        renderPublicLostFound();
      } catch (err) {
        hideLoading();
        showToast('error', 'Delete Failed', err.message || 'Could not delete report.');
      }
    } },
  ]);
}
