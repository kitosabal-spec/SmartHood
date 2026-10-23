# SmartHood database migrations

Migrations run in filename order and are recorded in `schema_migrations` with a SHA-256 checksum. An applied migration must never be edited; add a new numbered migration instead. Startup takes a MySQL advisory lock, executes each pending migration once, and stops on the first failure.

MySQL implicitly commits many DDL statements. The runner still wraps each migration in a transaction for its data changes, but operators must take and verify a backup before production DDL. Data validation failures are copied to `migration_issues` using record IDs and non-personal summaries only. No affected row is deleted.

Rollback guidance is in `docs/PRODUCTION_MIGRATION.md`. The legacy camelCase columns and JSON assignment/notification fields are retained as a compatibility layer; do not remove them until the relational backfill and application verification queries pass.
