'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { createAmenityService } = require('../src/services/amenityService');
const { up } = require('../migrations/014_amenity_availability_lock');

// Same opt-in local database convention as the existing migration tests.
// Never uses the application's configured database or credentials.
test('real MySQL: current reads under the mutex prevent conflicting commits across connections', {
  skip: process.env.TEST_LOCAL_MYSQL !== '1',
}, async () => {
  const config = { host: '127.0.0.1', user: 'root', password: '', connectionLimit: 4 };
  const admin = await mysql.createConnection(config);
  const schema = `san_amenity_test_${crypto.randomBytes(8).toString('hex')}`;
  let pool;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE \`${schema}\``);
    created = true;
    pool = mysql.createPool({ ...config, database: schema });
    await pool.query(`CREATE TABLE amenityBookings (
      id VARCHAR(64) PRIMARY KEY, homeownerId TEXT, amenity TEXT, bookingDate TEXT,
      status TEXT, startTime TEXT, endTime TEXT, archived_at DATETIME NULL
    ) ENGINE=InnoDB`);
    await pool.query('CREATE TABLE appSettings (id VARCHAR(64) PRIMARY KEY, value TEXT) ENGINE=InnoDB');
    await up(pool);
    await up(pool); // Safe restart/retry; the singleton is retained.

    const record = (id, status = 'Pending') => ({ id, homeownerId: id, amenity: 'Basketball Court',
      bookingDate: '2026-10-08', status, startTime: '09:00', endTime: '10:00' });
    let arrived = 0;
    let ready;
    const barrier = new Promise(resolve => { ready = resolve; });
    async function write(row, { update = false, synchronize = false, fail = false } = {}) {
      const connection = await pool.getConnection();
      const service = createAmenityService({
        all: async (sql, values) => (await connection.execute(sql, values))[0],
        get: async (sql, values) => (await connection.execute(sql, values))[0][0],
      });
      const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() {} };
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await connection.beginTransaction();
        // Deliberately establish stale snapshots in both transactions before
        // either acquires the lock (the production authorization read can do this).
        await connection.query('SELECT COUNT(*) FROM amenityBookings');
        if (synchronize) { if (++arrived === 2) ready(); await barrier; }
        await service.lock();
        if (!await service.validate(row, response, update ? row.id : '')) {
          await connection.rollback();
          return response.statusCode;
        }
        if (update) await connection.execute('UPDATE amenityBookings SET status = ? WHERE id = ?', [row.status, row.id]);
        else await connection.execute(`INSERT INTO amenityBookings
          (id, homeownerId, amenity, bookingDate, status, startTime, endTime) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.homeownerId, row.amenity, row.bookingDate, row.status, row.startTime, row.endTime]);
        if (fail) throw Error('Simulated audit failure');
        await connection.commit();
        return 200;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
    }
    const results = await Promise.all([write(record('resident-a'), { synchronize: true }), write(record('resident-b'), { synchronize: true })]);
    assert.deepEqual(results.sort(), [200, 409]);
    const [[winner]] = await pool.query('SELECT * FROM amenityBookings');
    assert.equal(await write(record('another', 'Approved')), 409);
    assert.equal(await write({ ...winner, status: 'Approved' }, { update: true }), 200);
    assert.equal(await write(record('another')), 409);
    assert.equal(await write({ ...winner, status: 'Rejected' }, { update: true }), 200);
    await assert.rejects(write(record('rolled-back'), { fail: true }), /Simulated audit failure/);
    assert.equal(await write(record('after-rejection')), 200);
    await pool.query("INSERT INTO appSettings VALUES ('amenityUnavailable', ?)", [JSON.stringify({ weeklyDays: [], dateRules: [{ amenity: 'all', date: '2026-10-08' }] })]);
    assert.equal(await write(record('after-rejection', 'Approved'), { update: true }), 409);
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE \`${schema}\``);
    await admin.end();
  }
});
