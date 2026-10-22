'use strict';
const { database, fixture } = require('./auth-fixture.cjs');

// Deliberately limited SQL double for the application's mutation routes. Each
// transaction snapshots data, so failure assertions check actual rollback.
function auditDatabase() {
  const pool = database();
  const authExecute = pool.execute;
  const tables = {
    users: pool.users, homeowners: [{ id: 'home-1', name: 'Resident', lotArea: 100 }],
    auditLog: [], billings: [], payments: [], complaints: [], amenityBookings: [],
    vehicleRegistrations: [], lostFound: [], announcements: [], appSettings: [],
    payment_settings: [], notifications: [], announcement_comments: [], board_of_directors: [],
  };
  pool.tables = tables;
  pool.failAudit = false;
  pool.commits = 0;
  pool.rollbacks = 0;
  pool.execute = async (sql, values = []) => {
    const q = sql.replace(/`/g, '').replace(/\s+/g, ' ').trim();
    if (/auth_rate_limits|auth_security_/.test(q) || q.includes('reset_token_') || (q.startsWith('SELECT * FROM users') && q.includes('LOWER(email)'))) return authExecute(sql, values);
    if (q.startsWith('SELECT id FROM users') && /BINARY username|LOWER\(email\)/.test(q)) {
      const column = q.includes('BINARY username') ? 'username' : 'email';
      return [tables.users.filter(u => String(u[column] || '').toLowerCase() === values[0].toLowerCase() && (!q.includes('id !=') || u.id !== values[1])).map(u => ({ id: u.id }))];
    }
    if (q.startsWith('SELECT u.id, h.name FROM users')) return [tables.users.filter(u => u.homeowner_id === values[0]).map(u => ({ id: u.id }))];
    if (q.startsWith('SELECT p.*, b.amount')) return [[]];
    if (q.includes('LOWER(TRIM(refNum))')) return [tables.payments.filter(p => String(p.refNum || '').trim().toLowerCase() === values[0].trim().toLowerCase())];
    if (q.startsWith('INSERT INTO auditLog')) {
      if (pool.failAudit) throw new Error('Injected audit write failure');
      tables.auditLog.push({ id: values[0], action: values[1], adminId: values[2], timestamp: values[3] });
      return [{ affectedRows: 1 }];
    }
    const select = q.replace(/ ORDER BY id DESC$/, '').match(/^SELECT (.+?) FROM (\w+)(?: WHERE (.*))?$/);
    if (select && tables[select[2]]) {
      let rows = tables[select[2]];
      let where = select[3] || '';
      let i = 0;
      // Extract the simple AND predicates used by the tested routes.
      for (const predicate of where.matchAll(/(?:^| AND )(\w+)\s*(=|!=)\s*(\?|"[^"]*"|'[^']*')/g)) {
        const expected = predicate[3] === '?' ? values[i++] : predicate[3].slice(1, -1);
        rows = rows.filter(row => predicate[2] === '=' ? row[predicate[1]] === expected : row[predicate[1]] !== expected);
      }
      if (where.includes('IS NOT NULL')) rows = rows.filter(row => row.homeowner_id != null);
      if (where.includes('LIMIT 1')) rows = rows.slice(0, 1);
      return [structuredClone(rows)];
    }
    const insert = q.match(/^INSERT INTO (\w+) \((.+?)\) VALUES \((.+)\)$/);
    if (insert && tables[insert[1]]) {
      const columns = insert[2].split(',').map(x => x.trim());
      let i = 0;
      const tokens = insert[3].split(',').map(x => x.trim());
      const row = Object.fromEntries(columns.map((column, index) => {
        const token = tokens[index];
        return [column, token === '?' ? values[i++] : token === 'NULL' ? null : token === 'NOW()' ? new Date().toISOString() : token.replace(/^'|'$/g, '')];
      }));
      if (tables[insert[1]].some(x => x.id === row.id)) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      tables[insert[1]].push(row);
      return [{ affectedRows: 1 }];
    }
    const update = q.match(/^UPDATE (\w+) SET (.+) WHERE id = \?$/);
    if (update && tables[update[1]]) {
      let i = 0;
      const changes = {};
      for (const assignment of update[2].split(',')) {
        const [field, token] = assignment.split('=').map(x => x.trim());
        changes[field] = token === '?' ? values[i++] : token === 'NULL' ? null : token.replace(/^'|'$/g, '');
      }
      const row = tables[update[1]].find(row => row.id === values[i]);
      if (row) Object.assign(row, changes);
      return [{ affectedRows: row ? 1 : 0 }];
    }
    const del = q.match(/^DELETE FROM (\w+)(?: WHERE (\w+) = \?)?$/);
    if (del && tables[del[1]]) {
      const rows = tables[del[1]];
      const kept = del[2] ? rows.filter(row => row[del[2]] !== values[0]) : [];
      const count = rows.length - kept.length;
      rows.splice(0, rows.length, ...kept);
      return [{ affectedRows: count }];
    }
    return authExecute(sql, values);
  };
  let tail = Promise.resolve();
  pool.getConnection = async () => {
    let release, snapshot;
    return {
      async beginTransaction() {
        const previous = tail;
        tail = new Promise(resolve => { release = resolve; });
        await previous;
        snapshot = structuredClone(tables);
      },
      execute: (...args) => pool.execute(...args),
      async commit() { pool.commits++; snapshot = null; },
      async rollback() {
        pool.rollbacks++;
        if (snapshot) for (const [table, rows] of Object.entries(snapshot)) tables[table].splice(0, tables[table].length, ...rows);
      },
      release() { release?.(); },
    };
  };
  return pool;
}

async function auditFixture(t) {
  const pool = auditDatabase();
  const fs = require('node:fs');
  const path = require('node:path');
  const uploadDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'smarthood-audit-test-'));
  t.after(() => {
    for (const name of fs.readdirSync(uploadDir)) fs.unlinkSync(path.join(uploadDir, name));
    fs.rmdirSync(uploadDir);
  });
  const f = await fixture(t, { pool, paths: { PRIVATE_RECEIPT_UPLOAD_DIR: uploadDir, PRIVATE_QRCODE_UPLOAD_DIR: uploadDir } });
  // Signed sessions use the real application signing/authentication code.
  const crypto = require('node:crypto');
  function cookie(id) {
    const data = Buffer.from(JSON.stringify({ userId: id, expiresAt: Date.now() + 3600000 })).toString('base64url');
    const sig = crypto.createHmac('sha256', 'test-session-secret').update(data).digest('base64url');
    return `smarthood_session=${data}.${sig}`;
  }
  async function request(method, url, body, id = 'admin-1') {
    const response = await fetch(f.base + url, {
      method, headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(id ? { Cookie: cookie(id) } : {}) },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  return { ...f, request, uploadDir };
}
module.exports = { auditDatabase, auditFixture };
