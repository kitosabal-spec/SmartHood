'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DB_CONFIG } = require('../src/config/environment');
const mysql = require('mysql2/promise');
const paths = require('../src/config/paths');
const { createStorageService } = require('../src/services/storageService');
const { createMigrationRepository, migrateUploads } = require('../src/services/storageMigrationService');

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--execute', '--dry-run', '--confirm=UPLOAD_TO_R2']);
  if (args.some(arg => !allowed.has(arg)) || (args.includes('--execute') && args.includes('--dry-run'))) throw new Error('Invalid migration options.');
  const execute = args.includes('--execute');
  const confirmed = args.includes('--confirm=UPLOAD_TO_R2');
  if (execute && !confirmed) throw new Error('Real migration requires --execute --confirm=UPLOAD_TO_R2.');
  // Dry-run needs neither R2 credentials nor a network call to object storage.
  const storage = execute ? createStorageService({ env: { ...process.env, STORAGE_DRIVER: 'r2' } }) : null;
  const pool = mysql.createPool(DB_CONFIG);
  let lock;
  const reports = [];
  try {
    if (execute) {
      lock = await pool.getConnection();
      const [[result]] = await lock.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':smarthood:r2-migration'), 0) AS acquired");
      if (!Number(result.acquired)) throw new Error('Another upload migration is running.');
    }
    const summary = await migrateUploads({ repository: createMigrationRepository(pool), storage, paths, execute, confirmed,
      report: result => reports.push(result) });
    // A local, redacted report is useful for retrying failures. Never write
    // credentials, resident data, original filenames, IDs or payment references.
    const reportPath = path.join(paths.ROOT_DIR, 'r2-migration-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({ mode: execute ? 'execute' : 'dry-run', summary, objects: reports }, null, 2));
    console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', ...summary }));
    console.log('Redacted results: r2-migration-report.json. Local files were retained.');
    if (summary.failed) process.exitCode = 1;
  } finally {
    if (lock) { await lock.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':smarthood:r2-migration'))").catch(() => {}); lock.release(); }
    await pool.end();
  }
}

if (require.main === module) main().catch(error => {
  // Only messages authored here are safe; drivers can include SQL and secrets.
  const safe = ['Real migration requires --execute --confirm=UPLOAD_TO_R2.', 'Invalid migration options.', 'Another upload migration is running.'];
  console.error(safe.includes(error.message) || error.message.startsWith('Incomplete R2 configuration:') ? error.message : 'Upload migration failed. Check configuration, database migrations, and access permissions.');
  process.exitCode = 1;
});

module.exports = { main };
