// PROFILE PHOTOS (served from /uploads/profile/, stored as path in users.profile_photo)
function userInitials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function profilePhotoUrl(user) {
  const value = user && user.profile_photo;
  if (!value || typeof value !== 'string') return null;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith('/uploads/profile/')) return value;
  if (/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(jpg|jpeg|png|webp)$/i.test(value)) return `/uploads/profile/${value}`;
  return null;
}

function avatarHTML(user, sizeClass = '') {
  const url = profilePhotoUrl(user);
  const initials = userInitials(user && user.name);
  if (url) return `<img src="${url}" alt="" class="avatar-img ${sizeClass}" loading="lazy" onerror="this.outerHTML=avatarFallbackHTML('${initials}', '${sizeClass}')"/>`;
  return avatarFallbackHTML(initials, sizeClass);
}

function avatarFallbackHTML(initials, sizeClass = '') {
  return `<span class="avatar-fallback ${sizeClass}">${initials}</span>`;
}

function renderAvatarInto(el, user) {
  if (!el) return;
  el.innerHTML = avatarHTML(user);
  el.classList.add('has-photo');
}

function syncUserPhotoInCache(userId, photoPath) {
  const users = db.get('users');
  const idx = users.findIndex(u => u.id === userId);
  if (idx >= 0) {
    users[idx] = { ...users[idx], profile_photo: photoPath };
    dbCache.users = users;
  }
  if (currentUser && currentUser.id === userId) {
    currentUser = { ...currentUser, profile_photo: photoPath };
  }
}

function profileAvatarEditableHTML(user) {
  return `
  <div class="profile-avatar-wrapper">
    <div class="profile-avatar-big" id="profileAvatarBig">
      ${avatarHTML(user, 'avatar-2xl')}
    </div>
    <button type="button" class="profile-avatar-edit-btn" id="profileAvatarEditBtn" onclick="toggleProfileAvatarMenu(event)" title="Edit profile photo" aria-label="Edit profile photo" aria-haspopup="true" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
      </svg>
    </button>
    <div class="profile-avatar-menu hidden" id="profileAvatarMenu" role="menu">
      <button type="button" class="profile-avatar-menu-item" onclick="handleAvatarMenuChangePhoto(event)" role="menuitem">
        <span class="profile-avatar-menu-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg></span>
        <span>Change Photo</span>
      </button>
      <button type="button" class="profile-avatar-menu-item danger" onclick="handleAvatarMenuRemovePhoto(event)" role="menuitem">
        <span class="profile-avatar-menu-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg></span>
        <span>Remove Photo</span>
      </button>
    </div>
    <input type="file" id="profilePhotoInput" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" class="hidden" onchange="handleProfilePhotoSelect(this)"/>
  </div>`;
}

function toggleProfileAvatarMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('profileAvatarMenu');
  const btn = document.getElementById('profileAvatarEditBtn');
  if (!menu) return;
  const isHidden = menu.classList.contains('hidden');
  if (isHidden) {
    menu.classList.remove('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  } else {
    menu.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}

function closeProfileAvatarMenu() {
  const menu = document.getElementById('profileAvatarMenu');
  const btn = document.getElementById('profileAvatarEditBtn');
  if (menu && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}

function handleAvatarMenuChangePhoto(e) {
  if (e) e.stopPropagation();
  closeProfileAvatarMenu();
  const input = document.getElementById('profilePhotoInput');
  if (input) input.click();
}

function handleAvatarMenuRemovePhoto(e) {
  if (e) e.stopPropagation();
  closeProfileAvatarMenu();
  confirmRemoveProfilePhoto();
}

function profilePhotoSectionHTML(u) {
  return '';
}

let pendingPhotoFile = null;
let pendingPhotoPreviewUrl = null;

function handleProfilePhotoSelect(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    showToast('error', 'Invalid File', 'Only JPG, PNG, or WebP images are allowed.');
    input.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('error', 'Too Large', 'Photo must be 5 MB or smaller.');
    input.value = '';
    return;
  }
  pendingPhotoFile = file;
  if (pendingPhotoPreviewUrl) URL.revokeObjectURL(pendingPhotoPreviewUrl);
  pendingPhotoPreviewUrl = URL.createObjectURL(file);
  openCropModal(pendingPhotoPreviewUrl, file.type);
}

function openCropModal(url, mime) {
  openModal('Adjust Profile Photo', `
    <div class="crop-modal-content">
      <p class="crop-modal-hint">Drag to position, use the slider to zoom, then save.</p>
      <div id="cropEditor" class="crop-editor">
        <div class="crop-viewport" id="cropViewport"><img id="cropImg" alt="Crop preview" draggable="false"/></div>
        <div class="crop-controls">
          <span aria-hidden="true">−</span>
          <input type="range" id="cropZoom" min="1" max="2" step="0.01" value="1" aria-label="Zoom photo"/>
          <span aria-hidden="true">+</span>
        </div>
      </div>
      <div id="photoUploadStatus" class="photo-upload-status" style="margin-top:10px;"></div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Save Photo', cls: 'btn-primary', action: uploadProfilePhoto },
  ]);
  openCropEditor(url, mime);
}

let cropState = null;

function openCropEditor(url, mime) {
  const editor = document.getElementById('cropEditor');
  const viewport = document.getElementById('cropViewport');
  const img = document.getElementById('cropImg');
  const zoom = document.getElementById('cropZoom');
  if (!editor || !viewport || !img || !zoom) return;
  editor.classList.remove('hidden');
  bindCropViewport(viewport, zoom);
  img.onload = () => {
    const vw = viewport.clientWidth || 240;
    const minScale = Math.max(vw / img.naturalWidth, vw / img.naturalHeight);
    cropState = {
      url, mime, imgEl: img,
      imgW: img.naturalWidth, imgH: img.naturalHeight, vw,
      scale: minScale, minScale,
      x: (vw - img.naturalWidth * minScale) / 2,
      y: (vw - img.naturalHeight * minScale) / 2,
    };
    zoom.min = String(minScale);
    zoom.max = String(minScale * 4);
    zoom.step = String(minScale / 50);
    zoom.value = String(minScale);
    applyCropTransform();
  };
  img.src = url;
}

function clampCropPosition(state) {
  const w = state.imgW * state.scale;
  const h = state.imgH * state.scale;
  state.x = Math.min(0, Math.max(state.vw - w, state.x));
  state.y = Math.min(0, Math.max(state.vw - h, state.y));
}

function applyCropTransform() {
  if (!cropState) return;
  const img = document.getElementById('cropImg');
  if (!img) return;
  clampCropPosition(cropState);
  img.style.width = `${cropState.imgW * cropState.scale}px`;
  img.style.height = 'auto';
  img.style.transform = `translate(${cropState.x}px, ${cropState.y}px)`;
}

function bindCropViewport(viewport, zoom) {
  if (viewport.dataset.cropBound) return;
  viewport.dataset.cropBound = '1';
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  viewport.addEventListener('pointerdown', (e) => {
    if (!cropState) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    try { viewport.setPointerCapture(e.pointerId); } catch { /* noop */ }
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!dragging || !cropState) return;
    cropState.x += e.clientX - lastX;
    cropState.y += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    applyCropTransform();
  });
  const endDrag = () => { dragging = false; };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  zoom.addEventListener('input', () => {
    if (!cropState) return;
    const newScale = Number(zoom.value);
    if (!Number.isFinite(newScale) || newScale <= 0) return;
    const cx = cropState.vw / 2;
    const cy = cropState.vw / 2;
    const ratio = newScale / cropState.scale;
    cropState.x = cx - (cx - cropState.x) * ratio;
    cropState.y = cy - (cy - cropState.y) * ratio;
    cropState.scale = newScale;
    applyCropTransform();
  });
}

function renderCroppedPhoto() {
  return new Promise((resolve, reject) => {
    if (!cropState || !cropState.imgEl) {
      reject(new Error('Choose a photo first.'));
      return;
    }
    const st = cropState;
    const side = st.vw / st.scale;
    const sx = -st.x / st.scale;
    const sy = -st.y / st.scale;
    const OUT = 512;
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Cropping is not supported in this browser.'));
      return;
    }
    ctx.drawImage(st.imgEl, sx, sy, side, side, 0, 0, OUT, OUT);
    const mime = st.mime === 'image/png' ? 'image/png' : (st.mime === 'image/webp' ? 'image/webp' : 'image/jpeg');
    const ext = mime === 'image/png' ? '.png' : (mime === 'image/webp' ? '.webp' : '.jpg');
    const toFile = (blob) => {
      if (!blob) {
        if (mime !== 'image/jpeg') {
          canvas.toBlob((fallback) => {
            if (!fallback) { reject(new Error('Could not process the image.')); return; }
            resolve(new File([fallback], `profile-${Date.now().toString(36)}.jpg`, { type: 'image/jpeg' }));
          }, 'image/jpeg', 0.92);
          return;
        }
        reject(new Error('Could not process the image.'));
        return;
      }
      resolve(new File([blob], `profile-${Date.now().toString(36)}${ext}`, { type: mime }));
    };
    canvas.toBlob(toFile, mime, 0.92);
  });
}

function cancelProfilePhotoSelect() {
  pendingPhotoFile = null;
  cropState = null;
  if (pendingPhotoPreviewUrl) { URL.revokeObjectURL(pendingPhotoPreviewUrl); pendingPhotoPreviewUrl = null; }
  const input = document.getElementById('profilePhotoInput');
  if (input) input.value = '';
  document.getElementById('cropEditor')?.classList.add('hidden');
  document.getElementById('photoPreviewActions')?.classList.add('hidden');
  const statusEl = document.getElementById('photoUploadStatus');
  if (statusEl) statusEl.textContent = '';
}

async function uploadProfilePhoto() {
  if (!currentUser) return;
  if (!pendingPhotoFile || !cropState) {
    showToast('error', 'No Photo', 'Choose a photo first.');
    return;
  }
  const statusEl = document.getElementById('photoUploadStatus');
  const saveBtn = document.querySelector('#modalFooter .btn-primary') || document.getElementById('photoSaveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
  if (statusEl) statusEl.textContent = 'Cropping and uploading…';
  try {
    const croppedFile = await renderCroppedPhoto();
    const form = new FormData();
    form.append('photo', croppedFile, croppedFile.name);
    const response = await fetch(`/api/users/${encodeURIComponent(currentUser.id)}/photo`, {
      method: 'POST',
      headers: { 'X-User-Id': currentUser.id },
      body: form,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Upload failed.');
    syncUserPhotoInCache(currentUser.id, result.profile_photo);
    pendingPhotoFile = null;
    cropState = null;
    if (pendingPhotoPreviewUrl) { URL.revokeObjectURL(pendingPhotoPreviewUrl); pendingPhotoPreviewUrl = null; }
    buildSidebar();
    const input = document.getElementById('profilePhotoInput');
    if (input) input.value = '';
    closeModal();
    showToast('success', 'Saved', 'Profile photo updated.');
    if (typeof currentView !== 'undefined' && currentView) renderView(currentView);
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message;
    showToast('error', 'Upload Failed', error.message);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Photo'; }
  }
}

function confirmRemoveProfilePhoto() {
  openModal('Remove Profile Photo?', '<p style="color:var(--text-2);line-height:1.6">Are you sure you want to remove your profile photo?</p>', [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Remove Photo', cls: 'btn-danger', action: () => { closeModal(); removeProfilePhoto(); } },
  ]);
}

async function removeProfilePhoto() {
  if (!currentUser) return;
  try {
    const response = await fetch(`/api/users/${encodeURIComponent(currentUser.id)}/photo`, {
      method: 'DELETE',
      headers: { 'X-User-Id': currentUser.id },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not remove photo.');
    syncUserPhotoInCache(currentUser.id, null);
    buildSidebar();
    showToast('success', 'Removed', 'Profile photo removed.');
    if (typeof currentView !== 'undefined' && currentView) renderView(currentView);
  } catch (error) {
    showToast('error', 'Failed', error.message);
  }
}


function confirmSaveAdminProfile() {
  const name = document.getElementById('s_name').value.trim() || currentUser.name;
  openConfirm('Save Profile', `Are you sure you want to update your profile to <strong>${name}</strong>?`, saveAdminProfile);
}

function saveAdminProfile() {
  currentUser.name = document.getElementById('s_name').value.trim() || currentUser.name;
  currentUser.email = document.getElementById('s_email').value.trim() || currentUser.email;
  db.save('users', currentUser);
  buildSidebar();
  showToast('success', 'Saved', 'Profile updated.');
}

function confirmChangeAdminPassword() {
  const curr = (document.getElementById('s_currpass')?.value || '').trim();
  const np = (document.getElementById('s_newpass')?.value || '').trim();
  const cp = (document.getElementById('s_confpass')?.value || '').trim();
  if (!curr || !np || !cp) { showToast('error', 'Empty Fields', 'Please fill in current, new, and confirm password fields.'); return; }
  if (np !== cp) { showToast('error', 'Mismatch', 'New passwords do not match.'); return; }
  if (np.length < 12) { showToast('error', 'Too Short', 'Password must be at least 12 characters.'); return; }
  openConfirm('Change Password', 'Are you sure you want to update your password?', changeAdminPassword);
}

async function changeAdminPassword() {
  const curr = (document.getElementById('s_currpass')?.value || '').trim();
  const np = (document.getElementById('s_newpass')?.value || '').trim();
  showLoading();
  try {
    await api.changePassword(curr, np);
    hideLoading();
    if (document.getElementById('s_currpass')) document.getElementById('s_currpass').value = '';
    if (document.getElementById('s_newpass')) document.getElementById('s_newpass').value = '';
    if (document.getElementById('s_confpass')) document.getElementById('s_confpass').value = '';
    showToast('success', 'Password Changed', 'Your password has been updated.');
  } catch (err) {
    hideLoading();
    showToast('error', 'Update Failed', err.message || 'Failed to update password.');
  }
}

function saveDuesRateSetting() {
  const rate = parseFloat(document.getElementById('duesRateInput').value);
  if (!Number.isFinite(rate) || rate <= 0) {
    showToast('error', 'Invalid Rate', 'Enter a valid amount per square meter.');
    return;
  }
  db.save('appSettings', { id: 'duesRatePerSqm', value: rate.toString() });
  showToast('success', 'Rate Saved', `Monthly dues rate set to PHP ${rate.toLocaleString()} per sqm.`);
}

function confirmResetData() {
  openModal('Reset All Data', '<p style="color:var(--red-600)"><strong>Warning:</strong> This will delete all data and re-seed the system. You will be logged out.</p>', [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Reset', cls: 'btn-danger', action: async () => {
      sessionStorage.removeItem('sah_session');
      localStorage.removeItem('sah_session');
      await api.reset();
      closeModal();
      performLogout();
      showToast('success', 'Reset', 'Data has been reset.');
    }},
  ]);
}



// ════════════════════════════════════════════════════════════

function renderHOProfile() {
  syncHomeownerBalances();
  const u = currentUser;
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header"><div class="page-header-left"><h2>My Profile</h2><p>View and update your personal information.</p></div></div>
  <div class="profile-card">
    ${profileAvatarEditableHTML(u)}
    <div class="profile-info"><h3>${u.name}</h3><p>${u.email}</p><p>${u.block||''} ${u.lot||''} · ${u.contact||'No contact'}</p></div>
  </div>
  <div class="settings-section">
    <div class="settings-section-header"><h4>Edit Profile</h4></div>
    <div class="settings-section-body">
      <div class="grid-2">
        <div class="form-group"><label>Full Name</label><input id="hp_name" value="${u.name}"/></div>
        <div class="form-group"><label>Email</label><input id="hp_email" value="${u.email}"/></div>
      </div>
      <div class="grid-2">
        <div class="form-group"><label>Contact</label><input id="hp_contact" value="${u.contact||''}"/></div>
        <div class="form-group"><label>Block / Lot</label><input id="hp_bloc" value="${(u.block||'')+' '+(u.lot||'')}"/></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="confirmSaveHOProfile()">Save Changes</button>
    </div>
  </div>
  <div class="settings-section">
    <div class="settings-section-header"><h4>Change Password</h4></div>
    <div class="settings-section-body">
      <div class="form-group" style="margin-bottom:12px;"><label>Current Password</label><input id="hp_currpass" type="password" placeholder="Enter current password..."/></div>
      <div class="grid-2">
        <div class="form-group"><label>New Password</label><input id="hp_newpass" type="password" placeholder="Min. 12 characters..."/></div>
        <div class="form-group"><label>Confirm</label><input id="hp_confpass" type="password" placeholder="Confirm new password..."/></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="confirmSaveHOPassword()">Update Password</button>
    </div>
  </div>`;
}

function confirmSaveHOProfile() {
  const name = document.getElementById('hp_name').value.trim() || currentUser.name;
  openConfirm('Save Profile', `Are you sure you want to save your profile changes for <strong>${name}</strong>?`, saveHOProfile);
}

function saveHOProfile() {
  currentUser.name = document.getElementById('hp_name').value.trim() || currentUser.name;
  currentUser.email = document.getElementById('hp_email').value.trim() || currentUser.email;
  currentUser.contact = document.getElementById('hp_contact').value.trim();
  db.save('users', currentUser);
  buildSidebar();
  showToast('success', 'Saved', 'Profile updated.');
}

function confirmSaveHOPassword() {
  const curr = (document.getElementById('hp_currpass')?.value || '').trim();
  const np = (document.getElementById('hp_newpass')?.value || '').trim();
  const cp = (document.getElementById('hp_confpass')?.value || '').trim();
  if (!curr || !np || !cp) { showToast('error', 'Empty', 'Please fill in current, new, and confirm password fields.'); return; }
  if (np !== cp) { showToast('error', 'Mismatch', 'New passwords do not match.'); return; }
  if (np.length < 12) { showToast('error', 'Too Short', 'Password must be at least 12 characters.'); return; }
  openConfirm('Change Password', 'Are you sure you want to update your password?', saveHOPassword);
}

async function saveHOPassword() {
  const curr = (document.getElementById('hp_currpass')?.value || '').trim();
  const np = (document.getElementById('hp_newpass')?.value || '').trim();
  showLoading();
  try {
    await api.changePassword(curr, np);
    hideLoading();
    if (document.getElementById('hp_currpass')) document.getElementById('hp_currpass').value = '';
    if (document.getElementById('hp_newpass')) document.getElementById('hp_newpass').value = '';
    if (document.getElementById('hp_confpass')) document.getElementById('hp_confpass').value = '';
    showToast('success', 'Updated', 'Your password has been updated.');
  } catch (err) {
    hideLoading();
    showToast('error', 'Update Failed', err.message || 'Failed to update password.');
  }
}

