'use strict';

// Explicitly read-only diagnostics. Never imports app.js or initializes the
// application (startup can migrate/seed). Prints timings/counts, never records.
const mysql = require('mysql2/promise');
const { performance } = require('node:perf_hooks');

async function main() {
  if (!process.argv.includes('--read-only')) {
    console.log('Usage: node scripts/measure-data-reads.cjs --read-only [--explain]');
    return;
  }
  const { DB_CONFIG } = require('../src/config/environment');
  const pool = mysql.createPool({ ...DB_CONFIG, connectionLimit: 4, connectTimeout: 15000 });
  const queries = [
    ['connection-and-round-trip', 'SELECT 1'],
    ['warm-round-trip', 'SELECT 1'],
    ['announcements', 'SELECT * FROM announcements'],
    ['lost-found', 'SELECT * FROM lostFound WHERE archived_at IS NULL'],
    ['board', 'SELECT * FROM board_of_directors'],
    ['board-term', 'SELECT value FROM appSettings WHERE id = "boardCurrentTerm"'],
    ['homeowner-financial-summary', `SELECT h.*, COALESCE(s.remaining_balance, 0) AS balance,
      COALESCE(s.total_billed, 0) AS total_billed, COALESCE(s.total_approved_payments, 0) AS total_approved_payments
      FROM homeowners h LEFT JOIN homeowner_financial_summary s ON s.homeowner_id = h.id
      WHERE h.archived_at IS NULL`],
  ];
  console.log(JSON.stringify({ configuredDatabase: 'local configuration; production identity not assumed',
    remote: !['localhost', '127.0.0.1', '::1'].includes(DB_CONFIG.host), tls: Boolean(DB_CONFIG.ssl) }));
  try {
    for (const [name, sql] of queries) {
      const start = performance.now();
      const [rows] = await pool.query({ sql, timeout: 15000 });
      console.log(JSON.stringify({ name, milliseconds: Math.round(performance.now() - start), rows: rows.length }));
      if (process.argv.includes('--explain') && name === 'homeowner-financial-summary') {
        const [plan] = await pool.query({ sql: 'EXPLAIN ' + sql, timeout: 15000 });
        // MySQL and TiDB use different plan columns. Keep only safe structural
        // fields; omit operator/access details that can embed schema names.
        console.log(JSON.stringify({ name: 'summary-plan', steps: plan.map(row => ({
          id: row.id, type: row.type, key: row.key, rows: row.rows, estRows: row.estRows,
        })) }));
      }
    }
  } finally {
    await pool.end();
  }
}
main().catch(error => { console.error('Read-only diagnostic failed:', error.code || 'DATABASE_ERROR'); process.exitCode = 1; });
