'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmailQueue } = require('../src/services/emailQueue');
const { createAuditService } = require('../src/services/auditService');

function database() {
  const jobs = [];
  const users = [];
  const db = { jobs, users, async execute(sql, values) {
    const q = sql.replace(/\s+/g, ' ');
    if (q.startsWith('INSERT INTO email_outbox')) {
      jobs.push({ id: values[0], payload: values[1], status: 'pending', attempts: 0, available_at: 0 });
      return [{ affectedRows: 1 }];
    }
    const ready = j => j.status === 'pending' && j.available_at <= Date.now() || j.status === 'processing' && j.lease_until <= Date.now();
    if (q.startsWith('SELECT id FROM email_outbox')) return [jobs.filter(ready).slice(0, 1).map(j => ({ id: j.id }))];
    if (q.startsWith("UPDATE email_outbox SET status = 'processing'")) {
      const job = jobs.find(j => j.id === values[1] && ready(j));
      if (job) Object.assign(job, { status: 'processing', lease_token: values[0], lease_until: Date.now() + 300000 });
      return [{ affectedRows: job ? 1 : 0 }];
    }
    if (q.startsWith('SELECT * FROM email_outbox')) return [jobs.filter(j => j.lease_token === values[0]).map(j => ({ ...j }))];
    if (q.startsWith('SELECT * FROM users')) return [users.filter(u => u.id === values[0])];
    const job = jobs.find(j => j.id === values.at(-2) && j.lease_token === values.at(-1));
    if (!job) return [{ affectedRows: 0 }];
    if (q.startsWith('UPDATE email_outbox SET attempts')) job.attempts++;
    else if (q.startsWith('UPDATE email_outbox SET status = ?')) Object.assign(job, { status: values[0], payload: values[0] === 'failed' ? job.payload : null, lease_token: null });
    else if (q.startsWith("UPDATE email_outbox SET status = 'pending'")) Object.assign(job, { status: 'pending', attempts: values[0], available_at: Date.now() + values[1] * 1000, lease_token: null });
    else throw Error('Unhandled SQL: ' + q);
    return [{ affectedRows: 1 }];
  } };
  return db;
}
const message = { to: 'resident@example.test', subject: 'Notification', message: 'Private content', actionPath: '?reset_token=secret' };
function queue(db, deliver, extra = {}) {
  return createEmailQueue({ getPool: () => db, deliver, env: { EMAIL_QUEUE_SECRET: 'test-persistent-key' }, logger: { error() {} }, ...extra });
}

test('durable enqueue never invokes SMTP; encrypted payload survives a new worker and is erased on success', async () => {
  const db = database();
  const first = queue(db, () => assert.fail('SMTP in request'));
  const result = await first.enqueue(message);
  assert.equal(result.queued, true);
  assert.doesNotMatch(db.jobs[0].payload, /resident|Private|reset_token|secret/);
  const delivered = [];
  const worker = queue(db, async m => { delivered.push(m); return { accepted: [m.to] }; });
  assert.equal(await worker.processOne(), true);
  assert.deepEqual(delivered[0], { ...message, messageId: `<${result.id}@smarthood.email>` });
  assert.equal(db.jobs[0].status, 'sent');
  assert.equal(db.jobs[0].payload, null);
  assert.equal(await worker.processOne(), false);
});

test('SMTP failures and rejected recipients back off, retry independently and stop after eight attempts', async () => {
  const db = database();
  let attempts = 0;
  const worker = queue(db, async () => { attempts++; if (attempts % 2) throw Error('secret SMTP credential'); return { rejected: ['recipient'] }; });
  await worker.enqueue(message);
  for (let i = 1; i <= 8; i++) {
    db.jobs[0].available_at = 0;
    await worker.processOne();
    assert.equal(db.jobs[0].attempts, i);
    if (i < 8) { assert.ok(db.jobs[0].available_at > Date.now()); assert.equal(await worker.processOne(), false); }
  }
  assert.equal(db.jobs[0].status, 'failed');
  assert.ok(db.jobs[0].payload, 'encrypted dead letter is available for operator retry');
  assert.equal(attempts, 8);
});

test('two workers claim once; expired crash leases recover using the same message ID', async () => {
  const db = database();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const worker = queue(db, () => pending);
  await worker.enqueue(message);
  const first = worker.processOne();
  assert.equal(await queue(db, () => assert.fail('duplicate')).processOne(), false);
  release({}); await first;
  await worker.enqueue(message);
  Object.assign(db.jobs[1], { status: 'processing', lease_until: 0, lease_token: 'dead-worker', attempts: 1 });
  await queue(db, async () => ({})).processOne();
  assert.equal(db.jobs[1].status, 'sent');
  assert.equal(db.jobs[1].attempts, 2);
});

test('queue intent commits and rolls back with the business transaction; no post-commit SMTP wait', async () => {
  const db = database();
  db.getConnection = async () => {
    const staged = database();
    return { beginTransaction: async () => {}, execute: staged.execute,
      commit: async () => db.jobs.push(...staged.jobs), rollback: async () => {}, release() {} };
  };
  const audit = createAuditService({ getPool: () => db, resolveActor: async () => null });
  const worker = queue(db, () => assert.fail('SMTP before commit'), { currentConnection: () => audit.current()?.connection });
  await assert.rejects(audit.transaction({}, async () => { await worker.enqueue(message); throw Error('business rollback'); }));
  assert.equal(db.jobs.length, 0);
  await audit.transaction({}, async () => { await worker.enqueue(message); assert.equal(db.jobs.length, 0); });
  assert.equal(db.jobs.length, 1);
});

test('expired, replaced, consumed and deactivated reset/verification tokens are canceled without delivery', async () => {
  for (const kind of ['reset', 'verification']) {
    for (const state of ['expired', 'replaced', 'consumed', 'inactive', 'changed-email', 'changed-password']) {
      if (kind === 'reset' && state === 'changed-password') continue;
      const db = database();
      const password = 'hash';
      const tag = require('crypto').createHash('sha256').update(password).digest('hex');
      const user = { id: 'u1', role: 'admin', status: 'active', email: message.to, pending_admin_email: message.to,
        password, admin_email_verified_at: new Date(), admin_email_password_tag: tag,
        reset_token_hash: 'token', admin_email_token_hash: 'token',
        reset_token_expires_at: new Date(Date.now() + 60000), admin_email_token_expires_at: new Date(Date.now() + 60000) };
      const prefix = kind === 'reset' ? 'reset_token' : 'admin_email_token';
      if (state === 'expired') user[prefix + '_expires_at'] = new Date(0);
      if (state === 'replaced') user[prefix + '_hash'] = 'new-token';
      if (state === 'consumed') user[prefix + '_hash'] = null;
      if (state === 'inactive') user.status = 'inactive';
      if (state === 'changed-email') { user.email = 'other'; user.pending_admin_email = 'other'; }
      if (state === 'changed-password') user.password = 'new-hash';
      db.users.push(user);
      const worker = queue(db, () => assert.fail(`${kind}: ${state}`));
      await worker.enqueue(message, { guard: { kind, userId: 'u1', hash: 'token', email: message.to } });
      await worker.processOne();
      assert.equal(db.jobs[0].status, 'canceled');
      assert.equal(db.jobs[0].payload, null);
    }
  }
});

test('disabled delivery retains jobs; authenticated encryption detects payload tampering', async () => {
  const db = database();
  const worker = queue(db, () => assert.fail('disabled'), { isEnabled: () => false });
  await worker.enqueue(message);
  assert.equal(await worker.processOne(), false);
  assert.equal(db.jobs[0].attempts, 0);
  const bytes = Buffer.from(db.jobs[0].payload, 'base64'); bytes[30] ^= 1;
  db.jobs[0].payload = bytes.toString('base64');
  await queue(db, () => assert.fail('tampered content')).processOne();
  assert.equal(db.jobs[0].status, 'pending');
  assert.equal(db.jobs[0].attempts, 1);
});
