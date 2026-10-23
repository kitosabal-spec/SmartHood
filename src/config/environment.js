const path = require('path');
const fs = require('fs');
const { ROOT_DIR } = require('./paths');

require('dotenv').config({ path: path.join(ROOT_DIR, '.env') });

const PORT = Number(process.env.PORT || 3000);
const mysqlHost = process.env.MYSQL_HOST || 'localhost';
const mysqlSslEnabled = process.env.MYSQL_SSL === 'true' ||
  (process.env.MYSQL_SSL !== 'false' && process.env.MYSQL_HOST && !['localhost', '127.0.0.1', '::1'].includes(process.env.MYSQL_HOST));
const mysqlCaPath = String(process.env.MYSQL_SSL_CA_PATH || '').trim();
const DB_CONFIG = {
  host: mysqlHost,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'san_alfonso_homes',
  ssl: mysqlSslEnabled ? {
    rejectUnauthorized: true,
    ...(mysqlCaPath ? { ca: fs.readFileSync(path.resolve(mysqlCaPath), 'utf8') } : {}),
  } : undefined,
};

module.exports = { PORT, DB_CONFIG };
