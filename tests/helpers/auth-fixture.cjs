'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const bcrypt = require('bcryptjs');
const { createLoginSecurityAlerts } = require('../../src/services/loginSecurityAlerts');

const password = 'Correct-test-password!';
const passwordHash = bcrypt.hashSync(password, 10);

// A transactional database double: HTTP tests run the real app, bcrypt,
// express-rate-limit, SQL store and email-claim repository without touching
// the configured application database or sending real emails.
function database() {
  const users = [
    { id: 'admin-1', username: 'admin', email: 'registered-admin@example.test', name: 'Administrator', role: 'admin', status: 'active', password: passwordHash },
    { id: 'resident-1', username: 'resident', email: 'Resident@example.test', name: 'Resident', role: 'homeowner', homeowner_id: 'home-1', status: 'active', password: passwordHash },
    { id: 'legacy-1', username: 'legacy', email: 'legacy@example.test', role: 'admin', status: 'active', password },
    { id: 'inactive-1', username: 'inactive', email: 'inactive@example.test', role: 'admin', status: 'inactive', password: passwordHash },
  ];
  for (const user of users) if (user.role === 'admin') user.admin_email_verified_at = new Date();
  const buckets = new Map();
  const events = new Map();
  const cooldowns = new Map();
  let tail = Promise.resolve();
  const state = { users, buckets, events, cooldowns, fail: false };
  async function execute(sql, values = []) {
    if (state.fail) throw new Error('Database unavailable: secret connection string');
    const q = sql.replace(/\s+/g, ' ').trim();
    const now = Date.now();
    if (q.startsWith('INSERT INTO auditLog')) {
      (state.auditLog ||= []).push({ id: values[0], action: values[1], adminId: values[2], timestamp: values[3] });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('SELECT * FROM users WHERE reset_token_hash')) {
      const user = users.find(u => u.reset_token_hash === values[0] && u.reset_token_expires_at > now && (u.role !== 'admin' || u.admin_email_verified_at) && !['inactive', 'deactivated'].includes(u.status));
      return [user ? [{ ...user }] : []];
    }
    const key = `${values[0]}:${values[1]}`;
    if (q.startsWith('CREATE TABLE')) return [{ affectedRows: 0 }];
    if (q.startsWith('INSERT INTO auth_rate_limits')) {
      let row = buckets.get(key);
      if (!row || row.expires_at_ms <= now) row = { hits: 0, expires_at_ms: now + values[2] };
      row.hits++;
      buckets.set(key, row);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('SELECT hits, expires_at_ms')) {
      const row = buckets.get(key);
      return [[...(row && (!q.includes('expires_at_ms >') || row.expires_at_ms > now) ? [{ ...row }] : [])]];
    }
    if (q.startsWith('INSERT IGNORE INTO auth_security_events')) {
      if (events.has(values[0])) return [{ affectedRows: 0 }];
      events.set(values[0], { user_id: values[1], event_type: values[2], email_status: values[3], occurred_at: now });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT IGNORE INTO auth_security_email_cooldowns')) {
      if (!cooldowns.has(key)) cooldowns.set(key, 0);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('UPDATE auth_security_email_cooldowns')) {
      const claimKey = `${values[1]}:${values[2]}`;
      if (cooldowns.get(claimKey) > now) return [{ affectedRows: 0 }];
      cooldowns.set(claimKey, now + values[0]);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('UPDATE auth_security_events')) {
      const pending = q.includes("= 'pending'");
      events.get(values[pending ? 0 : 1]).email_status = pending ? 'pending' : values[0];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('SELECT * FROM users') && q.includes('LOWER(TRIM(email))')) {
      const user = users.find(u => u.email?.trim().toLowerCase() === values[0] && (u.role !== 'homeowner' || u.homeowner_id) && (u.role !== 'admin' || u.admin_email_verified_at));
      return [user ? [{ ...user }] : []];
    }
    if (q.startsWith("SELECT * FROM users WHERE role = 'admin'")) {
      const user = users.find(u => u.role === 'admin' && (u.username === values[0] || u.id === values[1]));
      return [user ? [{ ...user }] : []];
    }
    if (q.startsWith('SELECT id FROM users WHERE normalized_email')) {
      const user = users.find(u => u.email?.trim().toLowerCase() === values[0] && u.id !== values[1]);
      return [user ? [{ id: user.id }] : []];
    }
    if (q.startsWith('SELECT * FROM users WHERE admin_email_token_hash')) {
      const user = users.find(u => u.admin_email_token_hash === values[0]);
      return [user ? [{ ...user }] : []];
    }
    if (q.startsWith('UPDATE users SET pending_admin_email')) {
      Object.assign(users.find(u => u.id === values[4]), { pending_admin_email: values[0], admin_email_token_hash: values[1], admin_email_token_expires_at: values[2], admin_email_password_tag: values[3] });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('UPDATE users SET email = ?, admin_email_verified_at')) {
      Object.assign(users.find(u => u.id === values[1]), { email: values[0], admin_email_verified_at: new Date(), pending_admin_email: null, admin_email_token_hash: null, admin_email_token_expires_at: null, admin_email_password_tag: null, reset_token_hash: null, reset_token_expires_at: null });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('SELECT * FROM users WHERE id')) {
      const user = users.find(u => u.id === values[0]);
      return [user ? [{ ...user }] : []];
    }
    if (q.startsWith('SELECT * FROM homeowners')) return [[{ id: 'home-1', name: 'Resident' }]];
    if (q.startsWith('UPDATE users SET password = ? WHERE id')) {
      users.find(u => u.id === values[1]).password = values[0];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('SELECT u.id, u.email')) {
      const user = users.find(u => u.email?.trim().toLowerCase() === values[0] && (u.role !== 'admin' || u.admin_email_verified_at));
      return [user ? [{ ...user }] : []];
    }
    if (q.startsWith('UPDATE users SET reset_token_hash = ?')) {
      const user = users.find(u => u.id === values[2] && (!values[3] || (u.email?.trim().toLowerCase() === values[3] && (u.role !== 'admin' || u.admin_email_verified_at))));
      if (!user) return [{ affectedRows: 0 }];
      Object.assign(user, { reset_token_hash: values[0], reset_token_expires_at: values[1] });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('UPDATE users SET reset_token_hash = NULL')) {
      const user = users.find(u => u.id === values[0] && u.reset_token_hash === values[1]);
      if (user) Object.assign(user, { reset_token_hash: null, reset_token_expires_at: null });
      return [{ affectedRows: user ? 1 : 0 }];
    }
    if (q.startsWith('SELECT id FROM users WHERE reset_token_hash') || q.startsWith('UPDATE users SET password = ?, reset_token_hash')) {
      const update = q.startsWith('UPDATE');
      const user = users.find(u => u.reset_token_hash === values[update ? 1 : 0] && u.reset_token_expires_at > now && (u.role !== 'admin' || u.admin_email_verified_at) && !['inactive', 'deactivated'].includes(u.status));
      if (!update) return [user ? [{ id: user.id }] : []];
      if (user) Object.assign(user, { password: values[0], reset_token_hash: null, reset_token_expires_at: null });
      return [{ affectedRows: user ? 1 : 0 }];
    }
    throw new Error(`Unhandled test SQL: ${q}`);
  }
  state.execute = execute;
  state.getConnection = async () => {
    let release;
    let snapshot;
    return {
      async beginTransaction() {
        const previous = tail;
        tail = new Promise(resolve => { release = resolve; });
        await previous;
        snapshot = { users: structuredClone(users), auditLog: structuredClone(state.auditLog || []) };
      },
      execute,
      async commit() {}, async rollback() {
        if (snapshot) { users.splice(0, users.length, ...snapshot.users); state.auditLog = snapshot.auditLog; }
      },
      release() { release?.(); },
    };
  };
  return state;
}

async function fixture(t, options = {}) {
  const pool = options.pool || database();
  const sent = [];
  const errors = [];
  const pending = new Set();
  const env = { NODE_ENV: 'test', SESSION_SECRET: 'test-session-secret', FILE_ACCESS_SECRET: 'test-file-secret', APP_BASE_URL: 'https://example.test', TRUST_PROXY: '1', ...options.env };
  const filename = path.resolve(__dirname, '../../src/app.js');
  const realRequire = createRequire(filename);
  const emailService = {
    isEmailConfigured: () => options.emailConfigured !== false,
    async sendEmail(message) {
      sent.push(message);
      if (options.deliver) return options.deliver(message);
      return { messageId: 'test-message' };
    },
  };
  const sandbox = {
    module: { exports: {} }, exports: {}, Buffer, URL, Date, Intl,
    setImmediate, setInterval, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error: (...args) => errors.push(args) },
    process: { env },
    __testPool: pool,
    require(name) {
      if (name === './config/paths' && options.paths) return { ...realRequire(name), ...options.paths };
      if (name === './config/environment') return { DB_CONFIG: {} };
      if (name === './config/loginSecurity') return { readLoginSecurityConfig: () => realRequire(name).readLoginSecurityConfig(env) };
      if (name === './services/uploadService') return { ensureUploadDirectories() {}, moveLegacyPrivateUploads() {} };
      if (name === './services/emailService') return emailService;
      if (name === './services/loginSecurityAlerts') return { createLoginSecurityAlerts(deps) {
        const handler = createLoginSecurityAlerts({ ...deps, deliver: emailService.sendEmail, logger: sandbox.console });
        return event => {
          const task = handler(event);
          pending.add(task);
          task.finally(() => pending.delete(task));
          return task;
        };
      } };
      return realRequire(name);
    },
  };
  sandbox.require.resolve = realRequire.resolve;
  vm.runInNewContext(fs.readFileSync(filename, 'utf8') + '\ndb = __testPool;', sandbox, { filename });
  const app = sandbox.module.exports.app;
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, body, ip = '203.0.113.5', headers = {}) {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  return {
    app, pool, sent, errors, request, base,
    initialAdminUser: sandbox.initialAdminUser,
    ensureAdminUser: sandbox.ensureAdminUser,
    login: (identifier = 'resident@example.test', pass = 'wrong', ip) => request('/api/login', { email: identifier, password: pass }, ip),
    async settle() { await new Promise(setImmediate); await Promise.all([...pending]); },
  };
}

module.exports = { fixture, database, password };
