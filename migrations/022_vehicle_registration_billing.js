'use strict';

async function up(db, h) {
  await h.addColumn(db, 'billings', 'vehicle_registration_id', 'VARCHAR(64) NULL');
  await h.addIndex(db, 'billings', 'uq_billing_vehicle_registration', '`vehicle_registration_id`', { unique: true });
  await h.addForeignKey(db, 'billings', 'fk_billing_vehicle_registration', '`vehicle_registration_id`', 'vehicleRegistrations', '`id`');
}

module.exports = { up };
