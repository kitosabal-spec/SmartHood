// SECTION 9B: VEHICLE REGISTRATION


function normalizeStickerNumber(value) {
  return (value || '').trim().toUpperCase();
}

function getVehicleRegistrationFee(registrantType) {
  return registrantType === 'nonHomeowner'
    ? VEHICLE_REGISTRATION_FEES.nonHomeowner
    : VEHICLE_REGISTRATION_FEES.homeowner;
}

function formatPeso(value) {
  return `₱${toMoneyNumber(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function vehicleRegistrationStatusBadge(status) {
  const map = {
    Pending: '<span class="badge badge-yellow">Pending</span>',
    Approved: '<span class="badge badge-green">Approved</span>',
    Rejected: '<span class="badge badge-red">Rejected</span>',
    Expired: '<span class="badge badge-gray">Expired</span>',
  };
  return map[status] || `<span class="badge badge-gray">${status || 'Unknown'}</span>`;
}

function vehiclePaymentStatusBadge(status) {
  return status === 'Paid'
    ? '<span class="badge badge-green">Paid</span>'
    : '<span class="badge badge-red">Unpaid</span>';
}

function getVehicleLocation(vehicle) {
  return [vehicle.block, vehicle.lot].filter(Boolean).join(' ') || 'N/A';
}

function isVehicleStickerTaken(stickerNumber, currentId = null) {
  const normalized = normalizeStickerNumber(stickerNumber);
  if (!normalized) return false;
  return db.get('vehicleRegistrations').some(vehicle =>
    vehicle.id !== currentId &&
    normalizeStickerNumber(vehicle.stickerNumber) === normalized
  );
}

function updateVehicleFeePreview() {
  const type = document.getElementById('vr_registrantType')?.value || 'homeowner';
  const fee = getVehicleRegistrationFee(type);
  const feeEl = document.getElementById('vr_feePreview');
  if (feeEl) feeEl.textContent = formatPeso(fee);
}

function renderHOVehicles() {
  const vehicles = db.get('vehicleRegistrations')
    .filter(vehicle => vehicle.homeownerId === currentUser.id)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>My Vehicles</h2><p>Register vehicles and track sticker release status.</p></div>
    <div class="page-header-actions">
      <button class="btn btn-primary" onclick="openVehicleRegistrationModal()"><svg class="btn-ico"><use href="#ico-plus"/></svg> Register Vehicle</button>
    </div>
  </div>
  <div class="section-card">
    <div class="section-card-body no-pad">
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Vehicle</th><th>Owner</th><th>Fee</th><th>Payment</th><th>Sticker</th><th>Status</th><th>Remarks</th></tr></thead>
        <tbody>
          ${vehicles.map(vehicle => `
            <tr>
              <td><strong>${vehicle.plateNumber}</strong><br><span style="font-size:0.78rem;color:var(--text-3)">${vehicle.vehicleType}</span></td>
              <td>${vehicle.ownerName}<br><span style="font-size:0.78rem;color:var(--text-3)">${getVehicleLocation(vehicle)}</span></td>
              <td>${formatPeso(vehicle.fee)}</td>
              <td>${vehiclePaymentStatusBadge(vehicle.paymentStatus)}</td>
              <td>${vehicle.stickerNumber ? `<strong>${vehicle.stickerNumber}</strong>${vehicle.releasedAt ? `<br><span style="font-size:0.75rem;color:var(--green-600)">Released ${vehicle.releasedAt}</span>` : ''}` : '<span style="color:var(--text-3)">Not assigned</span>'}</td>
              <td>${vehicleRegistrationStatusBadge(vehicle.registrationStatus)}</td>
              <td>${vehicle.remarks || '<span style="color:var(--text-3)">None</span>'}</td>
            </tr>`).join('') || '<tr><td colspan="7"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-parking"/></svg>No vehicle registrations yet.</div></td></tr>'}
        </tbody>
      </table></div>
    </div>
  </div>`;
}

function openVehicleRegistrationModal() {
  const block = currentUser.block || '';
  const lot = currentUser.lot || '';
  openModal('Register Vehicle', `
    <div class="vehicle-fee-panel">
      <div>
        <span>Registration Fee</span>
        <strong id="vr_feePreview">${formatPeso(VEHICLE_REGISTRATION_FEES.homeowner)}</strong>
      </div>
      <p>Homeowner registrations are ₱200. Non-homeowner registrations are ₱250.</p>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Registrant Type *</label>
        <select id="vr_registrantType" onchange="updateVehicleFeePreview()">
          <option value="homeowner">Homeowner</option>
          <option value="nonHomeowner">Non-homeowner</option>
        </select>
      </div>
      <div class="form-group">
        <label>Vehicle Type *</label>
        <select id="vr_vehicleType">
          ${VEHICLE_TYPES.map(type => `<option value="${type}">${type}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group"><label>Owner Name *</label><input id="vr_ownerName" value="${currentUser.name}" placeholder="Vehicle owner name"></div>
    <div class="grid-2">
      <div class="form-group"><label>Block *</label><input id="vr_block" value="${block}" placeholder="Block"></div>
      <div class="form-group"><label>Lot *</label><input id="vr_lot" value="${lot}" placeholder="Lot"></div>
    </div>
    <div class="form-group"><label>Plate Number *</label><input id="vr_plateNumber" placeholder="ABC 1234" style="text-transform:uppercase"></div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Submit Registration', cls: 'btn-primary', action: confirmSubmitVehicleRegistration },
  ]);
}

function confirmSubmitVehicleRegistration() {
  const registrantType = document.getElementById('vr_registrantType').value;
  const ownerName = document.getElementById('vr_ownerName').value.trim();
  const block = document.getElementById('vr_block').value.trim();
  const lot = document.getElementById('vr_lot').value.trim();
  const plateNumber = document.getElementById('vr_plateNumber').value.trim().toUpperCase();
  const vehicleType = document.getElementById('vr_vehicleType').value;

  if (!ownerName || !block || !lot || !plateNumber || !vehicleType) {
    showToast('error', 'Missing Fields', 'Please complete all required vehicle registration fields.');
    return;
  }

  openConfirm(
    'Submit Vehicle Registration',
    `Submit vehicle registration for <strong>${plateNumber}</strong> with a fee of <strong>${formatPeso(getVehicleRegistrationFee(registrantType))}</strong>?`,
    () => submitVehicleRegistration({ registrantType, ownerName, block, lot, plateNumber, vehicleType })
  );
}

function submitVehicleRegistration({ registrantType, ownerName, block, lot, plateNumber, vehicleType }) {
  const today = getLocalDateValue();
  const vehicle = {
    id: db.newId('vr'),
    homeownerId: currentUser.id,
    ownerName,
    block,
    lot,
    plateNumber,
    vehicleType,
    registrantType,
    fee: getVehicleRegistrationFee(registrantType),
    registrationStatus: 'Pending',
    paymentStatus: 'Unpaid',
    stickerNumber: null,
    remarks: '',
    createdAt: today,
    updatedAt: today,
    releasedAt: '',
  };
  db.save('vehicleRegistrations', vehicle);
  addNotification('Vehicle Registration Submitted', `${currentUser.name} submitted vehicle ${plateNumber} for review.`, { roles: ['admin', 'security'] });
  logAction(`Submitted vehicle registration: ${plateNumber} for ${ownerName}`);
  closeModal();
  showToast('success', 'Registration Submitted', 'Your vehicle registration is pending admin review.');
  renderHOVehicles();
}

function renderVehicleManagement(filtered = null) {
  const allVehicles = filtered || db.get('vehicleRegistrations');
  const vehicles = [...allVehicles].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const pendingCount = db.get('vehicleRegistrations').filter(vehicle => vehicle.registrationStatus === 'Pending').length;
  const unpaidCount = db.get('vehicleRegistrations').filter(vehicle => vehicle.paymentStatus !== 'Paid').length;
  const releasedCount = db.get('vehicleRegistrations').filter(vehicle => vehicle.releasedAt).length;
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Vehicle Management</h2><p>Review registrations, track payments, and release physical stickers.</p></div>
  </div>
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-clock"/></svg></div><div class="stat-info"><span class="stat-value">${pendingCount}</span><span class="stat-label">Pending</span></div></div>
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-credit"/></svg></div><div class="stat-info"><span class="stat-value">${unpaidCount}</span><span class="stat-label">Unpaid</span></div></div>
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-parking"/></svg></div><div class="stat-info"><span class="stat-value">${releasedCount}</span><span class="stat-label">Released Stickers</span></div></div>
  </div>
  <div class="section-card">
    <div class="section-card-header">
      <div class="filters-row">
        <div class="search-box"><span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span><input id="vehicleSearch" type="text" placeholder="Search owner, plate, block, sticker..."/></div>
        <select class="filter-select" id="vehicleStatusFilter" onchange="filterVehicles()">
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          <option value="Expired">Expired</option>
        </select>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper"><table class="data-table vehicle-table">
        <thead><tr><th>Owner</th><th>Vehicle</th><th>Fee</th><th>Payment</th><th>Status</th><th>Sticker</th><th>Actions</th></tr></thead>
        <tbody>
          ${vehicles.map(vehicle => `
            <tr>
              <td><strong>${vehicle.ownerName}</strong><br><span style="font-size:0.78rem;color:var(--text-3)">${getVehicleLocation(vehicle)} - ${vehicle.registrantType === 'nonHomeowner' ? 'Non-homeowner' : 'Homeowner'}</span></td>
              <td><strong>${vehicle.plateNumber}</strong><br><span style="font-size:0.78rem;color:var(--text-3)">${vehicle.vehicleType}</span></td>
              <td>${formatPeso(vehicle.fee)}</td>
              <td>${vehiclePaymentStatusBadge(vehicle.paymentStatus)}</td>
              <td>${vehicleRegistrationStatusBadge(vehicle.registrationStatus)}</td>
              <td>${vehicle.stickerNumber ? `<strong>${vehicle.stickerNumber}</strong>${vehicle.releasedAt ? `<br><span style="font-size:0.75rem;color:var(--green-600)">Released</span>` : ''}` : '<span style="color:var(--text-3)">Not assigned</span>'}</td>
              <td><div class="td-actions">
                <button class="btn btn-secondary btn-sm" onclick="openVehicleAdminModal('${vehicle.id}')">Manage</button>
              </div></td>
            </tr>`).join('') || '<tr><td colspan="7"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-parking"/></svg>No vehicle registrations found.</div></td></tr>'}
        </tbody>
      </table></div>
    </div>
  </div>`;

  const search = document.getElementById('vehicleSearch');
  if (search) search.addEventListener('input', filterVehicles);
}

function filterVehicles() {
  const query = (document.getElementById('vehicleSearch')?.value || '').trim().toLowerCase();
  const status = document.getElementById('vehicleStatusFilter')?.value || '';
  const filtered = db.get('vehicleRegistrations').filter(vehicle => {
    const haystack = [
      vehicle.ownerName,
      vehicle.block,
      vehicle.lot,
      vehicle.plateNumber,
      vehicle.vehicleType,
      vehicle.stickerNumber,
      vehicle.registrationStatus,
      vehicle.paymentStatus,
    ].join(' ').toLowerCase();
    return (!query || haystack.includes(query)) && (!status || vehicle.registrationStatus === status);
  });
  renderVehicleManagement(filtered);
  const search = document.getElementById('vehicleSearch');
  const statusEl = document.getElementById('vehicleStatusFilter');
  if (search) search.value = query;
  if (statusEl) statusEl.value = status;
}

function openVehicleAdminModal(id) {
  const vehicle = db.getOne('vehicleRegistrations', id);
  if (!vehicle) return;
  openModal('Manage Vehicle Registration', `
    <div class="vehicle-detail-grid">
      <div><span>Owner</span><strong>${vehicle.ownerName}</strong></div>
      <div><span>Location</span><strong>${getVehicleLocation(vehicle)}</strong></div>
      <div><span>Plate Number</span><strong>${vehicle.plateNumber}</strong></div>
      <div><span>Vehicle Type</span><strong>${vehicle.vehicleType}</strong></div>
      <div><span>Fee</span><strong>${formatPeso(vehicle.fee)}</strong></div>
      <div><span>Submitted</span><strong>${vehicle.createdAt || 'N/A'}</strong></div>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="form-group">
        <label>Payment Status</label>
        <select id="vm_paymentStatus">
          <option value="Unpaid" ${vehicle.paymentStatus === 'Unpaid' ? 'selected' : ''}>Unpaid</option>
          <option value="Paid" ${vehicle.paymentStatus === 'Paid' ? 'selected' : ''}>Paid</option>
        </select>
      </div>
      <div class="form-group">
        <label>Registration Status</label>
        <select id="vm_registrationStatus">
          ${['Pending', 'Approved', 'Rejected', 'Expired'].map(status => `<option value="${status}" ${vehicle.registrationStatus === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Physical Sticker Number</label>
      <input id="vm_stickerNumber" value="${vehicle.stickerNumber || ''}" placeholder="Unique sticker number" style="text-transform:uppercase">
    </div>
    <div class="form-group">
      <label>Remarks</label>
      <textarea id="vm_remarks" placeholder="Payment notes, rejection reason, release remarks...">${vehicle.remarks || ''}</textarea>
    </div>
    <label class="vehicle-release-check">
      <input id="vm_releaseSticker" type="checkbox" ${vehicle.releasedAt ? 'checked' : ''}>
      <span>Sticker released to registrant</span>
    </label>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Save Changes', cls: 'btn-primary', action: () => saveVehicleAdminChanges(id) },
  ]);
}

function saveVehicleAdminChanges(id) {
  const vehicle = db.getOne('vehicleRegistrations', id);
  if (!vehicle) return;
  const stickerNumber = normalizeStickerNumber(document.getElementById('vm_stickerNumber').value);
  const paymentStatus = document.getElementById('vm_paymentStatus').value;
  const registrationStatus = document.getElementById('vm_registrationStatus').value;
  const releaseSticker = document.getElementById('vm_releaseSticker').checked;

  if (stickerNumber && isVehicleStickerTaken(stickerNumber, id)) {
    showToast('error', 'Sticker Already Used', 'That sticker number is already assigned to another vehicle.');
    return;
  }
  if (releaseSticker && !stickerNumber) {
    showToast('error', 'Sticker Required', 'Assign a unique sticker number before releasing the sticker.');
    return;
  }
  if (releaseSticker && paymentStatus !== 'Paid') {
    showToast('error', 'Payment Required', 'Payment status must be Paid before releasing the sticker.');
    return;
  }
  if (releaseSticker && registrationStatus !== 'Approved') {
    showToast('error', 'Approval Required', 'Registration status must be Approved before releasing the sticker.');
    return;
  }

  const today = getLocalDateValue();
  vehicle.paymentStatus = paymentStatus;
  vehicle.registrationStatus = registrationStatus;
  vehicle.stickerNumber = stickerNumber || null;
  vehicle.remarks = document.getElementById('vm_remarks').value.trim();
  vehicle.updatedAt = today;
  vehicle.releasedAt = releaseSticker ? (vehicle.releasedAt || today) : '';
  db.save('vehicleRegistrations', vehicle);
  addNotification('Vehicle Registration Updated', `${vehicle.plateNumber} is now ${vehicle.registrationStatus}.`, { userIds: [vehicle.homeownerId] });
  logAction(`Updated vehicle registration: ${vehicle.plateNumber} (${vehicle.registrationStatus}, ${vehicle.paymentStatus})`);
  closeModal();
  showToast('success', 'Vehicle Updated', 'Vehicle registration details have been saved.');
  renderVehicleManagement();
}
