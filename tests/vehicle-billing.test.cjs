'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { auditFixture } = require('./helpers/audit-fixture.cjs');

const endpoint = '/api/vehicleRegistrations/vehicle-1/billing';
async function setup(t, changes = {}) {
  const f = await auditFixture(t);
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["resident"]';
  f.pool.tables.vehicleRegistrations.push({ id: 'vehicle-1', homeownerId: 'home-1', ownerName: 'Resident',
    plateNumber: 'ABC 123', vehicleType: 'Car', fee: 200, registrationStatus: 'Approved', paymentStatus: 'Unpaid', ...changes });
  return f;
}

test('approved vehicle creates one linked billing with server-owned details and recipient', async t => {
  const f = await setup(t);
  const preview = await f.request('GET', endpoint);
  assert.equal(preview.status, 200, JSON.stringify(preview));
  assert.equal(f.pool.tables.billings.length, 0);
  const created = await f.request('POST', endpoint, { vehicleVersion: preview.body.vehicleVersion,
    amount: 200, noDueDate: true, assignedTo: ['forged'], title: 'forged', note: 'Sticker fee' });
  assert.equal(created.status, 201, JSON.stringify(created));
  const bill = created.body.billing;
  assert.equal(bill.vehicle_registration_id, 'vehicle-1');
  assert.deepEqual(bill.assignedTo, ['home-1']);
  assert.equal(bill.title, 'Vehicle registration - ABC 123');
  assert.match(bill.description, /Sticker fee/);
  assert.equal(f.pool.tables.billing_assignments[0].homeowner_id, 'home-1');
  assert.equal(f.pool.tables.notifications.length, 1);
  assert.equal((await f.request('GET', '/api/vehicleRegistrations')).body[0].billingId, bill.id);
  assert.equal((await f.request('GET', endpoint)).body.billing.id, bill.id);
  assert.equal((await f.request('POST', endpoint, { vehicleVersion: preview.body.vehicleVersion, amount: 200, noDueDate: true })).status, 409);
  assert.equal((await f.request('PUT', `/api/billings/${bill.id}`, { vehicle_registration_id: null })).status, 400);
  assert.equal((await f.request('POST', '/api/billings', { ...bill, id: 'forged', noDueDate: true })).status, 400);
  assert.equal((await f.request('PUT', '/api/billings', [])).status, 409);
});

test('vehicle billing checks approval, homeowner eligibility, stale details and permissions', async t => {
  const f = await setup(t, { registrationStatus: 'Pending' });
  assert.equal((await f.request('GET', endpoint)).status, 409);
  f.pool.tables.vehicleRegistrations[0].registrationStatus = 'Approved';
  assert.equal((await f.request('PUT', '/api/vehicleRegistrations/vehicle-1', { paymentStatus: 'Paid' })).status, 200);
  assert.equal((await f.request('GET', endpoint)).status, 409);
  assert.equal((await f.request('POST', endpoint, { amount: 200, noDueDate: true })).status, 409);
  assert.equal((await f.request('PUT', '/api/vehicleRegistrations/vehicle-1', { paymentStatus: 'Unpaid' })).status, 200);
  const preview = await f.request('GET', endpoint);
  f.pool.tables.vehicleRegistrations[0].plateNumber = 'NEW 456';
  assert.equal((await f.request('POST', endpoint, { vehicleVersion: preview.body.vehicleVersion, amount: 200, noDueDate: true })).status, 409);
  f.pool.tables.vehicleRegistrations[0].homeownerId = null;
  assert.equal((await f.request('GET', endpoint)).status, 400);
  f.pool.tables.vehicleRegistrations[0].homeownerId = 'home-1';
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["vehicles","billing"]';
  assert.equal((await f.request('GET', endpoint)).status, 400);
  for (const id of [null, 'resident-1', 'inactive-1']) {
    assert.equal((await f.request('GET', endpoint, undefined, id)).status, id ? 403 : 401);
  }
});

test('vehicle management offers Create Billing, then View Billing, and reviews details before saving', async () => {
  const calls = [];
  const elements = { vehicleBillingForm: { reportValidity: () => true }, vb_amount: { value: '200' },
    vb_no_due: { checked: true }, vb_note: { value: 'Registration fee' } };
  const context = { currentUser: { role: 'admin' }, safeVehicleEscape: value => String(value),
    document: { getElementById: id => elements[id] },
    openModal: (title, html, buttons) => calls.push({ title, html, buttons }),
    api: { request: async (path, options) => {
      calls.push({ path, options });
      return options ? { billing: { id: 'bill-1' } } : { homeowner: { id: 'home-1', name: 'Resident' },
        billing_type: 'Other Billing', title: 'Vehicle registration - ABC 123', description: 'Car, ABC 123', fee: 200, vehicleVersion: 'version' };
    }, loadAll: async () => {} }, closeModal() {}, renderVehicleManagement() {}, showToast() {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/vehicles.js'), 'utf8'), context);
  const vehicle = { id: 'vehicle-1', registrationStatus: 'Approved', homeownerId: 'home-1' };
  assert.match(context.vehicleBillingAction(vehicle), /Create Billing/);
  assert.match(context.vehicleBillingAction({ ...vehicle, billingId: 'bill-1' }), /View Billing/);
  assert.match(context.vehicleBillingAction({ ...vehicle, paymentStatus: 'Paid' }), /View Payment Status/);
  assert.doesNotMatch(context.vehicleBillingAction({ ...vehicle, paymentStatus: 'Paid' }), /Create Billing/);
  assert.equal(context.vehicleBillingAction({ ...vehicle, registrationStatus: 'Pending' }), '');
  await context.openVehicleBilling('vehicle-1');
  assert.equal(calls[1].title, 'Create Vehicle Billing');
  calls[1].buttons[1].action();
  const review = calls.at(-1);
  assert.equal(review.title, 'Review Vehicle Billing');
  assert.match(review.html, /Registration fee/);
  await review.buttons[1].action();
  const payload = JSON.parse(calls.find(call => call.options)?.options.body);
  assert.equal(payload.vehicleVersion, 'version');
  assert.equal(payload.amount, 200);
});
