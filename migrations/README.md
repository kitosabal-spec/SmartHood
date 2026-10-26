# SmartHood database migrations

## Amenity booking billing (015)

Migration `015_amenity_booking_billing.js` adds nullable
`billings.amenity_booking_id`, a full unique index, and a foreign key to
`amenityBookings.id` with restricted deletion. Ordinary and existing bills keep
NULL links; no historic bill is guessed to belong to a booking and no billing
is created by the migration. Review any previously billed bookings before using
Create Billing on them to avoid issuing a second, unlinked legacy charge.

Run `npm run db:migrate` before serving the new application, or allow its normal
startup migration runner to apply 015. Back up the database first, following the
production migration runbook below. This change has not been applied to the
configured application database as part of implementation. The migration uses
existence-checked DDL and can resume after a partial install.

The booking row is locked during creation and the unique index is the final
concurrency guard. Bill creation, assignments, notification, and audit commit
together; email remains an existing best-effort post-commit action. Balances use
the existing assignment/payment financial summary. Approval alone reserves the
date, independent of billing or payment. Archived bills retain their link and
remain viewable from the booking; they never enable a replacement charge.

Focused tests: `node --test tests/amenity-billing.test.cjs`. For the optional
isolated MySQL migration/concurrency test, set `TEST_LOCAL_MYSQL=1` and run
`node --test tests/amenity-billing-mysql.test.cjs` (local root with blank password,
matching the other database tests; never uses the application database).

Migrations run in filename order and are recorded in `schema_migrations` with a SHA-256 checksum. An applied migration must never be edited; add a new numbered migration instead. Startup takes a MySQL advisory lock, executes each pending migration once, and stops on the first failure.

MySQL implicitly commits many DDL statements. The runner still wraps each migration in a transaction for its data changes, but operators must take and verify a backup before production DDL. Data validation failures are copied to `migration_issues` using record IDs and non-personal summaries only. No affected row is deleted.

Rollback guidance is in `docs/PRODUCTION_MIGRATION.md`. The legacy camelCase columns and JSON assignment/notification fields are retained as a compatibility layer; do not remove them until the relational backfill and application verification queries pass.

## Administrator email enrollment

Migration 013 adds verification state and a global unique normalized-email index.
It does not change email values, infer ownership, or create accounts. Reconcile
reported duplicate addresses before deployment, and follow
[the pre-deployment enrollment runbook](../docs/ADMINISTRATOR_EMAIL.md) before
switching to the new server. Do not reset the database.

TiDB uses a runner-scoped compatibility definition for 013's `normalized_email`:
`CASE ... END` with a virtual generated column and the same full unique index.
This avoids TiDB's unsupported `NULLIF` and `ALTER TABLE ... ADD ... STORED`
constructs without editing the historical migration or its checksum. Failed
partial installs resume through the existing column/index existence checks.
See [Render/TiDB 013 recovery](../docs/PRODUCTION_MIGRATION.md#rendertidb-failure-at-migration-013-normalized-email-column).
