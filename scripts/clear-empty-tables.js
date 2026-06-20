const mysql = require('mysql2/promise');

const tables = ['payments', 'notifications', 'complaints', 'billings', 'auditLog', 'announcements'];
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'san_alfonso_homes',
};

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

(async () => {
  const db = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 4,
  });

  for (const table of tables) {
    await db.execute(`DELETE FROM ${quoteIdentifier(table)}`);
  }

  const checks = await Promise.all(tables.map(async (table) => {
    const [rows] = await db.execute(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`);
    return { table, count: Number(rows[0].count) };
  }));

  console.log(JSON.stringify(checks, null, 2));
  await db.end();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
