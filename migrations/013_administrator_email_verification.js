'use strict';

async function up(db, h) {
  // Detect collisions before adding constraints. Never merge or discard accounts.
  const [duplicates] = await db.query(`SELECT MIN(id) AS id FROM users
    WHERE email IS NOT NULL AND TRIM(email) <> ''
    GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1`);
  if (duplicates.length) throw new h.MigrationDataError(
    'Duplicate normalized account emails must be reconciled before deployment.',
    duplicates.map(row => ({ type: 'duplicate_email', table: 'users', recordId: row.id,
      details: 'Multiple accounts share a normalized email; resolve ownership without deleting accounts.' })));
  for (const [column, definition] of [
    ['admin_email_verified_at', 'DATETIME(3) NULL'],
    ['pending_admin_email', 'VARCHAR(254) NULL'],
    ['admin_email_token_hash', 'CHAR(64) NULL'],
    ['admin_email_token_expires_at', 'DATETIME(3) NULL'],
    ['admin_email_password_tag', 'CHAR(64) NULL'],
    ['normalized_email', "VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin GENERATED ALWAYS AS (NULLIF(LOWER(TRIM(email)), '')) STORED"],
  ]) await h.addColumn(db, 'users', column, definition);
  await h.addIndex(db, 'users', 'idx_users_normalized_email', '`normalized_email`', { unique: true });
  await h.addIndex(db, 'users', 'idx_users_admin_email_token', '`admin_email_token_hash`');
  // No address, including the old preset, is silently marked verified.
}

module.exports = { up };
