// SECTION 9B: VEHICLE REGISTRATION

function safeVehicleEscape(str) {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
  return map[status] || `<span class="badge badge-gray">${safeVehicleEscape(status || 'Unknown')}</span>`;
}

function vehiclePaymentStatusBadge(status) {
  return status === 'Paid'
    ? '<span class="badge badge-green">Paid</span>'
    : '<span class="badge badge-red">Unpaid</span>';
}

function getVehicleLocation(vehicle) {
  return [vehicle.block, vehicle.lot].filter(Boolean).join(' ') || vehicle.registrationLocation || 'N/A';
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

function renderResidentVehicleRow(vehicle) {
  const safeOwner = safeVehicleEscape(vehicle.ownerName);
  const safeLoc = safeVehicleEscape(getVehicleLocation(vehicle));
  const safeType = safeVehicleEscape(vehicle.vehicleType);
  const safePlate = safeVehicleEscape(vehicle.plateNumber);
  const stickerHtml = vehicle.stickerNumber
    ? `<strong class="vehicle-sticker-no">${safeVehicleEscape(vehicle.stickerNumber)}</strong>${vehicle.releasedAt ? `<span class="vehicle-sticker-released">Released ${safeVehicleEscape(vehicle.releasedAt)}</span>` : ''}`
    : '<span class="vehicle-text-muted">Not assigned</span>';
  const remarksHtml = vehicle.remarks
    ? `<span>${safeVehicleEscape(vehicle.remarks)}</span>`
    : '<span class="vehicle-text-muted">None</span>';

  return `
    <tr>
      <td data-label="Vehicle">
        <div class="vehicle-cell-val">
          <strong class="vehicle-plate-no">${safePlate}</strong>
          <span class="vehicle-cell-sub">${safeType}</span>
        </div>
      </td>
      <td data-label="Owner">
        <div class="vehicle-cell-val">
          <strong class="vehicle-owner-name">${safeOwner}</strong>
          <span class="vehicle-cell-sub">${safeLoc}</span>
        </div>
      </td>
      <td data-label="Fee">
        <span class="vehicle-fee-val">${formatPeso(vehicle.fee)}</span>
      </td>
      <td data-label="Payment">
        ${vehiclePaymentStatusBadge(vehicle.paymentStatus)}
      </td>
      <td data-label="Sticker">
        <div class="vehicle-cell-val">
          ${stickerHtml}
        </div>
      </td>
      <td data-label="Status">
        ${vehicleRegistrationStatusBadge(vehicle.registrationStatus)}
      </td>
      <td data-label="Remarks">
        <div class="vehicle-cell-val vehicle-cell-remarks">
          ${remarksHtml}
        </div>
      </td>
    </tr>`;
}

function renderHOVehicles() {
  const vehicles = db.get('vehicleRegistrations')
    .filter(vehicle => vehicle.homeownerId === getCurrentHomeownerId())
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
      <div class="table-wrapper"><table class="data-table vehicle-table">
        <thead><tr><th>Vehicle</th><th>Owner</th><th>Fee</th><th>Payment</th><th>Sticker</th><th>Status</th><th>Remarks</th></tr></thead>
        <tbody>
          ${vehicles.map(renderResidentVehicleRow).join('') || '<tr><td colspan="7"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-parking"/></svg>No vehicle registrations yet.</div></td></tr>'}
        </tbody>
      </table></div>
    </div>
  </div>`;
}

function openVehicleRegistrationModal() {
  const block = safeVehicleEscape(currentUser.block || '');
  const lot = safeVehicleEscape(currentUser.lot || '');
  const ownerName = safeVehicleEscape(currentUser.name || '');
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
          ${VEHICLE_TYPES.map(type => `<option value="${safeVehicleEscape(type)}">${safeVehicleEscape(type)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group"><label>Owner Name *</label><input id="vr_ownerName" value="${ownerName}" placeholder="Vehicle owner name"></div>
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
    `Submit vehicle registration for <strong>${safeVehicleEscape(plateNumber)}</strong> with a fee of <strong>${formatPeso(getVehicleRegistrationFee(registrantType))}</strong>?`,
    () => submitVehicleRegistration({ registrantType, ownerName, block, lot, plateNumber, vehicleType })
  );
}

async function submitVehicleRegistration(vehicle, onBehalf = false) {
  try {
    await db.save('vehicleRegistrations', { ...vehicle, selfRegistration: !onBehalf });
  } catch (error) {
    showToast('error', 'Registration Not Saved', safeVehicleEscape(error.message));
    return false;
  }
  closeModal();
  showToast('success', 'Registration Submitted', 'The vehicle registration is pending review.');
  if (onBehalf) renderVehicleManagement();
  else renderHOVehicles();
  return true;
}

function openAdminVehicleRegistration(draft = {}, editingId = null) {
  if (!canManageVehicles()) return;
  const esc = safeVehicleEscape;
  const properties = new Map(getHomeowners().map(h => [
    [h.name, /^\d/.test(h.block) ? 'Block ' + h.block : h.block,
      /^\d/.test(h.lot) ? 'Lot ' + h.lot : h.lot, h.id].filter(Boolean).join(' · '), h,
  ]));
  openModal(editingId ? 'Edit Vehicle' : 'Add Vehicle', `
    <form id="vehicleEntry">
      <div class="grid-2">
        <div class="form-group"><label for="vr_registrantType">Registration type</label>
          <select id="vr_registrantType"><option value="homeowner">Homeowner</option><option value="nonHomeowner">Non-homeowner</option></select></div>
        <div class="form-group"><label for="vr_vehicleType">Vehicle type</label>
          <select id="vr_vehicleType">${VEHICLE_TYPES.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
      </div>
      <div class="form-group" hidden><label for="vr_ownerName">Vehicle owner’s full name *</label>
        <input id="vr_ownerName" maxlength="255" value="${esc(draft.ownerName || '')}"></div>
      <div class="form-group"><label id="vr_propertyLabel" for="vr_property">Homeowner *</label>
        <input id="vr_property" list="vr_properties" autocomplete="off" placeholder="Search by name, block or lot" value="${esc(draft.propertyLabel || '')}">
        <datalist id="vr_properties">${Array.from(properties.keys(), label => `<option value="${esc(label)}"></option>`).join('')}</datalist></div>
      <div class="form-group" hidden><label for="vr_location">Reason or registration location *</label>
        <input id="vr_location" maxlength="255" value="${esc(draft.registrationLocation || '')}"></div>
      <div class="grid-2">
        <div class="form-group"><label for="vr_plateNumber">Plate number *</label>
          <input id="vr_plateNumber" required maxlength="255" placeholder="ABC 1234" value="${esc(draft.plateNumber || '')}"></div>
        <div class="form-group"><label for="vr_fee">Registration fee</label><input id="vr_fee" readonly></div>
      </div>
      <div class="vehicle-entry-status">${vehicleRegistrationStatusBadge(draft.registrationStatus || 'Pending')} ${vehiclePaymentStatusBadge(draft.paymentStatus || 'Unpaid')}</div>
    </form>`, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: editingId ? 'Save Vehicle' : 'Register Vehicle', cls: 'btn-primary', action: () => form.requestSubmit() },
  ]);
  const form = document.getElementById('vehicleEntry');
  const { vr_registrantType: type, vr_vehicleType: vehicleType, vr_ownerName: owner,
    vr_property: property, vr_location: location, vr_plateNumber: plate, vr_fee: fee } = form.elements;
  type.value = draft.registrantType || 'homeowner';
  vehicleType.value = draft.vehicleType || VEHICLE_TYPES[0];
  function updateFields() {
    const homeowner = type.value === 'homeowner';
    owner.parentElement.hidden = homeowner;
    owner.disabled = homeowner;
    owner.required = !homeowner;
    document.getElementById('vr_propertyLabel').textContent = homeowner ? 'Homeowner *' : 'Associated homeowner / property (optional)';
    property.required = homeowner;
    property.setCustomValidity(property.value && !properties.has(property.value) ? 'Select a property from the list.' : '');
    location.disabled = homeowner || Boolean(property.value);
    location.parentElement.hidden = location.disabled;
    location.required = !location.disabled;
    fee.value = formatPeso(getVehicleRegistrationFee(type.value));
  }
  type.onchange = property.oninput = updateFields;
  plate.oninput = () => { plate.value = plate.value.toUpperCase(); };
  updateFields();
  form.onsubmit = event => {
    event.preventDefault();
    const selected = properties.get(property.value);
    const vehicle = { registrantType: type.value, vehicleType: vehicleType.value, homeownerId: selected?.id || null,
      ownerName: owner.disabled ? selected?.name : owner.value.trim(), plateNumber: plate.value.trim().toUpperCase(),
      registrationLocation: location.disabled ? null : location.value.trim() };
    if (!vehicle.ownerName || !/[A-Z0-9]/.test(vehicle.plateNumber) || !/^[A-Z0-9 -]+$/.test(vehicle.plateNumber) ||
        (!selected && !vehicle.registrationLocation)) {
      showToast('error', 'Check Registration', 'Enter the owner, a valid plate, and a property or registration reason.');
      return;
    }
    const back = () => openAdminVehicleRegistration({ ...draft, ...vehicle, propertyLabel: property.value }, editingId);
    openModal(editingId ? 'Confirm Vehicle Changes' : 'Confirm Vehicle Registration', `${editingId ? 'Save changes to' : 'Register'} <strong>${esc(vehicle.plateNumber)}</strong> for
      <strong>${esc(vehicle.ownerName)}</strong> with a fee of <strong>${esc(fee.value)}</strong>?`, [
      { label: 'Back', cls: 'btn-secondary', action: back },
      { label: editingId ? 'Confirm Changes' : 'Confirm Registration', cls: 'btn-primary', action: async event => {
        for (const button of event.currentTarget.parentElement.children) button.disabled = true;
        if (editingId) {
          try {
            await db.save('vehicleRegistrations', { ...vehicle, id: editingId });
            closeModal();
            showToast('success', 'Vehicle Updated', 'Vehicle registration details have been saved.');
            renderVehicleManagement();
          } catch (error) {
            showToast('error', 'Changes Not Saved', error.message);
            back();
          }
        } else if (!await submitVehicleRegistration(vehicle, true)) back();
      } },
    ], 'modal-confirm');
  };
}

function renderAdminVehicleRow(vehicle) {
  const safeOwner = safeVehicleEscape(vehicle.ownerName);
  const safeLoc = safeVehicleEscape(getVehicleLocation(vehicle));
  const safeType = safeVehicleEscape(vehicle.vehicleType);
  const safePlate = safeVehicleEscape(vehicle.plateNumber);
  const safeId = safeVehicleEscape(JSON.stringify(String(vehicle.id)));
  const isNonHO = vehicle.registrantType === 'nonHomeowner';
  const registrantTypeLabel = isNonHO ? 'Non-homeowner' : 'Homeowner';
  const stickerHtml = vehicle.stickerNumber
    ? `<strong class="vehicle-sticker-no">${safeVehicleEscape(vehicle.stickerNumber)}</strong>${vehicle.releasedAt ? '<span class="vehicle-sticker-released">Released</span>' : ''}`
    : '<span class="vehicle-text-muted">Not assigned</span>';

  return `
    <tr>
      <td data-label="Owner">
        <div class="vehicle-cell-val">
          <strong class="vehicle-owner-name">${safeOwner}</strong>
          <span class="vehicle-cell-sub">${safeLoc} &bull; ${registrantTypeLabel}</span>
        </div>
      </td>
      <td data-label="Vehicle">
        <div class="vehicle-cell-val">
          <strong class="vehicle-plate-no">${safePlate}</strong>
          <span class="vehicle-cell-sub">${safeType}</span>
        </div>
      </td>
      <td data-label="Fee">
        <span class="vehicle-fee-val">${formatPeso(vehicle.fee)}</span>
      </td>
      <td data-label="Payment">
        ${vehiclePaymentStatusBadge(vehicle.paymentStatus)}
      </td>
      <td data-label="Status">
        ${vehicleRegistrationStatusBadge(vehicle.registrationStatus)}
      </td>
      <td data-label="Sticker">
        <div class="vehicle-cell-val">
          ${stickerHtml}
        </div>
      </td>
      <td data-label="Actions">
        <div class="td-actions">
          <button class="btn btn-secondary btn-sm" onclick="openVehicleAdminModal(${safeId})">Manage</button>
        </div>
      </td>
    </tr>`;
}

function renderVehicleManagement(filtered = null) {
  const area = document.getElementById('contentArea');
  const tbody = document.getElementById('vehicleTableBody');
  const allRegistrations = db.get('vehicleRegistrations');
  if (typeof dbCache !== 'undefined' && dbCache._serverPaging && filtered === null) filtered = [];
  const vehicles = (filtered !== null ? filtered : allRegistrations)
    .slice()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  // If already rendered and this is an in-place filter update, update only table body to preserve search input focus
  if (filtered !== null && tbody && area && (typeof dbCache === 'undefined' || !dbCache._serverPaging || filtered.length)) {
    if (!vehicles.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-parking"/></svg>No vehicle registrations found.</div></td></tr>';
    } else {
      tbody.innerHTML = vehicles.map(renderAdminVehicleRow).join('');
    }
    return;
  }

  const pendingCount = allRegistrations.filter(vehicle => vehicle.registrationStatus === 'Pending').length;
  const unpaidCount = allRegistrations.filter(vehicle => vehicle.paymentStatus !== 'Paid').length;
  const releasedCount = allRegistrations.filter(vehicle => vehicle.releasedAt).length;

  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Vehicle Management</h2><p>Review registrations, track payments, and release physical stickers.</p></div>
    ${canManageVehicles() ? '<div class="page-header-actions"><button class="btn btn-primary" onclick="openAdminVehicleRegistration()"><svg class="btn-ico"><use href="#ico-plus"/></svg> Add Vehicle</button></div>' : ''}
  </div>
  <div class="stats-grid vehicles-stats-grid">
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-clock"/></svg></div><div class="stat-info"><span class="stat-value">${pendingCount}</span><span class="stat-label">Pending</span></div></div>
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-credit"/></svg></div><div class="stat-info"><span class="stat-value">${unpaidCount}</span><span class="stat-label">Unpaid</span></div></div>
    <div class="stat-card"><div class="stat-icon"><svg width="22" height="22"><use href="#ico-parking"/></svg></div><div class="stat-info"><span class="stat-value">${releasedCount}</span><span class="stat-label">Released Stickers</span></div></div>
  </div>
  <div class="section-card">
    <div class="section-card-header">
      <div class="filters-row vehicles-filters-row">
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
        <tbody id="vehicleTableBody">
          ${vehicles.map(renderAdminVehicleRow).join('') || '<tr><td colspan="7"><div class="no-results"><svg style="width:2rem;height:2rem;color:var(--text-3)"><use href="#ico-parking"/></svg>No vehicle registrations found.</div></td></tr>'}
        </tbody>
      </table></div>
    </div>
  </div>`;

  const search = document.getElementById('vehicleSearch');
  if (search) search.addEventListener('input', filterVehicles);
  if (typeof dbCache !== 'undefined' && dbCache._serverPaging) refreshVehiclePage();
}

function refreshVehiclePage(reset = false) {
  return renderModulePage('vehicleRegistrations', 'vehicleTableBody', {
    q: tableFilterValue('vehicleSearch'), registrationStatus: tableFilterValue('vehicleStatusFilter'), sort: 'createdAt',
  }, rows => { document.getElementById('vehicleTableBody').innerHTML = rows.map(renderAdminVehicleRow).join('') || '<tr><td colspan="7"><div class="no-results">No vehicle registrations found.</div></td></tr>'; }, reset);
}
function filterVehicles() {
  if (typeof dbCache !== 'undefined' && dbCache._serverPaging) {
    const state = modulePaginationStates.vehicleRegistrations ||= { page: 1, pageSize: 10 };
    scheduleTableSearch(state, () => refreshVehiclePage(true)); return;
  }
  const query = (document.getElementById('vehicleSearch')?.value || '').trim().toLowerCase();
  const status = document.getElementById('vehicleStatusFilter')?.value || '';
  const filtered = db.get('vehicleRegistrations').filter(vehicle => {
    const haystack = [
      vehicle.ownerName,
      vehicle.block,
      vehicle.lot,
      vehicle.registrationLocation,
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
  if (search && document.activeElement !== search) search.value = query;
  if (statusEl) statusEl.value = status;
}

function openVehicleAdminModal(id) {
  const vehicle = db.getOne('vehicleRegistrations', id);
  if (!vehicle) return;
  openModal('Manage Vehicle Registration', `
    <div class="vehicle-detail-grid">
      <div><span>Owner</span><strong>${safeVehicleEscape(vehicle.ownerName)}</strong></div>
      ${vehicle.registrantType === 'nonHomeowner' && vehicle.homeownerId ? `<div><span>Associated homeowner</span><strong>${safeVehicleEscape(getHomeownerById(vehicle.homeownerId)?.name || vehicle.homeownerId)}</strong></div>` : ''}
      <div><span>Location</span><strong>${safeVehicleEscape(getVehicleLocation(vehicle))}</strong></div>
      <div><span>Plate Number</span><strong>${safeVehicleEscape(vehicle.plateNumber)}</strong></div>
      <div><span>Vehicle Type</span><strong>${safeVehicleEscape(vehicle.vehicleType)}</strong></div>
      <div><span>Fee</span><strong>${formatPeso(vehicle.fee)}</strong></div>
      <div><span>Submitted</span><strong>${safeVehicleEscape(vehicle.createdAt || 'N/A')}</strong></div>
      ${currentUser?.role === 'admin' ? `<div><span>Billing</span><strong>${vehicleBillingAction(vehicle) || (vehicle.registrationStatus === 'Approved' ? 'Billing requires a linked homeowner' : 'Available after approval')}</strong></div>` : ''}
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
      <input id="vm_stickerNumber" value="${safeVehicleEscape(vehicle.stickerNumber || '')}" placeholder="Unique sticker number" style="text-transform:uppercase">
    </div>
    <div class="form-group">
      <label>Remarks</label>
      <textarea id="vm_remarks" placeholder="Payment notes, rejection reason, release remarks...">${safeVehicleEscape(vehicle.remarks || '')}</textarea>
    </div>
    <label class="vehicle-release-check">
      <input id="vm_releaseSticker" type="checkbox" ${vehicle.releasedAt ? 'checked' : ''}>
      <span>Sticker released to registrant</span>
    </label>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    ...(currentUser?.role === 'admin' && !vehicle.billingId ? [{ label: 'Edit Details', cls: 'btn-secondary', action: () => openVehicleEdit(id) }] : []),
    ...(currentUser?.role === 'admin' ? [{ label: 'Delete', cls: 'btn-danger', action: () => confirmArchiveVehicle(id) }] : []),
    { label: 'Save Changes', cls: 'btn-primary', action: () => saveVehicleAdminChanges(id) },
  ]);
}

function openVehicleEdit(id) {
  if (currentUser?.role !== 'admin') return;
  const vehicle = db.getOne('vehicleRegistrations', id);
  if (!vehicle || vehicle.billingId) return;
  const homeowner = vehicle.homeownerId && getHomeowners().find(h => h.id === vehicle.homeownerId);
  const propertyLabel = homeowner ? [homeowner.name, /^\d/.test(homeowner.block) ? 'Block ' + homeowner.block : homeowner.block,
    /^\d/.test(homeowner.lot) ? 'Lot ' + homeowner.lot : homeowner.lot, homeowner.id].filter(Boolean).join(' · ') : '';
  openAdminVehicleRegistration({ ...vehicle, propertyLabel }, id);
}

function confirmArchiveVehicle(id) {
  if (currentUser?.role !== 'admin') return;
  const vehicle = db.getOne('vehicleRegistrations', id);
  if (!vehicle) return;
  openConfirm('Delete Vehicle Registration', `Delete the registration for <strong>${safeVehicleEscape(vehicle.plateNumber)}</strong>?
    ${vehicle.billingId ? 'Its existing billing will remain in financial records.' : ''}`, async () => {
    try {
      await db.delete('vehicleRegistrations', id);
      closeModal();
      showToast('success', 'Vehicle Deleted', 'The registration was removed from Vehicle Management.');
      renderVehicleManagement();
    } catch (error) {
      showToast('error', 'Vehicle Not Deleted', error.message);
    }
  }, 'btn-danger', 'Delete Vehicle');
}

async function saveVehicleAdminChanges(id) {
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
  const button = document.querySelector('#modalFooter .btn-primary');
  button.disabled = true;
  try {
    await db.save('vehicleRegistrations', { id, registrationStatus, paymentStatus, stickerNumber,
      remarks: document.getElementById('vm_remarks').value.trim(), releasedAt: releaseSticker ? today : '' });
  } catch (error) {
    showToast('error', 'Changes Not Saved', safeVehicleEscape(error.message));
    return;
  } finally {
    button.disabled = false;
  }
  closeModal();
  showToast('success', 'Vehicle Updated', 'Vehicle registration details have been saved.');
  renderVehicleManagement();
  if (currentUser?.role === 'admin' && vehicle.homeownerId && paymentStatus !== 'Paid' && registrationStatus === 'Approved' && vehicle.registrationStatus !== 'Approved') {
    openModal('Vehicle Approved', '<p>Create its billing now or return to this approved vehicle later.</p>', [
      { label: 'Later', cls: 'btn-secondary', action: closeModal },
      { label: 'Create Billing', cls: 'btn-primary', action: () => openVehicleBilling(id) },
    ]);
  }
}

function vehicleBillingAction(vehicle) {
  if (currentUser?.role !== 'admin') return '';
  const id = safeVehicleEscape(JSON.stringify(String(vehicle.id)));
  if (vehicle.billingId) {
    const status = typeof amenityBillingStatus === 'function' ? amenityBillingStatus(vehicle.billingStatus) : vehicle.billingStatus;
    return `<button class="btn btn-secondary btn-sm" onclick="openVehicleBilling(${id})">View Billing</button><span class="badge badge-gray">${safeVehicleEscape(status)}${vehicle.billingArchivedAt ? ' (Archived)' : ''}</span>`;
  }
  if (vehicle.paymentStatus === 'Paid') {
    return `<button class="btn btn-secondary btn-sm" onclick="openVehicleManualPaymentDetails(${id})">View Payment Status</button>`;
  }
  return vehicle.registrationStatus === 'Approved' && vehicle.homeownerId
    ? `<button class="btn btn-primary btn-sm" onclick="openVehicleBilling(${id})">Create Billing</button>` : '';
}

function openVehicleManualPaymentDetails(id) {
  const vehicle = db.getOne('vehicleRegistrations', id);
  if (!vehicle || currentUser?.role !== 'admin') return;
  openModal('Vehicle Payment Status', `
    <dl class="amenity-billing-details">
      <dt>Owner</dt><dd>${safeVehicleEscape(vehicle.ownerName)}</dd>
      <dt>Plate number</dt><dd>${safeVehicleEscape(vehicle.plateNumber)}</dd>
      <dt>Registration fee</dt><dd>${formatPeso(vehicle.fee)}</dd>
      <dt>Payment status</dt><dd>${safeVehicleEscape(vehicle.paymentStatus)}</dd>
      <dt>Billing</dt><dd>No billing record was created for this vehicle.</dd>
    </dl>
    <p>The payment status was set in Vehicle Management. No payment transaction details are recorded here.</p>`, [
    { label: 'Close', cls: 'btn-secondary', action: closeModal },
  ]);
}

function vehicleBillingDetails(draft) {
  return `<dl class="amenity-billing-details">
    <dt>Homeowner</dt><dd>${safeVehicleEscape(draft.homeowner.name)} (${safeVehicleEscape(draft.homeowner.id)})</dd>
    <dt>Billing type</dt><dd>${safeVehicleEscape(draft.billing_type)}</dd>
    <dt>Title</dt><dd>${safeVehicleEscape(draft.title)}</dd>
    <dt>Vehicle details</dt><dd>${safeVehicleEscape(draft.description)}</dd>
  </dl>`;
}

async function openVehicleBilling(id) {
  if (currentUser?.role !== 'admin') return;
  try {
    const draft = await api.request(`/api/vehicleRegistrations/${encodeURIComponent(id)}/billing`);
    if (draft.billing) {
      await api.loadAll(["vehicleRegistrations","billings","homeowners","users","notifications"]);
      renderVehicleManagement();
      viewBillingDetail(draft.billing.id, draft.billing);
      return;
    }
    showVehicleBillingForm(id, draft);
  } catch (error) {
    showToast('error', 'Billing Unavailable', error.message);
  }
}

function showVehicleBillingForm(id, draft, values = {}) {
  const noDueDate = values.noDueDate !== false;
  openModal('Create Vehicle Billing', `${vehicleBillingDetails(draft)}
    <form id="vehicleBillingForm" onsubmit="return false">
      <div class="form-group"><label for="vb_amount">Amount (₱)</label><input id="vb_amount" type="number" min="0.01" max="9999999999.99" step="0.01" required value="${safeVehicleEscape(String(values.amount ?? draft.fee ?? ''))}"></div>
      <div class="form-group"><label class="billing-no-due-date"><input id="vb_no_due" type="checkbox" ${noDueDate ? 'checked' : ''} onchange="toggleVehicleBillingDeadline()"> No due date</label>
        <label for="vb_due">Due date</label><input id="vb_due" type="date" ${noDueDate ? 'disabled' : 'required'} value="${safeVehicleEscape(values.dueDate || '')}"></div>
      <div class="form-group"><label for="vb_note">Optional note</label><textarea id="vb_note" maxlength="2000">${safeVehicleEscape(values.note || '')}</textarea></div>
    </form>`, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Review Billing', cls: 'btn-primary', action: () => reviewVehicleBilling(id, draft) },
  ]);
}

function toggleVehicleBillingDeadline() {
  const noDueDate = document.getElementById('vb_no_due').checked;
  const due = document.getElementById('vb_due');
  due.disabled = noDueDate;
  due.required = !noDueDate;
  if (noDueDate) due.value = '';
}

function reviewVehicleBilling(id, draft) {
  if (!document.getElementById('vehicleBillingForm').reportValidity()) return;
  const noDueDate = document.getElementById('vb_no_due').checked;
  const values = {
    amount: Number(document.getElementById('vb_amount').value), noDueDate,
    dueDate: noDueDate ? null : document.getElementById('vb_due').value,
    note: document.getElementById('vb_note').value.trim(), vehicleVersion: draft.vehicleVersion,
  };
  let submitting = false;
  openModal('Review Vehicle Billing', `${vehicleBillingDetails(draft)}
    <dl class="amenity-billing-details"><dt>Amount</dt><dd>₱${values.amount.toFixed(2)}</dd>
    <dt>Due date</dt><dd>${safeVehicleEscape(values.dueDate || 'No due date')}</dd>
    <dt>Note</dt><dd style="white-space:pre-wrap">${safeVehicleEscape(values.note || 'None')}</dd></dl>
    <p>Confirm to create this bill and notify the homeowner.</p>`, [
    { label: 'Back', cls: 'btn-secondary', action: () => { if (!submitting) showVehicleBillingForm(id, draft, values); } },
    { label: 'Confirm Creation', cls: 'btn-primary', action: async () => {
      if (submitting) return;
      submitting = true;
      let created = false;
      try {
        await api.request(`/api/vehicleRegistrations/${encodeURIComponent(id)}/billing`, { method: 'POST', body: JSON.stringify(values) });
        created = true;
        closeModal();
        await api.loadAll(["vehicleRegistrations","billings","homeowners","users","notifications"]);
        renderVehicleManagement();
        showToast('success', 'Billing Created', 'Billing has been assigned to the homeowner.');
      } catch (error) {
        showToast('error', created ? 'Billing Created; Refresh Needed' : 'Billing Not Created', created ? 'The bill was saved. Reload the page to see the latest details.' : error.message);
        if (error.status === 409) {
          closeModal();
          try { await api.loadAll(["vehicleRegistrations","billings","homeowners","users","notifications"]); renderVehicleManagement(); } catch { /* Keep the original error visible. */ }
        }
      } finally { submitting = false; }
    } },
  ]);
}
