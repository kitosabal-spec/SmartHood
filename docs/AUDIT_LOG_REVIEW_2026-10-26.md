# Audit log repair and deployment review — 26 October 2026

## Cause and repair

The page reversed an unordered `SELECT *` result. Normal audit IDs contain a time component, while migration IDs are random, so reversal placed older maintenance events above newer account activity. The UI also displayed raw ISO timestamps and full technical change summaries, and ignored stored actor-name snapshots.

The table and export now sort by the recorded event timestamp with deterministic ties; invalid dates remain visible at the end. Readable event titles, meaningful change details, expandable reference IDs, event-time actor names, and explicitly labeled local dates replace the dense technical presentation. Empty-to-empty entries and redaction markers are omitted from the normal page and report. Original immutable evidence remains in the database. Mobile cards keep event text within the viewport. New bookings retain allowlisted amenity names and valid reservation times while protecting personal/free-text values. Historical values are never invented or looked up from current records.

Audit reads cannot be cached, failed refreshes clear stale content, and the writer uses Express's proxy-aware request IP rather than a caller-supplied raw forwarding header.

## Checks against the configured database

Only read-only queries were issued against the application database:

- 68 audit records; all timestamps parse. 17 records have structured metadata/name snapshots, and six are migration events.
- All 25 base tables use InnoDB; both immutable audit UPDATE/DELETE triggers exist.
- All 13 migrations are applied; no unresolved migration issues or deferred constraints remain.
- No orphan payment/billing links, orphan assignments, duplicate monthly assignments, orphan notification recipients, or nonpositive billing/payment amounts were found.
- Five previous invalid payment links were reconciled by migration 011. Their original identifiers remain in `legacy_billing_id`. The screenshot shows the preserved repair history, not five current failures.

## Validation

- `npm test`: authentication, role permissions, financial rollback, audit privacy, request-race and export checks, plus all UI simulation scripts. The real-database test is opt-in and reported separately; see `logs/test-results.txt` for counts.
- `npm run test:browser`: 24 administrator/resident views; populated audit search, ordering, details, pagination and XLSX download; responsive light/dark rendering; report Excel/CSV downloads. Uses synthetic data and isolated HTTP fixtures.
- `npm run check`: JavaScript syntax, local assets, merge markers and nested-repository checks.
- Real MariaDB migration/transaction test: four tests passed with zero skips, including fresh/legacy migrations, real business/audit commit and rollback, and immutable UPDATE/DELETE rejection. See `logs/mysql-regression.txt`. It creates and removes randomly named disposable databases, never the application database.
- Local verification output and synthetic screenshots are in `logs/`, which is Git-ignored.

## Dependency updates

Compatible lockfile updates include Express 4.22.3, body-parser 1.20.9, proxy-addr 2.0.8, Multer 2.5.0, mysql2 3.24.6, Nodemailer 10.2.1, and qs 6.16.1. Install the reviewed lockfile with `npm ci` when releasing.

The initial production audit reported nine affected package entries (one critical, two high, six moderate). After compatible updates, two moderate entries remain: `uuid` and its parent `exceljs`. They refer to the same [UUID buffer-bounds advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq), affecting the `v3`, `v5`, and `v6` methods. Inspection of ExcelJS 4.4.0 found only `v4()` calls without caller-provided buffers, so the reported vulnerable methods are not used by the current export path. The pinned browser bundle remains ExcelJS 4.4.0. This is a documented remaining dependency warning, not a clean vulnerability scan. Do not run `npm audit fix --force`: npm proposes downgrading ExcelJS to 3.4.0. Reassess if ExcelJS or the export feature changes.

## Before production release

This checkout is configured for local development (`NODE_ENV=development`, HTTP base URL, direct hosting with zero trusted proxy hops). It is not a verified production deployment.

1. Restore a verified backup into staging on a maintained database release and rehearse the documented migration/recovery procedure. The local database is MariaDB 10.4.32; [MariaDB 10.4 maintenance ended on 18 June 2024](https://mariadb.org/about/#maintenance-policy). Do not expose this version as a new production database or upgrade the sole live copy without recovery validation.
2. Configure the actual HTTPS domain and `NODE_ENV=production` so session cookies are secure. Set `TRUST_PROXY` to match the real ingress topology. Retain strong, distinct session/file secrets and verify certificate-checked TLS for any remote database connection. Local development settings were not changed.
3. Install with `npm ci`, run the test/check commands, start or restart the application, and refresh the browser to load the new assets. No audit-data rewrite or new application migration is required for this fix.
4. Recheck the deployed database with `npm run db:verify`; test an authorized staging mutation and its audit event, permission denial, filters, export, and rollback behavior on that deployment.
5. Verify email delivery, administrator email enrollment, backups/restoration, HTTPS/proxy behavior, persistent uploads, and operational monitoring in the actual hosting environment. No real user email, production payment mutation, or public deployment was performed during this repair.

The audit screen currently fetches the complete authorized audit history, as before. For large histories, plan server-side filtering/pagination and a bounded export workflow; browser pagination alone does not bound database/API payload size.
