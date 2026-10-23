'use strict';

async function triggerExists(db, name) {
  const [rows] = await db.execute(
    'SELECT 1 FROM information_schema.triggers WHERE trigger_schema = DATABASE() AND trigger_name = ? LIMIT 1',
    [name]
  );
  return rows.length > 0;
}

async function up(db) {
  if (!await triggerExists(db, 'auditlog_block_update')) {
    await db.query("CREATE TRIGGER auditlog_block_update BEFORE UPDATE ON auditLog FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are immutable'");
  }
  if (!await triggerExists(db, 'auditlog_block_delete')) {
    await db.query("CREATE TRIGGER auditlog_block_delete BEFORE DELETE ON auditLog FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are immutable'");
  }
}

module.exports = { up };
