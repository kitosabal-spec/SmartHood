'use strict';

// DDL is separate from 020 so MySQL's implicit DDL commits cannot split the reset.
async function up(db, h) {
  await h.addColumn(db, 'users', 'historical_homeowner_id', 'VARCHAR(64) NULL');
  await h.addColumn(db, 'billings', 'balance_reset_at', 'DATETIME(3) NULL');
  await db.query(`CREATE TABLE IF NOT EXISTS homeowner_reset_audit (
    entity_type VARCHAR(32) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    previous_values JSON NOT NULL,
    reset_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    reason VARCHAR(255) NOT NULL DEFAULT 'Administrator-requested homeowner account and opening balance reset',
    PRIMARY KEY (entity_type, entity_id)
  ) ENGINE=InnoDB`);
}

module.exports = { up };
