'use strict';

async function up(db, h) {
  await db.query(`CREATE OR REPLACE VIEW homeowner_financial_summary AS
    SELECT h.id AS homeowner_id,
           CAST(COALESCE(SUM(CASE WHEN ba.status = 'active' AND b.archived_at IS NULL THEN ba.assigned_amount ELSE 0 END), 0) AS DECIMAL(12,2)) AS total_billed,
           CAST(COALESCE(SUM(CASE WHEN ba.status = 'active' AND b.archived_at IS NULL THEN COALESCE(pp.total_paid, 0) ELSE 0 END), 0) AS DECIMAL(12,2)) AS total_approved_payments,
           CAST(COALESCE(SUM(CASE WHEN ba.status = 'active' AND b.archived_at IS NULL THEN GREATEST(ba.assigned_amount - COALESCE(pp.total_paid, 0), 0) ELSE 0 END), 0) AS DECIMAL(12,2)) AS remaining_balance
      FROM homeowners h
      LEFT JOIN billing_assignments ba ON ba.homeowner_id = h.id
      LEFT JOIN billings b ON b.id = ba.billing_id
      LEFT JOIN (
        SELECT billingId, homeownerId, SUM(amount) AS total_paid
          FROM payments
         WHERE status = 'approved' AND archived_at IS NULL AND voided_at IS NULL
         GROUP BY billingId, homeownerId
      ) pp ON pp.billingId = ba.billing_id AND pp.homeownerId = ba.homeowner_id
     WHERE h.archived_at IS NULL
     GROUP BY h.id`);

  await h.addIndex(db, 'billings', 'idx_billings_archive', '`archived_at`, `status`');
  await h.addIndex(db, 'payments', 'idx_payments_archive_void', '`archived_at`, `voided_at`, `status`');
}

module.exports = { up };
