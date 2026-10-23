'use strict';

async function addForeignKeyOrDefer(db, h, child, column, parent, constraintName, onDelete, parentColumn = 'id') {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS count FROM \`${child}\` c LEFT JOIN \`${parent}\` p ON c.\`${column}\` = p.\`${parentColumn}\`
     WHERE c.\`${column}\` IS NOT NULL AND c.\`${column}\` <> '' AND p.\`${parentColumn}\` IS NULL`
  );
  const count = Number(row.count);
  if (!count) {
    await h.addForeignKey(db, child, constraintName, `\`${column}\``, parent, `\`${parentColumn}\``, onDelete);
    return;
  }
  const details = `${count} row(s) in ${column} do not reference ${parent}.${parentColumn}; ${constraintName} was deferred without changing those records.`;
  await db.execute(
    `INSERT INTO migration_issues (migration_version, issue_type, table_name, details)
     SELECT '003', 'orphan_record', ?, ? FROM DUAL
      WHERE NOT EXISTS (
        SELECT 1 FROM migration_issues WHERE migration_version = '003' AND issue_type = 'orphan_record' AND table_name = ? AND details = ?
      )`,
    [child, details, child, details]
  );
  await db.execute(
    `INSERT INTO deferred_constraints
      (constraint_name, migration_version, child_table, child_column, parent_table, parent_column, on_delete_action, orphan_count)
     VALUES (?, '003', ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE orphan_count = VALUES(orphan_count), last_checked_at = CURRENT_TIMESTAMP(3)`,
    [constraintName, child, column, parent, parentColumn, onDelete, count]
  );
}

async function up(db, h) {
  const childColumns = [
    ['users', 'homeowner_id'], ['payments', 'homeownerId'], ['payments', 'billingId'], ['complaints', 'homeownerId'],
    ['amenityBookings', 'homeownerId'], ['vehicleRegistrations', 'homeownerId'], ['lostFound', 'homeownerId'],
    ['announcement_comments', 'announcement_id'], ['announcement_comments', 'user_id'],
    ['announcement_reactions', 'announcement_id'], ['announcement_reactions', 'user_id'],
  ];
  for (const [table, column] of childColumns) {
    if (await h.columnExists(db, table, column)) await db.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` VARCHAR(64) NULL`);
  }
  for (const [table, column] of [
    ['payments','status'], ['billings','status'], ['complaints','status'], ['amenityBookings','status'],
    ['vehicleRegistrations','registrationStatus'], ['vehicleRegistrations','paymentStatus'], ['lostFound','status'],
  ]) {
    const [[length]] = await db.query(`SELECT COALESCE(MAX(CHAR_LENGTH(\`${column}\`)), 0) AS max_length FROM \`${table}\``);
    if (Number(length.max_length) > 32) {
      throw new h.MigrationDataError(`Legacy ${table}.${column} values exceed the supported status length.`, [{
        type: 'invalid_status_length', table, details: `${column} contains a value longer than 32 characters.`,
      }]);
    }
    await db.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` VARCHAR(32) NULL`);
  }
  await h.addColumn(db, 'notifications', 'created_at', 'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)');
  const indexes = [
    ['payments','idx_payments_homeowner_status','`homeownerId`, `status`'], ['payments','idx_payments_billing_status','`billingId`, `status`'],
    ['payments','idx_payments_month_homeowner','`monthly_dues_month`, `homeownerId`'],
    ['billings','idx_billings_type_month','`billing_type`, `monthly_dues_month`'], ['billings','idx_billings_status_due','`status`, `due_date`'],
    ['complaints','idx_complaints_homeowner_status','`homeownerId`, `status`'],
    ['amenityBookings','idx_bookings_homeowner_status','`homeownerId`, `status`'],
    ['vehicleRegistrations','idx_vehicles_homeowner_status','`homeownerId`, `registrationStatus`'], ['vehicleRegistrations','idx_vehicles_plate','`plateNumber`'],
    ['announcement_comments','idx_comments_announcement','`announcement_id`'], ['notifications','idx_notifications_created','`created_at`'],
  ];
  for (const args of indexes) await h.addIndex(db, ...args);

  for (const args of [
    ['users','homeowner_id','homeowners','fk_users_homeowner','RESTRICT'],
    ['payments','homeownerId','homeowners','fk_payments_homeowner','RESTRICT'],
    ['payments','billingId','billings','fk_payments_billing','RESTRICT'],
    ['complaints','homeownerId','homeowners','fk_complaints_homeowner','RESTRICT'],
    ['amenityBookings','homeownerId','homeowners','fk_bookings_homeowner','RESTRICT'],
    ['vehicleRegistrations','homeownerId','homeowners','fk_vehicles_homeowner','RESTRICT'],
    ['lostFound','homeownerId','homeowners','fk_lostfound_homeowner','RESTRICT'],
    ['announcement_comments','announcement_id','announcements','fk_comments_announcement','CASCADE'],
    ['announcement_comments','user_id','users','fk_comments_user','RESTRICT'],
    ['announcement_reactions','announcement_id','announcements','fk_reactions_announcement','CASCADE'],
    ['announcement_reactions','user_id','users','fk_reactions_user','CASCADE'],
  ]) await addForeignKeyOrDefer(db, h, ...args);
}

module.exports = { up };
