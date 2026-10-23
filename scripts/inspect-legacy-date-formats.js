'use strict';

const mysql = require('mysql2/promise');
const { DB_CONFIG } = require('../src/config/environment');

const fields = [
  ['payments', 'submittedAt'], ['payments', 'reviewedAt'],
  ['complaints', 'dateFiled'], ['complaints', 'updatedAt'], ['complaints', 'resolvedAt'],
  ['amenityBookings', 'createdAt'], ['amenityBookings', 'reviewedAt'],
  ['vehicleRegistrations', 'createdAt'], ['vehicleRegistrations', 'updatedAt'],
];

async function main() {
  const connection = await mysql.createConnection(DB_CONFIG);
  try {
    for (const [table, column] of fields) {
      const [rows] = await connection.query(
        `SELECT \`${column}\` AS legacy_value, COUNT(*) AS occurrences
           FROM \`${table}\`
          WHERE \`${column}\` IS NOT NULL AND \`${column}\` <> ''
            AND \`${column}\` NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ]'
          GROUP BY \`${column}\` ORDER BY occurrences DESC`
      );
      if (rows.length) {
        console.log(`${table}.${column}`);
        console.table(rows);
      }
    }
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error('Could not inspect legacy date formats:', error.code || error.message);
  process.exitCode = 1;
});
