const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'san_alfonso_homes',
  ssl: (process.env.MYSQL_SSL === 'true' || (process.env.MYSQL_HOST && process.env.MYSQL_HOST !== 'localhost'))
    ? { rejectUnauthorized: false }
    : undefined,
};

(async () => {
  const db = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 4,
  });

  console.log(`Connecting to database ${dbConfig.database} on ${dbConfig.host}...`);

  // 1. Fetch current billings and payments
  const [billings] = await db.query('SELECT * FROM billings');
  const [payments] = await db.query('SELECT * FROM payments');
  const [homeownersWithBalance] = await db.query('SELECT id, username, name, balance FROM users WHERE role = ? AND balance > 0', ['homeowner']);

  console.log(`Found ${billings.length} billings, ${payments.length} payments, and ${homeownersWithBalance.length} homeowners with positive balance.`);

  // 2. Create backup
  const backupDir = path.join(__dirname, '..', 'data', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `billing_removal_backup_${timestamp}.json`);
  const backupData = {
    exportedAt: new Date().toISOString(),
    counts: {
      billings: billings.length,
      payments: payments.length,
      homeownersWithBalance: homeownersWithBalance.length,
    },
    billings,
    payments,
    homeownersWithBalance,
  };

  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`Backup saved to: ${backupFile}`);

  // 3. Clear payments linked to billings
  const [delPaymentsResult] = await db.execute('DELETE FROM payments WHERE billingId IS NOT NULL');
  console.log(`Deleted ${delPaymentsResult.affectedRows} payment records.`);

  // 4. Delete all billings / monthly dues
  const [delBillingsResult] = await db.execute('DELETE FROM billings');
  console.log(`Deleted ${delBillingsResult.affectedRows} billing records.`);

  // 5. Reset all homeowner balances to 0
  const [updateBalancesResult] = await db.execute('UPDATE users SET balance = 0 WHERE role = ?', ['homeowner']);
  console.log(`Reset balance for ${updateBalancesResult.affectedRows} homeowners to 0.`);

  // 6. Verify final state
  const [verifyBillings] = await db.query('SELECT COUNT(*) AS count FROM billings');
  const [verifyPayments] = await db.query('SELECT COUNT(*) AS count FROM payments');
  const [verifyBalances] = await db.query('SELECT COUNT(*) AS count FROM users WHERE role = ? AND balance > 0', ['homeowner']);

  const finalSummary = {
    backupFile,
    clearedBillings: delBillingsResult.affectedRows,
    clearedPayments: delPaymentsResult.affectedRows,
    updatedBalances: updateBalancesResult.affectedRows,
    remainingBillingsCount: Number(verifyBillings[0].count),
    remainingPaymentsCount: Number(verifyPayments[0].count),
    remainingHomeownersWithBalance: Number(verifyBalances[0].count),
    success: Number(verifyBillings[0].count) === 0 && Number(verifyBalances[0].count) === 0,
  };

  console.log('\n--- Final Verification Result ---');
  console.log(JSON.stringify(finalSummary, null, 2));

  await db.end();
})().catch((err) => {
  console.error('Error clearing billing data:', err);
  process.exitCode = 1;
});
