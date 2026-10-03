const mysql = require('mysql2/promise');

(async () => {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'san_alfonso_homes',
  });

  let failures = 0;
  const check = (label, condition, detail = '') => {
    if (condition) console.log(`PASS: ${label}${detail ? ` (${detail})` : ''}`);
    else {
      failures += 1;
      console.error(`FAIL: ${label}${detail ? ` (${detail})` : ''}`);
    }
  };

  try {
    const [[counts]] = await connection.query(`
      SELECT
        (SELECT COUNT(*) FROM homeowners) AS homeowners,
        (SELECT COUNT(*) FROM users WHERE homeowner_id IS NOT NULL) AS registered,
        (SELECT COUNT(*) FROM homeowners h LEFT JOIN users u ON u.homeowner_id = h.id WHERE u.id IS NULL) AS no_account
    `);
    check('Homeowner records are present', Number(counts.homeowners) > 0, `${counts.homeowners} records`);
    check('Account states cover every homeowner', Number(counts.registered) + Number(counts.no_account) === Number(counts.homeowners), `${counts.registered} registered, ${counts.no_account} no account`);

    const [[accountProblems]] = await connection.query(`
      SELECT
        SUM(CASE WHEN username IS NOT NULL AND username <> '' THEN 1 ELSE 0 END) AS usernames,
        SUM(CASE WHEN password NOT REGEXP '^\\\\$2[aby]?\\\\$[0-9]{2}\\\\$' THEN 1 ELSE 0 END) AS unhashed,
        SUM(CASE WHEN h.id IS NULL THEN 1 ELSE 0 END) AS orphan_accounts
      FROM users u
      LEFT JOIN homeowners h ON h.id = u.homeowner_id
      WHERE u.role = 'homeowner'
    `);
    check('Homeowner accounts have no usernames', Number(accountProblems.usernames || 0) === 0);
    check('Homeowner passwords are bcrypt hashes', Number(accountProblems.unhashed || 0) === 0);
    check('Every homeowner account links to a homeowner', Number(accountProblems.orphan_accounts || 0) === 0);

    const [duplicateEmails] = await connection.query(`
      SELECT LOWER(email) AS email, COUNT(*) AS count
      FROM users WHERE role = 'homeowner' AND email IS NOT NULL AND email <> ''
      GROUP BY LOWER(email) HAVING COUNT(*) > 1
    `);
    check('Homeowner account emails are unique', duplicateEmails.length === 0);
    if (duplicateEmails.length) {
      console.error('Duplicate emails:', duplicateEmails.slice(0, 20));
      const [duplicateAccounts] = await connection.query(`
        SELECT u.id, u.role, u.email, u.status, u.homeowner_id, COALESCE(h.name, u.name) AS name
        FROM users u LEFT JOIN homeowners h ON h.id = u.homeowner_id
        WHERE LOWER(u.email) IN (?) ORDER BY u.email, u.id
      `, [duplicateEmails.map(row => row.email)]);
      console.error('Duplicate account records:', duplicateAccounts);
    }

    for (const table of ['payments', 'complaints', 'amenityBookings', 'vehicleRegistrations', 'lostFound']) {
      const [[row]] = await connection.query(
        `SELECT COUNT(*) AS count FROM ${table} r LEFT JOIN homeowners h ON h.id = r.homeownerId WHERE r.homeownerId IS NOT NULL AND r.homeownerId <> '' AND h.id IS NULL`
      );
      check(`${table} homeowner relationships are intact`, Number(row.count) === 0, `${row.count} orphaned`);
    }

    const [homeowners] = await connection.query('SELECT id FROM homeowners');
    const homeownerIds = new Set(homeowners.map(row => row.id));
    const [billings] = await connection.query('SELECT id, assignedTo FROM billings');
    const orphanBillingLinks = [];
    for (const billing of billings) {
      let assigned = [];
      try {
        assigned = JSON.parse(billing.assignedTo || '[]');
        if (typeof assigned === 'string') assigned = JSON.parse(assigned);
      } catch {
        assigned = String(billing.assignedTo || '').split(',').map(value => value.trim()).filter(Boolean);
      }
      for (const homeownerId of Array.isArray(assigned) ? assigned : []) {
        if (!homeownerIds.has(homeownerId)) orphanBillingLinks.push(`${billing.id}:${homeownerId}`);
      }
    }
    check('Billing assignments still reference homeowners', orphanBillingLinks.length === 0, `${orphanBillingLinks.length} orphaned`);

    const [[testRows]] = await connection.query(`
      SELECT
        (SELECT COUNT(*) FROM homeowners WHERE id LIKE 'test-ho-%') +
        (SELECT COUNT(*) FROM billings WHERE id LIKE 'test-billing-%') AS count
    `);
    check('Integration test records were cleaned up', Number(testRows.count) === 0);
  } finally {
    await connection.end();
  }

  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
