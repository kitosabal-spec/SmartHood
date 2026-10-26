'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fixture, database, password } = require('./helpers/auth-fixture.cjs');

const booking = (id, overrides = {}) => ({ id, homeownerId: 'home-1', amenity: 'Basketball Court',
  bookingDate: '2026-10-08', startTime: '09:00', endTime: '10:00', purpose: 'Private party',
  status: 'Pending', adminRemarks: 'Private remarks', createdAt: '2026-10-01', reviewedAt: '', ...overrides });

// Transactions can overlap. Only the application's SELECT ... FOR UPDATE
// mutex serializes them; beginning a transaction alone does NOT acquire it.
function amenityPool(initial = []) {
  const base = database();
  base.users.push({ ...base.users[1], id: 'resident-2', homeowner_id: 'home-2', email: 'second@example.test' });
  const state = { bookings: structuredClone(initial), settings: null, locks: 0, failWrite: false, failCommit: false };
  let tail = Promise.resolve();
  async function execute(sql, values = [], tx) {
    const q = sql.replace(/`/g, '').replace(/\s+/g, ' ').trim();
    if (q === 'SELECT id FROM amenity_availability_lock WHERE id = 1 FOR UPDATE') {
      assert.ok(tx, 'mutex must use the same transaction connection as the write');
      const previous = tail;
      tail = new Promise(resolve => { tx.releaseLock = resolve; });
      await previous;
      tx.snapshot = structuredClone(state.bookings);
      tx.settingsSnapshot = state.settings;
      state.locks++;
      return [[{ id: 1 }]];
    }
    if (q.startsWith('SELECT b.amenity, b.bookingDate')) {
      assert.match(q, /b.status = 'Pending' AND \(\? = 1 OR b.homeownerId = \?\)/);
      const active = state.bookings.filter(b => !b.archived_at && (b.status === 'Approved' ||
        (b.status === 'Pending' && (values[0] === 1 || b.homeownerId === values[1]))));
      return [(active.length ? active : [{}]).map(b => ({ amenity: b.amenity, bookingDate: b.bookingDate, status: b.status, unavailableValue: state.settings }))];
    }
    if (q.startsWith('SELECT value FROM appSettings')) return [state.settings ? [{ value: state.settings }] : []];
    if (q.startsWith('SELECT * FROM homeowners WHERE id')) return [[{ id: values[0], name: values[0] }]];
    if (q.includes('FROM amenityBookings')) {
      let rows = state.bookings;
      if (q.includes('archived_at IS NULL')) rows = rows.filter(b => !b.archived_at);
      if (q.includes('WHERE amenity = ?')) {
        assert.match(q, /FOR UPDATE$/, 'conflict checks must use current locking reads');
        assert.ok(tx?.releaseLock, 'lock must be acquired before checking conflicts');
        assert.match(q, /AND status = 'Approved'/);
        rows = rows.filter(b => b.amenity === values[0] && b.bookingDate === values[1] && b.id !== values[2] && b.status === 'Approved');
        // Let another HTTP request reach its own transaction before the write.
        await new Promise(resolve => setTimeout(resolve, 10));
      } else if (q.includes('homeownerId = ?')) rows = rows.filter(b => b.homeownerId === values[0]);
      else if (q.includes('WHERE id = ?')) rows = rows.filter(b => b.id === values[0]);
      if (q.startsWith('SELECT COUNT(*)')) return [[{ total: rows.length }]];
      return [structuredClone(rows)];
    }
    if (q.startsWith('INSERT INTO amenityBookings') || q.startsWith('UPDATE amenityBookings')) {
      assert.ok(tx?.releaseLock, 'writes must hold the mutex');
      if (state.failWrite) throw Error('Write failed');
      if (q.startsWith('INSERT')) {
        const columns = q.match(/\(([^)]+)\)/)[1].split(',').map(c => c.trim());
        state.bookings.push(Object.fromEntries(columns.map((c, i) => [c, values[i]])));
      } else if (q.includes('SET archived_at')) {
        state.bookings.find(b => b.id === values[1]).archived_at = '2026-10-01';
      } else {
        const columns = q.match(/ SET (.+) WHERE /)[1].split(',').map(c => c.trim().split(' ')[0]);
        Object.assign(state.bookings.find(b => b.id === values.at(-1)), Object.fromEntries(columns.map((c, i) => [c, values[i]])));
      }
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('SELECT * FROM appSettings')) return [state.settings ? [{ id: 'amenityUnavailable', value: state.settings }] : []];
    if (q.startsWith('INSERT INTO appSettings') || q.startsWith('UPDATE appSettings')) {
      assert.ok(tx?.releaseLock);
      state.settings = values[q.startsWith('INSERT') ? 1 : 0];
      return [{ affectedRows: 1 }];
    }
    // Ancillary bootstrap tables in this fixture are empty; relevant booking
    // queries above are always evaluated rather than replaced with empty data.
    if (q.startsWith('SELECT') && !q.includes('FROM users') && !q.includes('auth_')) return [[]];
    return base.execute(sql, values);
  }
  return { ...base, state, execute: (sql, values) => execute(sql, values), async getConnection() {
    const tx = {};
    return { beginTransaction: async () => {}, execute: (sql, values) => execute(sql, values, tx),
      async commit() { if (tx.releaseLock && state.failCommit) throw Error('Commit failed'); },
      async rollback() { if (tx.snapshot) { state.bookings = tx.snapshot; state.settings = tx.settingsSnapshot; } },
      release() { tx.releaseLock?.(); } };
  } };
}

async function setup(t, initial) {
  const pool = amenityPool(initial);
  const site = await fixture(t, { pool, emailConfigured: false });
  const cookies = {};
  for (const [key, email] of Object.entries({ a: 'resident@example.test', b: 'second@example.test', admin: 'registered-admin@example.test' })) {
    const login = await site.login(email, password);
    assert.equal(login.status, 200);
    cookies[key] = login.headers.get('set-cookie').split(';')[0];
  }
  async function call(who, method, route, body) {
    const response = await fetch(site.base + route, { method, headers: { cookie: cookies[who] || '', 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  return { pool, site, call };
}

test('only the submitter and admin see pending availability; approved dates are shared and reads remain scoped', async t => {
  const { call } = await setup(t, [booking('approved', { status: 'Approved' }), booking('pending', { bookingDate: '2026-10-14' })]);
  const views = await Promise.all(['a', 'b', 'admin'].map(who => call(who, 'GET', '/api/amenity-availability')));
  assert.ok(views.every(v => v.status === 200));
  assert.deepEqual(views[0].body, views[2].body);
  assert.deepEqual(views[1].body.bookings, [
    { amenity: 'Basketball Court', bookingDate: '2026-10-08', status: 'Approved' },
  ]);
  assert.deepEqual(views[0].body.bookings, [
    { amenity: 'Basketball Court', bookingDate: '2026-10-08', status: 'Approved' },
    { amenity: 'Basketball Court', bookingDate: '2026-10-14', status: 'Pending' },
  ]);
  for (const [who, count] of [['a', 2], ['b', 0]]) {
    const own = await call(who, 'GET', '/api/amenityBookings');
    assert.equal(own.body.length, count);
    const boot = await call(who, 'GET', '/api/data');
    assert.equal(boot.status, 200, JSON.stringify(boot));
    assert.equal(boot.body.amenityBookings.length, count);
    const paged = await call(who, 'GET', '/api/paged/amenityBookings');
    assert.equal(paged.body.items.length, count);
  }
  assert.equal((await call('anonymous', 'GET', '/api/amenity-availability')).status, 401);
});

test('admin and two signed-in residents: private pending calendars, competing requests, then Booked for everyone', async t => {
  const { call, pool } = await setup(t, []);
  async function calendar(who, expected) {
    // Query parameters must not let a resident impersonate an owner/manager.
    const response = await call(who, 'GET', '/api/amenity-availability?canManage=1&homeownerId=home-1');
    assert.equal(response.status, 200);
    const { context, cache, elements } = browserContext();
    cache.amenityAvailability = response.body.bookings;
    cache.amenityAvailabilityRules[0].value = JSON.stringify(response.body.unavailable);
    const admin = who === 'admin';
    await context[admin ? 'renderAdminAmenityCalendar' : 'renderAmenityCalendar']();
    const html = elements[admin ? 'adminAmenityCalendar' : 'amenityCalendar'].innerHTML;
    const cell = html.match(/<button[^>]*2026-10-08[^]*?<\/button>/)?.[0];
    assert.ok(cell, 'target date must be rendered');
    assert.match(cell, new RegExp(`<small>${expected}</small>`));
    for (const row of response.body.bookings) {
      assert.deepEqual(Object.keys(row).sort(), ['amenity', 'bookingDate', 'status']);
    }
    return response.body.bookings;
  }
  assert.equal((await call('a', 'POST', '/api/amenityBookings', booking('a-request'))).status, 201);
  await calendar('a', 'Pending');
  await calendar('admin', 'Pending');
  assert.deepEqual(await calendar('b', 'Free'), []);
  assert.equal((await call('b', 'POST', '/api/amenityBookings', booking('b-request'))).status, 201);
  assert.equal((await calendar('a', 'Pending')).length, 1);
  assert.equal((await calendar('b', 'Pending')).length, 1);
  assert.equal((await calendar('admin', 'Pending')).length, 2);
  for (const [who, ownId] of [['a', 'a-request'], ['b', 'b-request']]) {
    for (const route of ['/api/amenityBookings', '/api/paged/amenityBookings', '/api/data']) {
      const { body, status } = await call(who, 'GET', route);
      assert.equal(status, 200);
      const rows = body.amenityBookings || body.items || body;
      assert.deepEqual(rows.map(row => row.id), [ownId]);
    }
  }
  assert.equal((await call('admin', 'PUT', '/api/amenityBookings/a-request', { status: 'Approved' })).status, 200);
  for (const who of ['a', 'b', 'admin']) await calendar(who, 'Booked');
  assert.equal((await call('admin', 'PUT', '/api/amenityBookings/b-request', { status: 'Approved' })).status, 409);
  assert.equal(pool.state.bookings.find(row => row.id === 'b-request').status, 'Pending');
  assert.equal((await call('b', 'POST', '/api/amenityBookings', booking('late'))).status, 409);
  // Direct admin creates and moving an approved booking also use the server guard.
  assert.equal((await call('admin', 'POST', '/api/amenityBookings', booking('direct', { status: 'Approved' }))).status, 409);
  assert.equal((await call('admin', 'POST', '/api/amenityBookings', booking('different', { status: 'Approved', bookingDate: '2026-10-09' }))).status, 201);
  assert.equal((await call('admin', 'PUT', '/api/amenityBookings/different', { bookingDate: '2026-10-08' })).status, 409);
});

test('server allows other pending requests but rejects approved whole-date conflicts despite different times', async t => {
  for (const status of ['Approved', 'Pending']) await t.test(status, async t => {
    const { call, pool } = await setup(t, [booking('existing', { status })]);
    const result = await call('b', 'POST', '/api/amenityBookings', booking('attempt', { startTime: '17:00', endTime: '18:00' }));
    assert.equal(result.status, status === 'Approved' ? 409 : 201);
    if (status === 'Approved') assert.match(result.body.error, /booked.*entire date/);
    assert.equal(pool.state.bookings.length, status === 'Approved' ? 1 : 2);
  });
});

test('simultaneous pending submissions across two app instances both succeed', async t => {
  const { call, pool, site } = await setup(t, []);
  const second = await fixture(t, { pool, emailConfigured: false });
  const login = await second.login('second@example.test', password);
  const competing = fetch(second.base + '/api/amenityBookings', { method: 'POST', headers: {
    cookie: login.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json',
  }, body: JSON.stringify(booking('second')) });
  const [first, other] = await Promise.all([call('a', 'POST', '/api/amenityBookings', booking('first')), competing]);
  assert.deepEqual([first.status, other.status].sort(), [201, 201], JSON.stringify(site.errors));
  assert.equal(pool.state.bookings.length, 2);
  assert.equal(pool.state.locks, 2);
});

test('approval rejects only approved conflicts, including partial updates', async t => {
  for (const status of ['Approved', 'Pending']) await t.test(status, async t => {
    const { call, pool } = await setup(t, [booking('own'), booking('other', { homeownerId: 'home-2', status })]);
    assert.equal((await call('admin', 'PUT', '/api/amenityBookings/own', { status: 'Approved' })).status, status === 'Approved' ? 409 : 200);
    assert.equal(pool.state.bookings[0].status, status === 'Approved' ? 'Pending' : 'Approved');
    assert.equal((await call('admin', 'PUT', '/api/amenityBookings/other', { status: 'Rejected' })).status, 200);
    assert.equal((await call('admin', 'PUT', '/api/amenityBookings/own', { status: 'Approved' })).status, 200);
  });
});

test('simultaneous approvals across app instances cannot occupy the same date', async t => {
  const { call, pool } = await setup(t, [booking('one'), booking('two', { homeownerId: 'home-2' })]);
  const second = await fixture(t, { pool, emailConfigured: false });
  const login = await second.login('registered-admin@example.test', password);
  const results = await Promise.all([
    call('admin', 'PUT', '/api/amenityBookings/one', { status: 'Approved' }),
    fetch(second.base + '/api/amenityBookings/two', { method: 'PUT', headers: {
      cookie: login.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json',
    }, body: JSON.stringify({ status: 'Approved' }) }),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(pool.state.bookings.filter(b => b.status === 'Approved').length, 1);
  assert.equal(pool.state.bookings.filter(b => b.status === 'Pending').length, 1);
});

test('rejection frees the date, spoofed status/owner are ignored, and residents cannot review or bulk replace', async t => {
  const { call, pool } = await setup(t, [booking('one')]);
  assert.equal((await call('admin', 'PUT', '/api/amenityBookings/one', { status: 'Rejected' })).status, 200);
  assert.deepEqual((await call('b', 'GET', '/api/amenity-availability')).body.bookings, []);
  const submitted = await call('b', 'POST', '/api/amenityBookings', booking('two', { status: 'Approved', homeownerId: 'home-1' }));
  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.homeownerId, 'home-2');
  assert.equal(submitted.body.status, 'Pending');
  assert.equal(submitted.body.adminRemarks, '');
  assert.equal((await call('b', 'PUT', '/api/amenityBookings/two', { status: 'Approved' })).status, 403);
  assert.equal((await call('admin', 'PUT', '/api/amenityBookings', [])).status, 405);
  assert.equal(pool.state.bookings.length, 2);
});

test('weekly and specific closures block submissions and approval; rejected and archived rows do not occupy dates', async t => {
  const { call, pool } = await setup(t, [booking('old', { status: 'Approved', archived_at: '2026-10-01' }), booking('review')]);
  pool.state.settings = JSON.stringify({ weeklyDays: [0], dateRules: [{ date: '2026-10-08', amenity: 'Basketball Court', reason: 'private note', id: 'secret-id' }] });
  assert.equal((await call('b', 'POST', '/api/amenityBookings', booking('sunday', { bookingDate: '2026-10-11' }))).status, 409);
  assert.equal((await call('b', 'POST', '/api/amenityBookings', booking('closed'))).status, 409);
  assert.equal((await call('admin', 'PUT', '/api/amenityBookings/review', { status: 'Approved' })).status, 409);
  assert.equal((await call('admin', 'PUT', '/api/amenityBookings/review', { status: 'Rejected' })).status, 200);
  const availability = (await call('b', 'GET', '/api/amenity-availability')).body;
  assert.deepEqual(availability.unavailable.dateRules, [{ date: '2026-10-08', amenity: 'Basketball Court' }]);
  assert.equal((await call('b', 'POST', '/api/amenityBookings', booking('club', { amenity: 'Clubhouse' }))).status, 201);
  const saved = await call('admin', 'PUT', '/api/appSettings/amenityUnavailable', { value: JSON.stringify({ weeklyDays: [], dateRules: [] }) });
  assert.equal(saved.status, 200);
  assert.equal((await call('b', 'POST', '/api/amenityBookings', booking('free'))).status, 201);
});

test('failed writes and commits roll back and release the availability mutex', async t => {
  const { call, pool } = await setup(t, []);
  for (const flag of ['failWrite', 'failCommit']) {
    pool.state[flag] = true;
    assert.equal((await call('a', 'POST', '/api/amenityBookings', booking('failure'))).status, 500);
    assert.equal(pool.state.bookings.length, 0);
    pool.state[flag] = false;
  }
  assert.equal((await call('b', 'POST', '/api/amenityBookings', booking('success'))).status, 201);
});

function browserContext(records = []) {
  const cache = { amenityBookings: records, amenityAvailability: [
    { amenity: 'Basketball Court', bookingDate: '2026-10-08', status: 'Approved' },
    { amenity: 'Basketball Court', bookingDate: '2026-10-14', status: 'Pending' },
  ], amenityAvailabilityRules: [{ id: 'amenityUnavailable', value: '{"weeklyDays":[0],"dateRules":[]}' }] };
  const elements = Object.fromEntries(['contentArea', 'amenityCalendar', 'adminAmenityCalendar', 'ab_month', 'admin_ab_month', 'ab_amenity', 'admin_ab_amenity'].map(id => [id, { id, value: id.endsWith('month') ? '2026-10' : 'Basketball Court', innerHTML: '' }]));
  const events = [];
  const context = { db: { get: key => cache[key] || [], getOne: (key, id) => (cache[key] || []).find(b => b.id === id), newId: () => 'new',
    save: async () => { events.push('save'); } },
    api: { loadAmenityAvailability: async () => { events.push('availability'); }, loadAmenityBookings: async () => { events.push('bookings'); } },
    document: { getElementById: id => elements[id] || null },
    AMENITIES: ['Basketball Court'], getLocalDateValue: () => '2026-10-01', getLocalMonthValue: () => '2026-10',
    getCurrentHomeownerId: () => 'home-2', currentUser: { name: 'Resident 2' }, getHomeownerById: () => ({}),
    showToast: (type, title) => events.push(`${type}:${title}`), closeModal() {}, addNotification() {}, logAction() {},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/amenities.js'), 'utf8'), context);
  return { context, elements, events, cache };
}

test('calendars render scoped availability while My Requests contains only the resident’s rows', async () => {
  const { context, elements } = browserContext([booking('private'), booking('own', { homeownerId: 'home-2', amenity: 'Clubhouse' })]);
  await context.renderAmenityCalendar();
  await context.renderAdminAmenityCalendar();
  for (const id of ['amenityCalendar', 'adminAmenityCalendar']) {
    assert.match(elements[id].innerHTML, /2026-10-08[^]*?<small>Booked<\/small>/);
    assert.match(elements[id].innerHTML, /2026-10-14[^]*?<small>Pending<\/small>/);
    assert.match(elements[id].innerHTML, /2026-10-11[^]*?<small>Unavailable<\/small>/);
  }
  context.renderHOAmenityBooking();
  const requests = elements.contentArea.innerHTML.split('My Requests')[1];
  assert.match(requests, /Clubhouse/);
  assert.doesNotMatch(requests, /Basketball Court|Private party|Private remarks/);
});

test('frontend allows pending submissions and approval alongside other pending requests, but blocks approved conflicts', () => {
  const { context, elements, events, cache } = browserContext([booking('one'), booking('two', { homeownerId: 'home-2' })]);
  context.openConfirm = title => events.push(title);
  for (const [id, value] of Object.entries({ ab_date: '2026-10-14', ab_start: '09:00', ab_end: '10:00', ab_purpose: 'Practice' })) {
    elements[id] = { value };
  }
  context.confirmSubmitAmenityBooking();
  assert.deepEqual(events, ['Submit Amenity Request']);
  events.length = 0;
  context.confirmApproveAmenityBooking('one');
  assert.deepEqual(events, ['Approve Booking']);
  events.length = 0;
  cache.amenityBookings[1].status = 'Approved';
  context.confirmApproveAmenityBooking('one');
  assert.deepEqual(events, ['error:Schedule Conflict']);
  events.length = 0;
  elements.ab_date.value = '2026-10-08';
  context.confirmSubmitAmenityBooking();
  assert.deepEqual(events, ['error:Not Available']);
});

test('browser awaits persistence, refreshes on success, and preserves cached status on failure', async () => {
  const { context, events, cache } = browserContext([booking('one')]);
  context.renderAmenityBookingsAdmin = () => events.push('render');
  let finish;
  context.db.save = () => new Promise(resolve => { finish = resolve; });
  const pending = context.approveAmenityBooking('one');
  assert.equal(cache.amenityBookings[0].status, 'Pending');
  assert.deepEqual(events, []);
  finish();
  await pending;
  assert.deepEqual(events, ['bookings', 'availability', 'success:Approved', 'render']);
  events.length = 0;
  context.db.save = async () => { throw Error('offline'); };
  await context.rejectAmenityBooking('one', 'remarks');
  assert.equal(cache.amenityBookings[0].status, 'Pending');
  assert.deepEqual(events, ['error:Change Not Saved']);
  await context.submitAmenityBooking(booking('new'));
  assert.ok(!events.some(e => e.startsWith('success')));
});

test('calendar load failure displays an error rather than a free calendar', async () => {
  const { context, elements } = browserContext();
  context.api.loadAmenityAvailability = async () => { throw Error('offline'); };
  await context.renderAmenityCalendar();
  assert.match(elements.amenityCalendar.textContent, /Could not load availability/);
  assert.equal(elements.amenityCalendar.innerHTML, '');
});
