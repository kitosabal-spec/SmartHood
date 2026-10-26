'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

class MigrationDataError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'MigrationDataError';
    this.issues = issues;
  }
}

async function tableExists(connection, table) {
  const [rows] = await connection.execute(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
    [table]
  );
  return rows.length > 0;
}

async function columnExists(connection, table, column) {
  const [rows] = await connection.execute(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(connection, table, index) {
  const [rows] = await connection.execute(
    'SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1',
    [table, index]
  );
  return rows.length > 0;
}

async function constraintExists(connection, table, constraint) {
  const [rows] = await connection.execute(
    'SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_name = ? LIMIT 1',
    [table, constraint]
  );
  return rows.length > 0;
}

async function addColumn(connection, table, column, definition) {
  if (!await columnExists(connection, table, column)) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function addAdministratorEmailColumnForTiDB(connection, table, column, definition) {
  // 013 is already applied on MySQL/MariaDB: retain its file and checksum.
  // TiDB disallows NULLIF in generated columns and ADD COLUMN ... STORED.
  // CASE + VIRTUAL preserves NULL/blank handling and indexed uniqueness.
  if (table === 'users' && column === 'normalized_email') {
    const original = "VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin GENERATED ALWAYS AS (NULLIF(LOWER(TRIM(email)), '')) STORED";
    if (definition !== original) throw new Error('Unexpected migration 013 normalized_email definition. Review TiDB compatibility before applying.');
    definition = "VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin GENERATED ALWAYS AS (CASE WHEN LOWER(TRIM(email)) = '' THEN NULL ELSE LOWER(TRIM(email)) END) VIRTUAL";
  }
  return addColumn(connection, table, column, definition);
}

async function addIndex(connection, table, name, columns, { unique = false } = {}) {
  if (!await indexExists(connection, table, name)) {
    // Legacy tables can retain TEXT columns despite CREATE TABLE IF NOT EXISTS.
    // Prefix only ordinary lookup indexes: prefixing UNIQUE indexes would change
    // their constraint semantics. Keep explicit prefixes/expressions untouched.
    if (!unique) {
      const [metadata] = await connection.execute(
        'SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
        [table]
      );
      const textColumns = new Set(metadata
        .filter(row => /^(tiny|medium|long)?(text|blob)$/i.test(row.data_type))
        .map(row => row.column_name.toLowerCase()));
      columns = columns.split(',').map(part => {
        const match = part.trim().match(/^`([A-Za-z0-9_]+)`$/);
        return match && textColumns.has(match[1].toLowerCase()) ? `${part.trim()}(191)` : part.trim();
      }).join(', ');
    }
    await connection.query(`ALTER TABLE \`${table}\` ADD ${unique ? 'UNIQUE ' : ''}INDEX \`${name}\` (${columns})`);
  }
}

async function addForeignKey(connection, table, name, columns, parentTable, parentColumns, onDelete = 'RESTRICT') {
  if (!await constraintExists(connection, table, name)) {
    await connection.query(
      `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (${columns}) REFERENCES \`${parentTable}\` (${parentColumns}) ON DELETE ${onDelete} ON UPDATE CASCADE`
    );
  }
}

function loadMigrations(directory) {
  return fs.readdirSync(directory)
    .filter(name => /^\d{3}_[a-z0-9_]+\.js$/.test(name))
    .sort()
    .map((name) => {
      const filename = path.join(directory, name);
      delete require.cache[require.resolve(filename)];
      const migration = require(filename);
      return {
        ...migration,
        version: name.slice(0, 3),
        name: name.slice(4, -3),
        filename,
        checksum: crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),
      };
    });
}

async function persistIssues(pool, version, issues) {
  for (const issue of issues) {
    await pool.execute(
      `INSERT INTO migration_issues (migration_version, issue_type, table_name, record_id, details)
       VALUES (?, ?, ?, ?, ?)`,
      [version, issue.type || 'invalid_data', issue.table || null, issue.recordId || null, issue.details || null]
    );
  }
}

function safeIdentifier(value) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error('Unsafe identifier in deferred constraint metadata.');
  return `\`${value}\``;
}

async function reconcileDeferredConstraints(pool) {
  const [rows] = await pool.query('SELECT * FROM deferred_constraints ORDER BY constraint_name');
  for (const row of rows) {
    const childTable = safeIdentifier(row.child_table);
    const childColumn = safeIdentifier(row.child_column);
    const parentTable = safeIdentifier(row.parent_table);
    const parentColumn = safeIdentifier(row.parent_column);
    const constraintName = safeIdentifier(row.constraint_name);
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS count FROM ${childTable} c LEFT JOIN ${parentTable} p ON c.${childColumn} = p.${parentColumn}
       WHERE c.${childColumn} IS NOT NULL AND c.${childColumn} <> '' AND p.${parentColumn} IS NULL`
    );
    const orphanCount = Number(countRow.count);
    if (orphanCount > 0) {
      await pool.execute(
        'UPDATE deferred_constraints SET orphan_count = ?, last_checked_at = CURRENT_TIMESTAMP(3) WHERE constraint_name = ?',
        [orphanCount, row.constraint_name]
      );
      console.warn(`[Database Migration] Deferred ${row.constraint_name}: ${orphanCount} orphan row(s) still require reconciliation.`);
      continue;
    }
    await pool.query(
      `ALTER TABLE ${childTable} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${childColumn}) REFERENCES ${parentTable} (${parentColumn}) ON DELETE ${row.on_delete_action} ON UPDATE CASCADE`
    );
    await pool.execute('DELETE FROM deferred_constraints WHERE constraint_name = ?', [row.constraint_name]);
    console.warn(`[Database Migration] Applied previously deferred constraint ${row.constraint_name}.`);
  }
}

async function runMigrationsOnConnection(connection, options = {}) {
  // Advisory locks belong to a session. Keep the lock, DDL, and release on
  // this checked-out connection instead of allowing the pool to switch sessions.
  const pool = connection;
  const directory = options.directory || path.resolve(__dirname, '../../migrations');
  const [[server]] = await connection.query('SELECT VERSION() AS version');
  const isTiDB = /tidb/i.test(server.version);
  if (isTiDB) {
    console.warn('[Database Migration] TiDB does not support audit immutability triggers. Application audit write protections remain enabled; direct SQL UPDATE/DELETE is not protected by triggers.');
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(32) PRIMARY KEY,
    name VARCHAR(191) NOT NULL,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS migration_issues (
    migration_issue_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    migration_version VARCHAR(32) NOT NULL,
    issue_type VARCHAR(64) NOT NULL,
    table_name VARCHAR(64),
    record_id VARCHAR(191),
    details VARCHAR(500),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_migration_issues_version (migration_version, issue_type)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS deferred_constraints (
    constraint_name VARCHAR(64) PRIMARY KEY,
    migration_version VARCHAR(32) NOT NULL,
    child_table VARCHAR(64) NOT NULL,
    child_column VARCHAR(64) NOT NULL,
    parent_table VARCHAR(64) NOT NULL,
    parent_column VARCHAR(64) NOT NULL,
    on_delete_action VARCHAR(16) NOT NULL,
    orphan_count BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_checked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);

  const [[lock]] = await pool.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':smarthood:migrations'), 30) AS acquired");
  if (Number(lock.acquired) !== 1) throw new Error('Could not acquire the database migration lock.');
  try {
    const [appliedRows] = await pool.query('SELECT version, checksum FROM schema_migrations');
    const applied = new Map(appliedRows.map(row => [row.version, row.checksum]));
    for (const migration of loadMigrations(directory)) {
      if (applied.has(migration.version)) {
        if (applied.get(migration.version) !== migration.checksum) {
          throw new Error(`Applied migration ${migration.version} has changed on disk.`);
        }
        continue;
      }
      try {
        await connection.beginTransaction();
        const helpers = { tableExists, columnExists, indexExists, constraintExists, addColumn, addIndex, addForeignKey, MigrationDataError };
        if (isTiDB && migration.version === '013' && migration.name === 'administrator_email_verification') {
          helpers.addColumn = addAdministratorEmailColumnForTiDB;
        }
        // Keep historical migration files/checksums intact. This one migration
        // consists solely of triggers, which TiDB explicitly does not support.
        if (!(isTiDB && migration.version === '010' && migration.name === 'enforce_audit_immutability')) {
          await migration.up(connection, helpers);
        }
        await connection.execute(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)',
          [migration.version, migration.name, migration.checksum]
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback().catch(() => {});
        if (error instanceof MigrationDataError && error.issues.length) {
          await persistIssues(pool, migration.version, error.issues);
        }
        const failure = new Error(`Database migration ${migration.version}_${migration.name} failed: ${error.message}`, { cause: error });
        failure.migrationVersion = migration.version;
        throw failure;
      }
    }
    await reconcileDeferredConstraints(pool);
  } finally {
    await pool.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':smarthood:migrations'))").catch(() => {});
  }
}

async function runMigrations(pool, options = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let connection;
    let retry = false;
    try {
      connection = await pool.getConnection();
      await runMigrationsOnConnection(connection, options);
      return;
    } catch (error) {
      const code = error.cause?.code || error.code;
      const disconnected = ['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT'].includes(code);
      if (disconnected && connection) {
        connection.destroy();
        connection = null;
      }
      // 008 uses guarded backfills and existence-checked DDL, so it can resume
      // after a disconnect. Do not blindly replay other data migrations.
      retry = disconnected && (!error.migrationVersion || error.migrationVersion === '008') && attempt < 3;
      if (!retry) throw error;
      console.warn(`[Database Migration] Connection interrupted; reconnecting and resuming migrations (attempt ${attempt + 1}/3).`);
    } finally {
      connection?.release();
    }
    if (retry) await new Promise(resolve => setTimeout(resolve, attempt * 1000));
  }
}

module.exports = { runMigrations, loadMigrations, MigrationDataError, reconcileDeferredConstraints, addIndex };
