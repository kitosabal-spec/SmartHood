'use strict';

const mysql = require('mysql2/promise');
const { DB_CONFIG } = require('../src/config/environment');
const { runMigrations } = require('../src/db/migrationRunner');

async function main() {
  const pool = mysql.createPool({ ...DB_CONFIG, waitForConnections: true, connectionLimit: 2 });
  try {
    await runMigrations(pool);
    console.log('Database migrations completed successfully.');
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
});
