'use strict';

const crypto = require('node:crypto');

async function up(db, h) {
  await h.addColumn(db, 'payments', 'legacy_billing_id', 'VARCHAR(64) NULL');
  await h.addColumn(db, 'migration_issues', 'resolved_at', 'DATETIME(3) NULL');
  await h.addColumn(db, 'migration_issues', 'resolution', 'VARCHAR(500) NULL');

  const [orphans] = await db.query(`
    SELECT p.id, p.billingId, p.status, p.monthly_dues_month, p.payment_type
      FROM payments p
      LEFT JOIN billings b ON b.id = p.billingId
     WHERE p.billingId IS NOT NULL
       AND p.billingId <> ''
       AND b.id IS NULL
     FOR UPDATE
  `);

  for (const payment of orphans) {
    const becomesAdvance = payment.status === 'approved' && !payment.monthly_dues_month;
    await db.execute(
      `UPDATE payments
          SET legacy_billing_id = billingId,
              billingId = NULL,
              payment_type = CASE WHEN ? THEN 'advance' ELSE payment_type END,
              updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = ?`,
      [becomesAdvance ? 1 : 0, payment.id]
    );
    const operation = becomesAdvance
      ? 'preserved as an unapplied advance credit'
      : (payment.monthly_dues_month ? 'preserved as a month-specific unlinked payment' : 'detached from a missing billing');
    await db.execute(
      `INSERT INTO auditLog
        (id, action, adminId, timestamp, actor_name, actor_role, action_type, entity_type, entity_id, new_values, created_at)
       VALUES (?, ?, 'system:migration', ?, 'Database migration', 'system', 'reconciled orphan link', 'payments', ?, ?, CURRENT_TIMESTAMP(3))`,
      [
        `l${String(payment.id).slice(0, 30)}${crypto.randomBytes(6).toString('hex')}`.slice(0, 64),
        `system migration reconciled orphan billing link for payments (${payment.id}): ${operation}; original identifier retained internally`,
        new Date().toISOString(),
        payment.id,
        JSON.stringify({ billing_link: 'reconciled', original_identifier: 'retained internally', classification: becomesAdvance ? 'advance' : payment.payment_type }),
      ]
    );
  }

  if (orphans.length) {
    await db.execute(
      `UPDATE migration_issues
          SET resolved_at = CURRENT_TIMESTAMP(3),
              resolution = ?
        WHERE migration_version = '003'
          AND issue_type = 'orphan_record'
          AND table_name = 'payments'
          AND resolved_at IS NULL`,
      [`${orphans.length} invalid billing link(s) were detached; original identifiers were retained in payments.legacy_billing_id and approved unallocated funds were classified as advances.`]
    );
  }
}

module.exports = { up };
