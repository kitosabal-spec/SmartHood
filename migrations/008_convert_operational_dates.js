'use strict';

async function addTypedColumns(db, h) {
  const definitions = {
    payments: [['submitted_at','DATETIME(3) NULL'], ['reviewed_at','DATETIME(3) NULL']],
    complaints: [['date_filed','DATETIME(3) NULL'], ['occurrence_date','DATE NULL'], ['updated_at','DATETIME(3) NULL'], ['resolved_at','DATETIME(3) NULL']],
    amenityBookings: [['booking_date','DATE NULL'], ['start_time','TIME NULL'], ['end_time','TIME NULL'], ['created_at','DATETIME(3) NULL'], ['reviewed_at','DATETIME(3) NULL']],
    vehicleRegistrations: [['created_at','DATETIME(3) NULL'], ['updated_at','DATETIME(3) NULL'], ['released_at','DATETIME(3) NULL']],
    lostFound: [['event_date','DATE NULL'], ['created_at','DATETIME(3) NULL'], ['updated_at','DATETIME(3) NULL'], ['claimed_at','DATETIME(3) NULL']],
    announcement_comments: [['created_at_utc','DATETIME(3) NULL']],
  };
  for (const [table, columns] of Object.entries(definitions)) {
    for (const [column, definition] of columns) await h.addColumn(db, table, column, definition);
  }
}

async function up(db, h) {
  await addTypedColumns(db, h);
  const mappings = [
    ['payments','submittedAt','submitted_at','datetime'], ['payments','reviewedAt','reviewed_at','datetime'],
    ['complaints','dateFiled','date_filed','datetime'], ['complaints','dateOfOccurrence','occurrence_date','date'],
    ['complaints','updatedAt','updated_at','datetime'], ['complaints','resolvedAt','resolved_at','datetime'],
    ['amenityBookings','bookingDate','booking_date','date'], ['amenityBookings','startTime','start_time','time'], ['amenityBookings','endTime','end_time','time'],
    ['amenityBookings','createdAt','created_at','datetime'], ['amenityBookings','reviewedAt','reviewed_at','datetime'],
    ['vehicleRegistrations','createdAt','created_at','datetime'], ['vehicleRegistrations','updatedAt','updated_at','datetime'], ['vehicleRegistrations','releasedAt','released_at','datetime'],
    ['lostFound','eventDate','event_date','date'], ['lostFound','createdAt','created_at','datetime'], ['lostFound','updatedAt','updated_at','datetime'], ['lostFound','claimedAt','claimed_at','datetime'],
    ['announcement_comments','created_at','created_at_utc','datetime'],
  ];
  const issues = [];
  for (const [table, legacy, typed, kind] of mappings) {
    if (!await h.columnExists(db, table, legacy)) continue;
    const pattern = kind === 'date' ? '^[0-9]{4}-[0-9]{2}-[0-9]{2}' : kind === 'time' ? '^[0-9]{1,2}:[0-9]{2}' : '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ]';
    const [[invalid]] = await db.query(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE \`${legacy}\` IS NOT NULL AND \`${legacy}\` <> '' AND \`${legacy}\` NOT REGEXP ?`, [pattern]);
    if (Number(invalid.count)) {
      issues.push({ type: 'malformed_date', table, details: `${legacy} contains ${invalid.count} value(s) that are not valid ISO ${kind} strings.` });
    }
    const expression = kind === 'date'
      ? `STR_TO_DATE(LEFT(\`${legacy}\`, 10), '%Y-%m-%d')`
      : kind === 'time'
        ? `STR_TO_DATE(LEFT(\`${legacy}\`, 8), '%H:%i:%s')`
        : `STR_TO_DATE(REPLACE(LEFT(\`${legacy}\`, 23), 'T', ' '), '%Y-%m-%d %H:%i:%s.%f')`;
    await db.execute(
      `UPDATE \`${table}\` SET \`${typed}\` = ${expression}
        WHERE \`${typed}\` IS NULL AND \`${legacy}\` IS NOT NULL AND \`${legacy}\` <> '' AND \`${legacy}\` REGEXP ?`,
      [pattern]
    );
  }
  for (const issue of issues) {
    await db.execute(
      `INSERT INTO migration_issues (migration_version, issue_type, table_name, details)
       SELECT '008', ?, ?, ? FROM DUAL
        WHERE NOT EXISTS (
          SELECT 1 FROM migration_issues WHERE migration_version = '008' AND issue_type = ? AND table_name = ? AND details = ?
        )`,
      [issue.type, issue.table, issue.details, issue.type, issue.table, issue.details]
    );
  }

  const [[invalidPaymentDates]] = await db.query("SELECT COUNT(*) AS count FROM payments WHERE payment_date IS NOT NULL AND CAST(payment_date AS CHAR) <> '' AND CAST(payment_date AS CHAR) NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'");
  if (Number(invalidPaymentDates.count)) {
    await h.addColumn(db, 'payments', 'payment_date_value', 'DATE NULL');
    await db.query("UPDATE payments SET payment_date_value = STR_TO_DATE(CAST(payment_date AS CHAR), '%Y-%m-%d') WHERE payment_date_value IS NULL AND CAST(payment_date AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'");
    const details = `${invalidPaymentDates.count} payment_date value(s) are not YYYY-MM-DD. Original values were preserved.`;
    await db.execute(
      `INSERT INTO migration_issues (migration_version, issue_type, table_name, details)
       SELECT '008', 'malformed_date', 'payments', ? FROM DUAL
        WHERE NOT EXISTS (SELECT 1 FROM migration_issues WHERE migration_version = '008' AND issue_type = 'malformed_date' AND table_name = 'payments' AND details = ?)`,
      [details, details]
    );
    await h.addIndex(db, 'payments', 'idx_payments_date_status', '`payment_date_value`, `status`');
  } else {
    await db.query('ALTER TABLE payments MODIFY COLUMN payment_date DATE NULL');
    await h.addIndex(db, 'payments', 'idx_payments_date_status', '`payment_date`, `status`');
  }
  await h.addIndex(db, 'complaints', 'idx_complaints_status_filed', '`status`, `date_filed`');
  await h.addIndex(db, 'amenityBookings', 'idx_bookings_date_status', '`booking_date`, `status`');
  await h.addIndex(db, 'announcement_comments', 'idx_comments_announcement_created', '`announcement_id`, `created_at_utc`');
}

module.exports = { up };
