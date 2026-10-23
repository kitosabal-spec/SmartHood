'use strict';

function parseIds(value) {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  } catch {
    return String(value).split(',').map(value => value.trim()).filter(Boolean);
  }
}

async function up(db, h) {
  await db.query(`CREATE TABLE IF NOT EXISTS billing_assignments (
    billing_assignment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    billing_id VARCHAR(64) NOT NULL, homeowner_id VARCHAR(64) NOT NULL,
    assigned_amount DECIMAL(12,2) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'active',
    monthly_dues_month VARCHAR(7), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_billing_homeowner (billing_id, homeowner_id),
    UNIQUE KEY uq_homeowner_monthly_dues (homeowner_id, monthly_dues_month),
    INDEX idx_assignments_homeowner_status (homeowner_id, status),
    CONSTRAINT fk_assignments_billing FOREIGN KEY (billing_id) REFERENCES billings(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_assignments_homeowner FOREIGN KEY (homeowner_id) REFERENCES homeowners(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB`);
  const [homeowners] = await db.query('SELECT id FROM homeowners');
  const known = new Set(homeowners.map(row => row.id));
  const [billings] = await db.query('SELECT id, amount, status, monthly_dues_month, assignedTo FROM billings');
  const issues = [];
  const assignments = [];
  for (const billing of billings) {
    const ids = parseIds(billing.assignedTo);
    const unique = new Set();
    for (const homeownerId of ids) {
      if (unique.has(homeownerId)) {
        issues.push({ type: 'duplicate_assignment', table: 'billings', recordId: billing.id, details: 'The legacy assignment list contains a duplicate homeowner ID.' });
      } else if (!known.has(homeownerId)) {
        issues.push({ type: 'missing_homeowner', table: 'billings', recordId: billing.id, details: 'The legacy assignment list references a nonexistent homeowner ID.' });
      } else {
        unique.add(homeownerId);
        assignments.push([billing.id, homeownerId, billing.amount, billing.status === 'inactive' ? 'inactive' : 'active', billing.monthly_dues_month || null]);
      }
    }
  }
  if (issues.length) throw new h.MigrationDataError('Billing assignment backfill requires manual review; see migration_issues.', issues);
  for (const values of assignments) {
    await db.execute(
      `INSERT INTO billing_assignments (billing_id, homeowner_id, assigned_amount, status, monthly_dues_month)
       VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE assigned_amount = VALUES(assigned_amount), status = VALUES(status), monthly_dues_month = VALUES(monthly_dues_month)`,
      values
    );
  }
}

module.exports = { up, parseIds };
