'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const bcrypt = require('bcryptjs');
const { fixture, database, password } = require('./helpers/auth-fixture.cjs');
const { readLoginSecurityConfig } = require('../src/config/loginSecurity');
const { MySqlRateLimitStore, createAuthSecurityRepository } = require('../src/services/authSecurityStore');

async function exhaust(f, identifier, ip) {
  for (let i = 0; i < 8; i++) assert.equal((await f.login(identifier, 'wrong', ip)).status, 401);
  return f.login(identifier, 'wrong', ip);
}

test('eight failures, warnings from fifth, ninth blocked with standard headers and one registered-address email', async t => {
  const f = await fixture(t);
  for (let i = 1; i <= 8; i++) {
    const response = await f.login(i % 2 ? '  RESIDENT@EXAMPLE.TEST  ' : 'resident@example.test');
    assert.equal(response.status, 401);
    assert.equal(response.body.error, 'Invalid email address or password.');
    assert.equal(Number(response.headers.get('ratelimit-remaining')), 8 - i);
    if (i < 5) assert.equal(response.body.warning, undefined);
    else {
      assert.equal(response.body.attemptsRemaining, 8 - i);
      assert.equal(response.body.warning, `You have ${8 - i} login attempts remaining before a temporary restriction.`);
    }
  }
  assert.equal(f.sent.length, 0);
  const response = await f.login();
  assert.equal(response.status, 429);
  assert.equal(response.body.error, 'Too many failed login attempts. Please wait 15 minutes before trying again.');
  assert.ok(response.body.retryAfterSeconds > 890 && response.body.retryAfterSeconds <= 900);
  assert.equal(Number(response.headers.get('retry-after')), response.body.retryAfterSeconds);
  assert.equal(response.headers.get('ratelimit-policy'), '8;w=900');
  await f.settle();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].to, 'Resident@example.test');
  assert.match(f.sent[0].subject, /^Security Alert: Multiple Failed SmartHood Login Attempts$/);
  assert.match(f.sent[0].message, /will never ask you to send your password/);
  assert.match(f.sent[0].details[0].label, /Philippines/);
  assert.doesNotMatch(JSON.stringify(f.sent), /wrong|203\.0\.113|smarthood_session|reset_token/);
  for (let i = 0; i < 3; i++) assert.equal((await f.login()).status, 429);
  await f.settle();
  assert.equal(f.sent.length, 1);
  assert.equal(f.pool.events.size, 1);
  assert.equal([...f.pool.events.values()][0].email_status, 'sent');
});

test('unknown identifiers have identical failures, warnings and restrictions, with no email', async t => {
  const f = await fixture(t);
  for (let i = 1; i <= 9; i++) {
    const known = await f.login('resident@example.test', 'wrong', '203.0.113.10');
    const unknown = await f.login('nobody@example.test', 'wrong', '203.0.113.11');
    assert.equal(known.status, unknown.status);
    if (i <= 8) assert.deepEqual(known.body, unknown.body);
    else {
      assert.equal(known.body.error, unknown.body.error);
      assert.deepEqual(Object.keys(known.body), Object.keys(unknown.body));
      assert.ok(Math.abs(known.body.retryAfterSeconds - unknown.body.retryAfterSeconds) <= 1);
    }
  }
  await f.settle();
  assert.equal(f.sent.length, 1);
  assert.equal([...f.pool.events.values()].filter(e => e.email_status === 'no_account').length, 1);
});

test('administrator username resolves to registered address and aliases/IPs/instances share the cooldown', async t => {
  const pool = database();
  const a = await fixture(t, { pool });
  const b = await fixture(t, { pool });
  await exhaust(a, ' admin ', '203.0.113.12');
  await a.settle();
  assert.equal(a.sent[0].to, 'registered-admin@example.test');
  assert.equal((await b.login('admin', password, '203.0.113.12')).status, 429);
  await exhaust(b, 'registered-admin@example.test', '203.0.113.13');
  await b.settle();
  assert.equal(a.sent.length + b.sent.length, 1);
  assert.equal(pool.cooldowns.size, 1);
});

test('successful logins do not consume either counter or erase earlier failures', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 6; i++) await f.login();
  const before = [...f.pool.buckets.values()].map(row => row.hits);
  const successes = await Promise.all(Array.from({ length: 6 }, () => f.login('resident@example.test', password)));
  assert.ok(successes.every(r => r.status === 200));
  assert.deepEqual([...f.pool.buckets.values()].map(row => row.hits), before);
  assert.equal((await f.login()).body.attemptsRemaining, 1);
  assert.equal((await f.login()).status, 401);
  assert.equal((await f.login()).status, 429);
});

test('an unknown username case variant cannot suppress the matched account alert', async t => {
  const f = await fixture(t);
  assert.equal((await exhaust(f, 'ADMIN')).status, 429);
  await f.settle();
  assert.equal(f.sent.length, 0);
  assert.equal((await f.login('admin')).status, 429);
  await f.settle();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].to, 'registered-admin@example.test');
});

test('50 failed attempts per IP prevent password spraying across accounts', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 50; i++) assert.equal((await f.login(`unknown-${i}@example.test`)).status, 401);
  const blocked = await f.login('new-account@example.test');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('ratelimit-limit'), '50');
  await f.settle();
  assert.equal(f.sent.length, 0);
  assert.equal([...f.pool.events.values()][0].event_type, 'login_ip_restriction');
  assert.equal((await f.login('resident@example.test', password, '203.0.113.9')).status, 200);
});

test('both limits exceeded concurrently still send one email', async t => {
  const f = await fixture(t, { env: { LOGIN_IP_MAX_FAILURES: '8' } });
  const responses = await Promise.all(Array.from({ length: 12 }, () => f.login('admin')));
  assert.equal(responses.filter(r => r.status === 401).length, 8);
  assert.equal(responses.filter(r => r.status === 429).length, 4);
  await f.settle();
  assert.equal(f.sent.length, 1);
  assert.equal(f.pool.events.size, 1);
});

test('restrictions expire automatically and a new window can produce a new alert', async t => {
  const f = await fixture(t);
  await exhaust(f, 'admin');
  await f.settle();
  for (const row of f.pool.buckets.values()) row.expires_at_ms = Date.now() - 1;
  for (const key of f.pool.cooldowns.keys()) f.pool.cooldowns.set(key, Date.now() - 1);
  assert.equal((await f.login('admin', password)).status, 200);
  await exhaust(f, 'admin');
  await f.settle();
  assert.equal(f.sent.length, 2);
  assert.equal(f.pool.users[0].status, 'active');
});

test('SMTP failure is sanitized, audited and does not reset restriction or retry email', async t => {
  const f = await fixture(t, { deliver: () => { throw new Error('secret-password full-cookie reset-token'); } });
  assert.equal((await exhaust(f, 'admin')).status, 429);
  await f.settle();
  assert.equal((await f.login('admin')).status, 429);
  await f.settle();
  assert.equal(f.sent.length, 1);
  assert.equal([...f.pool.events.values()][0].email_status, 'failed');
  assert.match(JSON.stringify(f.errors), /email delivery failed/);
  assert.doesNotMatch(JSON.stringify(f.errors), /secret-password|full-cookie|reset-token/);
});

test('SMTP delays cannot delay the 429 response', async t => {
  let release;
  const f = await fixture(t, { deliver: () => new Promise(resolve => { release = resolve; }) });
  assert.equal((await exhaust(f, 'admin')).status, 429);
  await new Promise(setImmediate);
  assert.equal((await f.login('admin')).status, 429);
  assert.equal(f.sent.length, 1);
  release();
  await f.settle();
});

test('disabled security emails still record the restriction', async t => {
  const f = await fixture(t, { env: { LOGIN_SECURITY_EMAIL_ENABLED: 'false' } });
  assert.equal((await exhaust(f, 'admin')).status, 429);
  await f.settle();
  assert.equal(f.sent.length, 0);
  assert.equal([...f.pool.events.values()][0].email_status, 'disabled');
});

test('store failure fails closed with a generic response', async t => {
  const f = await fixture(t);
  f.pool.fail = true;
  const response = await f.login('admin', password);
  assert.equal(response.status, 503);
  assert.doesNotMatch(JSON.stringify(response.body), /secret|connection/);
});

test('remaining retry time reflects expiry and blocked requests do not extend it', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 8; i++) await f.login('admin');
  const expiry = Date.now() + 60000;
  for (const row of f.pool.buckets.values()) row.expires_at_ms = expiry;
  const response = await f.login('admin');
  assert.equal(response.status, 429);
  assert.ok(response.body.retryAfterSeconds > 55 && response.body.retryAfterSeconds <= 60);
  assert.equal(Number(response.headers.get('retry-after')), response.body.retryAfterSeconds);
  await f.login('admin');
  assert.ok([...f.pool.buckets.values()].every(row => row.expires_at_ms === expiry));
});

test('alert lookup or audit processing failure never changes the 429 response', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 8; i++) await f.login('admin');
  const execute = f.pool.execute;
  f.pool.execute = (sql, values) => sql.includes('SELECT * FROM users')
    ? Promise.reject(new Error('private database failure details')) : execute(sql, values);
  assert.equal((await f.login('admin')).status, 429);
  await f.settle();
  assert.equal((await f.login('admin')).status, 429);
  await f.settle();
  assert.equal(f.sent.length, 0);
  assert.match(JSON.stringify(f.errors), /event processing failed/);
  assert.doesNotMatch(JSON.stringify(f.errors), /private database/);
});

test('bounded proxy handling ignores spoofed leftmost addresses and direct hosting ignores XFF', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 8; i++) assert.equal((await f.login('admin', 'wrong', `198.51.100.${i}, 203.0.113.20`)).status, 401);
  assert.equal((await f.login('admin', 'wrong', '192.0.2.250, 203.0.113.20')).status, 429);
  const direct = await fixture(t, { env: { TRUST_PROXY: '0' } });
  for (let i = 0; i < 8; i++) await direct.login('admin', 'wrong', `198.51.100.${i}`);
  assert.equal((await direct.login('admin', 'wrong', '192.0.2.250')).status, 429);
});

test('IPv4 mapped IPv6 cannot bypass a counter and IPv6 subnet rotation is bounded', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 8; i++) await f.login('admin', 'wrong', '203.0.113.45');
  assert.equal((await f.login('admin', 'wrong', '::ffff:203.0.113.45')).status, 429);
  for (let i = 0; i < 8; i++) await f.login('admin', 'wrong', `2001:db8:1234:5600::${i + 1}`);
  assert.equal((await f.login('admin', 'wrong', '2001:db8:1234:5600::100')).status, 429);
});

test('existing bcrypt, legacy migration, account status, session cookies, restoration and logout', async t => {
  const f = await fixture(t);
  const login = await f.login('admin', password);
  assert.equal(login.status, 200);
  assert.equal(login.body.password, undefined);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, /Max-Age|Expires/);
  const session = await f.request('/api/session', undefined, undefined, { Cookie: cookie.split(';')[0] });
  assert.equal(session.body.authenticated, true);
  assert.equal(session.body.user.id, 'admin-1');
  const logout = await f.request('/api/logout', {});
  assert.equal(logout.body.ok, true);
  assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  assert.equal((await f.request('/api/session')).body.authenticated, false);
  assert.equal((await f.login('inactive', password)).status, 403);
  assert.equal((await f.login('ADMIN', password)).status, 401, 'administrator usernames remain case-sensitive');
  assert.equal((await f.login('legacy', password)).status, 200);
  assert.ok(await bcrypt.compare(password, f.pool.users.find(u => u.id === 'legacy-1').password));
  assert.match(f.pool.users.find(u => u.id === 'legacy-1').password, /^\$2/);
  assert.equal((await f.login('resident', password)).status, 401, 'homeowner username is not a login identifier');
  assert.equal((await f.login('resident@example.test', password)).status, 200);
});

test('forgot-password has a separate five-per-hour limit and preserves generic responses', async t => {
  const f = await fixture(t);
  let generic;
  for (let i = 0; i < 5; i++) {
    const result = await f.request('/api/forgot-password', { email: i % 2 ? 'absent@example.test' : 'resident@example.test' });
    assert.equal(result.status, 200);
    if (!generic) generic = result.body;
    assert.deepEqual(result.body, generic);
  }
  for (const email of ['resident@example.test', 'absent@example.test']) {
    const limited = await f.request('/api/forgot-password', { email });
    assert.equal(limited.status, 429);
    assert.deepEqual(limited.body, generic);
    assert.ok(Number(limited.headers.get('retry-after')) > 3590);
  }
  await f.settle();
  assert.equal(f.pool.events.size, 0);
  assert.ok(f.sent.every(mail => mail.subject === 'Reset your SmartHood password'));
  assert.equal((await f.login('admin', password)).status, 200);
  for (const [key, row] of f.pool.buckets) if (key.startsWith('forgot_password:')) row.expires_at_ms = Date.now() - 1;
  assert.equal((await f.request('/api/forgot-password', { email: 'absent@example.test' })).status, 200);
});

test('login restriction leaves forgot-password and single-use password reset functional', async t => {
  const f = await fixture(t);
  await exhaust(f, 'admin');
  const forgot = await f.request('/api/forgot-password', { email: 'registered-admin@example.test' });
  assert.equal(forgot.status, 200);
  const mail = f.sent.find(message => message.subject === 'Reset your SmartHood password');
  const token = new URL(mail.actionPath, 'https://example.test').searchParams.get('reset_token');
  assert.equal(token.length, 64);
  assert.equal((await f.request(`/api/reset-password/validate?token=${token}`)).body.valid, true);
  const reset = await f.request('/api/reset-password', { token, newPassword: 'Changed-safe-password!' });
  assert.equal(reset.status, 200);
  assert.equal((await f.request(`/api/reset-password/validate?token=${token}`)).status, 400);
  assert.equal((await f.request('/api/reset-password', { token, newPassword: 'Changed-again-password!' })).status, 400);
  assert.equal((await f.login('admin', 'Changed-safe-password!', '203.0.113.100')).status, 200);
  assert.equal((await f.login('admin', 'Changed-safe-password!')).status, 429);
});

test('config rejects invalid or unbounded values with secure defaults', () => {
  const defaults = readLoginSecurityConfig({});
  assert.deepEqual(defaults, { trustProxy: 0, windowMs: 900000, identifierMax: 8, warningAfter: 5, ipMax: 50, emailEnabled: true, cooldownMs: 900000 });
  for (const bad of ['', '-1', '0', 'NaN', 'Infinity', '1.5', '9999999999999']) {
    const config = readLoginSecurityConfig({ LOGIN_RATE_WINDOW_MS: bad, LOGIN_IDENTIFIER_MAX_FAILURES: bad, LOGIN_WARNING_AFTER_FAILURES: bad, LOGIN_IP_MAX_FAILURES: bad, LOGIN_SECURITY_EMAIL_COOLDOWN_MS: bad });
    assert.deepEqual(config, defaults);
  }
  assert.equal(readLoginSecurityConfig({ TRUST_PROXY: 'true' }).trustProxy, 0);
  assert.equal(readLoginSecurityConfig({ TRUST_PROXY: 'true', RENDER: 'true' }).trustProxy, 1);
  assert.equal(readLoginSecurityConfig({ LOGIN_SECURITY_EMAIL_ENABLED: 'nonsense' }).emailEnabled, true);
  assert.equal(readLoginSecurityConfig({ LOGIN_RATE_WINDOW_MS: '1800000', LOGIN_SECURITY_EMAIL_COOLDOWN_MS: '1000' }).cooldownMs, 1800000);
});

test('shared store increments are atomic and account/event claims have one winner', async () => {
  const pool = database();
  const a = new MySqlRateLimitStore(() => pool, 'login_identifier');
  const b = new MySqlRateLimitStore(() => pool, 'login_identifier');
  a.init({ windowMs: 900000 });
  b.init({ windowMs: 900000 });
  const counts = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).increment('key')));
  assert.deepEqual(counts.map(row => row.totalHits), Array.from({ length: 20 }, (_, i) => i + 1));
  const repo = createAuthSecurityRepository(() => pool);
  const claims = await Promise.all(Array.from({ length: 20 }, (_, i) => repo.claimEvent({ eventKey: `event-${i}`, userId: 'admin', eventType: 'login_identifier_restriction', emailEnabled: true, cooldownMs: 900000 })));
  assert.equal(claims.filter(Boolean).length, 1);
});

test('login UI displays warnings and countdown text using the existing error element', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../public/js/main.js'), 'utf8');
  const helper = source.match(/function loginFailureMessage\(error\) \{[\s\S]*?\n\}/)[0];
  const context = vm.createContext({});
  vm.runInContext(helper, context);
  assert.match(context.loginFailureMessage({ message: 'Invalid email address or password.', warning: 'You have 3 login attempts remaining before a temporary restriction.' }), /3 login attempts/);
  assert.match(context.loginFailureMessage({ status: 429, message: 'Too many failed login attempts.', retryAfterSeconds: 61 }), /Approximately 2 minutes remaining.*Forgot Password/);
  assert.match(context.loginFailureMessage({ status: 429, retryAfterSeconds: 1 }), /Approximately 1 minute remaining/);
  assert.match(source, /showLoginError\(loginFailureMessage\(error\)\)/);
  assert.match(source, /requestError.retryAfterSeconds = err.retryAfterSeconds/);
  assert.match(source, /el.textContent = msg/);
});
