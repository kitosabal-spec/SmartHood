'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { S3Client } = require('@aws-sdk/client-s3');
const { createStorageService, readStorageConfig, objectKey, isObjectKey, PREFIXES, permanentReference, communityUrl } = require('../src/services/storageService');
const { createAuditService } = require('../src/services/auditService');
const { auditFixture } = require('./helpers/audit-fixture.cjs');

const env = { STORAGE_DRIVER: 'r2', R2_ACCOUNT_ID: 'test-account', R2_ACCESS_KEY_ID: 'test-access',
  R2_SECRET_ACCESS_KEY: 'test-secret', R2_BUCKET: 'test-bucket', R2_ENDPOINT: 'https://test-account.r2.cloudflarestorage.com' };
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
function file() { return { buffer: png, originalname: 'original.png', mimetype: 'image/png', size: png.length }; }
function mockR2() {
  const calls = [], objects = new Map();
  return { calls, objects, async send(command) {
    const type = command.constructor.name;
    calls.push({ type, input: command.input });
    const key = command.input.Key;
    if (type === 'PutObjectCommand') objects.set(key, command.input);
    if (type === 'DeleteObjectCommand') objects.delete(key);
    if (type === 'HeadObjectCommand') return { ContentLength: objects.get(key).Body.length, Metadata: objects.get(key).Metadata };
    if (type === 'GetObjectCommand') return { Body: { transformToByteArray: async () => objects.get(key).Body } };
    return {};
  } };
}
function proof(field = 'receipt', name = 'original.png', buffer = png, mime = 'image/png') {
  const form = new FormData();
  form.set('billingId', 'bill-1'); form.set('amount', '50'); form.set('refNum', 'private-test-reference');
  form.set(field, new Blob([buffer], { type: mime }), name);
  return form;
}
function ticket(kind, id, user, index = 0) {
  const payload = Buffer.from(JSON.stringify({ kind, recordId: id, userId: user, index, expires: Date.now() + 60000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', 'test-file-secret').update(payload).digest('base64url');
}
async function setup(t) {
  const client = mockR2(), signed = [];
  const f = await auditFixture(t, { env, storageClient: client, presign: async (_, command, options) => {
    signed.push({ command, options }); return 'https://objects.example.test/download?expires=300';
  } });
  f.pool.tables.billings.push({ id: 'bill-1', title: 'Bill', amount: 100, status: 'active', assignedTo: '["home-1"]' });
  return { ...f, client, signed };
}
async function read(f, kind, id, user = 'resident-1') {
  return fetch(`${f.base}/api/files/${kind}/${id}?access=${ticket(kind,id,user)}`, {
    headers: { Cookie: f.cookie(user) }, redirect: 'manual',
  });
}

test('R2 configuration is fail-fast, redacted, region auto, and local requires no credentials', () => {
  assert.deepEqual(readStorageConfig({}), { driver: 'local' });
  assert.throws(() => readStorageConfig({ STORAGE_DRIVER: 's3' }), /STORAGE_DRIVER/);
  for (const name of Object.keys(env).filter(k => k.startsWith('R2_'))) {
    assert.throws(() => readStorageConfig({ ...env, [name]: ' ' }), error => error.message.includes(name) && !error.message.includes('test-secret'));
  }
  for (const endpoint of ['bad', 'http://example.test', 'https://secret:password@example.test', 'https://example.test?secret=x']) {
    assert.throws(() => readStorageConfig({ ...env, R2_ENDPOINT: endpoint }), /R2_ENDPOINT/);
  }
  assert.equal(readStorageConfig(env).region, 'auto');
});

test('all storage categories use opaque UUID keys and reject executable types and traversal', () => {
  for (const kind of Object.keys(PREFIXES)) {
    const a = objectKey(kind, '.jpeg'), b = objectKey(kind, '.jpg');
    assert.ok(isObjectKey(a, kind)); assert.notEqual(a,b);
    assert.equal(a.split('/')[0], PREFIXES[kind]); assert.ok(a.endsWith('.jpg'));
  }
  assert.ok(isObjectKey(objectKey('resident-documents', '.pdf'), 'resident-documents'));
  for (const ext of ['.exe','.html','.svg','.js','.php','/../x.png']) assert.throws(() => objectKey('receipts',ext));
  assert.throws(() => objectKey('../receipts','.png'));
  assert.equal(isObjectKey('receipts/../../secret.png'), false);
  const key = objectKey('announcements','.png');
  assert.equal(permanentReference(communityUrl(key)),key);
});

test('uploads use private PUTs, preserve metadata, roll back new objects, and delete replacements only after commit', async () => {
  const events = [], client = mockR2(), metadata = [];
  const connection = { async beginTransaction() {}, async commit() { events.push('commit'); }, async rollback() { events.push('rollback'); }, release() {} };
  const audit = createAuditService({ getPool: () => ({ getConnection: async () => connection }), resolveActor: async () => ({ id: 'u', role: 'admin' }) });
  const service = createStorageService({ env, audit, client, metadata: async entry => metadata.push(entry) });
  let old;
  await audit.transaction({}, async () => { old = await service.store(file(),'receipts'); });
  const put = client.calls[0].input;
  assert.equal(put.ACL, undefined); assert.equal(put.CacheControl,'private, no-store'); assert.equal(put.ContentType,'image/png');
  assert.equal(metadata[0].originalname,'original.png'); assert.equal(metadata[0].size,png.length); assert.equal(metadata[0].provider,'r2');
  let failed;
  await assert.rejects(audit.transaction({}, async () => {
    failed = await service.store(file(),'receipts'); service.deleteAfterCommit(old,'receipts');
    throw new Error('DB failed');
  }));
  assert.equal(client.objects.has(failed),false); assert.equal(client.objects.has(old),true);
  await audit.transaction({}, async () => {
    await service.store(file(),'receipts'); service.deleteAfterCommit(old,'receipts');
    assert.equal(client.objects.has(old),true);
  });
  assert.equal(client.objects.has(old),false);
  assert.deepEqual(events,['commit','rollback','commit']);
});

test('deletion failures are safe and never log SDK messages or secrets', async () => {
  const logs = [], key = objectKey('receipts','.png');
  const service = createStorageService({ env, client: { send: async () => { throw new Error('test-secret private resident'); } }, logger: { error: (...args) => logs.push(args) } });
  assert.equal(await service.remove(key),false);
  assert.deepEqual(logs,[['Storage deletion failed',key,'StorageError']]);
});

test('community cleanup cannot delete private objects through a forged reference', async () => {
  const client = mockR2();
  const service = createStorageService({ env, client, audit: { afterCommit: work => work() } });
  const receipt = objectKey('receipts','.png');
  for (const kind of ['announcements','board','lostfound']) await service.deleteAfterCommit(receipt,kind);
  assert.equal(client.calls.length,0);
  assert.throws(() => service.deleteAfterCommit(receipt),/category/);
});

test('actual SDK presigning generates a five-minute GetObject URL with private no-store response headers', async () => {
  const config = readStorageConfig(env);
  const client = new S3Client(config);
  const service = createStorageService({ env, client });
  const url = new URL(await service.signedUrl(objectKey('receipts','.png')));
  assert.equal(url.searchParams.get('X-Amz-Expires'),'300');
  assert.equal(url.searchParams.get('response-cache-control'),'private, no-store');
  assert.match(url.searchParams.get('X-Amz-Credential'),/\/auto\/s3\/aws4_request$/);
  client.destroy();
});

test('payment HTTP uploads persist permanent keys, audit atomically, redirect only after auth, and replace after commit', async t => {
  const f = await setup(t);
  f.pool.failAudit = true;
  const failed = await f.request('POST','/api/payments/submit',proof(),'resident-1');
  assert.equal(failed.status,500);
  assert.equal(f.client.objects.size,0); assert.equal(f.pool.tables.payments.length,0); assert.equal(f.pool.tables.storage_objects.length,0);
  f.pool.failAudit = false;
  const result = await f.request('POST','/api/payments/submit',proof(),'resident-1');
  assert.equal(result.status,201,JSON.stringify(f.errors));
  const payment = f.pool.tables.payments[0], old = payment.receipt;
  assert.ok(isObjectKey(old,'receipts')); assert.match(result.body.payment.receipt,/^\/api\/files\/receipts\//);
  assert.equal(fs.readdirSync(f.uploadDir).length,0,'R2 Multer must never write to disk');
  assert.equal(f.pool.tables.storage_objects[0].original_name,'original.png');
  const response = await read(f,'receipts',payment.id);
  assert.equal(response.status,302); assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(f.signed[0].options.expiresIn,300); assert.equal(f.signed[0].command.input.Key,old);
  f.pool.failAudit = true;
  assert.equal((await f.request('POST',`/api/payments/${payment.id}/receipt`,proof(),'resident-1')).status,500);
  assert.equal(f.pool.tables.payments[0].receipt,old); assert.equal(f.client.objects.has(old),true);
  f.pool.failAudit = false;
  const before = f.pool.commits, send = f.client.send;
  f.client.send = async command => {
    if (command.constructor.name === 'DeleteObjectCommand' && command.input.Key === old) assert.ok(f.pool.commits > before);
    return send(command);
  };
  assert.equal((await f.request('POST',`/api/payments/${payment.id}/receipt`,proof(),'resident-1')).status,200);
  assert.equal(f.client.objects.has(old),false);
});

test('homeowner module permissions cannot bypass receipt, complaint, or profile ownership', async t => {
  const f = await setup(t);
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["resident","payments","complaints"]';
  f.pool.tables.payments.push({ id:'other-payment',homeownerId:'home-2',receipt:objectKey('receipts','.png') });
  f.pool.tables.complaints.push({ id:'other-complaint',homeownerId:'home-2',attachment:objectKey('complaints','.png') });
  for (const [kind,id] of [['receipts','other-payment'],['complaints','other-complaint'],['profile-photos','resident-2']]) {
    assert.equal((await read(f,kind,id)).status,403);
  }
  assert.equal(f.signed.length,0);
  // A homeowner cannot change the link used by the authorization check.
  assert.equal((await f.request('PUT','/api/users/resident-1',{homeowner_id:'home-2'},'resident-1')).status,200);
  assert.equal(f.pool.users.find(u=>u.id==='resident-1').homeowner_id,'home-1');
  assert.equal((await f.request('PUT','/api/complaints/other-complaint',{homeownerId:'home-1'},'resident-1')).status,200);
  assert.equal(f.pool.tables.complaints[0].homeownerId,'home-2');
  assert.equal((await read(f,'complaints','other-complaint')).status,403);
  assert.equal((await f.request('POST','/api/complaints',{id:'other-complaint',homeownerId:'home-1'},'resident-1')).status,409);
  assert.equal((await read(f,'receipts','other-payment','admin-1')).status,302);
  assert.equal((await read(f,'complaints','other-complaint','admin-1')).status,302);
});

test('R2 mode still reads legacy local paths and never deletes old local files on replacement', async t => {
  const f = await setup(t);
  fs.writeFileSync(path.join(f.uploadDir,'legacy.png'),png);
  f.pool.tables.payments.push({id:'legacy',homeownerId:'home-1',receipt:'/uploads/receipts/legacy.png'});
  const response = await read(f,'receipts','legacy');
  assert.equal(response.status,200); assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
  assert.equal((await f.request('POST','/api/payments/legacy/receipt',proof(),'resident-1')).status,200);
  assert.equal(fs.existsSync(path.join(f.uploadDir,'legacy.png')),true);
});

test('invalid content, executable extensions, excessive sizes, and counts never store or delete objects', async t => {
  const f = await setup(t);
  for (const form of [proof('receipt','x.exe'),proof('receipt','x.png',Buffer.from('not an image')),
    proof('receipt','x.png',Buffer.alloc(10*1024*1024+1))]) {
    assert.equal((await f.request('POST','/api/payments/submit',form,'resident-1')).status,400);
  }
  const form = proof(); form.append('receipt',new Blob([png],{type:'image/png'}),'second.png');
  assert.equal((await f.request('POST','/api/payments/submit',form,'resident-1')).status,400);
  assert.equal(f.client.calls.length,0);
});

test('announcement, board, lost-and-found, QR, profile and staged complaint uploads use storage without changing display routes', async t => {
  const f = await setup(t);
  const announcement = proof('images'); announcement.set('title','Title'); announcement.set('content','Content');
  let result = await f.request('POST','/api/announcements',announcement);
  assert.equal(result.status,201,JSON.stringify(f.errors));
  assert.ok(isObjectKey(f.pool.tables.announcements[0].image_path,'announcements'));
  assert.match(result.body.image_path,/^\/uploads\/announcements\//);
  const display = await fetch(f.base + result.body.image_path,{redirect:'manual'});
  assert.equal(display.status,302); assert.equal(display.headers.get('cache-control'),'private, no-store');
  const board = proof('photo'); board.set('name','Board'); board.set('position','Chair');
  result = await f.request('POST','/api/board',board);
  assert.equal(result.status,201,JSON.stringify(f.errors));
  assert.ok(isObjectKey(f.pool.tables.board_of_directors[0].photo,'board'));
  assert.equal((await f.request('POST','/api/payment-settings/upload-qr',proof('qr'))).status,200);
  assert.ok(isObjectKey(f.pool.tables.payment_settings[0].qr_code_path,'payment-qrcodes'));
  assert.equal((await f.request('POST','/api/users/resident-1/photo',proof('photo'),'resident-1')).status,200);
  assert.ok(isObjectKey(f.pool.tables.homeowners[0].profile_photo,'profile-photos'));
  result = await f.request('POST','/api/lostfound/upload',proof('media'),null);
  assert.equal(result.status,200,JSON.stringify(f.errors));
  assert.match(result.body.url,/^\/uploads\/lostfound\//);
  result = await f.request('POST','/api/complaints/upload',proof('media'),'resident-1');
  assert.equal(result.status,200,JSON.stringify(f.errors));
  assert.ok(isObjectKey(result.body.files[0].url,'complaints'));
  const staged = result.body.files;
  f.pool.users.push({id:'resident-2',role:'homeowner',homeowner_id:'home-2',status:'active',permissions:'["resident"]'});
  result = await f.request('POST','/api/complaints',{id:'claim',attachments:staged},'resident-2');
  assert.equal(result.status,400);
  result = await f.request('POST','/api/complaints',{id:'claim',attachments:staged},'resident-1');
  assert.equal(result.status,201,JSON.stringify(f.errors));
  assert.ok(isObjectKey(JSON.parse(f.pool.tables.complaints[0].attachments)[0].url,'complaints'));
});

