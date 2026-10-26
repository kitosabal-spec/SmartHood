'use strict';

async function up(db, h) {
  await h.addColumn(db, 'billings', 'amenity_booking_id', 'VARCHAR(64) NULL');
  // NULL permits ordinary bills; archived booking bills retain their link.
  await h.addIndex(db, 'billings', 'uq_billing_amenity_booking', '`amenity_booking_id`', { unique: true });
  await h.addForeignKey(db, 'billings', 'fk_billing_amenity_booking', '`amenity_booking_id`', 'amenityBookings', '`id`');
}

module.exports = { up };
