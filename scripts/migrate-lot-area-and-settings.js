const fs = require('fs');
const mysql = require('mysql2/promise');

const homeowners = JSON.parse(fs.readFileSync('data/homeowners.seed.json', 'utf8').replace(/^\uFEFF/, ''));
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'san_alfonso_homes',
};

let db;

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function ensureDatabase() {
  const setupPool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    waitForConnections: true,
    connectionLimit: 2,
  });

  await setupPool.query(
    `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(dbConfig.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await setupPool.end();

  db = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 4,
  });
}

async function run(sql, params = []) {
  const [result] = await db.execute(sql, params);
  return result;
}

async function get(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows[0];
}

(async () => {
  await ensureDatabase();
  await run('ALTER TABLE users ADD COLUMN lotArea DOUBLE').catch(() => {});
  await run('CREATE TABLE IF NOT EXISTS appSettings (id VARCHAR(64) PRIMARY KEY, value TEXT)');
  await run(
    'INSERT INTO appSettings (id, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    ['duesRatePerSqm', '5.725']
  );

  for (const user of homeowners) {
    await run('UPDATE users SET lotArea = ? WHERE id = ?', [user.lotArea || 0, user.id]);
  }

  const areaCheck = await get('SELECT COUNT(*) AS count FROM users WHERE role = ? AND lotArea IS NOT NULL', ['homeowner']);
  const setting = await get('SELECT value FROM appSettings WHERE id = ?', ['duesRatePerSqm']);
  console.log(JSON.stringify({ homeownersWithLotArea: areaCheck.count, duesRatePerSqm: setting.value }, null, 2));
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (db) await db.end();
  });
