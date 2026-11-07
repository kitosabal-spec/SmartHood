'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { auditFixture } = require('./helpers/audit-fixture.cjs');
const endpoint = '/api/vehicleRegistrations';
const application = { registrantType: 'homeowner', homeownerId: 'home-1', plateNumber: 'ab-123', vehicleType: 'Car' };

test('browser: confirm, retry a failed save, switch registration types and refresh the management page', {
  skip: process.env.TEST_VEHICLE_BROWSER !== '1',
}, async t => {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const f = await auditFixture(t);
  Object.assign(f.pool.tables.homeowners[0], { block: 'Block 3', lot: 'Lot 7' });
  const browser = await chromium.launch({ executablePath: process.env.REPORT_BROWSER_EXECUTABLE, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.request().url().startsWith(f.base) ? route.continue() : route.abort());
  await page.context().addCookies([{ name: 'smarthood_session', value: f.cookie('admin-1').split('=')[1], url: f.base }]);
  await page.goto(f.base);
  await page.waitForFunction(() => currentUser?.role === 'admin');
  await page.evaluate(() => navigate('vehicles'));
  await page.getByRole('button', { name: 'Add Vehicle' }).click();
  await page.locator('#vr_property').fill(await page.locator('#vr_properties option').first().getAttribute('value'));
  await page.locator('#vr_plateNumber').fill('xy 567');
  assert.equal(await page.locator('#vr_plateNumber').inputValue(), 'XY 567');
  assert.equal(await page.locator('#vr_ownerName').isVisible(), false);
  await page.getByRole('button', { name: 'Register Vehicle', exact: true }).click();
  assert.equal(f.pool.tables.vehicleRegistrations.length, 0);
  f.pool.failAudit = true;
  await page.getByRole('button', { name: 'Confirm Registration' }).click();
  await page.locator('#vr_property').waitFor();
  assert.equal(f.pool.tables.vehicleRegistrations.length, 0);
  assert.equal(await page.locator('#vr_plateNumber').inputValue(), 'XY 567');
  f.pool.failAudit = false;
  await page.getByRole('button', { name: 'Register Vehicle', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Registration' }).click();
  await page.locator('#vehicleTableBody').getByText('XY 567').waitFor();
  assert.deepEqual(await page.locator('.vehicles-stats-grid .stat-value').allTextContents(), ['1', '1', '0']);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Add Vehicle' }).click();
  await page.locator('#vr_registrantType').selectOption('nonHomeowner');
  assert.equal(await page.locator('#vr_ownerName').isVisible(), true);
  assert.equal(await page.locator('#vr_location').isVisible(), true);
  assert.match(await page.locator('#vr_fee').inputValue(), /250/);
  assert.ok(await page.locator('#vehicleEntry').evaluate(form => form.scrollWidth <= form.clientWidth));
  await page.locator('#vr_property').fill(await page.locator('#vr_properties option').first().getAttribute('value'));
  assert.equal(await page.locator('#vr_location').isVisible(), false);
});

test('admin links directory records with or without accounts and keeps guest owners separate', async t => {
  const f = await auditFixture(t);
  const rows = f.pool.tables;
  rows.homeowners.push({ id: 'offline', name: 'No Login', block: 'B', lot: '4' });
  const accounts = rows.users.length;
  const first = await f.request('POST', endpoint, { ...application, homeownerId: 'offline', ownerName: 'Wrong', block: 'Wrong',
    registrationStatus: 'Approved', paymentStatus: 'Paid', fee: 1, stickerNumber: 'fake', releasedAt: 'yesterday' });
  assert.equal(first.status, 201);
  const v = first.body;
  assert.deepEqual([v.homeownerId, v.ownerName, v.block, v.lot, v.plateNumber, v.fee, v.registrationStatus, v.paymentStatus, v.stickerNumber, v.releasedAt],
    ['offline', 'No Login', 'B', '4', 'AB-123', 200, 'Pending', 'Unpaid', null, '']);
  assert.equal((await f.request('POST', endpoint, { ...application, homeownerId: 'offline', plateNumber: 'XYZ' })).status, 201);
  assert.equal(rows.notifications.length, 0);
  const guest = { ...application, registrantType: 'nonHomeowner', ownerName: 'Guest Owner', plateNumber: 'Guest 1' };
  const linked = await f.request('POST', endpoint, guest);
  assert.equal(linked.status, 201);
  assert.equal(linked.body.ownerName, guest.ownerName);
  assert.equal(linked.body.fee, 250);
  assert.deepEqual(rows.notification_recipients.map(n => n.user_id), ['resident-1']);
  assert.deepEqual((await f.request('GET', endpoint, undefined, 'resident-1')).body.map(v => v.id), [linked.body.id]);
  const standalone = await f.request('POST', endpoint, { ...guest, homeownerId: null, plateNumber: 'guest 2', registrationLocation: 'Gatehouse contractor' });
  assert.equal(standalone.status, 201);
  assert.equal(standalone.body.homeownerId, null);
  assert.equal(standalone.body.registrationLocation, 'Gatehouse contractor');
  assert.equal(rows.homeowners.length, 2);
  assert.equal(rows.users.length, accounts);
  assert.equal(rows.auditLog.length, 4);
  assert.ok(rows.auditLog.every(log => log.adminId === 'admin-1'));
});

test('permissions, invalid fields and failed audits leave registrations and notifications untouched', async t => {
  const f = await auditFixture(t);
  const rows = f.pool.tables;
  for (const fields of [{ homeownerId: '' }, { homeownerId: 'missing' }, { plateNumber: ' - ' }, { vehicleType: 'invalid' },
    { registrantType: 'nonHomeowner', ownerName: 'Guest', homeownerId: null }, { registrantType: 'nonHomeowner', ownerName: ' ' }]) {
    assert.equal((await f.request('POST', endpoint, { ...application, ...fields })).status, 400);
  }
  assert.equal((await f.request('POST', endpoint, application, null)).status, 401);
  assert.equal((await f.request('POST', endpoint, { ...application, homeownerId: 'another' }, 'resident-1')).status, 403);
  assert.equal((await f.request('PUT', endpoint, [], 'resident-1')).status, 403);
  assert.equal((await f.request('PUT', endpoint, [])).status, 405);
  assert.equal((await f.request('PUT', endpoint + '/other', { registrationStatus: 'Approved' }, 'resident-1')).status, 403);
  assert.equal((await f.request('DELETE', endpoint + '/other', undefined, 'resident-1')).status, 403);
  f.pool.failAudit = true;
  assert.equal((await f.request('POST', endpoint, application)).status, 500);
  assert.equal(rows.vehicleRegistrations.length, 0);
  assert.equal(rows.notifications.length, 0);
  assert.equal(rows.auditLog.length, 0);
  f.pool.failAudit = false;
  const own = await f.request('POST', endpoint, { ...application, block: '1', lot: '2', ownerName: 'Owner',
    registrationStatus: 'Approved', paymentStatus: 'Paid' }, 'resident-1');
  assert.equal(own.status, 201);
  assert.deepEqual([own.body.homeownerId, own.body.registrationStatus, own.body.paymentStatus], ['home-1', 'Pending', 'Unpaid']);
});

test('active plate collisions include legacy records, and Manage enforces sticker release conditions', async t => {
  const f = await auditFixture(t);
  f.pool.tables.vehicleRegistrations.push({ id: 'legacy', plateNumber: ' aB 123 ', registrationStatus: 'Approved', stickerNumber: ' Old ' });
  assert.equal((await f.request('POST', endpoint, application)).status, 409);
  const legacy = endpoint + '/legacy';
  assert.equal((await f.request('PUT', legacy, { registrationStatus: 'Expired' })).status, 200);
  const created = await f.request('POST', endpoint, application);
  assert.equal(created.status, 201);
  assert.equal((await f.request('POST', endpoint, { ...application, plateNumber: 'AB 123' })).status, 409);
  const url = endpoint + '/' + created.body.id;
  assert.equal((await f.request('PUT', url, { stickerNumber: 'old' })).status, 409);
  for (const fields of [{ stickerNumber: 'S1', registrationStatus: 'Approved' }, { stickerNumber: 'S1', paymentStatus: 'Paid' },
    { registrationStatus: 'Approved', paymentStatus: 'Paid' }]) {
    assert.equal((await f.request('PUT', url, { ...fields, releasedAt: 'now' })).status, 400);
  }
  const released = await f.request('PUT', url, { releasedAt: 'forged date', stickerNumber: 's1', registrationStatus: 'Approved', paymentStatus: 'Paid' });
  assert.equal(released.status, 200);
  assert.match(released.body.releasedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(released.body.stickerNumber, 'S1');
});

test('administrator edits vehicle details and archives a registration', async t => {
  const f = await auditFixture(t);
  f.pool.tables.homeowners[0].block = 'Block 3';
  f.pool.tables.homeowners[0].lot = 'Lot 7';
  const created = await f.request('POST', endpoint, application);
  assert.equal(created.status, 201);
  const url = endpoint + '/' + created.body.id;
  const edit = await f.request('PUT', url, { registrantType: 'nonHomeowner', vehicleType: 'Motorcycle',
    homeownerId: 'home-1', ownerName: 'Guest Driver', plateNumber: 'NEW 987' });
  assert.equal(edit.status, 200, JSON.stringify(edit));
  assert.equal(edit.body.ownerName, 'Guest Driver');
  assert.equal(edit.body.fee, 250);
  assert.equal(edit.body.activePlateKey, 'NEW987');
  assert.equal((await f.request('GET', endpoint)).body[0].plateNumber, 'NEW 987');
  f.pool.tables.vehicleRegistrations.push({ id: 'legacy-plate', plateNumber: 'TAKEN 1', registrationStatus: 'Approved', activePlateKey: null });
  assert.equal((await f.request('PUT', url, { plateNumber: 'taken-1' })).status, 409);
  assert.equal((await f.request('PUT', url, { paymentStatus: 'Paid' })).status, 200);
  assert.equal((await f.request('PUT', url, { registrantType: 'homeowner' })).status, 409);
  assert.equal((await f.request('PUT', url, { plateNumber: 'OTHER 1' }, 'resident-1')).status, 403);
  assert.equal((await f.request('DELETE', url, undefined, 'resident-1')).status, 403);
  assert.equal((await f.request('DELETE', url)).status, 200);
  assert.equal((await f.request('GET', endpoint)).body.length, 1);
});

test('billed vehicle details cannot be changed, while status and archiving remain available', async t => {
  const f = await auditFixture(t);
  const created = await f.request('POST', endpoint, application);
  const url = endpoint + '/' + created.body.id;
  f.pool.tables.billings.push({ id: 'bill-1', vehicle_registration_id: created.body.id, status: 'active' });
  assert.equal((await f.request('PUT', url, { plateNumber: 'NEW 987' })).status, 409);
  assert.equal((await f.request('PUT', url, { registrationStatus: 'Approved' })).status, 200);
  assert.equal((await f.request('DELETE', url)).status, 200);
  assert.equal(f.pool.tables.billings[0].vehicle_registration_id, created.body.id);
});

test('registration UI waits for persistence and only refreshes on success', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const calls = [];
  let finish;
  const context = { db: { save: () => new Promise((resolve, reject) => { finish = { resolve, reject }; }) },
    showToast: kind => calls.push(kind), closeModal() {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/vehicles.js'), 'utf8'), context);
  context.renderVehicleManagement = () => calls.push('refresh');
  const failed = context.submitVehicleRegistration(application, true);
  assert.deepEqual(calls, []);
  finish.reject(Error('Database unavailable'));
  assert.equal(await failed, false);
  assert.deepEqual(calls, ['error']);
  const success = context.submitVehicleRegistration(application, true);
  assert.deepEqual(calls, ['error']);
  finish.resolve({});
  assert.equal(await success, true);
  assert.deepEqual(calls, ['error', 'success', 'refresh']);
});

test('vehicle management keeps row actions compact and offers editing and deletion in Manage', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const context = { currentUser: { role: 'admin' }, toMoneyNumber: Number,
    db: { getOne: () => ({ id: 'v1', plateNumber: 'ABC 123', ownerName: 'Resident',
      vehicleType: 'Car', fee: 200, registrationStatus: 'Approved', paymentStatus: 'Unpaid' }) },
    openModal: (title, html, buttons) => { context.modal = { title, html, buttons }; },
    getVehicleLocation: () => 'Block 1 Lot 1', closeModal() {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/vehicles.js'), 'utf8'), context);
  const vehicle = context.db.getOne();
  const row = context.renderAdminVehicleRow(vehicle);
  assert.match(row, />Manage<\/button>/);
  assert.doesNotMatch(row, />Edit<\/button>|>Delete<\/button>|>Create Billing<\/button>/);
  assert.doesNotMatch(context.renderAdminVehicleRow({ ...vehicle, billingId: 'bill-1' }), />View Billing<\/button>/);
  context.openVehicleAdminModal('v1');
  assert.deepEqual(Array.from(context.modal.buttons, button => button.label), ['Cancel', 'Edit Details', 'Delete', 'Save Changes']);
  context.currentUser.role = 'homeowner';
  context.openVehicleAdminModal('v1');
  assert.deepEqual(Array.from(context.modal.buttons, button => button.label), ['Cancel', 'Save Changes']);
});

test('real MySQL: concurrent registrations, reactivation and archive share one active plate claim', {
  skip: process.env.TEST_LOCAL_MYSQL !== '1',
}, async t => {
  const mysql = require('mysql2/promise');
  const { runMigrations } = require('../src/db/migrationRunner');
  const schema = 'san_vehicle_test_' + require('node:crypto').randomBytes(8).toString('hex');
  const config = { host: '127.0.0.1', user: 'root', password: '' };
  const admin = await mysql.createConnection(config);
  let pool;
  try {
    await admin.query(`CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    pool = mysql.createPool({ ...config, database: schema });
    await runMigrations(pool);
    await pool.execute("INSERT INTO users (id, role) VALUES ('admin-1', 'admin')");
    await pool.execute("INSERT INTO homeowners (id, name) VALUES ('home-1', 'Resident')");
    const f = await auditFixture(t, { pool });
    const guest = { ...application, registrantType: 'nonHomeowner', homeownerId: null, ownerName: 'Guest', registrationLocation: 'Gatehouse' };
    const attempts = await Promise.all([f.request('POST', endpoint, application), f.request('POST', endpoint, { ...guest, plateNumber: 'AB 123' })]);
    assert.deepEqual(attempts.map(r => r.status).sort(), [201, 409], JSON.stringify(attempts));
    const first = endpoint + '/' + attempts.find(r => r.status === 201).body.id;
    assert.equal((await f.request('PUT', first, { registrationStatus: 'Rejected' })).status, 200);
    const second = await f.request('POST', endpoint, guest);
    assert.equal(second.status, 201);
    assert.equal((await f.request('PUT', first, { registrationStatus: 'Approved' })).status, 409);
    assert.equal((await f.request('DELETE', endpoint + '/' + second.body.id)).status, 200);
    assert.equal((await f.request('PUT', first, { registrationStatus: 'Approved' })).status, 200);
    const [[counts]] = await pool.query('SELECT COUNT(*) AS total, COUNT(activePlateKey) AS active FROM vehicleRegistrations');
    assert.deepEqual([counts.total, counts.active], [2, 1]);
  } finally {
    if (pool) {
      await pool.end();
      await admin.query(`DROP DATABASE \`${schema}\``);
    }
    await admin.end();
  }
});
