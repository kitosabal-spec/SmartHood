'use strict';

async function up(db) {
  await db.query('SELECT id FROM payments FOR UPDATE');
  await db.query('SELECT id FROM disbursements FOR UPDATE');
  await db.query(`INSERT INTO homeowner_reset_audit (entity_type, entity_id, previous_values, reason)
    SELECT 'payments', id, JSON_OBJECT('amount', amount, 'status', status, 'archived_at', archived_at),
      'Administrator-requested collection and pending payment reset' FROM payments`);
  await db.query(`INSERT INTO homeowner_reset_audit (entity_type, entity_id, previous_values, reason)
    SELECT 'disbursements', id, JSON_OBJECT('amount', amount, 'voided_at', voided_at, 'voided_by', voided_by),
      'Administrator-requested disbursement total reset' FROM disbursements`);
  await db.query('UPDATE payments SET archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP(3)), updated_at = updated_at');
  await db.query('UPDATE disbursements SET voided_at = COALESCE(voided_at, CURRENT_TIMESTAMP(3)), updated_at = updated_at');
  await db.query(`INSERT INTO auditLog (id, action, timestamp, actor_name, actor_role,
      action_type, entity_type, entity_id, new_values, created_at)
    VALUES ('migration-021-financial-reset',
      'Applied administrator-requested collection, pending payment and disbursement reset; original records retained',
      CURRENT_TIMESTAMP(3), 'Database migration 021', 'system', 'reset financial totals',
      'payments', 'all', JSON_OBJECT('migration', '021', 'snapshot_table', 'homeowner_reset_audit'), CURRENT_TIMESTAMP(3))`);
}

module.exports = { up };
