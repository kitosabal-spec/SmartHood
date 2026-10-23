# Production database migration and recovery

Complete the backup section **before** starting a production deployment. SmartHood migrations preserve existing rows and stop on validation, orphan, duplicate-assignment, or malformed-date errors. They do not drop the production database or remove legacy compatibility columns.

## Prepare and back up

1. Schedule a maintenance window and stop every SmartHood instance so financial writes cannot race the migration.
2. Use a dedicated application account, not `root`. Grant DDL privileges only for the migration window and remove them afterward.
3. Record the application commit and MySQL version.
4. Create an encrypted backup outside Git, then restore-test it in an isolated database.

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Force -Path 'data/backups' | Out-Null
mysqldump --host=$env:MYSQL_HOST --port=$env:MYSQL_PORT --user=$env:MYSQL_BACKUP_USER --password --single-transaction --routines --triggers --events --set-gtid-purged=OFF $env:MYSQL_DATABASE | gzip > "data/backups/smarthood-$stamp.sql.gz"
```

Do not put a password directly on the command line. Prefer a MySQL login path or the interactive prompt. Encrypt and copy the dump to restricted off-host storage.

```powershell
mysql --host=$env:MYSQL_HOST --port=$env:MYSQL_PORT --user=$env:MYSQL_RESTORE_USER --password -e "CREATE DATABASE smarthood_restore_check CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
gzip -dc "data/backups/smarthood-YYYYMMDD-HHMMSS.sql.gz" | mysql --host=$env:MYSQL_HOST --port=$env:MYSQL_PORT --user=$env:MYSQL_RESTORE_USER --password smarthood_restore_check
```

## Rehearse and deploy

Restore the backup into staging and start one application instance. Startup takes an advisory lock and runs each pending migration once. Inspect `schema_migrations`, `migration_issues`, and `deferred_constraints`. Unsafe financial values still stop startup. Legacy orphan links, undeliverable notification targets, and malformed display dates are preserved and reported; only the affected foreign key or typed conversion is deferred. Never delete a record merely to satisfy a constraint. Deferred foreign keys are retried automatically on every startup after the source data is reconciled.

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd run db:migration-issues
npm.cmd run db:verify
npm.cmd start
```

Verify login, resident isolation, billing creation, partial payments, approval/rejection, duplicate-month prevention, notifications, protected files, audit export, and archive behavior. Compare financial totals before and after.

For production, stop all instances, confirm the backup again, deploy the reviewed commit, and start one instance. For remote MySQL set `MYSQL_SSL=true`; set `MYSQL_SSL_CA_PATH` if the database CA is not in the OS trust store. Certificate verification is never disabled. Start remaining instances only after these checks pass:

```sql
SELECT version, name, applied_at FROM schema_migrations ORDER BY version;
SELECT migration_version, issue_type, table_name, COUNT(*) AS affected
  FROM migration_issues GROUP BY migration_version, issue_type, table_name;
SELECT COUNT(*) AS orphan_assignments
  FROM billing_assignments ba LEFT JOIN homeowners h ON h.id = ba.homeowner_id
 WHERE h.id IS NULL;
SELECT billing_id, homeowner_id, COUNT(*) AS duplicates
  FROM billing_assignments GROUP BY billing_id, homeowner_id HAVING COUNT(*) > 1;
SELECT homeowner_id, monthly_dues_month, COUNT(*) AS duplicates
  FROM billing_assignments WHERE monthly_dues_month IS NOT NULL
 GROUP BY homeowner_id, monthly_dues_month HAVING COUNT(*) > 1;
SELECT * FROM homeowner_financial_summary ORDER BY homeowner_id LIMIT 25;
```

Use `EXPLAIN` in staging for billing-assignment, payment-status, monthly-dues, booking-date, complaint-status, and notification-recipient queries. The migrations add composite indexes matching their equality filters before date/order columns.

## Rollback

### TiDB deployments: migration 010 and interrupted migration 008

TiDB speaks the MySQL protocol but does not support triggers:
https://docs.pingcap.com/tidb/stable/mysql-compatibility/#unsupported-features

The runner detects TiDB with `SELECT VERSION()`. For TiDB only, migration 010
uses an explicit compatibility path without sending trigger SQL, then records
the original migration checksum. MySQL/MariaDB still execute the original
trigger migration. Every TiDB startup logs the limitation: application audit
mutation protections remain enabled, but direct SQL UPDATE/DELETE is not
blocked by database triggers. Restrict direct database access accordingly.
If moving a TiDB database to MySQL later, install and verify the audit triggers
explicitly; the already-recorded migration will not run again automatically.

Migration 008 can resume after connection-loss errors. The runner discards the
lost connection, reconnects, reacquires the migration lock, and reloads applied
checksums before retrying. It allows at most three attempts, with short backoff.
Other failed data migrations and SQL/validation errors still stop startup.
The advisory lock and all migration work use one checked-out connection so a
pool cannot acquire/release the lock on different sessions.

After deploying the updated runner, confirm 010, 011, and 012 are recorded,
check `/api/health`, and test login and audit reads. Do not manually mark the
failed migrations applied. The Render "No open ports" message is a consequence
of initialization failing before the server listens; keep the existing `PORT`
handling. Missing-secret warnings and dependency advisories are separate issues.

### Render failure at migration 006: TEXT actor index

If startup reports `ER_BLOB_KEY_WITHOUT_LENGTH` for `idx_audit_actor`, the existing
`auditLog.adminId` column has a legacy TEXT type. `CREATE TABLE IF NOT EXISTS` does
not change an existing column to the newer VARCHAR definition. The migration
runner now inspects column types and uses a 191-character prefix for ordinary
TEXT/BLOB lookup indexes. Stored values are not truncated; UNIQUE indexes retain
their original semantics. Already-applied migration files and checksums remain
unchanged.

Deploy the updated runner and restart one instance. Migration 006 retries,
skipping columns and indexes already created before the failure, then proceeds
to the remaining migrations. Do not delete migration records or audit rows.
Confirm migrations 001 through 012 are recorded and `/api/health` returns
`ok: true` before reopening traffic.

Set separate, persistent random `SESSION_SECRET` and `FILE_ACCESS_SECRET` values
in Render's environment settings to keep sessions and private file links valid
across restarts. Those missing-secret warnings and npm audit warnings are separate
from the migration failure.

For a disposable local MariaDB/MySQL regression run (localhost root with no
password, no application `.env` database access):

```powershell
$env:TEST_LOCAL_MYSQL = '1'
node --test tests/migration-index.test.cjs
Remove-Item Env:TEST_LOCAL_MYSQL
```

The test creates and removes its own randomly named databases, checks fresh and
legacy schemas, injects the MySQL failure at migration 006, verifies recovery and
repeat startup migrations, and checks that long legacy actor IDs remain intact.

### General rollback procedure

Never edit `schema_migrations` to pretend a failed migration succeeded. MySQL can implicitly commit DDL, so rolling back the application alone does not reverse schema changes.

- Before writes resume: stop the app, retain the failed database for investigation, restore the verified pre-migration dump into a new database, point the previous release to it, and validate counts before reopening traffic.
- After writes resume: do not restore over production because that would discard new payments. Keep the additive schema, roll back the application release, and prepare a reviewed forward-fix migration.
- Do not drop `billing_assignments`, `notification_recipients`, audit data, or legacy JSON columns until a later migration has reconciled counts and another backup has been verified.

Destructive `scripts/clear-*` utilities and historical integration scripts that write directly to MySQL must never run against production.

## Secure homeowner import

`data/homeowners.seed.json` contains fictional fixtures only. Real homeowner data must be supplied out of band, validated in an encrypted staging location, imported over a protected connection by an authorized operator, reconciled, and securely removed. Import files matching `data/homeowners.import.*`, `data/imports/`, and migration reports are ignored by Git. Do not log names, contacts, addresses, credentials, or document paths.

## Removing previously committed personal data

SmartHood does not rewrite history automatically. Repository owners should coordinate a maintenance window, take a protected mirror backup, revoke any exposed credentials, use `git filter-repo` or the hosting provider's sensitive-data removal process, have collaborators reclone, and run secret scanning afterward. History rewriting changes commit IDs and requires coordinated protected-branch administration; never force-push casually.
