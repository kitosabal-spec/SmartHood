'use strict';

const mysql = require('mysql2/promise');
const { DB_CONFIG } = require('../src/config/environment');

async function scalar(connection, sql) {
  const [[row]] = await connection.query(sql);
  return Number(Object.values(row)[0]);
}

async function main() {
  const connection = await mysql.createConnection(DB_CONFIG);
  try {
    const [migrations] = await connection.query('SELECT version, name FROM schema_migrations ORDER BY version');
    const [deferrals] = await connection.query('SELECT constraint_name, child_table, orphan_count FROM deferred_constraints ORDER BY constraint_name');
    const checks = {
      migrationCount: migrations.length,
      billingAssignments: await scalar(connection, 'SELECT COUNT(*) FROM billing_assignments'),
      duplicateBillingAssignments: await scalar(connection, 'SELECT COUNT(*) FROM (SELECT 1 FROM billing_assignments GROUP BY billing_id, homeowner_id HAVING COUNT(*) > 1) duplicates'),
      duplicateMonthlyDuesAssignments: await scalar(connection, "SELECT COUNT(*) FROM (SELECT 1 FROM billing_assignments WHERE monthly_dues_month IS NOT NULL GROUP BY homeowner_id, monthly_dues_month HAVING COUNT(*) > 1) duplicates"),
      orphanBillingAssignments: await scalar(connection, 'SELECT COUNT(*) FROM billing_assignments ba LEFT JOIN billings b ON b.id = ba.billing_id LEFT JOIN homeowners h ON h.id = ba.homeowner_id WHERE b.id IS NULL OR h.id IS NULL'),
      notificationRecipients: await scalar(connection, 'SELECT COUNT(*) FROM notification_recipients'),
      orphanNotificationRecipients: await scalar(connection, 'SELECT COUNT(*) FROM notification_recipients nr LEFT JOIN notifications n ON n.id = nr.notification_id LEFT JOIN users u ON u.id = nr.user_id WHERE n.id IS NULL OR u.id IS NULL'),
      nonPositiveBillings: await scalar(connection, 'SELECT COUNT(*) FROM billings WHERE amount IS NULL OR amount <= 0'),
      nonPositivePayments: await scalar(connection, 'SELECT COUNT(*) FROM payments WHERE amount IS NULL OR amount <= 0'),
      orphanPaymentBillingLinks: await scalar(connection, "SELECT COUNT(*) FROM payments p LEFT JOIN billings b ON b.id = p.billingId WHERE p.billingId IS NOT NULL AND p.billingId <> '' AND b.id IS NULL"),
      unresolvedMigrationIssues: await scalar(connection, 'SELECT COUNT(*) FROM migration_issues WHERE resolved_at IS NULL'),
      deferredConstraintCount: await scalar(connection, 'SELECT COUNT(*) FROM deferred_constraints'),
      paymentBillingForeignKey: await scalar(connection, "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'payments' AND constraint_name = 'fk_payments_billing' AND constraint_type = 'FOREIGN KEY'"),
      retainedLegacyPaymentLinks: await scalar(connection, "SELECT COUNT(*) FROM payments WHERE legacy_billing_id IS NOT NULL AND legacy_billing_id <> ''"),
    };
    console.log(`Applied migrations: ${migrations.map(row => row.version).join(', ')}`);
    console.table(checks);
    if (deferrals.length) console.table(deferrals);
    const mustBeZero = new Set([
      'duplicateBillingAssignments', 'duplicateMonthlyDuesAssignments', 'orphanBillingAssignments',
      'orphanNotificationRecipients', 'nonPositiveBillings', 'nonPositivePayments', 'orphanPaymentBillingLinks',
      'unresolvedMigrationIssues', 'deferredConstraintCount',
    ]);
    const failures = Object.entries(checks).filter(([name, value]) =>
      (mustBeZero.has(name) && value !== 0) || (name === 'paymentBillingForeignKey' && value !== 1)
    );
    if (failures.length) throw new Error(`Verification failed: ${failures.map(([name, value]) => `${name}=${value}`).join(', ')}`);
    console.log(deferrals.length
      ? 'Verification passed with the listed legacy foreign-key deferral(s).'
      : 'Verification passed with no deferred constraints.');
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
