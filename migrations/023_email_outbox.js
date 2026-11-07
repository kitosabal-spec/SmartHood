'use strict';

async function up(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS email_outbox (
    id CHAR(36) PRIMARY KEY,
    payload MEDIUMTEXT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    priority TINYINT UNSIGNED NOT NULL DEFAULT 0,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    lease_token CHAR(36) NULL,
    lease_until DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    finished_at DATETIME(3) NULL,
    UNIQUE INDEX idx_email_outbox_token (lease_token),
    INDEX idx_email_outbox_ready (status, available_at),
    INDEX idx_email_outbox_lease (status, lease_until)
  ) ENGINE=InnoDB`);
}

module.exports = { up };
