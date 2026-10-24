'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const { fixture, password } = require('./helpers/auth-fixture.cjs');
const { normalizeEmail, isValidEmail } = require('../src/utils/email');
const { up } = require('../migrations/013_administrator_email_verification');
const { MigrationDataError } = require('../src/db/migrationRunner');
const oldEmail = 'registered-admin@example.test';
const newEmail = 'amy@example.test';
const tokenFrom = mail => new URL(mail.actionPath, 'https://example.test').searchParams.get('admin_email_token');
async function signedIn(f) {
  const response = await f.login(oldEmail, password);
  assert.equal(response.status, 200);
  return { Cookie: response.headers.get('set-cookie').split(';')[0] };
}
async function requestChange(f, headers, email = newEmail, currentPassword = password) {
  return f.request('/api/admin-email/request', { email, currentPassword }, undefined, headers);
}

test('email validation normalizes whitespace/case and rejects malformed or oversized addresses', () => {
  assert.equal(normalizeEmail('  Amy+HOA@Example.Test '), 'amy+hoa@example.test');
  for (const email of ['admin', 'a@@b.com', 'a..b@c.com', '.a@c.com', 'a@-b.com', 'a@b..com', 'a b@c.com', 'a\n@b.com', 'a'.repeat(65) + '@example.test', {}, null]) assert.equal(isValidEmail(email), false, String(email));
  assert.equal(isValidEmail('Amy+HOA@Example.Test'), true);
});

test('verified email change keeps the same account and old login/reset until verification, then retires both old identifiers', async t => {
  const f = await fixture(t);
  const before = structuredClone(f.pool.users[0]);
  const headers = await signedIn(f);
  assert.equal((await requestChange(f, headers, '  AMY@EXAMPLE.TEST ')).status, 200);
  assert.equal(f.pool.users[0].email, oldEmail);
  assert.equal((await f.login(newEmail, password)).status, 401);
  assert.equal((await f.login(oldEmail, password)).status, 200);
  await f.request('/api/forgot-password', { email: oldEmail });
  const resetMail = f.sent.find(mail => mail.subject.includes('Reset your'));
  assert.equal(resetMail.to, oldEmail);
  const resetToken = new URL(resetMail.actionPath, 'https://example.test').searchParams.get('reset_token');
  const token = tokenFrom(f.sent[0]);
  assert.equal(f.pool.users[0].admin_email_token_hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.doesNotMatch(JSON.stringify((await f.request('/api/session', undefined, undefined, headers)).body), /pending_admin_email|admin_email_token|admin_email_password_tag/);
  assert.equal((await f.request('/api/admin-email/verify', { token })).status, 200);
  const after = f.pool.users[0];
  for (const field of ['id', 'username', 'role', 'password', 'permissions', 'status', 'name']) assert.deepEqual(after[field], before[field], field);
  assert.equal(f.pool.users.length, 4);
  assert.equal(after.email, newEmail);
  assert.equal((await f.login(' AMY@EXAMPLE.TEST ', password)).status, 200);
  assert.equal((await f.login(oldEmail, password)).status, 401);
  assert.equal((await f.login('admin', password)).status, 401);
  assert.equal((await f.request('/api/reset-password/validate?token=' + resetToken)).status, 400);
  const count = f.sent.length;
  await f.request('/api/forgot-password', { email: oldEmail });
  assert.equal(f.sent.length, count);
  await f.request('/api/forgot-password', { email: newEmail });
  assert.equal(f.sent.at(-1).to, newEmail);
  assert.equal((await f.request('/api/admin-email/verify', { token })).status, 400);
  assert.equal(f.pool.auditLog.length, 2);
  assert.doesNotMatch(JSON.stringify(f.pool.auditLog), new RegExp(token + '|' + newEmail + '|' + password));
});

test('legacy preset enrollment requires current password and mailbox proof, grants no username session, and closes permanently', async t => {
  const f = await fixture(t);
  Object.assign(f.pool.users[0], { admin_email_verified_at: null, email: 'admin@sanalfonsohomes.com' });
  assert.equal((await f.login('admin', password)).status, 401);
  assert.equal((await f.login('admin@sanalfonsohomes.com', password)).status, 401);
  await f.request('/api/forgot-password', { email: 'admin@sanalfonsohomes.com' });
  assert.equal(f.sent.length, 0);
  const body = { account: 'admin', email: newEmail, currentPassword: password };
  assert.equal((await f.request('/api/admin-email/enroll', { ...body, currentPassword: 'wrong' })).status, 401);
  const response = await f.request('/api/admin-email/enroll', body);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(f.sent[0].to, newEmail);
  assert.equal((await f.request('/api/admin-email/verify', { token: tokenFrom(f.sent[0]) })).status, 200);
  assert.equal((await f.login(newEmail, password)).body.id, 'admin-1');
  assert.equal((await f.request('/api/admin-email/enroll', body)).status, 401);
  assert.equal((await f.login('admin', password)).status, 401);
});

test('request validates authentication, role, current password, syntax and duplicates without changing the account', async t => {
  const f = await fixture(t);
  assert.equal((await requestChange(f, {})).status, 401);
  const headers = await signedIn(f);
  for (const [email, pass, status] of [[newEmail, '', 401], [newEmail, 'wrong', 401], ['not-email', password, 400], [' RESIDENT@EXAMPLE.TEST ', password, 409], [oldEmail, password, 400]]) {
    assert.equal((await requestChange(f, headers, email, pass)).status, status);
  }
  const resident = await f.login('resident@example.test', password);
  assert.equal((await requestChange(f, { Cookie: resident.headers.get('set-cookie').split(';')[0] })).status, 401);
  assert.equal(f.sent.length, 0);
  assert.equal(f.pool.users[0].email, oldEmail);
});

test('email verification expiry, replacement, password change, deactivation and concurrent replay are enforced', async t => {
  const f = await fixture(t);
  const headers = await signedIn(f);
  await requestChange(f, headers);
  const oldToken = tokenFrom(f.sent[0]);
  await requestChange(f, headers, 'second@example.test');
  const token = tokenFrom(f.sent[1]);
  assert.equal((await f.request('/api/admin-email/verify', { token: oldToken })).status, 400);
  const expiry = f.pool.users[0].admin_email_token_expires_at;
  f.pool.users[0].admin_email_token_expires_at = new Date(0);
  assert.equal((await f.request('/api/admin-email/verify', { token })).status, 400);
  f.pool.users[0].admin_email_token_expires_at = expiry;
  const hash = f.pool.users[0].password;
  f.pool.users[0].password = 'new-password';
  assert.equal((await f.request('/api/admin-email/verify', { token })).status, 400);
  f.pool.users[0].password = hash;
  f.pool.users[0].status = 'inactive';
  assert.equal((await f.request('/api/admin-email/verify', { token })).status, 400);
  f.pool.users[0].status = 'active';
  const results = await Promise.all([f.request('/api/admin-email/verify', { token }), f.request('/api/admin-email/verify', { token })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
});

test('duplicate claimed after request cannot replace the active email', async t => {
  const f = await fixture(t);
  await requestChange(f, await signedIn(f));
  f.pool.users[1].email = newEmail;
  assert.equal((await f.request('/api/admin-email/verify', { token: tokenFrom(f.sent[0]) })).status, 409);
  assert.equal(f.pool.users[0].email, oldEmail);
});

test('SMTP failure and disabled delivery roll back pending state and show actionable errors', async t => {
  for (const options of [{ deliver() { throw new Error('smtp-secret'); } }, { emailConfigured: false }]) {
    const f = await fixture(t, options);
    const response = await requestChange(f, await signedIn(f));
    assert.equal(response.status, 503);
    assert.match(response.body.error, /current email has not changed/);
    assert.doesNotMatch(JSON.stringify(response), /smtp-secret/);
    assert.equal(f.pool.users[0].email, oldEmail);
    assert.equal(f.pool.users[0].pending_admin_email, undefined);
    assert.equal(f.pool.auditLog?.length || 0, 0);
  }
});

test('generic profile and create APIs cannot bypass email verification or overwrite the admin ID', async t => {
  const f = await fixture(t);
  const headers = await signedIn(f);
  for (const email of [newEmail, '', null]) {
    const response = await fetch(f.base + '/api/users/admin-1', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /verification/);
  }
  assert.equal((await f.request('/api/users', { id: 'admin-1', email: newEmail }, undefined, headers)).status, 409);
  const bulk = await fetch(f.base + '/api/users', { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify([{ id: 'admin-1', email: newEmail }]) });
  assert.equal(bulk.status, 405);
  assert.equal(f.pool.users[0].email, oldEmail);
});

test('a password-reset request racing verification cannot issue a token to the retired email', async t => {
  const f = await fixture(t);
  await requestChange(f, await signedIn(f));
  const token = tokenFrom(f.sent[0]);
  const execute = f.pool.execute;
  let releaseLookup;
  let lookupStarted;
  const started = new Promise(resolve => { lookupStarted = resolve; });
  const released = new Promise(resolve => { releaseLookup = resolve; });
  f.pool.execute = async (sql, values) => {
    const result = await execute(sql, values);
    if (sql.startsWith('SELECT u.id, u.email')) { lookupStarted(); await released; }
    return result;
  };
  const forgot = f.request('/api/forgot-password', { email: oldEmail });
  await started;
  assert.equal((await f.request('/api/admin-email/verify', { token })).status, 200);
  releaseLookup();
  assert.equal((await forgot).status, 200);
  assert.equal(f.sent.length, 1, 'No reset mail goes to the retired address');
  assert.equal(f.pool.users[0].reset_token_hash, null);
});

test('enrollment requests are bounded by persistent rate limits', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 8; i++) assert.equal((await f.request('/api/admin-email/enroll', { account: 'admin', email: newEmail, currentPassword: 'wrong' })).status, 401);
  assert.equal((await f.request('/api/admin-email/enroll', { account: 'admin', email: newEmail, currentPassword: password })).status, 429);
});

test('homeowner and authorized HOA officer email login remains functional', async t => {
  const f = await fixture(t);
  f.pool.users[1].permissions = '["billing","payments","resident"]';
  assert.equal((await f.login(' RESIDENT@EXAMPLE.TEST ', password)).status, 200);
  assert.equal((await f.login('resident', password)).status, 401);
  f.pool.users.push({ id: 'officer-1', email: 'officer@example.test', role: 'hoa_officer', permissions: '["billing"]', status: 'active', password: f.pool.users[0].password });
  assert.equal((await f.login('officer@example.test', password)).status, 200);
});

test('first-admin setup requires a real configured email; restarting never overwrites an existing renamed administrator', async t => {
  const missing = await fixture(t, { env: { INITIAL_ADMIN_PASSWORD: password } });
  assert.throws(() => missing.initialAdminUser(), /INITIAL_ADMIN_EMAIL/);
  const f = await fixture(t, { env: { INITIAL_ADMIN_PASSWORD: password, INITIAL_ADMIN_EMAIL: ' NEW@EXAMPLE.TEST ' } });
  const seed = f.initialAdminUser();
  assert.equal(seed.id, 'u001');
  assert.equal(seed.email, 'new@example.test');
  assert.equal(seed.password, password);
  assert.equal(seed.admin_email_verified_at, undefined);
  const stored = { id: 'original-id', username: 'renamed', role: 'admin', email: 'original@example.test', password: 'unchanged-hash', permissions: '["*"]', status: 'active' };
  const before = structuredClone(stored);
  f.pool.execute = async sql => {
    if (sql.startsWith('SELECT id, permissions, status FROM users')) {
      assert.match(sql, /WHERE role = 'admin'/);
      assert.doesNotMatch(sql, /WHERE username/);
      return [[stored]];
    }
    if (sql.startsWith('UPDATE users SET permissions') && sql.includes('role = ?')) return [{ affectedRows: 0 }];
    assert.fail('Startup must not write to the existing administrator: ' + sql);
  };
  await f.ensureAdminUser();
  await f.ensureAdminUser();
  assert.deepEqual(stored, before);
});

test('audit failure rolls back verification and leaves the old login active', async t => {
  const f = await fixture(t);
  await requestChange(f, await signedIn(f));
  const token = tokenFrom(f.sent[0]);
  const connectionFactory = f.pool.getConnection;
  f.pool.getConnection = async () => {
    const connection = await connectionFactory();
    const execute = connection.execute;
    connection.execute = (sql, args) => {
      if (sql.startsWith('INSERT INTO auditLog')) throw new Error('Audit storage failed');
      return execute(sql, args);
    };
    return connection;
  };
  assert.equal((await f.request('/api/admin-email/verify', { token })).status, 500);
  assert.equal(f.pool.users[0].email, oldEmail);
  assert.equal((await f.login(oldEmail, password)).status, 200);
});

test('migration rejects duplicate emails before DDL and never infers verification or replaces accounts', async () => {
  const changes = [];
  const helpers = { MigrationDataError, addColumn: async (...args) => changes.push(args), addIndex: async (...args) => changes.push(args) };
  await assert.rejects(up({ query: async () => [[{ id: 'u001' }]] }, helpers), MigrationDataError);
  assert.equal(changes.length, 0);
  await up({ query: async () => [[]] }, helpers);
  assert.ok(changes.some(args => args[2] === 'idx_users_normalized_email' && args[4].unique));
  assert.ok(changes.some(args => args[2] === 'admin_email_verified_at' && args[3] === 'DATETIME(3) NULL'));
});

test('profile UI waits for server responses, displays verification failures, and keeps active email unchanged', async () => {
  const elements = Object.fromEntries(['s_name', 's_email', 's_email_password', 'adminEmailStatus', 'saveAdminProfileButton'].map(id => [id, { value: '', textContent: '', disabled: false }]));
  Object.assign(elements.s_name, { value: 'Amy' });
  Object.assign(elements.s_email, { value: newEmail });
  Object.assign(elements.s_email_password, { value: password });
  const context = { currentUser: { id: 'admin-1', name: 'Amy', email: oldEmail, admin_email_verified_at: true }, document: { getElementById: id => elements[id] }, showToast() {}, buildSidebar() {},
    fetch: async () => ({ ok: false, json: async () => ({ error: 'Current password is incorrect.' }) }) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/profile.js'), 'utf8'), context);
  await context.saveAdminProfile();
  assert.match(elements.adminEmailStatus.textContent, /password is incorrect/);
  assert.equal(context.currentUser.email, oldEmail);
  assert.equal(elements.saveAdminProfileButton.disabled, false);
  elements.s_email_password.value = password;
  context.fetch = async url => ({ ok: true, json: async () => ({ message: url.includes('admin-email') ? 'Verification email sent.' : 'Saved' }) });
  await context.saveAdminProfile();
  assert.equal(elements.adminEmailStatus.textContent, 'Verification email sent.');
  assert.equal(context.currentUser.email, oldEmail);
});
