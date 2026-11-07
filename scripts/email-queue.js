'use strict';
const { DB_CONFIG } = require('../src/config/environment');
const mysql = require('mysql2/promise');

async function main() {
  const [command = 'status', id] = process.argv.slice(2);
  if (!['status', 'retry', 'prune'].includes(command) ||
      (command === 'retry' && !/^[a-f0-9-]{36}$/.test(id || ''))) {
    throw new Error('Usage: npm run email:queue -- status | retry <job UUID> | prune');
  }
  const db = await mysql.createConnection(DB_CONFIG);
  try {
    if (command === 'status') {
      const [rows] = await db.query(`SELECT status, COUNT(*) AS jobs, MIN(created_at) AS oldest,
        MAX(attempts) AS max_attempts FROM email_outbox GROUP BY status`);
      console.table(rows);
      const [failed] = await db.query("SELECT id, attempts, finished_at FROM email_outbox WHERE status = 'failed' ORDER BY finished_at DESC LIMIT 50");
      console.table(failed);
    } else if (command === 'retry') {
      const [result] = await db.execute(`UPDATE email_outbox SET status = 'pending', attempts = 0,
        available_at = NOW(3), finished_at = NULL WHERE id = ? AND status = 'failed' AND payload IS NOT NULL`, [id]);
      console.log(`Jobs requeued: ${result.affectedRows}. Expired or superseded links will be canceled.`);
    } else {
      const [result] = await db.query(`DELETE FROM email_outbox
        WHERE status IN ('sent', 'canceled', 'failed') AND finished_at < NOW() - INTERVAL 30 DAY LIMIT 1000`);
      console.log(`Old terminal jobs removed: ${result.affectedRows}. Repeat to clear a larger backlog.`);
    }
  } finally { await db.end(); }
}
main().catch(() => { console.error('Email queue operation failed. Check the command, database and migration 023.'); process.exitCode = 1; });
