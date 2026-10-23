'use strict';

async function invalidCount(db, table, predicate) {
  const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE ${predicate}`);
  return Number(row.count);
}

async function up(db, h) {
  const checks = [
    ['billings', 'amount IS NULL OR amount <= 0 OR ABS(amount) > 9999999999.99', 'Billing amounts must be positive and fit DECIMAL(12,2).'],
    ['payments', 'amount IS NULL OR amount <= 0 OR ABS(amount) > 9999999999.99', 'Payment amounts must be positive and fit DECIMAL(12,2).'],
    ['homeowners', 'balance IS NOT NULL AND (balance < 0 OR ABS(balance) > 9999999999.99)', 'Cached homeowner balances must be non-negative.'],
    ['vehicleRegistrations', 'fee IS NOT NULL AND (fee < 0 OR ABS(fee) > 9999999999.99)', 'Vehicle fees must be non-negative.'],
    ['homeowners', 'lotArea IS NOT NULL AND (lotArea < 0 OR ABS(lotArea) > 99999999.99)', 'Lot areas must be non-negative and fit DECIMAL(10,2).'],
  ];
  const issues = [];
  for (const [table, predicate, details] of checks) {
    if (await h.tableExists(db, table)) {
      const count = await invalidCount(db, table, predicate);
      if (count) issues.push({ type: 'invalid_financial_value', table, details: `${details} Affected rows: ${count}.` });
    }
  }
  if (issues.length) throw new h.MigrationDataError('Invalid financial values require manual correction; see migration_issues.', issues);

  for (const [table, column] of [['billings', 'amount'], ['payments', 'amount'], ['homeowners', 'balance'], ['vehicleRegistrations', 'fee']]) {
    if (await h.columnExists(db, table, column)) {
      await db.query(`UPDATE \`${table}\` SET \`${column}\` = ROUND(\`${column}\`, 2) WHERE \`${column}\` IS NOT NULL`);
      await db.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` DECIMAL(12,2) NULL`);
    }
  }
  if (await h.columnExists(db, 'homeowners', 'lotArea')) {
    await db.query('UPDATE homeowners SET lotArea = ROUND(lotArea, 2) WHERE lotArea IS NOT NULL');
    await db.query('ALTER TABLE homeowners MODIFY COLUMN lotArea DECIMAL(10,2) NULL');
  }

  await h.addColumn(db, 'billings', 'due_date', 'DATE NULL');
  await h.addColumn(db, 'billings', 'created_at', 'DATETIME(3) NULL');
  await h.addColumn(db, 'billings', 'updated_at', 'DATETIME(3) NULL');
  await h.addColumn(db, 'payments', 'archived_at', 'DATETIME(3) NULL');
  await h.addColumn(db, 'payments', 'archived_by', 'VARCHAR(64) NULL');
  await h.addColumn(db, 'payments', 'voided_at', 'DATETIME(3) NULL');
  await h.addColumn(db, 'payments', 'voided_by', 'VARCHAR(64) NULL');
  await h.addColumn(db, 'payments', 'void_reason', 'VARCHAR(500) NULL');
  for (const table of ['users', 'homeowners', 'billings', 'complaints', 'amenityBookings', 'vehicleRegistrations', 'lostFound']) {
    await h.addColumn(db, table, 'archived_at', 'DATETIME(3) NULL');
    await h.addColumn(db, table, 'archived_by', 'VARCHAR(64) NULL');
  }

  await db.query("UPDATE billings SET due_date = STR_TO_DATE(dueDate, '%Y-%m-%d') WHERE due_date IS NULL AND dueDate REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'");
  await db.query("UPDATE billings SET created_at = STR_TO_DATE(LEFT(createdAt, 23), '%Y-%m-%dT%H:%i:%s.%f') WHERE created_at IS NULL AND createdAt REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'");

  const malformedDueDates = await invalidCount(db, 'billings', "dueDate IS NOT NULL AND dueDate <> '' AND due_date IS NULL");
  if (malformedDueDates) {
    throw new h.MigrationDataError('Malformed legacy dates require review; see migration_issues.', [{
      type: 'malformed_date', table: 'billings', details: `dueDate could not be converted for ${malformedDueDates} row(s). No records were changed or deleted.`,
    }]);
  }
}

module.exports = { up };
