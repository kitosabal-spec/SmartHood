// SECTION 11: ADMIN & COMMUNITY — ANNOUNCEMENTS

// Date & Relative Time Formatting Helpers
function formatCommunityDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    if (dateStr.length <= 10) {
      return `${month} ${day}, ${year}`;
    }
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${month} ${day}, ${year} at ${hours}:${minutes} ${ampm}`;
  } catch (e) {
    return String(dateStr);
  }
}

function formatPostTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400 && d.getDate() === now.getDate()) return `${Math.floor(diffSec / 3600)}h ago`;
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    if (diffSec < 86400 * 2 && d.getDate() === now.getDate() - 1) return `Yesterday at ${hours}:${minutes} ${ampm}`;
    return formatCommunityDate(isoStr);
  } catch (e) {
    return String(isoStr);
  }
}

// Extract array of images from announcement object
function getAnnouncementImages(a) {
  if (!a) return [];
  if (Array.isArray(a.images) && a.images.length) {
    return a.images;
  }
  if (typeof a.images === 'string') {
    try {
      const parsed = JSON.parse(a.images);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {}
  }
  if (a.image_path) {
    return [a.image_path];
  }
  return [];
}

// ── Facebook-Style Photo Collage Grid Generator ──
function renderPhotoGridHTML(announcementId, images, title) {
  if (!images || !images.length) return '';
  const count = images.length;
  const safeTitle = escapeHtml(title || 'Photo');

  if (count === 1) {
    return `
    <div class="community-photo-grid count-1" onclick="openAnnouncementLightbox('${announcementId}', 0)">
      <div class="photo-item">
        <img src="${escapeHtml(images[0])}" alt="${safeTitle}" loading="lazy" />
      </div>
    </div>`;
  }

  if (count === 2) {
    return `
    <div class="community-photo-grid count-2">
      ${images.map((img, i) => `
        <div class="photo-item" onclick="openAnnouncementLightbox('${announcementId}', ${i})">
          <img src="${escapeHtml(img)}" alt="${safeTitle} (${i+1})" loading="lazy" />
        </div>
      `).join('')}
    </div>`;
  }

  if (count === 3) {
    return `
    <div class="community-photo-grid count-3">
      ${images.map((img, i) => `
        <div class="photo-item" onclick="openAnnouncementLightbox('${announcementId}', ${i})">
          <img src="${escapeHtml(img)}" alt="${safeTitle} (${i+1})" loading="lazy" />
        </div>
      `).join('')}
    </div>`;
  }

  if (count === 4) {
    return `
    <div class="community-photo-grid count-4">
      ${images.map((img, i) => `
        <div class="photo-item" onclick="openAnnouncementLightbox('${announcementId}', ${i})">
          <img src="${escapeHtml(img)}" alt="${safeTitle} (${i+1})" loading="lazy" />
        </div>
      `).join('')}
    </div>`;
  }

  // 5 or more photos: 2x2 grid with +N overlay on 4th photo
  const visible = images.slice(0, 4);
  const remaining = count - 4;

  return `
  <div class="community-photo-grid count-more">
    ${visible.map((img, i) => {
      const isFourth = i === 3;
      return `
      <div class="photo-item" onclick="openAnnouncementLightbox('${announcementId}', ${i})">
        <img src="${escapeHtml(img)}" alt="${safeTitle} (${i+1})" loading="lazy" />
        ${isFourth ? `<div class="photo-more-overlay">+${remaining}</div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

// ── Interactive Lightbox Gallery ──
let currentLightboxData = {
  images: [],
  activeIndex: 0,
  title: '',
};

function openAnnouncementLightbox(announcementOrImages, initialIndex = 0, customTitle = '') {
  let images = [];
  let title = customTitle || 'Announcement Photo';

  if (Array.isArray(announcementOrImages)) {
    images = announcementOrImages;
  } else if (typeof announcementOrImages === 'string') {
    const a = db.getOne('announcements', announcementOrImages);
    if (a) {
      images = getAnnouncementImages(a);
      title = a.title || 'Announcement Photo';
    } else if (announcementOrImages.startsWith('/') || announcementOrImages.startsWith('http')) {
      images = [announcementOrImages];
    }
  }

  if (!images || !images.length) return;

  currentLightboxData = {
    images,
    activeIndex: Math.max(0, Math.min(initialIndex, images.length - 1)),
    title,
  };

  renderLightboxModal();
  document.removeEventListener('keydown', handleLightboxKeydown);
  document.addEventListener('keydown', handleLightboxKeydown);
}

function handleLightboxKeydown(e) {
  if (e.key === 'ArrowRight') {
    nextLightboxPhoto();
  } else if (e.key === 'ArrowLeft') {
    prevLightboxPhoto();
  } else if (e.key === 'Escape') {
    closeLightbox();
  }
}

function closeLightbox() {
  document.removeEventListener('keydown', handleLightboxKeydown);
  closeModal();
}

function nextLightboxPhoto() {
  const { images, activeIndex } = currentLightboxData;
  if (!images.length || images.length <= 1) return;
  currentLightboxData.activeIndex = (activeIndex + 1) % images.length;
  updateLightboxStage();
}

function prevLightboxPhoto() {
  const { images, activeIndex } = currentLightboxData;
  if (!images.length || images.length <= 1) return;
  currentLightboxData.activeIndex = (activeIndex - 1 + images.length) % images.length;
  updateLightboxStage();
}

function goToLightboxPhoto(index) {
  const { images } = currentLightboxData;
  if (index >= 0 && index < images.length) {
    currentLightboxData.activeIndex = index;
    updateLightboxStage();
  }
}

function updateLightboxStage() {
  const { images, activeIndex, title } = currentLightboxData;
  const imgEl = document.getElementById('lightboxMainImg');
  const counterEl = document.getElementById('lightboxCounter');
  if (imgEl) {
    imgEl.src = images[activeIndex];
    imgEl.alt = `${title} (${activeIndex + 1})`;
  }
  if (counterEl) {
    counterEl.textContent = `${activeIndex + 1} of ${images.length}`;
  }
  document.querySelectorAll('.lightbox-thumb-item').forEach((el, idx) => {
    el.classList.toggle('active', idx === activeIndex);
  });
}

function renderLightboxModal() {
  const { images, activeIndex, title } = currentLightboxData;
  const hasMultiple = images.length > 1;

  openModal(title, `
    <div class="lightbox-viewer">
      <div class="lightbox-main-stage">
        ${hasMultiple ? `
          <button type="button" class="lightbox-nav-btn prev" onclick="prevLightboxPhoto()" title="Previous Photo (Left Arrow)">&#8249;</button>
        ` : ''}
        <img id="lightboxMainImg" class="lightbox-main-img" src="${escapeHtml(images[activeIndex])}" alt="${escapeHtml(title)}" />
        ${hasMultiple ? `
          <button type="button" class="lightbox-nav-btn next" onclick="nextLightboxPhoto()" title="Next Photo (Right Arrow)">&#8250;</button>
        ` : ''}
      </div>
      <div class="lightbox-bottom-bar">
        <div style="font-weight:600;font-size:0.92rem;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%;">
          ${escapeHtml(title)}
        </div>
        ${hasMultiple ? `
          <span class="lightbox-counter" id="lightboxCounter">${activeIndex + 1} of ${images.length}</span>
        ` : ''}
      </div>
      ${hasMultiple ? `
        <div class="lightbox-thumb-strip">
          ${images.map((img, i) => `
            <div class="lightbox-thumb-item ${i === activeIndex ? 'active' : ''}" onclick="goToLightboxPhoto(${i})">
              <img src="${escapeHtml(img)}" alt="thumb ${i+1}" />
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `, [
    { label: 'Close', cls: 'btn-secondary', action: closeLightbox }
  ]);
}

// ════════════════════════════════════════════════════════════
// ── PHOTO CROPPER ENGINE (Freeform & Preset Ratios) ──
// ════════════════════════════════════════════════════════════
let activeCropper = {
  img: null,
  stage: null,
  box: null,
  sourceUrl: '',
  sourceName: 'photo.jpg',
  sourceMime: 'image/jpeg',
  rotation: 0,
  ratio: 'free', // 'free', '16:9', '4:3', '1:1', 'orig'
  origRatio: 1,
  boxCoords: { x: 0, y: 0, w: 100, h: 100 },
  stageSize: { w: 100, h: 100 },
  onApply: null,
  isEventsBound: false,
};

function openPhotoCropper(fileOrUrl, onApply, filename = 'photo.jpg') {
  let url = '';
  let mime = 'image/jpeg';
  let name = filename;

  if (fileOrUrl instanceof File || fileOrUrl instanceof Blob) {
    url = URL.createObjectURL(fileOrUrl);
    mime = fileOrUrl.type || 'image/jpeg';
    name = fileOrUrl.name || filename;
  } else if (typeof fileOrUrl === 'string') {
    url = fileOrUrl;
    if (url.endsWith('.png')) mime = 'image/png';
    else if (url.endsWith('.webp')) mime = 'image/webp';
  }

  if (!url) return;

  activeCropper.sourceUrl = url;
  activeCropper.sourceName = name;
  activeCropper.sourceMime = mime;
  activeCropper.rotation = 0;
  activeCropper.ratio = 'free';
  activeCropper.onApply = onApply;

  const overlay = document.getElementById('photoCropperOverlay');
  const targetImg = document.getElementById('cropperTargetImg');
  const stage = document.getElementById('cropperStage');
  const box = document.getElementById('cropperBox');

  if (!overlay || !targetImg || !stage || !box) return;

  activeCropper.img = targetImg;
  activeCropper.stage = stage;
  activeCropper.box = box;

  // Reset toolbar ratio active button
  document.querySelectorAll('.cropper-ratio-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ratio === 'free');
  });

  targetImg.style.transform = 'none';
  box.style.display = 'none';
  overlay.classList.remove('hidden');

  targetImg.onload = () => {
    initCropperBox();
  };
  targetImg.src = url;

  if (!activeCropper.isEventsBound) {
    bindCropperBoxEvents();
    activeCropper.isEventsBound = true;
  }
}

function initCropperBox() {
  const { img, stage, box } = activeCropper;
  if (!img || !stage || !box) return;

  const stageW = img.clientWidth || 300;
  const stageH = img.clientHeight || 200;
  activeCropper.stageSize = { w: stageW, h: stageH };
  activeCropper.origRatio = (img.naturalWidth && img.naturalHeight) ? (img.naturalWidth / img.naturalHeight) : (stageW / stageH);

  // Default box: 85% of stage, centered
  let w = Math.round(stageW * 0.85);
  let h = Math.round(stageH * 0.85);

  if (activeCropper.ratio !== 'free') {
    const targetRatio = getNumericRatio(activeCropper.ratio);
    if (w / h > targetRatio) {
      w = Math.round(h * targetRatio);
    } else {
      h = Math.round(w / targetRatio);
    }
  }

  const x = Math.round((stageW - w) / 2);
  const y = Math.round((stageH - h) / 2);

  activeCropper.boxCoords = { x, y, w, h };
  box.style.display = 'block';
  renderCropperBoxStyle();
}

function getNumericRatio(ratioStr) {
  if (ratioStr === '16:9') return 16 / 9;
  if (ratioStr === '4:3') return 4 / 3;
  if (ratioStr === '1:1') return 1;
  if (ratioStr === 'orig') return activeCropper.origRatio || 1;
  return null;
}

function renderCropperBoxStyle() {
  const { box, boxCoords } = activeCropper;
  if (!box) return;
  box.style.left = `${boxCoords.x}px`;
  box.style.top = `${boxCoords.y}px`;
  box.style.width = `${boxCoords.w}px`;
  box.style.height = `${boxCoords.h}px`;
}

function setCropperRatio(ratio) {
  activeCropper.ratio = ratio;
  document.querySelectorAll('.cropper-ratio-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ratio === ratio);
  });

  const { stageSize, boxCoords } = activeCropper;
  const targetRatio = getNumericRatio(ratio);

  if (!targetRatio) return; // 'free' maintains current box dimensions

  const cx = boxCoords.x + boxCoords.w / 2;
  const cy = boxCoords.y + boxCoords.h / 2;

  let newW = boxCoords.w;
  let newH = Math.round(newW / targetRatio);

  if (newH > stageSize.h) {
    newH = Math.round(stageSize.h * 0.85);
    newW = Math.round(newH * targetRatio);
  }
  if (newW > stageSize.w) {
    newW = Math.round(stageSize.w * 0.85);
    newH = Math.round(newW / targetRatio);
  }

  let newX = Math.round(cx - newW / 2);
  let newY = Math.round(cy - newH / 2);

  newX = Math.max(0, Math.min(stageSize.w - newW, newX));
  newY = Math.max(0, Math.min(stageSize.h - newH, newY));

  activeCropper.boxCoords = { x: newX, y: newY, w: newW, h: newH };
  renderCropperBoxStyle();
}

function resetCropperBox() {
  initCropperBox();
}

function rotateCropper(deg = 90) {
  activeCropper.rotation = (activeCropper.rotation + deg) % 360;
  const targetImg = activeCropper.img;
  if (targetImg) {
    targetImg.style.transform = `rotate(${activeCropper.rotation}deg)`;
  }
}

function closePhotoCropper() {
  const overlay = document.getElementById('photoCropperOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function bindCropperBoxEvents() {
  const box = document.getElementById('cropperBox');
  if (!box) return;

  let mode = null; // 'move' or 'resize'
  let activeHandle = null;
  let startX = 0;
  let startY = 0;
  let initial = { x: 0, y: 0, w: 0, h: 0 };

  box.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    startX = e.clientX;
    startY = e.clientY;
    initial = { ...activeCropper.boxCoords };

    if (e.target.dataset.handle) {
      mode = 'resize';
      activeHandle = e.target.dataset.handle;
    } else {
      mode = 'move';
      activeHandle = null;
    }

    try { box.setPointerCapture(e.pointerId); } catch (err) {}
  });

  box.addEventListener('pointermove', (e) => {
    if (!mode) return;
    e.preventDefault();

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const { stageSize, ratio } = activeCropper;
    const targetRatio = getNumericRatio(ratio);

    if (mode === 'move') {
      const maxX = stageSize.w - initial.w;
      const maxY = stageSize.h - initial.h;
      activeCropper.boxCoords.x = Math.max(0, Math.min(maxX, initial.x + dx));
      activeCropper.boxCoords.y = Math.max(0, Math.min(maxY, initial.y + dy));
      renderCropperBoxStyle();
      return;
    }

    if (mode === 'resize') {
      let x = initial.x;
      let y = initial.y;
      let w = initial.w;
      let h = initial.h;

      // Handle raw resizing
      if (activeHandle === 'br' || activeHandle === 'r') {
        w = initial.w + dx;
      }
      if (activeHandle === 'br' || activeHandle === 'b') {
        h = initial.h + dy;
      }
      if (activeHandle === 'tl' || activeHandle === 'l') {
        w = initial.w - dx;
        x = initial.x + dx;
      }
      if (activeHandle === 'tl' || activeHandle === 't') {
        h = initial.h - dy;
        y = initial.y + dy;
      }
      if (activeHandle === 'tr') {
        w = initial.w + dx;
        h = initial.h - dy;
        y = initial.y + dy;
      }
      if (activeHandle === 'bl') {
        w = initial.w - dx;
        x = initial.x + dx;
        h = initial.h + dy;
      }

      // Constrain aspect ratio if active
      if (targetRatio) {
        if (activeHandle === 'r' || activeHandle === 'l') {
          h = Math.round(w / targetRatio);
        } else if (activeHandle === 't' || activeHandle === 'b') {
          w = Math.round(h * targetRatio);
        } else {
          // Corners: pick dominant delta
          if (Math.abs(dx) > Math.abs(dy)) {
            h = Math.round(w / targetRatio);
            if (activeHandle.includes('t')) {
              y = initial.y + (initial.h - h);
            }
          } else {
            w = Math.round(h * targetRatio);
            if (activeHandle.includes('l')) {
              x = initial.x + (initial.w - w);
            }
          }
        }
      }

      // Min size threshold
      const MIN_SIZE = 40;
      if (w < MIN_SIZE) w = MIN_SIZE;
      if (h < MIN_SIZE) h = MIN_SIZE;

      // Clamp coordinates to stage boundaries
      if (x < 0) { w += x; x = 0; }
      if (y < 0) { h += y; y = 0; }
      if (x + w > stageSize.w) w = stageSize.w - x;
      if (y + h > stageSize.h) h = stageSize.h - y;

      activeCropper.boxCoords = { x, y, w, h };
      renderCropperBoxStyle();
    }
  });

  const stopPointer = () => { mode = null; activeHandle = null; };
  box.addEventListener('pointerup', stopPointer);
  box.addEventListener('pointercancel', stopPointer);
}

function applyPhotoCrop() {
  const { img, boxCoords, stageSize, sourceName, sourceMime, rotation, onApply } = activeCropper;
  if (!img || !img.naturalWidth || !img.naturalHeight) {
    showToast('error', 'Error', 'Could not read image dimensions.');
    return;
  }

  const scaleX = img.naturalWidth / stageSize.w;
  const scaleY = img.naturalHeight / stageSize.h;

  const cropX = Math.round(boxCoords.x * scaleX);
  const cropY = Math.round(boxCoords.y * scaleY);
  const cropW = Math.round(boxCoords.w * scaleX);
  const cropH = Math.round(boxCoords.h * scaleY);

  const canvas = document.createElement('canvas');
  const rot = (rotation % 360 + 360) % 360;

  if (rot === 90 || rot === 270) {
    canvas.width = cropH;
    canvas.height = cropW;
  } else {
    canvas.width = cropW;
    canvas.height = cropH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    showToast('error', 'Error', 'Canvas context unavailable.');
    return;
  }

  // Handle image rotation around center if specified
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);

  // Draw the cropped portion
  if (rot === 90 || rot === 270) {
    ctx.drawImage(img, cropX, cropY, cropW, cropH, -cropW / 2, -cropH / 2, cropW, cropH);
  } else {
    ctx.drawImage(img, cropX, cropY, cropW, cropH, -cropW / 2, -cropH / 2, cropW, cropH);
  }
  ctx.restore();

  const exportMime = (sourceMime === 'image/png') ? 'image/png' : 'image/jpeg';
  canvas.toBlob((blob) => {
    if (!blob) {
      showToast('error', 'Error', 'Could not generate cropped image.');
      return;
    }
    const cleanName = sourceName.replace(/\.[^/.]+$/, '') + '-cropped.jpg';
    const croppedFile = new File([blob], cleanName, { type: exportMime });

    if (typeof onApply === 'function') {
      onApply(croppedFile);
    }
    closePhotoCropper();
  }, exportMime, 0.92);
}

// ════════════════════════════════════════════════════════════
// ── Announcement Views & Feeds ──
// ════════════════════════════════════════════════════════════

function renderAnnouncements() {
  const area = document.getElementById('contentArea');
  if (!area) return;

  const adminName = currentUser ? escapeHtml(currentUser.name.split(' ')[0]) : 'Admin';

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <h2>Announcements</h2>
      <p>Post and manage community notices, announcements, and resident discussions.</p>
    </div>
    <div class="page-header-actions">
      <button class="btn btn-primary" onclick="openAddAnnouncementModal()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px;vertical-align:-2px"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        New Announcement
      </button>
    </div>
  </div>

  <div class="community-feed-container">
    <!-- Facebook-Style Post Composer Prompt Card -->
    <div class="post-composer-card">
      <div class="post-composer-top">
        ${avatarHTML(currentUser, 'avatar-md')}
        <div class="post-composer-placeholder" onclick="openAddAnnouncementModal()">
          Write an announcement or community update, ${adminName}...
        </div>
      </div>
      <div class="post-composer-actions">
        <button type="button" class="post-composer-action-btn" onclick="openAddAnnouncementModal(true)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--green-600)"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span>Photos / Images</span>
        </button>
        <button type="button" class="post-composer-action-btn" onclick="openAddAnnouncementModal()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--teal-600)"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <span>Create Notice</span>
        </button>
      </div>
    </div>

    <!-- Feed Container -->
    <div id="announcementsList"></div>
  </div>`;

  renderAnnouncementCards();
}

function renderAnnouncementCards() {
  const list = document.getElementById('announcementsList');
  if (!list) return;

  const announcements = [...db.get('announcements')].reverse();
  if (!announcements.length) {
    list.innerHTML = `<div class="no-results" style="padding:40px 20px;"><svg style="width:2.5rem;height:2.5rem;color:var(--text-3);margin-bottom:10px;"><use href="#ico-megaphone"/></svg><br><strong>No announcements posted yet.</strong><p style="color:var(--text-3);font-size:0.85rem;margin-top:4px;">Click the composer above or "New Announcement" to publish your first post.</p></div>`;
    return;
  }

  const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin');
  list.innerHTML = announcements.map(a => communityPostCardHTML(a, isAdmin)).join('');

  // Automatically fetch & render MySQL comments for each announcement
  announcements.forEach(a => {
    loadAndRenderComments(a.id);
  });
}

function communityPostCardHTML(a, isAdmin) {
  const author = db.getOne('users', a.user_id || a.createdBy) || { name: 'Administrator', role: 'admin' };
  const catColors = { Maintenance: '#2271c3', Emergency: '#dc2626', Events: '#16a34a', Security: '#d97706', General: '#177a80' };
  const accentColor = catColors[a.category] || '#177a80';
  const displayDate = formatCommunityDate(a.created_at || a.date);
  const images = getAnnouncementImages(a);

  return `
  <div class="community-post-card" id="announcement-card-${a.id}">
    <div class="community-post-header">
      <div class="community-post-author-row">
        ${avatarHTML(author, 'avatar-md')}
        <div class="community-post-author-info">
          <div class="community-post-author-name">
            <span>${escapeHtml(author.name)}</span>
            <span class="badge-admin-official">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Admin
            </span>
          </div>
          <div class="community-post-meta">
            <span>${displayDate}</span>
            <span class="community-post-meta-dot">&bull;</span>
            <span class="badge" style="background:${accentColor}18;color:${accentColor};font-weight:700;padding:2px 8px;border-radius:10px;font-size:0.72rem;">${escapeHtml(a.category || 'General')}</span>
            ${a.urgent ? '<span class="badge badge-red" style="font-weight:700;padding:2px 8px;border-radius:10px;font-size:0.72rem;">Urgent</span>' : ''}
          </div>
        </div>
      </div>
      ${isAdmin ? `
        <div class="community-post-actions-top">
          <button type="button" class="btn-post-action" onclick="openEditAnnouncementModal('${a.id}')" title="Edit Announcement">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="btn-post-action danger" onclick="confirmDeleteAnnouncement('${a.id}')" title="Delete Announcement">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      ` : ''}
    </div>

    <div class="community-post-content">
      <div class="community-post-title">${escapeHtml(a.title)}</div>
      <div class="community-post-text">${escapeHtml(a.content || a.description || '')}</div>
    </div>

    ${renderPhotoGridHTML(a.id, images, a.title)}

    <div class="community-post-stats">
      <span id="comm-count-${a.id}">💬 0 comments</span>
      ${images.length > 1 ? `<span style="color:var(--text-3);font-size:0.8rem;font-weight:600;">📷 ${images.length} photos</span>` : ''}
    </div>

    <div class="community-post-action-bar">
      <button type="button" class="community-post-action-btn" onclick="focusCommentInput('${a.id}')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>Comment</span>
      </button>
    </div>

    <div class="community-comments-section">
      <div class="comment-composer-wrap">
        ${avatarHTML(currentUser, 'avatar-xs')}
        <div class="comment-composer-input-box">
          <input type="text" id="comment-input-${a.id}" class="comment-composer-input" placeholder="Write a comment as ${escapeHtml(currentUser.name)}..." onkeydown="handleCommentKeydown(event, '${a.id}')" />
          <button type="button" class="comment-composer-submit-btn" onclick="submitNewComment('${a.id}')" title="Post Comment">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
      <div class="community-comments-list" id="comments-list-${a.id}">
        <div style="font-size:0.8rem;color:var(--text-3);padding:6px 0;">Loading comments...</div>
      </div>
    </div>
  </div>`;
}

function focusCommentInput(announcementId) {
  const input = document.getElementById(`comment-input-${announcementId}`);
  if (input) {
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function handleCommentKeydown(event, announcementId) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitNewComment(announcementId);
  }
}

// ── MySQL Comments Handlers ──

async function loadAndRenderComments(announcementId) {
  const container = document.getElementById(`comments-list-${announcementId}`);
  try {
    const comments = await api.getComments(announcementId);
    announcementCommentsCache[announcementId] = comments || [];
    renderCommentsIntoContainer(announcementId);
  } catch (err) {
    if (container) {
      container.innerHTML = `<div style="font-size:0.8rem;color:var(--text-3);padding:4px 0;">Could not load comments.</div>`;
    }
  }
}

function renderCommentsIntoContainer(announcementId) {
  const container = document.getElementById(`comments-list-${announcementId}`);
  const countEl = document.getElementById(`comm-count-${announcementId}`);
  const comments = announcementCommentsCache[announcementId] || [];

  if (countEl) {
    countEl.textContent = comments.length === 0
      ? 'No comments yet'
      : (comments.length === 1 ? '💬 1 comment' : `💬 ${comments.length} comments`);
  }

  if (!container) return;

  if (!comments.length) {
    container.innerHTML = `<div class="empty-comments-note" style="font-size:0.82rem;color:var(--text-3);font-style:italic;padding:4px 0;">No comments yet. Be the first to comment!</div>`;
    return;
  }

  container.innerHTML = comments.map(c => renderSingleCommentHTML(announcementId, c)).join('');
}

function renderSingleCommentHTML(announcementId, c) {
  const authorObj = {
    name: c.author_name || 'Resident',
    role: c.author_role || 'homeowner',
    profile_photo: c.author_photo || null,
  };
  const currentUserId = currentUser ? (currentUser.id || currentUser.user_id) : null;
  const isAuthor = currentUserId && (String(c.user_id) === String(currentUserId));
  const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin');

  return `
  <div class="comment-item" id="comment-item-${c.id}">
    ${avatarHTML(authorObj, 'avatar-xs')}
    <div class="comment-bubble-container">
      <div class="comment-bubble" id="comment-bubble-${c.id}">
        <div class="comment-author-row">
          <span class="comment-author-name">${escapeHtml(authorObj.name)}</span>
          ${c.author_role === 'admin' ? '<span class="comment-role-badge">Admin</span>' : ''}
        </div>
        <div class="comment-text" id="comment-text-${c.id}">${escapeHtml(c.comment)}</div>
      </div>
      <div class="comment-meta-row">
        <span>${formatPostTime(c.created_at)}</span>
        ${c.updated_at && c.updated_at !== c.created_at ? '<span style="font-size:0.7rem;color:var(--text-3);">(edited)</span>' : ''}
        ${isAuthor ? `<button type="button" class="comment-action-link" onclick="startEditComment('${announcementId}', '${c.id}')">Edit</button>` : ''}
        ${(isAuthor || isAdmin) ? `<button type="button" class="comment-action-link danger" onclick="confirmDeleteComment('${announcementId}', '${c.id}')">Delete</button>` : ''}
      </div>
    </div>
  </div>`;
}

async function submitNewComment(announcementId) {
  const input = document.getElementById(`comment-input-${announcementId}`);
  if (!input) return;
  const commentText = input.value.trim();
  if (!commentText) return;

  input.disabled = true;
  try {
    const created = await api.addComment(announcementId, commentText);
    input.value = '';
    if (!announcementCommentsCache[announcementId]) {
      announcementCommentsCache[announcementId] = [];
    }
    announcementCommentsCache[announcementId].push(created);
    renderCommentsIntoContainer(announcementId);
    showToast('success', 'Comment Posted', 'Your comment has been saved.');
  } catch (err) {
    showToast('error', 'Failed', err.message || 'Could not post comment.');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function startEditComment(announcementId, commentId) {
  const comments = announcementCommentsCache[announcementId] || [];
  const c = comments.find(x => x.id === commentId);
  if (!c) return;

  const bubble = document.getElementById(`comment-bubble-${commentId}`);
  if (!bubble) return;

  bubble.innerHTML = `
    <div class="comment-edit-form">
      <textarea id="edit-comment-input-${commentId}" class="comment-edit-textarea" rows="2">${escapeHtml(c.comment)}</textarea>
      <div class="comment-edit-actions">
        <button type="button" class="btn btn-primary btn-xs" onclick="saveEditComment('${announcementId}', '${commentId}')">Save</button>
        <button type="button" class="btn btn-secondary btn-xs" onclick="cancelEditComment('${announcementId}', '${commentId}')">Cancel</button>
      </div>
    </div>
  `;
  const textarea = document.getElementById(`edit-comment-input-${commentId}`);
  if (textarea) {
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveEditComment(announcementId, commentId);
      } else if (e.key === 'Escape') {
        cancelEditComment(announcementId, commentId);
      }
    });
  }
}

function cancelEditComment(announcementId, commentId) {
  renderCommentsIntoContainer(announcementId);
}

async function saveEditComment(announcementId, commentId) {
  const input = document.getElementById(`edit-comment-input-${commentId}`);
  if (!input) return;
  const newText = input.value.trim();
  if (!newText) {
    showToast('error', 'Empty Comment', 'Comment cannot be empty.');
    return;
  }

  input.disabled = true;
  try {
    const updated = await api.updateComment(announcementId, commentId, newText);
    const comments = announcementCommentsCache[announcementId] || [];
    const idx = comments.findIndex(x => x.id === commentId);
    if (idx >= 0) {
      comments[idx] = updated;
    }
    renderCommentsIntoContainer(announcementId);
    showToast('success', 'Comment Updated', 'Your comment changes have been saved.');
  } catch (err) {
    showToast('error', 'Failed', err.message || 'Could not update comment.');
    input.disabled = false;
  }
}

function confirmDeleteComment(announcementId, commentId) {
  openModal('Delete Comment?', `
    <p style="color:var(--text-2);line-height:1.6">Are you sure you want to delete this comment?</p>
    <p style="color:var(--text-3);font-size:0.82rem;margin-top:6px;">This action cannot be undone.</p>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    {
      label: 'Delete Comment',
      cls: 'btn-danger',
      action: async () => {
        closeModal();
        try {
          await api.deleteComment(announcementId, commentId);
          if (announcementCommentsCache[announcementId]) {
            announcementCommentsCache[announcementId] = announcementCommentsCache[announcementId].filter(x => x.id !== commentId);
          }
          renderCommentsIntoContainer(announcementId);
          showToast('success', 'Comment Deleted', 'The comment has been removed.');
        } catch (err) {
          showToast('error', 'Failed', err.message || 'Could not delete comment.');
        }
      }
    }
  ]);
}

// ════════════════════════════════════════════════════════════
// ── Admin Announcement Modals (Multi-Photo & Cropping) ──
// ════════════════════════════════════════════════════════════

let selectedAnnouncementFiles = [];

function openAddAnnouncementModal(triggerPhoto = false) {
  selectedAnnouncementFiles = [];
  openModal('New Announcement', `
    <div class="form-group">
      <label>Title *</label>
      <input id="af_title" placeholder="Announcement title..."/>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Category</label>
        <select id="af_cat">
          <option>General</option>
          <option>Maintenance</option>
          <option>Emergency</option>
          <option>Events</option>
          <option>Security</option>
        </select>
      </div>
      <div class="form-group">
        <label>Date</label>
        <input id="af_date" type="date" value="${getLocalDateValue()}"/>
      </div>
    </div>
    <div class="form-group">
      <label>Content / Details *</label>
      <textarea id="af_content" placeholder="Write announcement details..." style="min-height:110px"></textarea>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <input type="checkbox" id="af_urgent">
      <label for="af_urgent" style="font-size:0.88rem;cursor:pointer;color:var(--text-2);font-weight:600">Mark as Urgent</label>
    </div>
    <div class="form-group">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <label style="margin-bottom:0;">Photos / Images (Optional, up to 10 photos, max 5MB each)</label>
        <span id="af_photos_count_badge" class="photo-count-badge hidden">0 photos</span>
      </div>

      <input type="file" id="af_images_input" accept="image/jpeg,image/png,image/webp" multiple style="display:none" onchange="handleAnnouncementImagesSelect(event)" />
      
      <div class="image-upload-dropzone" onclick="document.getElementById('af_images_input').click()">
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;color:var(--teal-600);font-weight:600;font-size:0.88rem">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span id="af_images_dropzone_label">Click to select photos (JPG, PNG, WebP)</span>
        </div>
      </div>

      <div id="af_images_preview_wrap" class="multi-photo-preview-grid hidden"></div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Post Announcement', cls: 'btn-primary', action: saveAnnouncement },
  ]);

  if (triggerPhoto) {
    setTimeout(() => {
      const fileInput = document.getElementById('af_images_input');
      if (fileInput) fileInput.click();
    }, 150);
  }
}

function handleAnnouncementImagesSelect(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  const startIndex = selectedAnnouncementFiles.length;

  for (const f of files) {
    if (selectedAnnouncementFiles.length >= 10) {
      showToast('error', 'Limit Reached', 'You can upload up to 10 photos per announcement.');
      break;
    }
    if (f.size > 5 * 1024 * 1024) {
      showToast('error', 'File Too Large', `"${f.name}" exceeds 5 MB.`);
      continue;
    }
    if (!allowed.includes(f.type)) {
      showToast('error', 'Invalid File Type', `"${f.name}" is not a JPG, PNG, or WebP image.`);
      continue;
    }
    selectedAnnouncementFiles.push(f);
  }

  event.target.value = '';
  renderSelectedAnnouncementImagesPreviews();

  // If user selected exactly 1 photo, automatically open the cropper for convenient editing
  if (files.length === 1 && selectedAnnouncementFiles.length > startIndex) {
    openCropperForSelectedFile(startIndex);
  }
}

function openCropperForSelectedFile(index) {
  if (index < 0 || index >= selectedAnnouncementFiles.length) return;
  const file = selectedAnnouncementFiles[index];
  openPhotoCropper(file, (croppedFile) => {
    selectedAnnouncementFiles[index] = croppedFile;
    renderSelectedAnnouncementImagesPreviews();
    showToast('success', 'Photo Cropped', 'Crop applied successfully.');
  }, file.name);
}

function removeSelectedAnnouncementFile(index) {
  if (index >= 0 && index < selectedAnnouncementFiles.length) {
    selectedAnnouncementFiles.splice(index, 1);
    renderSelectedAnnouncementImagesPreviews();
  }
}

function renderSelectedAnnouncementImagesPreviews() {
  const wrap = document.getElementById('af_images_preview_wrap');
  const badge = document.getElementById('af_photos_count_badge');
  const label = document.getElementById('af_images_dropzone_label');
  if (!wrap) return;

  if (!selectedAnnouncementFiles.length) {
    wrap.innerHTML = '';
    wrap.classList.add('hidden');
    if (badge) badge.classList.add('hidden');
    if (label) label.textContent = 'Click to select photos (JPG, PNG, WebP)';
    return;
  }

  wrap.classList.remove('hidden');
  if (badge) {
    badge.textContent = `📷 ${selectedAnnouncementFiles.length} photo${selectedAnnouncementFiles.length > 1 ? 's' : ''}`;
    badge.classList.remove('hidden');
  }
  if (label) {
    label.textContent = selectedAnnouncementFiles.length >= 10 ? 'Maximum 10 photos selected' : 'Add more photos (JPG, PNG, WebP)';
  }

  wrap.innerHTML = selectedAnnouncementFiles.map((f, idx) => {
    const url = URL.createObjectURL(f);
    return `
    <div class="multi-photo-thumb-wrap" title="${escapeHtml(f.name)}" onclick="openCropperForSelectedFile(${idx})">
      <img src="${url}" alt="Preview ${idx + 1}" />
      <button type="button" class="multi-photo-thumb-remove" onclick="event.stopPropagation(); removeSelectedAnnouncementFile(${idx})" title="Remove photo">&times;</button>
    </div>`;
  }).join('');
}

async function saveAnnouncement() {
  const title = (document.getElementById('af_title').value || '').trim();
  const content = (document.getElementById('af_content').value || '').trim();
  const category = document.getElementById('af_cat').value;
  const date = document.getElementById('af_date').value;
  const urgent = document.getElementById('af_urgent').checked;

  if (!title || !content) {
    showToast('error', 'Missing Fields', 'Title and content are required.');
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('content', content);
  formData.append('category', category);
  formData.append('date', date);
  formData.append('urgent', urgent ? 'true' : 'false');
  
  for (const f of selectedAnnouncementFiles) {
    formData.append('images', f);
  }

  showLoading();
  try {
    const created = await api.createAnnouncement(formData);
    const announcements = db.get('announcements');
    announcements.unshift(created);
    dbCache.announcements = announcements;

    logAction(`Posted announcement: "${title}"`);
    addNotification('New Announcement', title, { audience: 'all' });
    closeModal();
    hideLoading();
    showToast('success', 'Posted', 'Announcement published to community feed.');
    renderAnnouncements();
  } catch (err) {
    hideLoading();
    showToast('error', 'Failed', err.message || 'Could not publish announcement.');
  }
}

let editExistingImages = [];
let editNewFiles = [];

function openEditAnnouncementModal(id) {
  const a = db.getOne('announcements', id);
  if (!a) return;

  editExistingImages = [...getAnnouncementImages(a)];
  editNewFiles = [];

  openModal('Edit Announcement', `
    <div class="form-group">
      <label>Title *</label>
      <input id="edit_af_title" value="${escapeHtml(a.title)}" placeholder="Announcement title..."/>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Category</label>
        <select id="edit_af_cat">
          <option ${a.category === 'General' ? 'selected' : ''}>General</option>
          <option ${a.category === 'Maintenance' ? 'selected' : ''}>Maintenance</option>
          <option ${a.category === 'Emergency' ? 'selected' : ''}>Emergency</option>
          <option ${a.category === 'Events' ? 'selected' : ''}>Events</option>
          <option ${a.category === 'Security' ? 'selected' : ''}>Security</option>
        </select>
      </div>
      <div class="form-group">
        <label>Date</label>
        <input id="edit_af_date" type="date" value="${a.date || getLocalDateValue()}"/>
      </div>
    </div>
    <div class="form-group">
      <label>Content / Details *</label>
      <textarea id="edit_af_content" style="min-height:110px">${escapeHtml(a.content || a.description || '')}</textarea>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <input type="checkbox" id="edit_af_urgent" ${a.urgent ? 'checked' : ''}>
      <label for="edit_af_urgent" style="font-size:0.88rem;cursor:pointer;color:var(--text-2);font-weight:600">Mark as Urgent</label>
    </div>
    <div class="form-group">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <label style="margin-bottom:0;">Photos / Images (Optional, up to 10 photos)</label>
        <span id="edit_photos_count_badge" class="photo-count-badge">0 photos</span>
      </div>
      
      <div id="edit_photos_container" class="multi-photo-preview-grid" style="margin-bottom:10px;"></div>

      <input type="file" id="edit_af_images_input" accept="image/jpeg,image/png,image/webp" multiple style="display:none" onchange="handleEditImagesSelect(event)" />
      
      <div class="image-upload-dropzone" onclick="document.getElementById('edit_af_images_input').click()">
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;color:var(--teal-600);font-weight:600;font-size:0.88rem">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span id="edit_af_images_label">Add more photos (JPG, PNG, WebP)</span>
        </div>
      </div>
    </div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Save Changes', cls: 'btn-primary', action: () => updateAnnouncement(id) },
  ]);

  renderEditPhotosPreviews();
}

function handleEditImagesSelect(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  const startIdx = editNewFiles.length;

  for (const f of files) {
    if (editExistingImages.length + editNewFiles.length >= 10) {
      showToast('error', 'Limit Reached', 'You can have up to 10 photos per announcement.');
      break;
    }
    if (f.size > 5 * 1024 * 1024) {
      showToast('error', 'File Too Large', `"${f.name}" exceeds 5 MB.`);
      continue;
    }
    if (!allowed.includes(f.type)) {
      showToast('error', 'Invalid File Type', `"${f.name}" is not a JPG, PNG, or WebP image.`);
      continue;
    }
    editNewFiles.push(f);
  }

  event.target.value = '';
  renderEditPhotosPreviews();

  if (files.length === 1 && editNewFiles.length > startIdx) {
    openCropperForEditNewFile(startIdx);
  }
}

function openCropperForEditNewFile(index) {
  if (index < 0 || index >= editNewFiles.length) return;
  const file = editNewFiles[index];
  openPhotoCropper(file, (croppedFile) => {
    editNewFiles[index] = croppedFile;
    renderEditPhotosPreviews();
    showToast('success', 'Photo Cropped', 'Crop applied successfully.');
  }, file.name);
}

function openCropperForExistingImage(index) {
  if (index < 0 || index >= editExistingImages.length) return;
  const imgUrl = editExistingImages[index];
  openPhotoCropper(imgUrl, (croppedFile) => {
    // Remove the old server path and add the new cropped file to editNewFiles
    editExistingImages.splice(index, 1);
    editNewFiles.push(croppedFile);
    renderEditPhotosPreviews();
    showToast('success', 'Photo Cropped', 'Crop applied. Save changes to update post.');
  }, `photo-${index + 1}.jpg`);
}

function removeEditExistingImage(index) {
  if (index >= 0 && index < editExistingImages.length) {
    editExistingImages.splice(index, 1);
    renderEditPhotosPreviews();
  }
}

function removeEditNewFile(index) {
  if (index >= 0 && index < editNewFiles.length) {
    editNewFiles.splice(index, 1);
    renderEditPhotosPreviews();
  }
}

function renderEditPhotosPreviews() {
  const container = document.getElementById('edit_photos_container');
  const badge = document.getElementById('edit_photos_count_badge');
  const label = document.getElementById('edit_af_images_label');
  if (!container) return;

  const total = editExistingImages.length + editNewFiles.length;
  if (badge) {
    badge.textContent = `📷 ${total} photo${total === 1 ? '' : 's'}`;
  }
  if (label) {
    label.textContent = total >= 10 ? 'Maximum 10 photos reached' : 'Add more photos (JPG, PNG, WebP)';
  }

  let html = '';
  // Existing photos
  editExistingImages.forEach((img, idx) => {
    html += `
    <div class="multi-photo-thumb-wrap" title="Click to crop photo ${idx + 1}" onclick="openCropperForExistingImage(${idx})">
      <img src="${escapeHtml(img)}" alt="Existing ${idx + 1}" />
      <button type="button" class="multi-photo-thumb-remove" onclick="event.stopPropagation(); removeEditExistingImage(${idx})" title="Remove this photo">&times;</button>
    </div>`;
  });

  // Newly selected photos
  editNewFiles.forEach((f, idx) => {
    const url = URL.createObjectURL(f);
    html += `
    <div class="multi-photo-thumb-wrap" title="Click to crop: ${escapeHtml(f.name)}" onclick="openCropperForEditNewFile(${idx})" style="border-color:var(--teal-500);">
      <img src="${url}" alt="New ${idx + 1}" />
      <button type="button" class="multi-photo-thumb-remove" onclick="event.stopPropagation(); removeEditNewFile(${idx})" title="Cancel this photo">&times;</button>
    </div>`;
  });

  container.innerHTML = html || '<div style="font-size:0.82rem;color:var(--text-3);padding:6px 0;">No photos currently attached.</div>';
}

async function updateAnnouncement(id) {
  const title = (document.getElementById('edit_af_title').value || '').trim();
  const content = (document.getElementById('edit_af_content').value || '').trim();
  const category = document.getElementById('edit_af_cat').value;
  const date = document.getElementById('edit_af_date').value;
  const urgent = document.getElementById('edit_af_urgent').checked;

  if (!title || !content) {
    showToast('error', 'Missing Fields', 'Title and content are required.');
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('content', content);
  formData.append('category', category);
  formData.append('date', date);
  formData.append('urgent', urgent ? 'true' : 'false');
  
  formData.append('existing_images', JSON.stringify(editExistingImages));
  if (editExistingImages.length === 0 && editNewFiles.length === 0) {
    formData.append('remove_all_images', 'true');
  }

  for (const f of editNewFiles) {
    formData.append('images', f);
  }

  showLoading();
  try {
    const updated = await api.updateAnnouncement(id, formData);
    const announcements = db.get('announcements');
    const idx = announcements.findIndex(x => x.id === id);
    if (idx >= 0) announcements[idx] = updated;
    dbCache.announcements = announcements;

    logAction(`Updated announcement: "${title}"`);
    closeModal();
    hideLoading();
    showToast('success', 'Updated', 'Announcement changes saved.');
    renderAnnouncements();
  } catch (err) {
    hideLoading();
    showToast('error', 'Failed', err.message || 'Could not update announcement.');
  }
}

function confirmDeleteAnnouncement(id) {
  const a = db.getOne('announcements', id);
  if (!a) return;

  openModal('Delete Announcement', `
    <p style="color:var(--text-2);line-height:1.6">Are you sure you want to delete "<strong>${escapeHtml(a.title)}</strong>"?</p>
    <p style="color:var(--text-3);font-size:0.82rem;margin-top:8px;">This will permanently remove the announcement, all its attached photos, and all resident comments.</p>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    {
      label: 'Delete Announcement',
      cls: 'btn-danger',
      action: async () => {
        showLoading();
        try {
          await api.deleteAnnouncement(id);
          dbCache.announcements = db.get('announcements').filter(x => x.id !== id);
          delete announcementCommentsCache[id];
          logAction(`Deleted announcement: "${a.title}"`);
          closeModal();
          hideLoading();
          showToast('success', 'Deleted', 'Announcement removed from community feed.');
          renderAnnouncements();
        } catch (err) {
          hideLoading();
          showToast('error', 'Failed', err.message || 'Could not delete announcement.');
        }
      }
    },
  ]);
}



function renderHOAnnouncements() {
  const area = document.getElementById('contentArea');
  if (!area) return;

  const announcements = [...db.get('announcements')].reverse();

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left">
      <h2>Announcements</h2>
      <p>Latest official notices, announcements, and community discussions from San Alfonso Homes.</p>
    </div>
  </div>

  <div class="community-feed-container">
    <div id="hoAnnouncementsList">
      ${!announcements.length ? `
        <div class="no-results" style="padding:40px 20px;">
          <svg style="width:2.5rem;height:2.5rem;color:var(--text-3);margin-bottom:10px;"><use href="#ico-megaphone"/></svg>
          <br><strong>No community announcements at this time.</strong>
        </div>
      ` : announcements.map(a => communityPostCardHTML(a, false)).join('')}
    </div>
  </div>`;

  // Fetch and render MySQL comments for residents
  announcements.forEach(a => {
    loadAndRenderComments(a.id);
  });
}


function renderPublicAnnouncements() {
  const grid = document.getElementById('pubAnnGrid');
  if (!grid) return;
  const announcements = db.get('announcements').slice(-6).reverse();
  const catColors = { Maintenance: '#2271c3', Emergency: '#dc2626', Events: '#16a34a', Security: '#d97706', General: '#177a80' };
  if (!announcements.length) {
    grid.innerHTML = `<div class="no-results" style="grid-column:1/-1"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-megaphone"/></svg>No announcements at this time.</div>`;
    return;
  }
  grid.innerHTML = announcements.map(a => {
    const accentColor = catColors[a.category] || '#177a80';
    const images = getAnnouncementImages(a);
    const hasImages = images.length > 0;
    return `
    <div class="pub-ann-card" style="--ann-color:${accentColor}">
      <div class="pub-ann-card-top">
        <div class="pub-ann-card-title">${escapeHtml(a.title)}</div>
        <div style="flex-shrink:0">${a.urgent ? '<span class="badge badge-red">Urgent</span>' : ''}</div>
      </div>
      ${hasImages ? `
        <div style="position:relative;width:100%;height:150px;overflow:hidden;border-radius:6px;margin:10px 0;cursor:pointer;" onclick="openAnnouncementLightbox('${a.id}', 0)">
          <img src="${escapeHtml(images[0])}" alt="${escapeHtml(a.title)}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy" />
          ${images.length > 1 ? `
            <div style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,0.7);color:#fff;font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:10px;">
              📷 ${images.length} photos
            </div>
          ` : ''}
        </div>
      ` : ''}
      <div class="pub-ann-card-body">${escapeHtml(a.content || a.description || '')}</div>
      <div class="pub-ann-card-meta">
        <span>${formatCommunityDate(a.created_at || a.date)}</span>
        <span class="badge" style="background:${accentColor}18;color:${accentColor};font-weight:700;">${escapeHtml(a.category || 'General')}</span>
      </div>
    </div>`;
  }).join('');
}
