/* ════════════════════════════════════════════════════════════
   Board of Directors: Public Homepage & Admin Management
════════════════════════════════════════════════════════════ */

function getPositionBadgeClass(pos) {
  return 'pub-board-pos-vp';
}

async function renderPublicBoardOfDirectors() {
  const container = document.getElementById('pubBoardContainer');
  if (!container) return;

  let members = [];
  try {
    const cached = db.get('board_of_directors');
    if (cached && cached.length) {
      members = [...cached].sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0));
    } else {
      members = await api.request('/api/board');
      if (Array.isArray(members)) {
        dbCache['board_of_directors'] = members;
      }
    }
  } catch (err) {
    console.warn('Could not load board members:', err);
    members = db.get('board_of_directors') || [];
  }

  if (!members || !members.length) {
    container.innerHTML = `
      <div class="no-results" style="padding: 40px 20px;">
        <svg style="width:2.5rem;height:2.5rem;color:var(--text-3);margin-bottom:12px;"><use href="#ico-users"/></svg>
        <p style="font-size:1.05rem;font-weight:600;color:var(--text-2);">Board of Directors details will be announced soon.</p>
      </div>`;
    return;
  }

  // Update subtitle term years if available
  const sampleTerm = members.find(m => m.term_years && m.term_years.trim())?.term_years || '2026 - 2028';
  const termSub = document.getElementById('pubBoardTermSub');
  if (termSub) {
    termSub.innerHTML = `Term ${escapeHtml(sampleTerm)} &bull; Dedicated to serving San Alfonso Homes with integrity, transparency, and unity.`;
  }

  // Find President
  const president = members.find(m => (m.position || '').trim().toLowerCase() === 'president') || members[0];
  const otherMembers = members.filter(m => m.id !== president.id);

  function getPhotoHtml(m, isPres = false) {
    const photoUrl = m.photo ? escapeHtml(m.photo) : null;
    const initial = (m.name || 'B').charAt(0).toUpperCase();
    if (photoUrl) {
      return `
        <div class="pub-board-photo-wrap">
          <img src="${photoUrl}" alt="${escapeHtml(m.name)}" class="pub-board-photo" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'bod-table-avatar\\' style=\\'width:100%;height:100%;font-size:2.5rem;display:flex;align-items:center;justify-content:center;background:var(--teal-100);color:var(--teal-800);font-weight:700;\\'>${initial}</div>'" />
        </div>`;
    }
    return `
      <div class="pub-board-photo-wrap" style="display:flex;align-items:center;justify-content:center;background:var(--teal-50);color:var(--teal-700);font-size:2.5rem;font-weight:700;">
        ${initial}
      </div>`;
  }

  function getContactHtml(m) {
    const contact = (m.contact_number || '').trim();
    if (!contact) return '';
    const cleanNum = contact.replace(/[^0-9+]/g, '');
    return `
      <a href="tel:${cleanNum}" class="pub-board-contact" title="Call ${escapeHtml(m.name)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.01 4.18 2 2 0 012 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
        </svg>
        <span>${escapeHtml(contact)}</span>
      </a>`;
  }

  let html = '';

  // Prominent President Card at Top Center
  if (president) {
    html += `
      <div class="pub-board-president-wrap">
        <div class="pub-board-card pub-board-card-pres">
          ${getPhotoHtml(president, true)}
          <div class="pub-board-name">${escapeHtml(president.name)}</div>
          <div class="pub-board-pos-badge ${getPositionBadgeClass(president.position)}">${escapeHtml(president.position)}</div>
          ${getContactHtml(president)}
        </div>
      </div>`;
  }

  // Executive Officers Grid Below
  if (otherMembers.length > 0) {
    html += `
      <div class="pub-board-grid">
        ${otherMembers.map(m => `
          <div class="pub-board-card">
            ${getPhotoHtml(m, false)}
            <div class="pub-board-name">${escapeHtml(m.name)}</div>
            <div class="pub-board-pos-badge ${getPositionBadgeClass(m.position)}">${escapeHtml(m.position)}</div>
            ${getContactHtml(m)}
          </div>
        `).join('')}
      </div>`;
  }

  container.innerHTML = html;
}

// ── Admin Board of Directors Management ──

function renderBoardOfDirectorsManagement() {
  const area = document.getElementById('contentArea');
  if (!area) return;

  const allMembers = db.get('board_of_directors') || [];
  const totalCount = allMembers.length;
  const sampleTerm = allMembers.find(m => m.term_years && m.term_years.trim())?.term_years || '2026 - 2028';
  const hasPres = allMembers.some(m => (m.position || '').toLowerCase().includes('president') && !(m.position || '').toLowerCase().includes('vice'));

  const standardPositions = ['President', 'Vice President', 'Secretary', 'Treasurer', 'Auditor'];
  const allPositions = Array.from(new Set([
    ...standardPositions,
    ...allMembers.map(m => (m.position || '').trim()).filter(Boolean)
  ]));

  area.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2>Board of Directors</h2>
        <p>Manage elected HOA officers, positions, contact details, term years, and profile photos.</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" onclick="openAddBoardMemberModal()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:-2px"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Add Board Member
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--teal-50);color:var(--teal-600);"><svg width="22" height="22"><use href="#ico-users"/></svg></div>
        <div class="stat-info">
          <span class="stat-value">${totalCount}</span>
          <span class="stat-label">Total Officers</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(34,113,195,0.1);color:#1d4ed8;"><svg width="22" height="22"><use href="#ico-clock"/></svg></div>
        <div class="stat-info">
          <span class="stat-value" style="font-size:1.3rem;">${escapeHtml(sampleTerm)}</span>
          <span class="stat-label">Current Term</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(22,163,74,0.1);color:#16a34a;"><svg width="22" height="22"><use href="#ico-shield"/></svg></div>
        <div class="stat-info">
          <span class="stat-value">${hasPres ? 'Active' : 'Unassigned'}</span>
          <span class="stat-label">President Role</span>
        </div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-card-header">
        <div class="filters-row" style="width:100%;">
          <div class="search-box">
            <span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span>
            <input id="bodSearchInput" type="text" placeholder="Search name, position, contact..." oninput="filterBoardMembers()" />
          </div>
          <select class="filter-select" id="bodPositionFilter" onchange="filterBoardMembers()">
            <option value="">All Positions</option>
            ${allPositions.map(pos => `<option value="${escapeHtml(pos)}">${escapeHtml(pos)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="section-card-body no-pad">
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:70px;">Photo</th>
                <th>Full Name</th>
                <th>Position</th>
                <th>Contact Number</th>
                <th>Term Years</th>
                <th>Order</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody id="bodTableBody">
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  renderBoardMembersTable();
}

function renderBoardMembersTable(filtered = null) {
  const tbody = document.getElementById('bodTableBody');
  if (!tbody) return;

  const members = filtered !== null ? filtered : (db.get('board_of_directors') || []);
  const sorted = [...members].sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0));

  if (!sorted.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="no-results" style="padding:32px;">
            <svg style="width:2rem;height:2rem;color:var(--text-3);"><use href="#ico-users"/></svg>
            No board members found.
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = sorted.map(m => {
    const initial = (m.name || 'B').charAt(0).toUpperCase();
    const photoHtml = m.photo
      ? `<img src="${escapeHtml(m.photo)}" alt="${escapeHtml(m.name)}" class="bod-table-avatar" onerror="this.outerHTML='<div class=\\'bod-table-avatar\\' style=\\'display:flex;align-items:center;justify-content:center;background:var(--teal-100);color:var(--teal-800);font-weight:700;\\'>${initial}</div>'" />`
      : `<div class="bod-table-avatar" style="display:flex;align-items:center;justify-content:center;background:var(--teal-100);color:var(--teal-800);font-weight:700;">${initial}</div>`;
    return `
      <tr>
        <td>${photoHtml}</td>
        <td>
          <strong>${escapeHtml(m.name)}</strong>
        </td>
        <td>
          <span class="pub-board-pos-badge ${getPositionBadgeClass(m.position)}" style="margin-bottom:0;font-size:0.73rem;">
            ${escapeHtml(m.position)}
          </span>
        </td>
        <td>
          <span style="font-family:monospace;font-weight:600;color:var(--text-2);">${escapeHtml(m.contact_number || '—')}</span>
        </td>
        <td>
          <span class="badge badge-gray">${escapeHtml(m.term_years || '2026 - 2028')}</span>
        </td>
        <td>
          <span style="font-weight:700;color:var(--text-3);">${m.display_order ?? 0}</span>
        </td>
        <td style="text-align:right;">
          <div class="td-actions" style="justify-content:flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="openEditBoardMemberModal('${m.id}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteBoardMember('${m.id}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterBoardMembers() {
  const query = (document.getElementById('bodSearchInput')?.value || '').trim().toLowerCase();
  const posFilter = (document.getElementById('bodPositionFilter')?.value || '').trim().toLowerCase();
  const allMembers = db.get('board_of_directors') || [];

  const filtered = allMembers.filter(m => {
    const matchesQuery = !query ||
      (m.name || '').toLowerCase().includes(query) ||
      (m.position || '').toLowerCase().includes(query) ||
      (m.contact_number || '').toLowerCase().includes(query) ||
      (m.term_years || '').toLowerCase().includes(query);
    const matchesPos = !posFilter || (m.position || '').trim().toLowerCase() === posFilter;
    return matchesQuery && matchesPos;
  });

  renderBoardMembersTable(filtered);
}

let pendingBodPhotoFile = null;
let pendingBodPhotoPreviewUrl = null;
let bodCropState = null;

function previewBodModalPhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    showToast('error', 'Invalid File', 'Only JPG, PNG, or WebP images are allowed.');
    input.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('error', 'File Too Large', 'Photo must be 5MB or smaller.');
    input.value = '';
    return;
  }

  if (pendingBodPhotoPreviewUrl) {
    URL.revokeObjectURL(pendingBodPhotoPreviewUrl);
  }
  pendingBodPhotoPreviewUrl = URL.createObjectURL(file);
  openBodCropModal(pendingBodPhotoPreviewUrl, file.type, file.name);
}

function openBodCropModal(url, mime, filename) {
  const overlay = document.getElementById('bodCropOverlay');
  const viewport = document.getElementById('bodCropViewport');
  const img = document.getElementById('bodCropImg');
  const zoom = document.getElementById('bodCropZoom');
  const statusEl = document.getElementById('bodPhotoCropStatus');
  const saveBtn = document.getElementById('bodCropSaveBtn');

  if (!overlay || !viewport || !img || !zoom) return;

  if (statusEl) statusEl.textContent = '';
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Photo';
  }

  overlay.classList.remove('hidden');

  bindBodCropViewport(viewport, zoom);

  img.onload = () => {
    const vw = viewport.clientWidth || 240;
    const minScale = Math.max(vw / img.naturalWidth, vw / img.naturalHeight);
    bodCropState = {
      url, mime, filename, imgEl: img,
      imgW: img.naturalWidth, imgH: img.naturalHeight, vw,
      scale: minScale, minScale,
      x: (vw - img.naturalWidth * minScale) / 2,
      y: (vw - img.naturalHeight * minScale) / 2,
    };
    zoom.min = String(minScale);
    zoom.max = String(minScale * 4);
    zoom.step = String(minScale / 50);
    zoom.value = String(minScale);
    applyBodCropTransform();
  };
  img.src = url;
}

function clampBodCropPosition(state) {
  const w = state.imgW * state.scale;
  const h = state.imgH * state.scale;
  state.x = Math.min(0, Math.max(state.vw - w, state.x));
  state.y = Math.min(0, Math.max(state.vw - h, state.y));
}

function applyBodCropTransform() {
  if (!bodCropState) return;
  const img = document.getElementById('bodCropImg');
  if (!img) return;
  clampBodCropPosition(bodCropState);
  img.style.width = `${bodCropState.imgW * bodCropState.scale}px`;
  img.style.height = 'auto';
  img.style.transform = `translate(${bodCropState.x}px, ${bodCropState.y}px)`;
}

function bindBodCropViewport(viewport, zoom) {
  if (viewport.dataset.cropBound) return;
  viewport.dataset.cropBound = '1';
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  viewport.addEventListener('pointerdown', (e) => {
    if (!bodCropState) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    try { viewport.setPointerCapture(e.pointerId); } catch { /* noop */ }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!dragging || !bodCropState) return;
    bodCropState.x += e.clientX - lastX;
    bodCropState.y += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    applyBodCropTransform();
  });

  const endDrag = () => { dragging = false; };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  zoom.addEventListener('input', () => {
    if (!bodCropState) return;
    const newScale = Number(zoom.value);
    if (!Number.isFinite(newScale) || newScale <= 0) return;
    const cx = bodCropState.vw / 2;
    const cy = bodCropState.vw / 2;
    const ratio = newScale / bodCropState.scale;
    bodCropState.x = cx - (cx - bodCropState.x) * ratio;
    bodCropState.y = cy - (cy - bodCropState.y) * ratio;
    bodCropState.scale = newScale;
    applyBodCropTransform();
  });

  viewport.addEventListener('wheel', (e) => {
    if (!bodCropState) return;
    e.preventDefault();
    const step = (Number(zoom.max) - Number(zoom.min)) / 20;
    const delta = e.deltaY < 0 ? step : -step;
    const newScale = Math.min(Number(zoom.max), Math.max(Number(zoom.min), bodCropState.scale + delta));
    zoom.value = String(newScale);
    zoom.dispatchEvent(new Event('input'));
  }, { passive: false });
}

function closeBodCropModal() {
  const overlay = document.getElementById('bodCropOverlay');
  if (overlay) overlay.classList.add('hidden');
  bodCropState = null;
  const input = document.getElementById('bod_photo_input');
  if (input) input.value = '';
}

function closeBodCropOutside(e) {
  if (e.target === document.getElementById('bodCropOverlay')) {
    closeBodCropModal();
  }
}

async function applyBodPhotoCrop() {
  if (!bodCropState || !bodCropState.imgEl) {
    showToast('error', 'No Photo', 'Please choose a photo first.');
    return;
  }
  const saveBtn = document.getElementById('bodCropSaveBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Processing...';
  }

  try {
    const st = bodCropState;
    const side = st.vw / st.scale;
    const sx = -st.x / st.scale;
    const sy = -st.y / st.scale;
    const OUT = 512;
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas cropping is not supported in this browser.');
    }
    ctx.drawImage(st.imgEl, sx, sy, side, side, 0, 0, OUT, OUT);

    const mime = st.mime === 'image/png' ? 'image/png' : (st.mime === 'image/webp' ? 'image/webp' : 'image/jpeg');
    const ext = mime === 'image/png' ? '.png' : (mime === 'image/webp' ? '.webp' : '.jpg');

    const file = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Could not process the cropped image.'));
          return;
        }
        try {
          resolve(new File([blob], `bod-${Date.now().toString(36)}${ext}`, { type: mime }));
        } catch {
          blob.name = `bod-${Date.now().toString(36)}${ext}`;
          resolve(blob);
        }
      }, mime, 0.92);
    });

    pendingBodPhotoFile = file;

    // Update modal preview
    const preview = document.getElementById('bodPhotoPreview');
    const placeholder = document.getElementById('bodPreviewPlaceholder');
    if (preview) {
      preview.src = canvas.toDataURL(mime, 0.92);
      preview.classList.remove('hidden');
    }
    if (placeholder) {
      placeholder.classList.add('hidden');
    }

    closeBodCropModal();
    showToast('success', 'Photo Adjusted', 'Profile photo cropped and ready to save.');
  } catch (err) {
    console.error(err);
    showToast('error', 'Crop Error', err.message || 'Failed to crop photo.');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Photo';
    }
  }
}

function handleBodPositionChange(select) {
  const customInput = document.getElementById('bod_custom_position');
  if (!customInput) return;
  if (select.value === 'custom') {
    customInput.classList.remove('hidden');
    customInput.focus();
  } else {
    customInput.classList.add('hidden');
  }
}

function openAddBoardMemberModal() {
  pendingBodPhotoFile = null;
  if (pendingBodPhotoPreviewUrl) {
    URL.revokeObjectURL(pendingBodPhotoPreviewUrl);
    pendingBodPhotoPreviewUrl = null;
  }
  const bodyHtml = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div class="form-group">
        <label>Profile Photo (Square)</label>
        <div class="bod-upload-container">
          <div class="bod-photo-preview-wrap">
            <img id="bodPhotoPreview" class="bod-photo-preview-img hidden" alt="Preview" />
            <div id="bodPreviewPlaceholder" class="bod-preview-placeholder">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="margin-bottom:4px;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span>No Photo</span>
            </div>
          </div>
          <div style="flex:1;">
            <input type="file" id="bod_photo_input" accept="image/jpeg,image/png,image/webp" onchange="previewBodModalPhoto(this)" style="display:none;" />
            <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('bod_photo_input').click()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Choose Photo
            </button>
            <div style="font-size:0.75rem;color:var(--text-3);margin-top:6px;">Square JPG, PNG, or WebP up to 5MB.</div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>Full Name <span style="color:var(--red-600);">*</span></label>
        <input type="text" id="bod_name_input" placeholder="e.g. Arturo Tuy" required />
      </div>

      <div class="form-group">
        <label>Position <span style="color:var(--red-600);">*</span></label>
        <select id="bod_position_select" onchange="handleBodPositionChange(this)">
          <option value="President">President</option>
          <option value="Vice President">Vice President</option>
          <option value="Secretary">Secretary</option>
          <option value="Treasurer">Treasurer</option>
          <option value="Auditor">Auditor</option>
          <option value="custom">Other / Custom Position...</option>
        </select>
        <input type="text" id="bod_custom_position" class="hidden" placeholder="Enter custom position title" style="margin-top:8px;" />
      </div>

      <div class="form-group">
        <label>Contact Number</label>
        <input type="text" id="bod_contact_input" placeholder="e.g. 09125225210" />
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div class="form-group">
          <label>Term Years</label>
          <input type="text" id="bod_term_input" value="2026 - 2028" placeholder="e.g. 2026 - 2028" />
        </div>
        <div class="form-group">
          <label>Display Order</label>
          <input type="number" id="bod_order_input" value="6" min="1" max="99" />
        </div>
      </div>
    </div>
  `;

  openModal('Add New Board Member', bodyHtml, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Save Member', cls: 'btn-primary', action: () => saveBoardMember(false) },
  ]);
}

function openEditBoardMemberModal(memberId) {
  pendingBodPhotoFile = null;
  if (pendingBodPhotoPreviewUrl) {
    URL.revokeObjectURL(pendingBodPhotoPreviewUrl);
    pendingBodPhotoPreviewUrl = null;
  }
  const m = db.getOne('board_of_directors', memberId);
  if (!m) {
    showToast('error', 'Error', 'Board member not found.');
    return;
  }

  const standardPositions = ['President', 'Vice President', 'Secretary', 'Treasurer', 'Auditor'];
  const isCustom = !standardPositions.includes(m.position);
  const photoUrl = m.photo ? escapeHtml(m.photo) : '';

  const bodyHtml = `
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div class="form-group">
        <label>Profile Photo (Square)</label>
        <div class="bod-upload-container">
          <div class="bod-photo-preview-wrap">
            <img id="bodPhotoPreview" class="bod-photo-preview-img ${photoUrl ? '' : 'hidden'}" src="${photoUrl}" alt="Preview" />
            <div id="bodPreviewPlaceholder" class="bod-preview-placeholder ${photoUrl ? 'hidden' : ''}">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="margin-bottom:4px;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span>No Photo</span>
            </div>
          </div>
          <div style="flex:1;">
            <input type="file" id="bod_photo_input" accept="image/jpeg,image/png,image/webp" onchange="previewBodModalPhoto(this)" style="display:none;" />
            <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('bod_photo_input').click()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Change Photo
            </button>
            <div style="font-size:0.75rem;color:var(--text-3);margin-top:6px;">Select a new image to replace current photo.</div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>Full Name <span style="color:var(--red-600);">*</span></label>
        <input type="text" id="bod_name_input" value="${escapeHtml(m.name || '')}" required />
      </div>

      <div class="form-group">
        <label>Position <span style="color:var(--red-600);">*</span></label>
        <select id="bod_position_select" onchange="handleBodPositionChange(this)">
          <option value="President" ${m.position === 'President' ? 'selected' : ''}>President</option>
          <option value="Vice President" ${m.position === 'Vice President' ? 'selected' : ''}>Vice President</option>
          <option value="Secretary" ${m.position === 'Secretary' ? 'selected' : ''}>Secretary</option>
          <option value="Treasurer" ${m.position === 'Treasurer' ? 'selected' : ''}>Treasurer</option>
          <option value="Auditor" ${m.position === 'Auditor' ? 'selected' : ''}>Auditor</option>
          <option value="custom" ${isCustom ? 'selected' : ''}>Other / Custom Position...</option>
        </select>
        <input type="text" id="bod_custom_position" class="${isCustom ? '' : 'hidden'}" value="${isCustom ? escapeHtml(m.position || '') : ''}" placeholder="Enter custom position title" style="margin-top:8px;" />
      </div>

      <div class="form-group">
        <label>Contact Number</label>
        <input type="text" id="bod_contact_input" value="${escapeHtml(m.contact_number || '')}" placeholder="e.g. 09125225210" />
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div class="form-group">
          <label>Term Years</label>
          <input type="text" id="bod_term_input" value="${escapeHtml(m.term_years || '2026 - 2028')}" placeholder="e.g. 2026 - 2028" />
        </div>
        <div class="form-group">
          <label>Display Order</label>
          <input type="number" id="bod_order_input" value="${m.display_order ?? 1}" min="1" max="99" />
        </div>
      </div>
    </div>
  `;

  openModal('Edit Board Member', bodyHtml, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Save Changes', cls: 'btn-primary', action: () => saveBoardMember(true, memberId) },
  ]);
}

async function saveBoardMember(isEdit, memberId = null) {
  const nameInput = document.getElementById('bod_name_input');
  const posSelect = document.getElementById('bod_position_select');
  const customPosInput = document.getElementById('bod_custom_position');
  const contactInput = document.getElementById('bod_contact_input');
  const termInput = document.getElementById('bod_term_input');
  const orderInput = document.getElementById('bod_order_input');

  const name = (nameInput?.value || '').trim();
  let position = posSelect?.value;
  if (position === 'custom') {
    position = (customPosInput?.value || '').trim();
  }

  if (!name) {
    showToast('error', 'Name Required', 'Please enter the board member\'s full name.');
    return;
  }
  if (!position) {
    showToast('error', 'Position Required', 'Please specify a position for this board member.');
    return;
  }

  const contact = (contactInput?.value || '').trim();
  const term = (termInput?.value || '2026 - 2028').trim();
  const order = parseInt(orderInput?.value, 10) || 1;

  const formData = new FormData();
  formData.append('name', name);
  formData.append('position', position);
  formData.append('contact_number', contact);
  formData.append('term_years', term);
  formData.append('display_order', order);

  if (pendingBodPhotoFile) {
    formData.append('photo', pendingBodPhotoFile);
  }

  const url = isEdit ? `/api/board/${memberId}` : '/api/board';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const headers = {};
    if (currentUser && currentUser.id) {
      headers['X-User-Id'] = currentUser.id;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to save board member.' }));
      throw new Error(err.error || 'Failed to save board member.');
    }

    // Refresh local cache
    const updatedList = await api.request('/api/board');
    dbCache['board_of_directors'] = updatedList;

    closeModal();
    pendingBodPhotoFile = null;
    if (pendingBodPhotoPreviewUrl) {
      URL.revokeObjectURL(pendingBodPhotoPreviewUrl);
      pendingBodPhotoPreviewUrl = null;
    }
    showToast('success', 'Success', isEdit ? 'Board member updated successfully.' : 'New board member added successfully.');
    renderBoardOfDirectorsManagement();
    renderPublicBoardOfDirectors();
  } catch (err) {
    console.error(err);
    showToast('error', 'Error', err.message || 'Could not save board member.');
  }
}

function confirmDeleteBoardMember(memberId) {
  const m = db.getOne('board_of_directors', memberId);
  if (!m) return;

  openModal('Delete Board Member?', `
    <p style="color:var(--text-2);line-height:1.6;">
      Are you sure you want to remove <strong>${escapeHtml(m.name)}</strong> (${escapeHtml(m.position)}) from the Board of Directors?
    </p>
    <p style="color:var(--red-600);font-size:0.84rem;margin-top:8px;">
      This action cannot be undone. Their profile and details will be permanently removed from the public homepage and management directory.
    </p>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    {
      label: 'Delete Member',
      cls: 'btn-danger',
      action: async () => {
        try {
          await api.request(`/api/board/${memberId}`, { method: 'DELETE' });
          const updatedList = await api.request('/api/board');
          dbCache['board_of_directors'] = updatedList;
          closeModal();
          showToast('success', 'Deleted', `${m.name} was removed from the Board of Directors.`);
          renderBoardOfDirectorsManagement();
          renderPublicBoardOfDirectors();
        } catch (err) {
          console.error(err);
          showToast('error', 'Delete Failed', err.message || 'Could not delete board member.');
        }
      }
    }
  ]);
}
