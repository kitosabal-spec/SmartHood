const path = require('path');
const { ROOT_DIR } = require('./paths');

require('dotenv').config({ path: path.join(ROOT_DIR, '.env') });

const PORT = Number(process.env.PORT || 3000);
const DB_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'san_alfonso_homes',
  ssl: (process.env.MYSQL_SSL === 'true' || (process.env.MYSQL_HOST && process.env.MYSQL_HOST !== 'localhost'))
    ? { rejectUnauthorized: false }
    : undefined,
};

module.exports = { PORT, DB_CONFIG };
