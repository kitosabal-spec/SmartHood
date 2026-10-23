'use strict';

async function addCheck(db, h, table, name, expression) {
  if (!await h.constraintExists(db, table, name)) {
    await db.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` CHECK (${expression})`);
  }
}

async function up(db, h) {
  await addCheck(db, h, 'billings', 'chk_billings_amount_positive', '`amount` > 0');
  await addCheck(db, h, 'payments', 'chk_payments_amount_positive', '`amount` > 0');
  await addCheck(db, h, 'homeowners', 'chk_homeowners_lot_area', '`lotArea` IS NULL OR `lotArea` >= 0');
  await addCheck(db, h, 'vehicleRegistrations', 'chk_vehicle_fee', '`fee` IS NULL OR `fee` >= 0');
  await addCheck(db, h, 'billings', 'chk_billings_month', "`monthly_dues_month` IS NULL OR `monthly_dues_month` REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'");
  await addCheck(db, h, 'payments', 'chk_payments_month', "`monthly_dues_month` IS NULL OR `monthly_dues_month` REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'");
  await addCheck(db, h, 'amenityBookings', 'chk_booking_time_order', '`start_time` IS NULL OR `end_time` IS NULL OR `start_time` < `end_time`');
  await addCheck(db, h, 'users', 'chk_users_role', "`role` IN ('admin', 'homeowner')");
}

module.exports = { up };
