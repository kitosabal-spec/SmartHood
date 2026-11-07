'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { DB_CONFIG } = require('../src/config/environment');
const { runMigrations } = require('../src/db/migrationRunner');
async function main() {
  const pool = mysql.createPool({ ...DB_CONFIG, connectionLimit: 2 });
  try {
    if ((await pool.query("SELECT version FROM schema_migrations WHERE version='021'"))[0].length) {
      console.log('Reset already applied; new transactions unchanged.'); return;
    }
    const before = {};
    for (const table of ['payments', 'disbursements', 'users', 'homeowners', 'complaints']) before[table] = (await pool.query(`SELECT * FROM ${table} ORDER BY id`))[0];
    const directory = path.resolve(__dirname, '../.local-backups', 'financial-reset-' + new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'before.json'), JSON.stringify(before));
    await runMigrations(pool);
    for (const [table, rows] of Object.entries(before)) {
      const after = (await pool.query(`SELECT * FROM ${table} ORDER BY id`))[0];
      const field = table === 'payments' ? 'archived_at' : table === 'disbursements' ? 'voided_at' : null;
      if (field) assert.ok(after.every(row => row[field]));
      const strip = records => records.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== field)));
      assert.deepEqual(strip(after), strip(rows), `${table} preservation failed`);
    }
    const [[totals]] = await pool.query(`SELECT
      (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='approved' AND archived_at IS NULL) collected,
      (SELECT COUNT(*) FROM payments WHERE status='pending' AND archived_at IS NULL) pending,
      (SELECT COALESCE(SUM(amount),0) FROM disbursements WHERE voided_at IS NULL) disbursed`);
    assert.ok(Object.values(totals).every(value => Number(value) === 0));
    await runMigrations(pool);
    const report = { ...totals, paymentRecordsPreserved: before.payments.length, disbursementRecordsPreserved: before.disbursements.length, backup: directory };
    fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error.message.split('\n')[0]); process.exitCode = 1; });
