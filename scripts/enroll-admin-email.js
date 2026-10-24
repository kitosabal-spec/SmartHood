'use strict';

// Run locally by the deployment operator BEFORE switching to email-only login.
// No passwords/tokens in argv, environment, logs, or shell history.
const readline = require('node:readline/promises');
const mysql = require('mysql2/promise');
const { DB_CONFIG } = require('../src/config/environment');
const { runMigrations } = require('../src/db/migrationRunner');
const { createAuditService } = require('../src/services/auditService');
const { createAdminEmailService } = require('../src/services/adminEmailService');
const { sendEmail, isEmailConfigured } = require('../src/services/emailService');

function secret(prompt) {
  return new Promise((resolve, reject) => {
    process.stdout.write(prompt);
    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
    };
    function onData(chunk) {
      for (const char of chunk.toString()) {
        if (char === '\u0003') { finish(); reject(new Error('Canceled.')); return; }
        if (char === '\r' || char === '\n') { finish(); resolve(value); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    }
    process.stdin.on('data', onData);
  });
}

async function main() {
  if (!process.stdin.isTTY) throw new Error('Use an interactive terminal; redirected credential input is not supported.');
  const pool = mysql.createPool({ ...DB_CONFIG, connectionLimit: 2 });
  const ask = async prompt => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try { return await rl.question(prompt); } finally { rl.close(); }
  };
  try {
    await runMigrations(pool);
    const account = (await ask('Existing administrator username or account ID [admin]: ')).trim() || 'admin';
    const [users] = await pool.execute("SELECT * FROM users WHERE role = 'admin' AND (BINARY username = ? OR id = ?) LIMIT 1", [account, account]);
    if (!users[0]) throw new Error('Existing administrator not found. Initialize a new installation with npm start first.');
    const email = (await ask('Real email address to verify: ')).trim();
    let password = await secret('Current administrator password (hidden): ');
    const req = { headers: {}, ip: 'local-operator' };
    const audit = createAuditService({ getPool: () => pool, resolveActor: async () => null });
    const service = createAdminEmailService({
      get: async (sql, args) => (await audit.current().connection.execute(sql, args))[0][0],
      run: async (sql, args) => (await audit.current().connection.execute(sql, args))[0],
      record: async (user, operation) => {
        audit.current().actor = { id: user.id, role: user.role, name: user.name };
        await audit.record(req, { table: 'users', id: user.id, operation });
      },
      sendEmail, isEmailConfigured, baseUrl: () => String(process.env.APP_BASE_URL || '').trim(),
    });
    await audit.transaction(req, () => service.request({ userId: users[0].id, email, password, enrollment: true }));
    password = '';
    console.log('Verification sent. Copy the link from the email; do not open it on the old application.');
    const link = await secret('Paste verification link (hidden): ');
    let token;
    try { token = new URL(link).searchParams.get('admin_email_token'); } catch { token = link; }
    const result = await audit.transaction(req, () => service.verify(token));
    console.log(result.message);
    console.log('Enrollment complete on the SAME account. Deploy the new server to disable username login.');
  } finally { await pool.end(); }
}

main().catch(error => { console.error('Administrator enrollment failed:', error.message); process.exitCode = 1; });
