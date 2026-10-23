'use strict';

async function up(db, h) {
  for (const [column, definition] of [
    ['actor_name','VARCHAR(255) NULL'], ['actor_role','VARCHAR(64) NULL'], ['action_type','VARCHAR(64) NULL'],
    ['entity_type','VARCHAR(64) NULL'], ['entity_id','VARCHAR(64) NULL'], ['old_values','JSON NULL'],
    ['new_values','JSON NULL'], ['ip_address','VARCHAR(64) NULL'], ['created_at','DATETIME(3) NULL'],
  ]) await h.addColumn(db, 'auditLog', column, definition);
  await db.query("UPDATE auditLog SET created_at = STR_TO_DATE(LEFT(timestamp, 23), '%Y-%m-%dT%H:%i:%s.%f') WHERE created_at IS NULL AND timestamp REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'");
  await db.query("UPDATE auditLog SET created_at = CURRENT_TIMESTAMP(3) WHERE created_at IS NULL");
  for (const args of [
    ['auditLog','idx_audit_created','`created_at`'], ['auditLog','idx_audit_actor','`adminId`'],
    ['auditLog','idx_audit_entity','`entity_type`, `entity_id`'], ['auditLog','idx_audit_action','`action_type`'],
  ]) await h.addIndex(db, ...args);

  await db.query(`CREATE TABLE IF NOT EXISTS attachments (
    attachment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entity_type VARCHAR(64) NOT NULL, entity_id VARCHAR(64) NOT NULL, storage_key VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255) NOT NULL, mime_type VARCHAR(191) NOT NULL, file_size BIGINT UNSIGNED NOT NULL,
    uploaded_by VARCHAR(64), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_attachments_entity (entity_type, entity_id), INDEX idx_attachments_uploader (uploaded_by),
    CONSTRAINT fk_attachments_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
  ) ENGINE=InnoDB`);
}

module.exports = { up };
