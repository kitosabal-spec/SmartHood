'use strict';

async function up(db, h) {
  await h.addColumn(db, 'billings', 'billing_category', 'VARCHAR(32) NULL');
  // Metadata only. Do not infer relationships from titles or touch financial data.
  // The NULL predicate makes retries safe and preserves explicit classifications.
  await db.query(`UPDATE billings SET billing_category = CASE
    WHEN vehicle_registration_id IS NOT NULL AND vehicle_registration_id <> '' THEN 'vehicle_fees'
    WHEN amenity_booking_id IS NOT NULL AND amenity_booking_id <> '' THEN 'amenity_fees'
    WHEN billing_type = 'Monthly Association Dues'
      OR ((billing_type IS NULL OR billing_type = '') AND monthly_dues_month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$') THEN 'monthly_dues'
    ELSE 'other_charges' END, updated_at = updated_at
    WHERE billing_category IS NULL`);
  await h.addIndex(db, 'billings', 'idx_billings_category', '`billing_category`, `archived_at`');
}

module.exports = { up };
