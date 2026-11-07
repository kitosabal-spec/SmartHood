'use strict';

// Explicit operational wrapper: backup first, migrate once, then compare every
// preserved record. Do not run while another process is writing to the database.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { DB_CONFIG } = require('../src/config/environment');
const { runMigrations } = require('../src/db/migrationRunner');
const { isResidentAccount } = require('../migrations/020_reset_homeowner_accounts_and_balances');

function omit(row, fields) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !fields.includes(key)));
}
function canonical(rows) {
  return rows.map(row => JSON.stringify(row)).sort();
}
async function snapshot(pool) {
  const [tables] = await pool.query("SELECT TABLE_NAME name FROM information_schema.tables WHERE table_schema = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME");
  const data = {};
  for (const { name } of tables) {
    if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error('Unexpected table identifier');
    data[name.toLowerCase() === 'auditlog' ? 'auditLog' : name] = (await pool.query(`SELECT * FROM \`${name}\``))[0];
  }
  return data;
}
async function main() {
  const verifyIndex = process.argv.indexOf('--verify');
  const verifyDirectory = verifyIndex >= 0 ? process.argv[verifyIndex + 1] : null;
  if (!process.argv.includes('--apply') && !verifyDirectory) throw new Error('Use --apply, or --verify BACKUP_DIRECTORY to repeat verification without resetting again.');
  const pool = mysql.createPool({ ...DB_CONFIG, connectionLimit: 2 });
  try {
    const [applied] = await pool.query("SELECT version FROM schema_migrations WHERE version = '020'");
    if (applied.length && !verifyDirectory) { console.log('Reset already applied. Existing registrations and new balances are unchanged.'); return; }
    const directory = verifyDirectory ? path.resolve(verifyDirectory) : path.resolve(__dirname, '../.local-backups', `homeowner-reset-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    const before = verifyDirectory ? JSON.parse(fs.readFileSync(path.join(directory, 'database-before.json'), 'utf8')) : await snapshot(pool);
    if (before.auditlog) { before.auditLog = before.auditlog; delete before.auditlog; }
    if (!verifyDirectory) {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'database-before.json'), JSON.stringify(before), { flag: 'wx' });
      await runMigrations(pool);
    }
    const after = await snapshot(pool);
    // Compare portable JSON values: backups serialize DATE/DATETIME objects.
    const normalized = JSON.parse(JSON.stringify(after));
    for (const [table, rows] of Object.entries(before)) {
      if (['schema_migrations', 'auditLog', 'homeowner_reset_audit'].includes(table)) continue;
      let oldRows = rows, newRows = normalized[table];
      oldRows = JSON.parse(JSON.stringify(oldRows));
      const originalRows = oldRows;
      if (table === 'homeowners') {
        assert.ok(newRows.every(row => Number(row.balance) === 0));
        oldRows = originalRows.map(row => omit(row, ['balance']));
        newRows = newRows.map(row => omit(row, ['balance']));
      } else if (table === 'users') {
        const fields = ['historical_homeowner_id', 'homeowner_id', 'username', 'email', 'normalized_email', 'homeowner_email_key', 'password', 'reset_token_hash', 'reset_token_expires_at', 'status', 'archived_at', 'balance'];
        oldRows = originalRows.map(row => isResidentAccount(row) ? omit(row, fields) : omit(row, ['historical_homeowner_id']));
        newRows = newRows.map(row => {
          const original = originalRows.find(old => old.id === row.id);
          if (isResidentAccount(original)) {
            assert.ok(row.archived_at && row.status === 'inactive' && row.password == null && row.homeowner_id == null);
            assert.equal(row.historical_homeowner_id, original.homeowner_id);
            return omit(row, fields);
          }
          return omit(row, ['historical_homeowner_id']);
        });
      } else if (table === 'billings') {
        const fields = ['status', 'archived_at', 'balance_reset_at'];
        oldRows = originalRows.map(row => omit(row, fields));
        newRows = newRows.map(row => omit(row, fields));
      } else if (table === 'billing_assignments') {
        assert.ok(newRows.every(row => row.status === 'archived'));
        oldRows = originalRows.map(row => omit(row, ['status']));
        newRows = newRows.map(row => omit(row, ['status']));
      }
      assert.deepEqual(canonical(newRows), canonical(oldRows), `${table}: unexpected record changes`);
    }
    for (const row of JSON.parse(JSON.stringify(before.auditLog))) assert.deepEqual(normalized.auditLog.find(item => item.id === row.id), row);
    const [[remaining]] = await pool.query('SELECT COUNT(*) count FROM homeowner_financial_summary WHERE remaining_balance <> 0');
    assert.equal(Number(remaining.count), 0);
    await runMigrations(pool);
    assert.deepEqual(await snapshot(pool), after, 'Migration rerun must not change any data');
    const [[totals]] = await pool.query("SELECT SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(previous_values, '$.remaining_balance')) AS DECIMAL(12,2))) balance FROM homeowner_reset_audit WHERE entity_type = 'homeowners'");
    const result = {
      homeowners: before.homeowners.length, residentAccountsRetired: before.users.filter(isResidentAccount).length,
      protectedAccountsPreserved: before.users.filter(row => !isResidentAccount(row)).length,
      previousOutstandingBalance: totals.balance, currentOutstandingBalance: '0.00',
      paymentsPreserved: before.payments.length, billingsRetained: before.billings.length,
      backupDirectory: directory, verified: true,
    };
    fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error.message.split('\n')[0]); process.exitCode = 1; });
