'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { auditFixture } = require('./helpers/audit-fixture.cjs');
const { password } = require('./helpers/auth-fixture.cjs');
const { createAuditService, changeSummary } = require('../src/services/auditService');

test('all audit mutations are rejected for admins, audit-only officers, residents and anonymous clients; reads and legacy filters survive', async t => {
  const f = await auditFixture(t);
  f.pool.users.push({ id: 'officer', role: 'homeowner', status: 'active', permissions: '["auditlog"]' });
  const old = { id: 'legacy', action: 'Legacy billing created', adminId: 'deleted-user', timestamp: '2025-01-01 08:30' };
  f.pool.tables.auditLog.push(old);
  for (const id of ['admin-1', 'officer', 'resident-1', null]) {
    for (const [method, path, body] of [
      ['POST', '/api/auditLog', { id: 'fake', action: 'forged', adminId: 'admin-1' }],
      ['PUT', '/api/auditLog', []], ['DELETE', '/api/auditLog/legacy'],
      ['PUT', '/api/auditLog/legacy', { action: 'edited' }],
      ['PATCH', '/api/auditLog/legacy', { action: 'edited' }],
      ['DELETE', '/api/auditLog'], ['POST', '/api/AUDITLOG', {}],
    ]) assert.equal((await f.request(method, path, body, id)).status, 403);
  }
  for (const id of ['admin-1', 'officer']) {
    assert.deepEqual((await f.request('GET', '/api/auditLog?q=billing&startDate=2025-01-01&endDate=2025-01-01', undefined, id)).body, [old]);
  }
  assert.equal((await f.request('GET', '/api/auditLog', undefined, 'resident-1')).status, 403);
  assert.equal((await f.request('GET', '/api/auditLog', undefined, null)).status, 401);
  assert.deepEqual(f.pool.tables.auditLog, [old]);
});

test('audit reads are not cached and searchable event-time names survive account deletion', async t => {
  const f = await auditFixture(t);
  const row = { id: 'snapshot', adminId: 'deleted', actor_name: 'Former Operator', action: 'Updated billing', timestamp: '2026-10-24T05:00:00Z' };
  f.pool.tables.auditLog.push(row);
  const response = await f.request('GET', '/api/auditLog?q=former');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(response.body, [row]);
  const denied = await f.request('GET', '/api/auditLog', undefined, 'resident-1');
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('cache-control'), 'private, no-store');
});

test('audit IP evidence uses the trusted request address, never a raw forwarding header', async () => {
  const writes = [];
  const service = createAuditService({
    getPool: () => ({ execute: async (sql, values) => writes.push(values) }),
    resolveActor: async () => ({ id: 'admin-1', name: 'Operator', role: 'admin' }),
  });
  await service.record({ ip: '203.0.113.8', headers: { 'x-forwarded-for': 'forged, 203.0.113.8' } }, { table: 'billings', id: 'b1', operation: 'updated' });
  assert.equal(writes[0][10], '203.0.113.8');
  await service.record({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': 'forged' } }, { table: 'billings', id: 'b1', operation: 'updated' });
  assert.equal(writes[1][10], '127.0.0.1');
});

test('summaries omit empty-to-empty noise while preserving changes to protected values', () => {
  assert.equal(changeSummary({}, { purpose: '', reviewedAt: null, status: 'Pending' }, ['purpose', 'reviewedAt', 'status']), 'status: (empty) -> Pending');
  assert.equal(changeSummary({ purpose: 'old secret' }, { purpose: 'new secret' }, ['purpose']), 'purpose: [redacted] -> [redacted]');
  assert.equal(changeSummary({ purpose: 'old secret' }, { purpose: '' }, ['purpose']), 'purpose: [redacted] -> (empty)');
});

test('booking summaries record allowed amenities and valid times while keeping free text private', () => {
  const columns = ['amenity', 'startTime', 'endTime', 'purpose'];
  const summary = changeSummary({}, { amenity: 'Clubhouse', startTime: '09:00', endTime: '13:30', purpose: 'Private celebration' }, columns);
  assert.match(summary, /amenity: \(empty\) -> Clubhouse/);
  assert.match(summary, /startTime: \(empty\) -> 09:00; endTime: \(empty\) -> 13:30/);
  assert.doesNotMatch(summary, /Private celebration/);
  const invalid = changeSummary({}, { amenity: 'PRIVATE ADDRESS', startTime: '25:90', endTime: 'PRIVATE TEXT' }, columns);
  assert.doesNotMatch(invalid, /PRIVATE|25:90/);
});

test('generic mutations audit authenticated actors once, redact content, and roll back required audit failures', async t => {
  const f = await auditFixture(t);
  const rows = f.pool.tables;
  f.pool.users.push({ id: 'officer', role: 'hoa_officer', status: 'active', permissions: '["complaints","amenities","vehicles","lostfound","payments"]' });
  rows.complaints.push({ id: 'case-1', homeownerId: 'home-1', status: 'Reviewed', description: 'private case details' });
  rows.amenityBookings.push({ id: 'booking-1', status: 'Pending' });
  rows.vehicleRegistrations.push({ id: 'vehicle-1', registrationStatus: 'Pending' });
  rows.lostFound.push({ id: 'lost-1', status: 'Pending' });
  const mutations = [
    ['complaints', 'case-1', { status: 'Resolved', adminResponse: 'secret response' }],
    ['amenityBookings', 'booking-1', { status: 'Approved', adminRemarks: 'private note' }],
    ['vehicleRegistrations', 'vehicle-1', { registrationStatus: 'Approved', plateNumber: 'PRIVATE-PLATE' }],
    ['lostFound', 'lost-1', { status: 'Claimed', remarks: 'private note' }],
  ];
  for (const [table, id, body] of mutations) {
    const result = await f.request('PUT', `/api/${table}/${id}`, { ...body, adminId: 'fake', actor: 'fake', action: 'forged', timestamp: '1900-01-01' }, 'officer');
    assert.equal(result.status, 200, JSON.stringify(result));
    const log = rows.auditLog.at(-1);
    assert.equal(log.adminId, 'officer');
    assert.match(log.action, new RegExp(`hoa_officer \\(officer\\).*${table} \\(${id}\\)`));
    assert.match(log.timestamp, /^\d{4}-\d\d-\d\dT/);
  }
  assert.equal(rows.auditLog.length, mutations.length);
  assert.doesNotMatch(JSON.stringify(rows.auditLog), /private case|secret response|private note|PRIVATE-PLATE|forged|1900-01-01/);
  f.pool.failAudit = true;
  const failed = await f.request('PUT', '/api/complaints/case-1', { status: 'Rejected' }, 'officer');
  assert.equal(failed.status, 500);
  assert.equal(rows.complaints[0].status, 'Resolved');
  assert.equal(rows.auditLog.length, mutations.length);
  assert.ok(f.pool.rollbacks > 0);
});

test('homeowner self edits and account lifecycle changes are audited with safe summaries', async t => {
  const f = await auditFixture(t);
  const rows = f.pool.tables;
  let response = await f.request('PUT', '/api/homeowners/home-1', { name: 'Private Name', contact: 'private phone' }, 'resident-1');
  assert.equal(response.status, 200, JSON.stringify(response));
  assert.match(rows.auditLog.at(-1).action, /^homeowner \(resident-1\) updated homeowners \(home-1\)/);
  response = await f.request('POST', '/api/users', { id: 'new-admin', username: 'newadmin', name: 'New Admin', email: 'new@example.test', password: 'Secret-password-123', role: 'admin' });
  assert.equal(response.status, 201, JSON.stringify(response));
  response = await f.request('PUT', '/api/users/new-admin', { role: 'homeowner', permissions: ['payments'], status: 'deactivated' });
  assert.equal(response.status, 200, JSON.stringify(response));
  assert.match(rows.auditLog.at(-1).action, /permissions: \* -> payments.*status: active -> deactivated/);
  response = await f.request('POST', '/api/change-password', { currentPassword: password, newPassword: 'Changed-password-123' }, 'resident-1');
  assert.equal(response.status, 200, JSON.stringify(response));
  assert.match(rows.auditLog.at(-1).action, /password/);
  assert.doesNotMatch(JSON.stringify(rows.auditLog), /Private Name|private phone|Secret-password|Changed-password|\$2[aby]\$/);
  response = await f.request('DELETE', '/api/users/new-admin');
  assert.equal(response.status, 200);
  assert.match(rows.auditLog.at(-1).action, /archived users \(new-admin\)/);
});

test('bulk replacement logs changes and removals atomically without clearing history', async t => {
  const f = await auditFixture(t);
  const rows = f.pool.tables;
  rows.appSettings.push({ id: 'one', value: 'secret-one' }, { id: 'two', value: 'secret-two' });
  const result = await f.request('PUT', '/api/appSettings', [{ id: 'one', value: 'changed-secret' }, { id: 'three', value: 'new-secret' }]);
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(rows.auditLog.length, 3);
  assert.match(rows.auditLog[0].action, /deleted appSettings \(two\)/);
  assert.doesNotMatch(JSON.stringify(rows.auditLog), /secret/);
  f.pool.failAudit = true;
  const before = structuredClone(rows.appSettings);
  assert.equal((await f.request('PUT', '/api/appSettings', [])).status, 500);
  assert.deepEqual(rows.appSettings, before);
  assert.equal(rows.auditLog.length, 3);
});

test('dedicated announcement and moderation routes emit one entry and respect audit failure', async t => {
  const f = await auditFixture(t);
  const rows = f.pool.tables;
  let response = await f.request('POST', '/api/announcements', { id: 'announcement-1', title: 'Test', content: 'Private announcement body' });
  assert.equal(response.status, 201, JSON.stringify(response));
  response = await f.request('PUT', '/api/announcements/announcement-1', { title: 'Updated' });
  assert.equal(response.status, 200, JSON.stringify(response));
  response = await f.request('PATCH', '/api/announcements/announcement-1/pin', { is_pinned: true });
  assert.equal(response.status, 200);
  response = await f.request('DELETE', '/api/announcements/announcement-1');
  assert.equal(response.status, 200);
  assert.equal(rows.auditLog.length, 4);
  rows.lostFound.push({ id: 'lost-1', status: 'Pending' });
  response = await f.request('POST', '/api/lost-found/lost-1/approve', {});
  assert.equal(response.status, 200);
  response = await f.request('POST', '/api/lostfound/lost-1/reject', { reason: 'sensitive moderation reason' });
  assert.equal(response.status, 200);
  assert.equal(rows.auditLog.length, 6);
  assert.doesNotMatch(JSON.stringify(rows.auditLog), /Private announcement body|sensitive moderation reason/);
  f.pool.failAudit = true;
  response = await f.request('POST', '/api/announcements', { id: 'failed', title: 'Test', content: 'Body' });
  assert.equal(response.status, 500);
  assert.equal(rows.announcements.length, 0);
});

test('manual payment, approval and rejection commit with their audit or roll back together', async t => {
  const f = await auditFixture(t);
  const rows = f.pool.tables;
  rows.billings.push({ id: 'bill-1', title: 'Test bill', amount: 100, assignedTo: '["home-1"]', status: 'active' });
  const body = { homeownerId: 'home-1', billingId: 'bill-1', amount: 50, payment_method: 'Cash', payment_date: '2026-10-22' };
  f.pool.failAudit = true;
  assert.equal((await f.request('POST', '/api/payments/manual', body)).status, 500);
  assert.equal(rows.payments.length, 0);
  assert.equal(rows.billings[0].status, 'active');
  f.pool.failAudit = false;
  let result = await f.request('POST', '/api/payments/manual', body);
  assert.equal(result.status, 201, JSON.stringify(result));
  assert.equal(rows.auditLog.length, 1);
  assert.match(rows.auditLog[0].action, /manually recorded and approved payments/);
  rows.payments.push({ id: 'pending-1', homeownerId: 'home-1', billingId: 'bill-1', amount: 50, status: 'pending' });
  f.pool.failAudit = true;
  assert.equal((await f.request('POST', '/api/payments/pending-1/approve', {})).status, 500);
  assert.equal(rows.payments.find(p => p.id === 'pending-1').status, 'pending');
  assert.equal(rows.billings[0].status, 'partially_paid');
  f.pool.failAudit = false;
  result = await f.request('POST', '/api/payments/pending-1/approve', {});
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(rows.auditLog.length, 2);
  assert.equal(rows.billings[0].status, 'paid');
  assert.equal((await f.request('POST', '/api/payments/pending-1/approve', {})).status, 400);
  assert.equal(rows.auditLog.length, 2);
  rows.payments.push({ id: 'pending-2', homeownerId: 'home-1', amount: 25, status: 'pending' });
  result = await f.request('POST', '/api/payments/pending-2/reject', { reason: 'Private payment explanation' });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(rows.auditLog.length, 3);
  assert.doesNotMatch(JSON.stringify(rows.auditLog), /Private payment explanation/);
});

test('audit transaction fails closed even if a caller catches its write failure; postcommit effects stay deferred', async () => {
  const events = [];
  const connection = { beginTransaction: async () => events.push('begin'), execute: async () => { throw Error('audit failed'); }, commit: async () => events.push('commit'), rollback: async () => events.push('rollback'), release: () => events.push('release') };
  const audit = createAuditService({ getPool: () => ({ getConnection: async () => connection }), resolveActor: async () => ({ id: 'real-user', role: 'homeowner' }) });
  await assert.rejects(audit.transaction({}, async () => {
    audit.afterCommit(() => events.push('email/file-delete'));
    await audit.record({}, { table: 'users', id: 'target', operation: 'updated' }).catch(() => {});
  }));
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
  const summary = changeSummary({}, { password: 'secret', description: 'private case', receipt: 'file', status: 'Resolved', action: 'forged' }, ['password', 'description', 'receipt', 'status']);
  assert.match(summary, /status: \(empty\) -> Resolved/);
  assert.doesNotMatch(summary, /secret|private case|file|forged/);
});

test('billing CRUD and monthly generation log each affected record; generation rolls back as a batch', async t => {
  const f = await auditFixture(t);
  const rows = f.pool.tables;
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["resident"]';
  const bill = { id: 'bill-1', title: 'Community charge', amount: 100, assignedTo: ['home-1'], dueDate: '2026-10-31', billing_type: 'other' };
  let result = await f.request('POST', '/api/billings', bill);
  assert.equal(result.status, 201, JSON.stringify(result));
  result = await f.request('PUT', '/api/billings/bill-1', { amount: 125 });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.match(rows.auditLog.at(-1).action, /amount: 100 -> 125/);
  assert.equal((await f.request('DELETE', '/api/billings/bill-1')).status, 200);
  assert.equal(rows.auditLog.length, 3);
  f.pool.failAudit = true;
  assert.equal((await f.request('POST', '/api/billings/generate-monthly-dues', { month: '2026-11' })).status, 500);
  assert.equal(rows.billings.filter(row => row.archived_at == null).length, 0);
  f.pool.failAudit = false;
  result = await f.request('POST', '/api/billings/generate-monthly-dues', { month: '2026-11' });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(rows.billings.filter(row => row.archived_at == null).length, 1);
  assert.equal(rows.auditLog.length, 4);
  assert.match(rows.auditLog.at(-1).action, /generated monthly dues for billings/);
  assert.match(rows.auditLog.at(-1).action, /2026-11/);
  assert.equal((await f.request('POST', '/api/billings/generate-monthly-dues', { month: '2026-11' })).status, 200);
  assert.equal(rows.auditLog.length, 4);
});

test('payment settings, QR removal and generic settings paths are audited without account details', async t => {
  const f = await auditFixture(t);
  const rows = f.pool.tables;
  let result = await f.request('PUT', '/api/payment-settings', { account_name: 'Private holder', account_number: 'private-account-number', instructions: 'private instructions', is_active: true });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(rows.auditLog.length, 1);
  rows.payment_settings[0].qr_code_path = 'private:payment-qrcodes/old.png';
  result = await f.request('DELETE', '/api/payment-settings/qr');
  assert.equal(result.status, 200);
  assert.equal(rows.auditLog.length, 2);
  assert.equal(rows.payment_settings[0].qr_code_path, null);
  assert.equal((await f.request('DELETE', '/api/payment-settings/qr')).status, 200);
  assert.equal(rows.auditLog.length, 2);
  f.pool.failAudit = true;
  assert.equal((await f.request('PUT', '/api/payment-settings', { is_active: false })).status, 500);
  assert.equal(rows.payment_settings[0].is_active, 1);
  f.pool.failAudit = false;
  result = await f.request('PUT', '/api/payment_settings/ps_gcash', { account_number: 'another-private-number' });
  assert.equal(result.status, 200);
  assert.equal(rows.auditLog.length, 3);
  assert.doesNotMatch(JSON.stringify(rows.auditLog), /Private holder|private-account-number|private instructions|old.png|another-private-number/);
});

test('homeowner account registration/reset and token resets identify the correct authenticated actor', async t => {
  const f = await auditFixture(t);
  const rows = f.pool.tables;
  rows.homeowners.push({ id: 'new-home', name: 'Homeowner' });
  let result = await f.request('POST', '/api/homeowners/new-home/account', {
    email: 'new-home@example.test', mobile: '09123456789', password: 'Initial-password-123',
    termsAccepted: true, privacyAcknowledged: true, policyVersion: '2026-10-06', permissions: ['resident'],
  });
  assert.equal(result.status, 201, JSON.stringify(result));
  const accountId = result.body.id;
  assert.equal(rows.auditLog.filter(row => row.action.includes(`users (${accountId})`)).length, 1);
  result = await f.request('POST', '/api/homeowners/new-home/reset-password', { password: 'Reset-password-123' });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.match(rows.auditLog.at(-1).action, /admin \(admin-1\) reset password for users/);
  const crypto = require('node:crypto');
  const token = 'a'.repeat(64);
  const user = rows.users.find(u => u.id === accountId);
  user.reset_token_hash = crypto.createHash('sha256').update(token).digest('hex');
  const tokenHash = user.reset_token_hash;
  user.reset_token_expires_at = Date.now() + 60000;
  f.pool.failAudit = true;
  assert.equal((await f.request('POST', '/api/reset-password', { token, newPassword: 'Token-password-123' })).status, 500);
  assert.equal(rows.users.find(u => u.id === accountId).reset_token_hash, tokenHash);
  f.pool.failAudit = false;
  result = await f.request('POST', '/api/reset-password', { token, newPassword: 'Token-password-123', adminId: 'fake' });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(rows.auditLog.at(-1).adminId, accountId);
  assert.match(rows.auditLog.at(-1).action, /homeowner .*reset password using verified reset link/);
  assert.doesNotMatch(JSON.stringify(rows.auditLog), /Initial-password|Reset-password|Token-password|aaaaaaaaaaaaaaaa|fake/);
});

test('multipart payment submission is audited once and audit failure preserves data and cleans the new upload', async t => {
  const f = await auditFixture(t);
  const fs = require('node:fs');
  const rows = f.pool.tables;
  rows.billings.push({ id: 'bill-1', title: 'Bill', amount: 100, assignedTo: '["home-1"]', status: 'active' });
  const form = () => {
    const data = new FormData();
    data.set('billingId', 'bill-1'); data.set('amount', '50'); data.set('refNum', 'PRIVATE-REFERENCE');
    data.set('adminId', 'fake'); data.set('timestamp', '1900-01-01'); data.set('action', 'forged');
    data.set('receipt', new Blob([Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])], { type: 'image/png' }), 'proof.png');
    return data;
  };
  f.pool.failAudit = true;
  let result = await f.request('POST', '/api/payments/submit', form(), 'resident-1');
  assert.equal(result.status, 500, JSON.stringify(result));
  assert.equal(rows.payments.length, 0);
  assert.equal(rows.auditLog.length, 0);
  assert.deepEqual(fs.readdirSync(f.uploadDir), []);
  f.pool.failAudit = false;
  result = await f.request('POST', '/api/payments/submit', form(), 'resident-1');
  assert.equal(result.status, 201, JSON.stringify(result));
  assert.equal(rows.payments.length, 1);
  assert.equal(rows.auditLog.length, 1);
  assert.equal(rows.auditLog[0].adminId, 'resident-1');
  assert.match(rows.auditLog[0].action, /homeowner \(resident-1\) submitted payments/);
  assert.doesNotMatch(JSON.stringify(rows.auditLog), /PRIVATE-REFERENCE|proof.png|private:|fake|1900-01-01|forged/);
  assert.equal(fs.readdirSync(f.uploadDir).length, 1);
});

test('browser logAction cannot write audit data or fabricate local success entries', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/main.js'), 'utf8');
  const helper = source.match(/function logAction\([^]*?\n\}/)[0];
  vm.runInNewContext(helper + '\nlogAction("forged success");', { db: new Proxy({}, { get() { throw Error('Unexpected client database access'); } }) });
  assert.doesNotMatch(source, /db\.set\('auditLog'/);
});
