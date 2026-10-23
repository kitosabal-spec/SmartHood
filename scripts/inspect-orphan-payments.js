'use strict';

const mysql = require('mysql2/promise');
const { DB_CONFIG } = require('../src/config/environment');

async function main() {
  const connection = await mysql.createConnection(DB_CONFIG);
  try {
    const [rows] = await connection.query(`
      SELECT p.id AS payment_id,
             p.billingId AS missing_billing_id,
             p.homeownerId AS homeowner_id,
             p.status,
             p.amount,
             p.monthly_dues_month,
             p.payment_type,
             p.payment_source,
             p.payment_date,
             p.created_at
        FROM payments p
        LEFT JOIN billings b ON b.id = p.billingId
       WHERE p.billingId IS NOT NULL
         AND p.billingId <> ''
         AND b.id IS NULL
       ORDER BY p.id
    `);
    console.table(rows);
    if (rows.length) {
      const ids = rows.flatMap(row => [row.payment_id, row.missing_billing_id]);
      const clauses = ids.map(() => 'action LIKE ?').join(' OR ');
      const [auditRows] = await connection.query(
        `SELECT action, timestamp FROM auditLog WHERE ${clauses} ORDER BY timestamp`,
        ids.map(id => `%${id}%`)
      );
      console.log('Related redacted audit entries:');
      console.table(auditRows);
      const homeownerIds = [...new Set(rows.map(row => row.homeowner_id))];
      const placeholders = homeownerIds.map(() => '?').join(', ');
      const [homeowners] = await connection.query(
        `SELECT id AS homeowner_id, archived_at IS NOT NULL AS is_archived FROM homeowners WHERE id IN (${placeholders})`,
        homeownerIds
      );
      console.log('Referenced homeowner existence:');
      console.table(homeowners);
    }
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error('Could not inspect orphan payments:', error.code || error.message);
  process.exitCode = 1;
});
