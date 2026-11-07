'use strict';

const crypto = require('node:crypto');

function createEmailQueue({ getPool, currentConnection = () => null, deliver, isEnabled = () => true,
  env = process.env, logger = console }) {
  let timer;
  let running;
  let stopped = true;
  const maxAttempts = 8;
  function key() {
    const secret = env.EMAIL_QUEUE_SECRET || env.SESSION_SECRET;
    if (!secret) throw new Error('Set a persistent EMAIL_QUEUE_SECRET or SESSION_SECRET for the email queue.');
    return crypto.createHash('sha256').update(secret).digest();
  }
  function seal(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }
  function open(value) {
    const data = Buffer.from(value, 'base64');
    const cipher = crypto.createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8'));
  }
  async function enqueue(message, { connection, guard = null } = {}) {
    const id = crypto.randomUUID();
    const payload = seal({ message, guard });
    try {
      await (connection || currentConnection() || getPool()).execute(
        'INSERT INTO email_outbox (id, payload, priority) VALUES (?, ?, ?)', [id, payload, guard ? 10 : 0]);
    } catch {
      // Database errors can include SQL parameters; do not expose the payload.
      throw new Error('Could not persist the email job.');
    }
    return { queued: true, id, rejected: [] };
  }
  async function valid(guard) {
    if (!guard) return true;
    const [rows] = await getPool().execute('SELECT * FROM users WHERE id = ?', [guard.userId]);
    const user = rows[0];
    if (!user || ['inactive', 'deactivated'].includes(user.status) || user.archived_at) return false;
    if (guard.kind === 'reset') return user.reset_token_hash === guard.hash &&
      new Date(user.reset_token_expires_at).getTime() > Date.now() &&
      user.email === guard.email && (user.role !== 'admin' || Boolean(user.admin_email_verified_at));
    if (guard.kind === 'verification') return user.role === 'admin' &&
      user.admin_email_token_hash === guard.hash && user.pending_admin_email === guard.email &&
      new Date(user.admin_email_token_expires_at).getTime() > Date.now() &&
      user.admin_email_password_tag === crypto.createHash('sha256').update(user.password).digest('hex');
    return false;
  }
  async function processOne() {
    if (!isEnabled()) return false;
    const pool = getPool();
    const token = crypto.randomUUID();
    // Nonlocking discovery does not wait on jobs in uncommitted business writes.
    const ready = `(status = 'pending' AND available_at <= NOW(3))
      OR (status = 'processing' AND lease_until <= NOW(3))`;
    const [candidates] = await pool.execute(`SELECT id FROM email_outbox WHERE ${ready}
      ORDER BY priority DESC, available_at, id LIMIT 1`);
    if (!candidates.length) return false;
    // Compare-and-set claim arbitrates competing workers after discovery.
    const [claim] = await pool.execute(`UPDATE email_outbox SET status = 'processing',
      lease_token = ?, lease_until = DATE_ADD(NOW(3), INTERVAL 5 MINUTE)
      WHERE id = ? AND (${ready})`, [token, candidates[0].id]);
    if (!claim.affectedRows) return false;
    const [rows] = await pool.execute('SELECT * FROM email_outbox WHERE lease_token = ?', [token]);
    const job = rows[0];
    if (!job) return false;
    const finish = status => pool.execute(`UPDATE email_outbox SET status = ?, payload = CASE WHEN ? = 'failed' THEN payload ELSE NULL END,
      finished_at = NOW(3), lease_token = NULL, lease_until = NULL WHERE id = ? AND lease_token = ?`, [status, status, job.id, token]);
    let heartbeat;
    try {
      if (job.attempts >= maxAttempts) { await finish('failed'); return true; }
      const { message, guard } = open(job.payload);
      if (!await valid(guard)) { await finish('canceled'); return true; }
      await pool.execute('UPDATE email_outbox SET attempts = attempts + 1 WHERE id = ? AND lease_token = ?', [job.id, token]);
      heartbeat = setInterval(() => {
        pool.execute(`UPDATE email_outbox SET lease_until = DATE_ADD(NOW(3), INTERVAL 5 MINUTE)
          WHERE id = ? AND lease_token = ?`, [job.id, token]).catch(() => logger.error('Email queue lease renewal failed.'));
      }, 30000);
      heartbeat.unref();
      const result = await deliver({ ...message, messageId: `<${job.id}@smarthood.email>` });
      if (result?.rejected?.length) throw new Error('Recipient rejected');
      await finish('sent');
    } catch {
      // Never log provider errors, recipients, message bodies or secret links.
      logger.error('Email queue delivery failed; inspect outbox status and attempts.');
      const attempts = Number(job.attempts) + 1;
      const delay = Math.min(3600, 30 * 2 ** (attempts - 1)) + crypto.randomInt(0, 15);
      if (attempts >= maxAttempts) await finish('failed');
      else await pool.execute(`UPDATE email_outbox SET status = 'pending', attempts = ?,
        available_at = DATE_ADD(NOW(3), INTERVAL ? SECOND), lease_token = NULL, lease_until = NULL
        WHERE id = ? AND lease_token = ?`, [attempts, delay, job.id, token]);
    } finally { if (heartbeat) clearInterval(heartbeat); }
    return true;
  }
  function tick() {
    if (running || stopped) return;
    running = (async () => {
      for (let count = 0; count < 10 && !stopped; count++) {
        if (!await processOne()) break;
      }
    })().catch(() => logger.error('Email queue database operation failed.'))
      .finally(() => { running = null; });
  }
  function start() {
    if (!stopped) return;
    if (isEnabled()) key();
    stopped = false;
    timer = setInterval(tick, 1000);
    timer.unref();
    tick();
  }
  async function stop() { stopped = true; clearInterval(timer); await running; }
  return { enqueue, processOne, start, stop };
}

module.exports = { createEmailQueue };
