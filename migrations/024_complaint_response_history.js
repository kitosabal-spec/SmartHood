'use strict';

async function up(db, h) {
  await db.query(`CREATE TABLE IF NOT EXISTS complaint_responses (
    id VARCHAR(64) PRIMARY KEY,
    complaint_id VARCHAR(64) NOT NULL,
    message LONGTEXT NOT NULL,
    sender_id VARCHAR(64) NULL,
    sender_name VARCHAR(255) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_complaint_responses_history (complaint_id, created_at, id)
  ) ENGINE=InnoDB`);

  // Preserve every response stored by the legacy one-response design. The
  // deterministic ID makes this backfill safe if a failed migration is retried.
  await db.query(`INSERT IGNORE INTO complaint_responses
      (id, complaint_id, message, sender_id, sender_name, created_at)
    SELECT CONCAT('legacy-', LEFT(SHA2(id, 256), 56)), id, adminResponse, NULL,
           'Administrator', COALESCE(updated_at, date_filed, CURRENT_TIMESTAMP(3))
      FROM complaints
     WHERE adminResponse IS NOT NULL AND TRIM(adminResponse) <> ''`);

  await h.addForeignKey(
    db,
    'complaint_responses',
    'fk_complaint_responses_complaint',
    '`complaint_id`',
    'complaints',
    '`id`',
    'CASCADE'
  );
}

module.exports = { up };
