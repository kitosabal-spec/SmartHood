'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { runMigrations } = require('../src/db/migrationRunner');
const { createAmenityBillingService, bookingBillingDetails } = require('../src/services/amenityBillingService');

test('real MySQL: concurrent billing uses current reads and migration enforces uniqueness and referential integrity', {
  skip: process.env.TEST_LOCAL_MYSQL !== '1',
}, async () => {
  // Isolated disposable schema, never the configured application database.
  const config = { host: '127.0.0.1', user: 'root', password: '', connectionLimit: 4 };
  const admin = await mysql.createConnection(config);
  const schema = `san_booking_bill_test_${crypto.randomBytes(8).toString('hex')}`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'san-booking-billing-migration-'));
  let pool, created = false;
  try {
    fs.copyFileSync(path.join(__dirname, '../migrations/015_amenity_booking_billing.js'), path.join(directory, '015_amenity_booking_billing.js'));
    await admin.query(`CREATE DATABASE \`${schema}\``);
    created = true;
    pool = mysql.createPool({ ...config, database: schema });
    await pool.query(`CREATE TABLE amenityBookings (id VARCHAR(64) PRIMARY KEY, homeownerId VARCHAR(64),
      amenity TEXT, bookingDate TEXT, startTime TEXT, endTime TEXT, status TEXT, archived_at DATETIME NULL) ENGINE=InnoDB`);
    await pool.query('CREATE TABLE homeowners (id VARCHAR(64) PRIMARY KEY, name TEXT, archived_at DATETIME NULL) ENGINE=InnoDB');
    await pool.query('CREATE TABLE billings (id VARCHAR(64) PRIMARY KEY, title TEXT, status TEXT, archived_at DATETIME NULL) ENGINE=InnoDB');
    // Also verifies migration startup/restart against pre-existing ordinary bills.
    await pool.query("INSERT INTO billings (id) VALUES ('ordinary-1'), ('ordinary-2')");
    await runMigrations(pool, { directory });
    await runMigrations(pool, { directory });
    await pool.query("INSERT INTO homeowners (id, name) VALUES ('home-1', 'Resident')");
    const booking = { id: 'booking-1', homeownerId: 'home-1', amenity: 'Clubhouse', bookingDate: '2026-11-12', startTime: '09:00', endTime: '11:00', status: 'Approved' };
    await pool.execute('INSERT INTO amenityBookings (id, homeownerId, amenity, bookingDate, startTime, endTime, status) VALUES (?, ?, ?, ?, ?, ?, ?)', Object.values(booking));
    let arrived = 0, ready;
    const barrier = new Promise(resolve => { ready = resolve; });
    async function create() {
      const connection = await pool.getConnection();
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      const service = createAmenityBillingService({
        get: async (sql, values) => (await connection.execute(sql, values))[0][0],
        requireAdmin: async () => ({ role: 'admin' }), eligibleIds: async () => new Set(['home-1']),
        validate: async () => true, notify: async () => {},
        save: async (_table, bill) => {
          bill.id = crypto.randomUUID();
          await connection.execute('INSERT INTO billings (id, amenity_booking_id, title, status) VALUES (?, ?, ?, ?)', [bill.id, bill.amenity_booking_id, bill.title, bill.status]);
        },
      });
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await connection.beginTransaction();
        // Both transactions see no billing before either acquires the row lock.
        await connection.query('SELECT * FROM billings');
        if (++arrived === 2) ready();
        await barrier;
        await service.create({ params: { id: booking.id }, body: { amount: 100, noDueDate: true, bookingVersion: bookingBillingDetails(booking).bookingVersion } }, res);
        if (res.statusCode >= 400) await connection.rollback();
        else await connection.commit();
        return res.statusCode;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    }
    assert.deepEqual((await Promise.all([create(), create()])).sort(), [201, 409]);
    const [linked] = await pool.query('SELECT * FROM billings WHERE amenity_booking_id IS NOT NULL');
    assert.equal(linked.length, 1);
    await pool.execute('UPDATE billings SET archived_at = NOW() WHERE id = ?', [linked[0].id]);
    await assert.rejects(pool.query("INSERT INTO billings (id, amenity_booking_id) VALUES ('duplicate', 'booking-1')"), { code: 'ER_DUP_ENTRY' });
    await assert.rejects(pool.query("INSERT INTO billings (id, amenity_booking_id) VALUES ('orphan', 'missing')"), { code: 'ER_NO_REFERENCED_ROW_2' });
    await assert.rejects(pool.query("DELETE FROM amenityBookings WHERE id = 'booking-1'"), { code: 'ER_ROW_IS_REFERENCED_2' });
  } finally {
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE \`${schema}\``);
    await admin.end();
    for (const file of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, file));
    fs.rmdirSync(directory);
  }
});
