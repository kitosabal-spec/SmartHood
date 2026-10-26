// SECTION 9: AMENITY BOOKINGS


function getAmenityBookingDate(value) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function isSundayDate(value) {
  const date = getAmenityBookingDate(value);
  return date ? date.getDay() === 0 : false;
}

function getAmenityUnavailableSettings(forAvailability = false) {
  const setting = db.getOne(forAvailability ? 'amenityAvailabilityRules' : 'appSettings', 'amenityUnavailable');
  const fallback = { weeklyDays: [0], dateRules: [] };
  if (!setting?.value) return fallback;
  try {
    const parsed = JSON.parse(setting.value);
    return {
      weeklyDays: Array.isArray(parsed.weeklyDays) ? parsed.weeklyDays.map(Number).filter(day => day >= 0 && day <= 6) : fallback.weeklyDays,
      dateRules: Array.isArray(parsed.dateRules) ? parsed.dateRules : [],
    };
  } catch {
    return fallback;
  }
}

async function saveAmenityUnavailableSettings(settings) {
  return saveAmenityChange('appSettings', {
    id: 'amenityUnavailable',
    value: JSON.stringify({
      weeklyDays: [...new Set(settings.weeklyDays || [])].map(Number).sort(),
      dateRules: settings.dateRules || [],
    }),
  });
}

function getAmenityUnavailableRule(amenity, dateValue) {
  const date = getAmenityBookingDate(dateValue);
  if (!date) return null;
  const settings = getAmenityUnavailableSettings(true);
  const dayRule = settings.weeklyDays.includes(date.getDay())
    ? { type: 'weekly', reason: `${date.toLocaleDateString(undefined, { weekday: 'long' })} is marked unavailable.` }
    : null;
  const dateRule = settings.dateRules.find(rule =>
    rule.date === dateValue &&
    (rule.amenity === 'all' || rule.amenity === amenity)
  );
  return dateRule || dayRule;
}

function formatAmenityDate(value) {
  const date = getAmenityBookingDate(value);
  if (!date) return 'N/A';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function amenityBookingConflicts(amenity, bookingDate, ignoreId = null) {
  return db.get('amenityBookings').filter(booking =>
    booking.id !== ignoreId &&
    booking.amenity === amenity &&
    booking.bookingDate === bookingDate &&
    ['Pending', 'Approved'].includes(booking.status)
  );
}

function getAmenityDayStatus(amenity, dateValue) {
  if (!db.getOne('amenityAvailabilityRules', 'amenityUnavailable')) return 'Unknown';
  if (getAmenityUnavailableRule(amenity, dateValue)) return 'Unavailable';
  const bookings = db.get('amenityAvailability').filter(booking => booking.amenity === amenity && booking.bookingDate === dateValue);
  if (bookings.some(booking => booking.status === 'Approved')) return 'Booked';
  if (bookings.some(booking => booking.status === 'Pending')) return 'Pending';
  return 'Free';
}

async function loadAmenityCalendar(container) {
  container.textContent = 'Loading availability…';
  try {
    await api.loadAmenityAvailability();
    return document.getElementById(container.id) === container;
  } catch (error) {
    container.textContent = 'Could not load availability. Change the month or reopen this page to retry.';
    showToast('error', 'Availability Unavailable', error.message);
    return false;
  }
}

async function renderAmenityCalendar() {
  const container = document.getElementById('amenityCalendar');
  if (!container) return;
  if (!await loadAmenityCalendar(container)) return;
  const amenity = document.getElementById('ab_amenity')?.value || AMENITIES[0];
  const monthValue = document.getElementById('ab_month')?.value || getLocalMonthValue();
  const [year, month] = monthValue.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = first.getDay();
  const cells = [];

  for (let i = 0; i < leadingBlanks; i++) cells.push('<div class="amenity-calendar-cell empty"></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const dateValue = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const status = getAmenityDayStatus(amenity, dateValue);
    cells.push(`
      <button class="amenity-calendar-cell ${status.toLowerCase()}" type="button" onclick="selectAmenityDate('${dateValue}')">
        <span>${day}</span>
        <small>${status}</small>
      </button>`);
  }

  container.innerHTML = `
    <div class="amenity-calendar-head">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => `<span>${day}</span>`).join('')}</div>
    <div class="amenity-calendar-grid">${cells.join('')}</div>`;
  updateAmenityAvailabilityNote();
}

function selectAmenityDate(dateValue) {
  const input = document.getElementById('ab_date');
  if (input) input.value = dateValue;
  updateAmenityAvailabilityNote();
}

async function renderAdminAmenityCalendar() {
  const container = document.getElementById('adminAmenityCalendar');
  if (!container) return;
  if (!await loadAmenityCalendar(container)) return;
  const amenity = document.getElementById('admin_ab_amenity')?.value || AMENITIES[0];
  const monthValue = document.getElementById('admin_ab_month')?.value || getLocalMonthValue();
  const [year, month] = monthValue.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = first.getDay();
  const cells = [];

  for (let i = 0; i < leadingBlanks; i++) cells.push('<div class="amenity-calendar-cell empty"></div>');
  for (let day = 1; day <= daysInMonth; day++) {
    const dateValue = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const status = getAmenityDayStatus(amenity, dateValue);
    cells.push(`
      <button class="amenity-calendar-cell ${status.toLowerCase()}" type="button" onclick="selectAdminAmenityDate('${dateValue}')">
        <span>${day}</span>
        <small>${status}</small>
      </button>`);
  }

  container.innerHTML = `
    <div class="amenity-calendar-head">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => `<span>${day}</span>`).join('')}</div>
    <div class="amenity-calendar-grid">${cells.join('')}</div>`;
}

function selectAdminAmenityDate(dateValue) {
  const input = document.getElementById('adminUnavailableDate');
  if (input) input.value = dateValue;
}

function updateAmenityAvailabilityNote() {
  const note = document.getElementById('ab_availabilityNote');
  if (!note) return;
  const amenity = document.getElementById('ab_amenity')?.value;
  const bookingDate = document.getElementById('ab_date')?.value;
  if (!amenity || !bookingDate) {
    note.textContent = 'Select an amenity and date to check availability.';
    note.className = 'amenity-availability-note';
    return;
  }
  const status = getAmenityDayStatus(amenity, bookingDate);
  if (status === 'Unknown') {
    note.textContent = 'Availability has not loaded. Reopen this page to retry.';
    return;
  }
  const unavailableRule = getAmenityUnavailableRule(amenity, bookingDate);
  note.textContent = unavailableRule
    ? `${amenity} is unavailable on ${formatAmenityDate(bookingDate)}. ${unavailableRule.reason || ''}`.trim()
    : status === 'Free'
      ? `${amenity} is available on ${formatAmenityDate(bookingDate)}.`
      : `${amenity} is ${status.toLowerCase()} on ${formatAmenityDate(bookingDate)}.`;
  note.className = `amenity-availability-note ${status.toLowerCase()}`;
}

function renderHOAmenityBooking() {
  const today = getLocalDateValue();
  const currentMonth = document.getElementById('ab_month')?.value || today.slice(0, 7);
  const selectedAmenity = document.getElementById('ab_amenity')?.value || AMENITIES[0];
  const myBookings = db.get('amenityBookings')
    .filter(booking => booking.homeownerId === getCurrentHomeownerId())
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Book Amenities</h2><p>Request use of community amenities and check availability.</p></div>
  </div>
  <div class="amenity-layout">
    <div class="section-card">
      <div class="section-card-header"><div><h3>New Booking Request</h3><p>Check the calendar before submitting a booking request.</p></div></div>
      <div class="section-card-body">
        <div class="grid-2">
          <div class="form-group">
            <label>Amenity *</label>
            <select id="ab_amenity" onchange="renderAmenityCalendar();updateAmenityAvailabilityNote()">
              ${AMENITIES.map(item => `<option value="${item}" ${item === selectedAmenity ? 'selected' : ''}>${item}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Calendar Month</label>
            <input id="ab_month" type="month" value="${currentMonth}" onchange="renderAmenityCalendar()"/>
          </div>
        </div>
        <div id="amenityCalendar" class="amenity-calendar"></div>
        <div class="grid-2" style="margin-top:16px">
          <div class="form-group">
            <label>Booking Date *</label>
            <input id="ab_date" type="date" min="${today}" onchange="updateAmenityAvailabilityNote()"/>
          </div>
          <div class="form-group">
            <label>Time *</label>
            <div class="grid-2" style="gap:8px">
              <input id="ab_start" type="time"/>
              <input id="ab_end" type="time"/>
            </div>
          </div>
        </div>
        <div id="ab_availabilityNote" class="amenity-availability-note">Select an amenity and date to check availability.</div>
        <div class="form-group" style="margin-top:14px">
          <label>Purpose</label>
          <textarea id="ab_purpose" placeholder="Briefly describe how the amenity will be used..."></textarea>
        </div>
        <button class="btn btn-primary" onclick="confirmSubmitAmenityBooking()">Submit Request</button>
      </div>
    </div>
    <div class="section-card">
      <div class="section-card-header"><div><h3>My Requests</h3><p>Status of your amenity bookings.</p></div></div>
      <div class="section-card-body no-pad">
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Amenity</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              ${myBookings.map(booking => `
                <tr>
                  <td><strong>${booking.amenity}</strong><br><span style="font-size:0.78rem;color:var(--text-3)">${booking.startTime || ''} - ${booking.endTime || ''}</span></td>
                  <td>${formatAmenityDate(booking.bookingDate)}</td>
                  <td>${amenityStatusBadge(booking.status)}</td>
                </tr>`).join('') || '<tr><td colspan="3"><div class="no-results">No amenity requests yet.</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`;
  renderAmenityCalendar();
}

function confirmSubmitAmenityBooking() {
  const amenity = document.getElementById('ab_amenity').value;
  const bookingDate = document.getElementById('ab_date').value;
  const startTime = document.getElementById('ab_start').value;
  const endTime = document.getElementById('ab_end').value;
  if (!amenity || !bookingDate || !startTime || !endTime) {
    showToast('error', 'Missing Fields', 'Please select an amenity, date, and time.');
    return;
  }
  const unavailableRule = getAmenityUnavailableRule(amenity, bookingDate);
  if (unavailableRule) {
    showToast('error', 'Unavailable', unavailableRule.reason || `${amenity} is not available on that date.`);
    return;
  }
  if (endTime <= startTime) {
    showToast('error', 'Invalid Time', 'End time must be later than start time.');
    return;
  }
  if (['Booked', 'Pending'].includes(getAmenityDayStatus(amenity, bookingDate))) {
    showToast('error', 'Not Available', `${amenity} is already booked or pending for that date.`);
    return;
  }
  const purpose = document.getElementById('ab_purpose').value.trim();
  openConfirm(
    'Submit Amenity Request',
    `Submit a request for <strong>${amenity}</strong> on <strong>${formatAmenityDate(bookingDate)}</strong>?`,
    () => submitAmenityBooking({ amenity, bookingDate, startTime, endTime, purpose })
  );
}

// A failed save must leave cached records and the form untouched. A refresh
// failure after commit is reported separately so residents do not resubmit.
async function saveAmenityChange(table, item) {
  try {
    await db.save(table, item);
  } catch (error) {
    showToast('error', 'Change Not Saved', error.message);
    if (error.status === 409) {
      if (document.getElementById('amenityCalendar')) await renderAmenityCalendar();
      if (document.getElementById('adminAmenityCalendar')) await renderAdminAmenityCalendar();
    }
    return false;
  }
  try {
    await api.loadAmenityBookings();
    await api.loadAmenityAvailability();
  } catch (error) {
    showToast('warning', 'Saved; Refresh Failed', 'Your change was saved. Reopen this page to refresh availability.');
  }
  return true;
}

async function submitAmenityBooking({ amenity, bookingDate, startTime, endTime, purpose }) {
  const booking = {
    id: db.newId('ab'),
    homeownerId: getCurrentHomeownerId(),
    amenity,
    bookingDate,
    startTime,
    endTime,
    purpose,
    status: 'Pending',
    adminRemarks: '',
    createdAt: getLocalDateValue(),
    reviewedAt: '',
  };
  if (!await saveAmenityChange('amenityBookings', booking)) return;
  addNotification('Amenity Booking Request', `${currentUser.name} requested ${booking.amenity} on ${formatAmenityDate(booking.bookingDate)}.`, { roles: ['admin', 'president'] });
  logAction(`Submitted amenity booking request: ${booking.amenity} for ${currentUser.name}`);
  closeModal();
  showToast('success', 'Request Submitted', 'Your amenity booking request is now pending admin approval.');
  renderHOAmenityBooking();
}

function getAdminAmenityBookingFilters() {
  return {
    search: (document.getElementById('amenityBookingSearch')?.value || '').trim(),
    status: document.getElementById('amenityBookingStatusFilter')?.value || '',
    amenity: document.getElementById('amenityBookingAmenityFilter')?.value || '',
  };
}

function getFilteredAdminAmenityBookings(bookings, filters = {}) {
  const query = (filters.search || '').trim().toLowerCase();
  const status = filters.status || '';
  const amenity = filters.amenity || '';

  return bookings.filter(booking => {
    const homeowner = getHomeownerById(booking.homeownerId);
    const haystack = [
      homeowner?.name,
      homeowner?.block,
      homeowner?.lot,
      booking.amenity,
      booking.purpose,
      booking.bookingDate,
      booking.startTime,
      booking.endTime,
      booking.status,
    ].filter(Boolean).join(' ').toLowerCase();

    return (!query || haystack.includes(query)) &&
      (!status || booking.status === status) &&
      (!amenity || booking.amenity === amenity);
  });
}

function renderAdminAmenityBookingRows(bookings, hasActiveFilters = false) {
  return bookings.map(booking => {
    const homeowner = getHomeownerById(booking.homeownerId);
    return `<tr>
      <td><div class="cell-user">${avatarHTML(homeowner, 'avatar-sm')}<strong>${homeowner ? homeowner.name : 'Unknown'}</strong></div></td>
      <td>${booking.amenity}<br><span style="font-size:0.78rem;color:var(--text-3)">${booking.purpose || 'No purpose provided'}</span></td>
      <td>${formatAmenityDate(booking.bookingDate)}<br><span style="font-size:0.78rem;color:var(--text-3)">${booking.startTime || ''} - ${booking.endTime || ''}</span></td>
      <td>${amenityStatusBadge(booking.status)}</td>
      <td><div class="td-actions">
        ${booking.status === 'Pending' ? `
          <button class="btn btn-success btn-sm" onclick="confirmApproveAmenityBooking('${booking.id}')">Approve</button>
          <button class="btn btn-danger btn-sm" onclick="openRejectAmenityBooking('${booking.id}')">Reject</button>
        ` : `<button class="btn btn-secondary btn-sm" onclick="viewAmenityBooking('${booking.id}')">View</button>`}
      </div></td>
    </tr>`;
  }).join('') || `<tr><td colspan="5"><div class="no-results">${hasActiveFilters
    ? 'No booking requests match the selected filters.'
    : 'No amenity booking requests.'}</div></td></tr>`;
}

function filterAdminAmenityBookings() {
  const tbody = document.getElementById('amenityBookingTableBody');
  if (!tbody) return;
  const filters = getAdminAmenityBookingFilters();
  const bookings = [...db.get('amenityBookings')]
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  tbody.innerHTML = renderAdminAmenityBookingRows(
    getFilteredAdminAmenityBookings(bookings, filters),
    Boolean(filters.search || filters.status || filters.amenity)
  );
}

function renderAmenityBookingsAdmin() {
  const filters = getAdminAmenityBookingFilters();
  const allBookings = [...db.get('amenityBookings')].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const bookings = getFilteredAdminAmenityBookings(allBookings, filters);
  const today = getLocalDateValue();
  const currentMonth = document.getElementById('admin_ab_month')?.value || today.slice(0, 7);
  const selectedAmenity = document.getElementById('admin_ab_amenity')?.value || AMENITIES[0];
  const unavailable = getAmenityUnavailableSettings();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const area = document.getElementById('contentArea');
  area.innerHTML = `
  <div class="page-header">
    <div class="page-header-left"><h2>Amenity Bookings</h2><p>Review and manage homeowner amenity requests.</p></div>
  </div>
  <div class="amenity-layout">
    <div class="section-card">
      <div class="section-card-header"><div><h3>Availability Calendar</h3><p>View bookings and unavailable dates by amenity.</p></div></div>
      <div class="section-card-body">
        <div class="grid-2">
          <div class="form-group">
            <label>Amenity</label>
            <select id="admin_ab_amenity" onchange="renderAdminAmenityCalendar()">
              ${AMENITIES.map(item => `<option value="${item}" ${item === selectedAmenity ? 'selected' : ''}>${item}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Calendar Month</label>
            <input id="admin_ab_month" type="month" value="${currentMonth}" onchange="renderAdminAmenityCalendar()"/>
          </div>
        </div>
        <div id="adminAmenityCalendar" class="amenity-calendar"></div>
      </div>
    </div>
    <div class="section-card">
      <div class="section-card-header"><div><h3>Unavailable Schedule</h3><p>Block recurring days or a specific date.</p></div></div>
      <div class="section-card-body">
        <div class="form-group">
          <label>Unavailable Days</label>
          <div class="amenity-day-toggle-grid">
            ${dayNames.map((day, index) => `
              <label class="amenity-day-toggle">
                <input type="checkbox" class="admin-unavailable-day" value="${index}" ${unavailable.weeklyDays.includes(index) ? 'checked' : ''}>
                <span>${day.slice(0, 3)}</span>
              </label>`).join('')}
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveAmenityUnavailableDays()">Save Days</button>
        <div class="form-divider"></div>
        <div class="grid-2">
          <div class="form-group">
            <label>Date</label>
            <input id="adminUnavailableDate" type="date" min="${today}">
          </div>
          <div class="form-group">
            <label>Amenity</label>
            <select id="adminUnavailableAmenity">
              <option value="all">All Amenities</option>
              ${AMENITIES.map(item => `<option value="${item}">${item}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Reason</label>
          <input id="adminUnavailableReason" placeholder="e.g. Maintenance, private HOA event">
        </div>
        <button class="btn btn-primary btn-sm" onclick="addAmenityUnavailableDate()">Block Date</button>
        <div class="amenity-unavailable-list">
          ${unavailable.dateRules.length ? unavailable.dateRules
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
            .map(rule => `
              <div class="amenity-unavailable-item">
                <div>
                  <strong>${formatAmenityDate(rule.date)}</strong>
                  <span>${rule.amenity === 'all' ? 'All Amenities' : rule.amenity}${rule.reason ? ` - ${rule.reason}` : ''}</span>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="removeAmenityUnavailableDate('${rule.id}')">Remove</button>
              </div>`).join('')
            : '<p class="empty-note">No blocked dates.</p>'}
        </div>
      </div>
    </div>
  </div>
  <div class="section-card">
    <div class="section-card-header">
      <div><h3>Booking Requests</h3><p>Approve or reject submitted amenity requests.</p></div>
      <div class="filters-row">
        <div class="search-box">
          <span class="search-icon"><svg width="15" height="15"><use href="#ico-search"/></svg></span>
          <input id="amenityBookingSearch" type="search" value="${escapeHtml(filters.search)}" placeholder="Search homeowner, purpose, or date..." aria-label="Search booking requests" oninput="filterAdminAmenityBookings()"/>
        </div>
        <select class="filter-select" id="amenityBookingStatusFilter" aria-label="Filter booking requests by status" onchange="filterAdminAmenityBookings()">
          <option value="">All Statuses</option>
          ${['Pending', 'Approved', 'Rejected'].map(status => `<option value="${status}" ${filters.status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
        <select class="filter-select" id="amenityBookingAmenityFilter" aria-label="Filter booking requests by amenity" onchange="filterAdminAmenityBookings()">
          <option value="">All Amenities</option>
          ${AMENITIES.map(amenity => `<option value="${amenity}" ${filters.amenity === amenity ? 'selected' : ''}>${amenity}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="section-card-body no-pad">
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>Homeowner</th><th>Amenity</th><th>Date / Time</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="amenityBookingTableBody">${renderAdminAmenityBookingRows(bookings, Boolean(filters.search || filters.status || filters.amenity))}</tbody>
        </table>
      </div>
    </div>
  </div>`;
  renderAdminAmenityCalendar();
}

async function saveAmenityUnavailableDays() {
  const settings = getAmenityUnavailableSettings();
  settings.weeklyDays = [...document.querySelectorAll('.admin-unavailable-day:checked')].map(input => Number(input.value));
  if (!await saveAmenityUnavailableSettings(settings)) return;
  logAction(`Updated amenity unavailable days: ${settings.weeklyDays.join(', ') || 'none'}`);
  showToast('success', 'Days Saved', 'Unavailable amenity days have been updated.');
  renderAmenityBookingsAdmin();
}

async function addAmenityUnavailableDate() {
  const date = document.getElementById('adminUnavailableDate')?.value;
  const amenity = document.getElementById('adminUnavailableAmenity')?.value || 'all';
  const reason = document.getElementById('adminUnavailableReason')?.value.trim() || 'Marked unavailable by admin.';
  if (!date) {
    showToast('error', 'Missing Date', 'Select the date to block.');
    return;
  }

  const settings = getAmenityUnavailableSettings();
  const existing = settings.dateRules.find(rule => rule.date === date && rule.amenity === amenity);
  if (existing) {
    existing.reason = reason;
  } else {
    settings.dateRules.push({ id: db.newId('au'), date, amenity, reason });
  }

  if (!await saveAmenityUnavailableSettings(settings)) return;
  logAction(`Marked amenity unavailable: ${amenity === 'all' ? 'All amenities' : amenity} on ${formatAmenityDate(date)}`);
  showToast('success', 'Date Blocked', `${amenity === 'all' ? 'All amenities' : amenity} marked unavailable on ${formatAmenityDate(date)}.`);
  renderAmenityBookingsAdmin();
}

async function removeAmenityUnavailableDate(id) {
  const settings = getAmenityUnavailableSettings();
  const removed = settings.dateRules.find(rule => rule.id === id);
  settings.dateRules = settings.dateRules.filter(rule => rule.id !== id);
  if (!await saveAmenityUnavailableSettings(settings)) return;
  if (removed) logAction(`Removed amenity unavailable date: ${removed.amenity} on ${formatAmenityDate(removed.date)}`);
  showToast('success', 'Date Removed', 'The unavailable date has been removed.');
  renderAmenityBookingsAdmin();
}

function confirmApproveAmenityBooking(id) {
  const booking = db.getOne('amenityBookings', id);
  if (!booking) return;
  const unavailableRule = getAmenityUnavailableRule(booking.amenity, booking.bookingDate);
  if (unavailableRule) {
    showToast('error', 'Unavailable', unavailableRule.reason || 'This amenity is not available on that date.');
    return;
  }
  if (amenityBookingConflicts(booking.amenity, booking.bookingDate, id).length) {
    showToast('error', 'Schedule Conflict', 'This amenity already has a pending or approved booking for that date.');
    return;
  }
  openConfirm('Approve Booking', `Approve <strong>${booking.amenity}</strong> for <strong>${formatAmenityDate(booking.bookingDate)}</strong>?`, () => approveAmenityBooking(id));
}

async function approveAmenityBooking(id) {
  const existing = db.getOne('amenityBookings', id);
  if (!existing) return;
  const booking = { ...existing, status: 'Approved', reviewedAt: getLocalDateValue() };
  if (!await saveAmenityChange('amenityBookings', booking)) return;
  const homeowner = getHomeownerById(booking.homeownerId);
  logAction(`Approved amenity booking: ${booking.amenity} for ${homeowner ? homeowner.name : 'Unknown'}`);
  showToast('success', 'Approved', 'Amenity booking approved.');
  renderAmenityBookingsAdmin();
}

function openRejectAmenityBooking(id) {
  openModal('Reject Amenity Booking', `
    <p style="color:var(--text-2);margin-bottom:16px">Please provide a reason for rejection.</p>
    <div class="form-group"><label>Remarks</label><textarea id="amenityRejectRemarks" placeholder="e.g. Amenity unavailable for maintenance..."></textarea></div>
  `, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Reject', cls: 'btn-danger', action: () => confirmRejectAmenityBooking(id) },
  ]);
}

function confirmRejectAmenityBooking(id) {
  const booking = db.getOne('amenityBookings', id);
  if (!booking) return;
  const remarks = document.getElementById('amenityRejectRemarks').value.trim() || 'Rejected by admin.';
  openConfirm('Reject Booking', `Reject <strong>${booking.amenity}</strong> request for <strong>${formatAmenityDate(booking.bookingDate)}</strong>?`, () => rejectAmenityBooking(id, remarks));
}

async function rejectAmenityBooking(id, remarks) {
  const existing = db.getOne('amenityBookings', id);
  if (!existing) return;
  const booking = { ...existing, status: 'Rejected', adminRemarks: remarks, reviewedAt: getLocalDateValue() };
  if (!await saveAmenityChange('amenityBookings', booking)) return;
  const homeowner = getHomeownerById(booking.homeownerId);
  logAction(`Rejected amenity booking: ${booking.amenity} for ${homeowner ? homeowner.name : 'Unknown'} - ${remarks}`);
  closeModal();
  showToast('warning', 'Rejected', 'Amenity booking rejected.');
  renderAmenityBookingsAdmin();
}

function viewAmenityBooking(id) {
  const booking = db.getOne('amenityBookings', id);
  if (!booking) return;
  const homeowner = getHomeownerById(booking.homeownerId);
  openModal('Amenity Booking', `
    <table style="width:100%;font-size:0.88rem">
      <tr><td style="padding:6px 0;color:var(--text-3)">Homeowner</td><td style="font-weight:600">${homeowner ? homeowner.name : 'Unknown'}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-3)">Amenity</td><td>${booking.amenity}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-3)">Date</td><td>${formatAmenityDate(booking.bookingDate)}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-3)">Time</td><td>${booking.startTime || ''} - ${booking.endTime || ''}</td></tr>
      <tr><td style="padding:6px 0;color:var(--text-3)">Status</td><td>${amenityStatusBadge(booking.status)}</td></tr>
      ${booking.adminRemarks ? `<tr><td style="padding:6px 0;color:var(--text-3)">Remarks</td><td>${booking.adminRemarks}</td></tr>` : ''}
    </table>
  `, [{ label: 'Close', cls: 'btn-secondary', action: closeModal }]);
}

function amenityStatusBadge(status) {
  const map = {
    Pending: '<span class="badge badge-yellow">Pending</span>',
    Approved: '<span class="badge badge-green">Approved</span>',
    Rejected: '<span class="badge badge-red">Rejected</span>',
  };
  return map[status] || `<span class="badge badge-gray">${status || 'Unknown'}</span>`;
}
