'use strict';

function isResidentAccount(account) {
  if (account.role !== 'homeowner') return false;
  // Officers in legacy databases also use role=homeowner. Preserve every
  // account with administrative modules (and fail closed on unknown formats).
  let permissions = account.permissions;
  if (typeof permissions === 'string') {
    try { permissions = JSON.parse(permissions); } catch { return false; }
  }
  return Array.isArray(permissions) && permissions.every(p => typeof p === 'string' && (p === 'resident' || p.startsWith('ho-')));
}

async function up(db) {
  const [accounts] = await db.query('SELECT id, role, permissions FROM users FOR UPDATE');
  await db.query('SELECT id FROM homeowners FOR UPDATE');
  await db.query('SELECT id FROM billings FOR UPDATE');
  await db.query('SELECT billing_assignment_id FROM billing_assignments FOR UPDATE');
  const ids = accounts.filter(isResidentAccount).map(account => account.id);
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    await db.execute(`INSERT INTO homeowner_reset_audit (entity_type, entity_id, previous_values)
      SELECT 'users', id, JSON_OBJECT('homeowner_id', homeowner_id, 'username', username,
        'email', email, 'status', status, 'archived_at', archived_at, 'permissions', permissions)
      FROM users WHERE id IN (${placeholders})`, ids);
    // Keep user IDs referenced by comments, payments, notifications and audit
    // records. Free the unique login/link fields for a NEW account identity;
    // an old signed cookie must never work again after registration.
    await db.execute(`UPDATE users SET historical_homeowner_id = homeowner_id,
      homeowner_id = NULL, username = NULL, email = NULL, password = NULL,
      reset_token_hash = NULL, reset_token_expires_at = NULL,
      status = 'inactive', archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP(3)), balance = 0
      WHERE id IN (${placeholders})`, ids);
  }
  await db.query(`INSERT INTO homeowner_reset_audit (entity_type, entity_id, previous_values)
    SELECT 'homeowners', h.id, JSON_OBJECT('cached_balance', h.balance,
      'remaining_balance', COALESCE(s.remaining_balance, 0))
    FROM homeowners h LEFT JOIN homeowner_financial_summary s ON s.homeowner_id = h.id`);
  await db.query(`INSERT INTO homeowner_reset_audit (entity_type, entity_id, previous_values)
    SELECT 'billings', b.id, JSON_OBJECT('status', b.status, 'archived_at', b.archived_at)
    FROM billings b WHERE EXISTS (SELECT 1 FROM billing_assignments ba WHERE ba.billing_id = b.id)`);
  await db.query(`INSERT INTO homeowner_reset_audit (entity_type, entity_id, previous_values)
    SELECT 'billing_assignments', CAST(billing_assignment_id AS CHAR),
      JSON_OBJECT('billing_id', billing_id, 'homeowner_id', homeowner_id,
        'assigned_amount', assigned_amount, 'status', status, 'monthly_dues_month', monthly_dues_month)
    FROM billing_assignments`);
  await db.query(`UPDATE billings SET status = 'inactive',
    archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP(3)), balance_reset_at = CURRENT_TIMESTAMP(3),
    updated_at = updated_at
    WHERE EXISTS (SELECT 1 FROM billing_assignments ba WHERE ba.billing_id = billings.id)`);
  // Retain amounts, links, and monthly uniqueness reservations for audit and
  // to prevent automatic generation of the same cleared monthly obligation.
  await db.query("UPDATE billing_assignments SET status = 'archived', updated_at = updated_at");
  await db.query('UPDATE homeowners SET balance = 0, updated_at = updated_at');
  await db.query(`INSERT INTO auditLog (id, action, timestamp, actor_name, actor_role,
      action_type, entity_type, entity_id, new_values, created_at)
    VALUES ('migration-020-homeowner-reset',
      'Applied administrator-requested resident account and opening balance reset; officer accounts and payment history preserved',
      CURRENT_TIMESTAMP(3), 'Database migration 020', 'system', 'reset opening balances',
      'homeowners', 'all', JSON_OBJECT('migration', '020', 'snapshot_table', 'homeowner_reset_audit'), CURRENT_TIMESTAMP(3))`);
}

module.exports = { up, isResidentAccount };
