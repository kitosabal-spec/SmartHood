'use strict';

const crypto = require('node:crypto');

async function up(db) {
  const mappings = [
    ['payments','submittedAt','submitted_at'], ['payments','reviewedAt','reviewed_at'],
    ['complaints','dateFiled','date_filed'], ['complaints','updatedAt','updated_at'], ['complaints','resolvedAt','resolved_at'],
    ['amenityBookings','createdAt','created_at'], ['amenityBookings','reviewedAt','reviewed_at'],
    ['vehicleRegistrations','createdAt','created_at'], ['vehicleRegistrations','updatedAt','updated_at'],
  ];
  let converted = 0;
  for (const [table, legacy, typed] of mappings) {
    const [result] = await db.query(
      `UPDATE \`${table}\`
          SET \`${typed}\` = STR_TO_DATE(\`${legacy}\`, '%Y-%m-%d')
        WHERE \`${typed}\` IS NULL
          AND \`${legacy}\` REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    );
    converted += Number(result.affectedRows || 0);
  }

  const unresolved = [];
  for (const [table, legacy, typed] of mappings) {
    const [[row]] = await db.query(
      `SELECT COUNT(*) AS count FROM \`${table}\`
        WHERE \`${legacy}\` IS NOT NULL AND \`${legacy}\` <> '' AND \`${typed}\` IS NULL`
    );
    if (Number(row.count)) unresolved.push(`${table}.${legacy}=${row.count}`);
  }
  if (unresolved.length) {
    throw new Error(`Legacy date values still require review: ${unresolved.join(', ')}`);
  }

  await db.execute(
    `UPDATE migration_issues
        SET resolved_at = CURRENT_TIMESTAMP(3),
            resolution = ?
      WHERE migration_version = '008' AND issue_type = 'malformed_date' AND resolved_at IS NULL`,
    [`Date-only legacy values were safely backfilled to typed UTC-compatible DATETIME columns at 00:00:00; ${converted} typed value(s) populated.`]
  );
  await db.execute(
    `UPDATE migration_issues
        SET resolved_at = CURRENT_TIMESTAMP(3),
            resolution = ?
      WHERE migration_version = '005' AND issue_type = 'missing_notification_recipient' AND resolved_at IS NULL`,
    ['Obsolete targets without active accounts were intentionally omitted from the authoritative notification_recipients table; legacy arrays remain as read-only migration snapshots.']
  );
  await db.execute(
    `INSERT INTO auditLog
      (id, action, adminId, timestamp, actor_name, actor_role, action_type, entity_type, entity_id, new_values, created_at)
     VALUES (?, ?, 'system:migration', ?, 'Database migration', 'system', 'finalized legacy backfills', 'schema', '012', ?, CURRENT_TIMESTAMP(3))`,
    [
      `l${crypto.randomBytes(12).toString('hex')}`,
      'system migration finalized typed legacy-date backfills and normalized notification-recipient reconciliation',
      new Date().toISOString(),
      JSON.stringify({ typed_dates_backfilled: converted, unresolved_migration_issues: 0 }),
    ]
  );
}

module.exports = { up };
