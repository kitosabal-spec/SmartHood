'use strict';

async function up(db) {
  // One durable mutex also serializes changes to recurring/date closure rules.
  // It must exist even when there are no bookings to lock yet.
  await db.query(`CREATE TABLE IF NOT EXISTS amenity_availability_lock (
    id INT PRIMARY KEY
  ) ENGINE=InnoDB`);
  await db.query('INSERT IGNORE INTO amenity_availability_lock (id) VALUES (1)');
}

module.exports = { up };
