'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { runMigrations, loadMigrations } = require('../src/db/migrationRunner');

function fixture(t, { version = '8.0.11-TiDB-v8.5.0', failure, migration = '010', commitLost = false, alwaysFail = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'san-migration-compat-'));
  t.after(() => {
    for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
    fs.rmdirSync(directory);
  });
  if (migration === '010') {
    fs.copyFileSync(path.resolve(__dirname, '../migrations/010_enforce_audit_immutability.js'), path.join(directory, '010_enforce_audit_immutability.js'));
  } else {
    fs.writeFileSync(path.join(directory, `${migration}_test_backfill.js`), "exports.up = async db => { await db.query('BACKFILL'); };\n");
  }
  const applied = new Map();
  const calls = [];
  let connections = 0;
  let failed = false;
  const pool = {
    async getConnection() {
      const id = ++connections;
      let locked = false;
      const record = sql => calls.push({ id, sql });
      return {
        async query(sql) {
          record(sql);
          if (sql === 'SELECT VERSION() AS version') return [[{ version }]];
          if (sql.includes('GET_LOCK(')) { locked = true; return [[{ acquired: 1 }]]; }
          if (sql.includes('RELEASE_LOCK(')) { assert.ok(locked); locked = false; return [[{ released: 1 }]]; }
          if (sql.startsWith('CREATE TABLE')) return [{}];
          assert.ok(locked, 'migration work must use the lock-owning connection');
          if (sql === 'SELECT version, checksum FROM schema_migrations') return [[...applied].map(([version, checksum]) => ({ version, checksum }))];
          if (sql.includes('FROM deferred_constraints')) return [[]];
          if (sql === 'BACKFILL' || sql.startsWith('CREATE TRIGGER')) {
            if (failure && (!failed || alwaysFail)) { failed = true; throw Object.assign(new Error('injected failure'), { code: failure }); }
            if (sql.startsWith('CREATE TRIGGER') && /tidb/i.test(version)) assert.fail('TiDB must never receive CREATE TRIGGER');
            return [{}];
          }
          assert.fail(`Unexpected SQL: ${sql}`);
        },
        async execute(sql, values) {
          record(sql);
          assert.ok(locked);
          if (sql.includes('information_schema.triggers')) return [[]];
          if (sql.startsWith('INSERT INTO schema_migrations')) { applied.set(values[0], values[2]); return [{}]; }
          assert.fail(`Unexpected SQL: ${sql}`);
        },
        async beginTransaction() { assert.ok(locked); },
        async commit() {
          if (commitLost && !failed) { failed = true; throw Object.assign(new Error('commit acknowledgement lost'), { code: 'PROTOCOL_CONNECTION_LOST' }); }
        },
        async rollback() {},
        release() { record('RELEASE CONNECTION'); },
        destroy() { record('DESTROY CONNECTION'); },
      };
    },
  };
  return { pool, directory, applied, calls, connections: () => connections };
}

test('TiDB applies the explicit audit compatibility path and retains the historical checksum', async t => {
  const f = fixture(t);
  await runMigrations(f.pool, { directory: f.directory });
  await runMigrations(f.pool, { directory: f.directory });
  assert.equal(f.applied.get('010'), loadMigrations(f.directory)[0].checksum);
  assert.equal(f.calls.filter(x => x.sql.startsWith('INSERT INTO schema_migrations')).length, 1);
  assert.ok(!f.calls.some(x => /TRIGGER|information_schema.triggers/.test(x.sql)));
});

test('MySQL and MariaDB still install both immutability triggers', async t => {
  for (const version of ['8.0.36', '10.4.32-MariaDB']) {
    const f = fixture(t, { version });
    await runMigrations(f.pool, { directory: f.directory });
    assert.equal(f.calls.filter(x => x.sql.startsWith('CREATE TRIGGER')).length, 2);
  }
});

test('SQL errors still stop startup and do not mark failed migrations applied', async t => {
  const f = fixture(t, { version: '8.0.36', failure: 'ER_PARSE_ERROR' });
  await assert.rejects(runMigrations(f.pool, { directory: f.directory }), /010_enforce_audit_immutability failed/);
  assert.equal(f.connections(), 1);
  assert.equal(f.applied.size, 0);
});

test('008 reconnects, reacquires its lock, and resumes after connection loss', async t => {
  const f = fixture(t, { migration: '008', failure: 'PROTOCOL_CONNECTION_LOST' });
  await runMigrations(f.pool, { directory: f.directory });
  assert.equal(f.connections(), 2);
  assert.equal(f.applied.size, 1);
  assert.equal(f.calls.filter(x => x.sql === 'DESTROY CONNECTION').length, 1);
  assert.deepEqual(f.calls.filter(x => x.sql.includes('GET_LOCK(')).map(x => x.id), [1, 2]);
});

test('lost commit acknowledgement is resolved by re-reading applied checksums', async t => {
  const f = fixture(t, { migration: '008', commitLost: true });
  await runMigrations(f.pool, { directory: f.directory });
  assert.equal(f.connections(), 2);
  assert.equal(f.calls.filter(x => x.sql === 'BACKFILL').length, 1);
});

test('other data migrations are not automatically replayed after a disconnect', async t => {
  const f = fixture(t, { migration: '011', failure: 'PROTOCOL_CONNECTION_LOST' });
  await assert.rejects(runMigrations(f.pool, { directory: f.directory }), /011_test_backfill failed/);
  assert.equal(f.connections(), 1);
  assert.equal(f.applied.size, 0);
});

test('persistent connection failure stops after three attempts without recording success', async t => {
  const f = fixture(t, { migration: '008', failure: 'PROTOCOL_CONNECTION_LOST', alwaysFail: true });
  await assert.rejects(runMigrations(f.pool, { directory: f.directory }), /008_test_backfill failed/);
  assert.equal(f.connections(), 3);
  assert.equal(f.applied.size, 0);
});

test('already-applied migration checksum mismatches still stop startup on TiDB', async t => {
  const f = fixture(t);
  f.applied.set('010', 'wrong-checksum');
  await assert.rejects(runMigrations(f.pool, { directory: f.directory }), /Applied migration 010 has changed/);
});

test('historical LF and CRLF checksums survive checkout changes without replay or history updates', async t => {
  for (const storedEnding of ['\n', '\r\n']) {
    for (const diskEnding of ['\n', '\r\n']) {
      const f = fixture(t, { migration: '016', version: '8.0.36' });
      const filename = path.join(f.directory, '016_test_backfill.js');
      const source = fs.readFileSync(filename, 'utf8');
      const recorded = crypto.createHash('sha256').update(source.replace(/\n/g, storedEnding)).digest('hex');
      f.applied.set('016', recorded);
      fs.writeFileSync(filename, source.replace(/\n/g, diskEnding));
      await runMigrations(f.pool, { directory: f.directory });
      assert.equal(f.applied.get('016'), recorded);
      assert.ok(!f.calls.some(x => x.sql === 'BACKFILL' || /INSERT|UPDATE|DELETE/.test(x.sql)));
    }
  }
});

test('new CRLF migrations record the LF checksum and run only once across checkout changes', async t => {
  const f = fixture(t, { migration: '016', version: '8.0.36' });
  const filename = path.join(f.directory, '016_test_backfill.js');
  const source = fs.readFileSync(filename, 'utf8');
  const expected = crypto.createHash('sha256').update(source).digest('hex');
  fs.writeFileSync(filename, source.replace(/\n/g, '\r\n'));
  await runMigrations(f.pool, { directory: f.directory });
  assert.equal(f.applied.get('016'), expected);
  fs.writeFileSync(filename, source);
  await runMigrations(f.pool, { directory: f.directory });
  assert.equal(f.calls.filter(x => x.sql === 'BACKFILL').length, 1);
  assert.equal(f.calls.filter(x => x.sql.startsWith('INSERT INTO schema_migrations')).length, 1);
});

test('line-ending compatibility still rejects source edits and releases the migration lock', async t => {
  for (const ending of ['\n', '\r\n']) {
    const f = fixture(t, { migration: '016', version: '8.0.36' });
    const filename = path.join(f.directory, '016_test_backfill.js');
    const source = fs.readFileSync(filename, 'utf8');
    const recorded = crypto.createHash('sha256').update(source.replace(/\n/g, ending)).digest('hex');
    f.applied.set('016', recorded);
    fs.writeFileSync(filename, source.replace('BACKFILL', 'CHANGED_BACKFILL').replace(/\n/g, '\r\n'));
    await assert.rejects(runMigrations(f.pool, { directory: f.directory }), /Applied migration 016 has changed on disk/);
    assert.equal(f.applied.get('016'), recorded);
    assert.ok(f.calls.some(x => x.sql.includes('RELEASE_LOCK(')));
    assert.ok(!f.calls.some(x => x.sql === 'BACKFILL' || x.sql === 'CHANGED_BACKFILL'));
  }
});
