'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { auditFixture } = require('./helpers/audit-fixture.cjs');

const booking = (changes = {}) => ({ id: 'booking-1', homeownerId: 'home-1', amenity: 'Clubhouse',
  bookingDate: '2026-11-12', startTime: '09:00', endTime: '11:00', status: 'Approved', ...changes });
const url = '/api/amenityBookings/booking-1/billing';
async function setup(t, changes) {
  const f = await auditFixture(t);
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["resident"]';
  f.pool.tables.amenityBookings.push(booking(changes));
  f.preview = () => f.request('GET', url);
  f.create = async (changes = {}) => {
    const preview = await f.preview();
    return f.request('POST', url, { amount: 125.50, noDueDate: true, bookingVersion: preview.body.bookingVersion, ...changes });
  };
  return f;
}

test('approval reserves the date without a bill or payment; Later requires no financial write', async t => {
  const f = await setup(t, { status: 'Pending' });
  assert.equal((await f.request('PUT', '/api/amenityBookings/booking-1', { status: 'Approved' })).status, 200);
  assert.equal(f.pool.tables.billings.length, 0);
  assert.equal(f.pool.tables.billing_assignments.length, 0);
  assert.equal(f.pool.tables.payments.length, 0);
  assert.equal((await f.request('POST', '/api/amenityBookings', booking({ id: 'competitor', status: 'Pending' }))).status, 409);
  assert.equal((await f.preview()).status, 200);
  assert.equal(f.pool.tables.billings.length, 0, 'opening the form never creates a bill');
});

test('server derives recipient and booking details; shared assignments, notification and audit behavior run once', async t => {
  const f = await setup(t);
  const result = await f.create({ assignedTo: ['someone-else'], title: 'forged', billing_type: 'Monthly Association Dues', description: 'forged', status: 'paid', note: 'Bring the receipt' });
  assert.equal(result.status, 201, JSON.stringify(result));
  const bill = result.body.billing;
  assert.equal(bill.amenity_booking_id, 'booking-1');
  assert.deepEqual(bill.assignedTo, ['home-1']);
  assert.equal(bill.billing_type, 'Other Billing');
  assert.equal(bill.title, 'Clubhouse reservation - 2026-11-12');
  assert.equal(bill.description, 'Amenity: Clubhouse. Reservation: 2026-11-12, 09:00 - 11:00.\nNote: Bring the receipt');
  assert.equal(bill.dueDate, null);
  assert.equal(bill.due_date, null);
  assert.equal(bill.status, 'active');
  assert.equal(f.pool.tables.billing_assignments[0].assigned_amount, 125.50);
  assert.equal(f.pool.tables.billing_assignments[0].homeowner_id, 'home-1');
  assert.equal(f.pool.tables.notifications.length, 1);
  assert.match(f.pool.tables.notifications[0].message, /No due date/);
  assert.equal(f.pool.tables.auditLog.filter(x => x.action.includes('created billings')).length, 1);
  const list = await f.request('GET', '/api/amenityBookings');
  assert.equal(list.body[0].billingId, bill.id);
  assert.equal(list.body[0].billingStatus, 'active');
  const paid = await f.request('POST', '/api/payments/manual', { homeownerId: 'home-1', billingId: bill.id, amount: 125.50, payment_method: 'Cash', payment_date: '2026-10-27' });
  assert.equal(paid.status, 201, JSON.stringify(paid));
  assert.equal((await f.preview()).body.billing.status, 'paid');
});

test('deadline choices, pending/rejected/archived bookings, eligibility and stale review are checked on the server', async t => {
  const f = await setup(t);
  for (const changes of [{ amount: 0 }, { amount: 0.001 }, { amount: -1 }, { amount: 1e12 }, { noDueDate: false }, { noDueDate: false, dueDate: '2026-02-30' }, { note: {} }]) {
    assert.equal((await f.create(changes)).status, 400, JSON.stringify(changes));
  }
  for (const status of ['Pending', 'Rejected']) {
    f.pool.tables.amenityBookings[0].status = status;
    assert.equal((await f.preview()).status, 409);
    assert.equal((await f.request('POST', url, { amount: 10, noDueDate: true })).status, 409);
  }
  f.pool.tables.amenityBookings[0].status = 'Approved';
  f.pool.tables.amenityBookings[0].archived_at = '2026-10-27';
  assert.equal((await f.preview()).status, 404);
  f.pool.tables.amenityBookings[0].archived_at = null;
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["amenities"]';
  const ineligible = await f.create();
  assert.equal(ineligible.status, 400);
  assert.match(ineligible.body.error, /eligible Resident Portal account/);
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["resident"]';
  const draft = (await f.preview()).body;
  f.pool.tables.amenityBookings[0].startTime = '10:00';
  assert.equal((await f.request('POST', url, { bookingVersion: draft.bookingVersion, amount: 5, noDueDate: true })).status, 409);
  assert.equal(f.pool.tables.billings.length, 0);
  const dated = await f.create({ noDueDate: false, dueDate: '2026-12-01' });
  assert.equal(dated.status, 201);
  assert.equal(dated.body.billing.due_date, '2026-12-01');
});

test('only an active Administrator can preview or create booking billing, including accounts with management modules', async t => {
  const f = await setup(t);
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["resident","billing","amenities"]';
  for (const [id, status] of [[null, 401], ['resident-1', 403], ['inactive-1', 403]]) {
    for (const method of ['GET', 'POST']) {
      const result = await f.request(method, url, method === 'POST' ? { amount: 10, noDueDate: true } : undefined, id);
      assert.equal(result.status, status, JSON.stringify({ id, method, result }));
    }
  }
  assert.equal(f.pool.tables.billings.length, 0);
});

test('duplicate requests and archived bills cannot create a second bill; generic CRUD cannot forge or detach links', async t => {
  const f = await setup(t);
  const payload = { amount: 100, noDueDate: true, bookingVersion: (await f.preview()).body.bookingVersion };
  const results = await Promise.all([f.request('POST', url, payload), f.request('POST', url, payload)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(f.pool.tables.billings.length, 1);
  assert.equal(f.pool.tables.notifications.length, 1);
  const bill = results.find(r => r.status === 201).body.billing;
  assert.equal((await f.request('PUT', `/api/billings/${bill.id}`, { amenity_booking_id: null })).status, 400);
  assert.equal((await f.request('PUT', `/api/billings/${bill.id}`, { assignedTo: ['someone-else'] })).status, 400);
  assert.equal((await f.request('PUT', '/api/billings', [])).status, 409);
  assert.equal((await f.request('POST', '/api/billings', { ...bill, id: 'forged', noDueDate: true })).status, 400);
  assert.equal((await f.request('DELETE', `/api/billings/${bill.id}`)).status, 200);
  assert.equal((await f.request('PUT', '/api/billings', [{ ...bill, amenity_booking_id: null, noDueDate: true }])).status, 400);
  assert.equal((await f.request('POST', url, payload)).status, 409);
  assert.ok((await f.preview()).body.billing.archived_at);
  assert.equal((await f.request('GET', '/api/amenityBookings')).body[0].billingId, bill.id);
});

test('audit failure rolls back billing, assignments and notifications, allowing a clean retry', async t => {
  const f = await setup(t);
  f.pool.failAudit = true;
  assert.equal((await f.create()).status, 500);
  assert.equal(f.pool.tables.billings.length, 0);
  assert.equal(f.pool.tables.billing_assignments.length, 0);
  assert.equal(f.pool.tables.notifications.length, 0);
  f.pool.failAudit = false;
  assert.equal((await f.create()).status, 201);
});

test('browser offers Later after approval, preserves Create Billing and reviews all fields before confirmation', async () => {
  const elements = { amenityBillingForm: { reportValidity: () => true }, ab_bill_amount: { value: '125.50' }, ab_bill_no_due: { checked: true }, ab_bill_note: { value: 'Optional note' } };
  const records = [booking({ status: 'Pending' })];
  let modal, posts = 0, closed = 0;
  const draft = { homeowner: { id: 'home-1', name: 'Resident' }, title: 'Clubhouse reservation - 2026-11-12', description: 'Clubhouse, 2026-11-12, 09:00 - 11:00', billing_type: 'Other Billing', bookingVersion: 'version' };
  const c = vm.createContext({ currentUser: { role: 'admin' }, document: { getElementById: id => elements[id] },
    db: { getOne: () => records[0] }, getHomeownerById: () => ({ name: 'Resident' }), getLocalDateValue: () => '2026-10-27',
    escapeHtml: s => String(s).replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    logAction() {}, showToast() {}, closeModal() { closed++; }, openModal(title, html, buttons) { modal = { title, html, buttons }; },
    api: { request: async (_url, options) => { if (options?.method === 'POST') { posts++; return {}; } return draft; }, loadAll: async () => {} },
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../public/js/amenities.js'), 'utf8'), c);
  c.saveAmenityChange = async (_table, row) => { records[0] = row; return true; };
  c.renderAmenityBookingsAdmin = () => {};
  await c.approveAmenityBooking('booking-1');
  assert.deepEqual(Array.from(modal.buttons, b => b.label), ['Later', 'Create Billing']);
  modal.buttons[0].action();
  assert.equal(closed, 1);
  assert.match(c.amenityBillingAction(records[0]), /Create Billing/);
  assert.equal(posts, 0);
  await c.openAmenityBilling('booking-1');
  assert.match(modal.html, /Resident.*home-1/);
  assert.match(modal.html, /Other Billing/);
  assert.doesNotMatch(modal.html, /<select|ho-cb/);
  modal.buttons[1].action();
  assert.equal(posts, 0);
  for (const detail of ['125.50', 'No due date', 'Optional note', '09:00 - 11:00', 'Other Billing', 'Resident']) assert.ok(modal.html.includes(detail));
  const confirm = modal.buttons[1].action;
  await Promise.all([confirm(), confirm()]);
  assert.equal(posts, 1);
  const linked = c.amenityBillingAction({ ...records[0], billingId: 'bill-1', billingStatus: 'partially_paid' });
  assert.match(linked, /View Billing/); assert.match(linked, /Partially paid/); assert.doesNotMatch(linked, /Create Billing/);
  c.currentUser.role = 'homeowner';
  assert.equal(c.amenityBillingAction(records[0]), '');
});
