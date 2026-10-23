'use strict';

const mysql = require('mysql2/promise');
const { DB_CONFIG } = require('../src/config/environment');

async function main() {
  const connection = await mysql.createConnection(DB_CONFIG);
  try {
    const [issues] = await connection.execute(
      `SELECT migration_version, issue_type, table_name, details,
              CASE WHEN resolved_at IS NULL THEN 'unresolved' ELSE 'resolved' END AS resolution_status,
              MAX(resolution) AS resolution,
              COUNT(*) AS occurrences
         FROM migration_issues
        GROUP BY migration_version, issue_type, table_name, details,
                 CASE WHEN resolved_at IS NULL THEN 'unresolved' ELSE 'resolved' END
        ORDER BY resolution_status DESC, migration_version, issue_type, table_name`
    );
    if (!issues.length) {
      console.log('No migration issues are recorded.');
      return;
    }
    console.table(issues);
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error('Could not read the migration issue summary:', error.code || error.message);
  process.exitCode = 1;
});
