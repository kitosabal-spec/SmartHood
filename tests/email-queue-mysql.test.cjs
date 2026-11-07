'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { up } = require('../migrations/023_email_outbox');
const { createEmailQueue } = require('../src/services/emailQueue');

test('real MySQL outbox: commit visibility, rollback, competing workers, crash recovery and retries', {
  skip: process.env.TEST_LOCAL_MYSQL !== '1',
}, async () => {
  // Isolated synthetic schema; never load application database credentials.
  const config = { host: '127.0.0.1', user: 'root', password: '', connectionLimit: 5 };
  const admin = await mysql.createConnection(config);
  const schema = `san_email_test_${crypto.randomBytes(8).toString('hex')}`;
  let pool;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE \`${schema}\``); created = true;
    pool = mysql.createPool({ ...config, database: schema });
    await up(pool); await up(pool);
    const delivered = [];
    const make = deliver => createEmailQueue({ getPool: () => pool, deliver,
      env: { EMAIL_QUEUE_SECRET: 'synthetic-test-key' }, logger: { error() {} } });
    const worker = make(async m => { delivered.push(m); return {}; });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await worker.enqueue({ to: 'test@example.test', message: 'rolled back' }, { connection });
      assert.equal(await worker.processOne(), false);
      await connection.rollback();
      assert.equal(await worker.processOne(), false);
      await connection.beginTransaction();
      const job = await worker.enqueue({ to: 'test@example.test', message: 'committed' }, { connection });
      assert.equal(await worker.processOne(), false);
      await connection.commit();
      await Promise.all([worker.processOne(), make(async m => { delivered.push(m); return {}; }).processOne()]);
      assert.equal(delivered.length, 1);
      assert.equal(delivered[0].messageId, `<${job.id}@smarthood.email>`);
      let [[row]] = await pool.execute('SELECT * FROM email_outbox WHERE id = ?', [job.id]);
      assert.equal(row.status, 'sent'); assert.equal(row.payload, null);
      const retry = await worker.enqueue({ to: 'test@example.test', message: 'retry' });
      await make(async () => { throw Error('SMTP offline'); }).processOne();
      [[row]] = await pool.execute('SELECT * FROM email_outbox WHERE id = ?', [retry.id]);
      assert.equal(row.status, 'pending'); assert.equal(row.attempts, 1);
      assert.equal(await worker.processOne(), false);
      await pool.execute("UPDATE email_outbox SET status = 'processing', lease_token = 'crashed', lease_until = DATE_SUB(NOW(3), INTERVAL 1 MINUTE) WHERE id = ?", [retry.id]);
      await worker.processOne();
      [[row]] = await pool.execute('SELECT * FROM email_outbox WHERE id = ?', [retry.id]);
      assert.equal(row.status, 'sent'); assert.equal(row.attempts, 2);
    } finally { connection.release(); }
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE \`${schema}\``);
    await admin.end();
  }
});
