'use strict';

async function up(db, h) {
  await h.addColumn(db, 'vehicleRegistrations', 'registrationLocation', 'VARCHAR(255) NULL');
  // Existing records may already share plates. Preserve them and check them
  // at registration time. The unique key arbitrates concurrent new claims.
  await h.addColumn(db, 'vehicleRegistrations', 'activePlateKey', 'VARCHAR(255) NULL');
  await h.addIndex(db, 'vehicleRegistrations', 'uq_vehicle_active_plate', '`activePlateKey`', { unique: true });
}

module.exports = { up };
