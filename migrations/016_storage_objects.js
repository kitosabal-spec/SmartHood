'use strict';

async function up(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS storage_objects (
    object_key VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    provider VARCHAR(16) NOT NULL,
    original_name TEXT NULL,
    mime_type VARCHAR(128) NOT NULL,
    size_bytes BIGINT UNSIGNED NOT NULL,
    legacy_reference VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_storage_legacy_reference (legacy_reference)
  ) ENGINE=InnoDB`);
}

module.exports = { up };
