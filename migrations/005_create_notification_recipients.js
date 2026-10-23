'use strict';

function parseList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  } catch {
    return String(value).split(',').map(item => item.trim()).filter(Boolean);
  }
}

async function up(db, h) {
  await db.query(`CREATE TABLE IF NOT EXISTS notification_recipients (
    notification_id VARCHAR(64) NOT NULL, user_id VARCHAR(64) NOT NULL,
    read_at DATETIME(3), dismissed_at DATETIME(3), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (notification_id, user_id), INDEX idx_notification_recipient_user (user_id, dismissed_at, read_at),
    CONSTRAINT fk_notification_recipient_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_notification_recipient_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB`);
  const [users] = await db.query("SELECT id, role, homeowner_id FROM users WHERE status NOT IN ('inactive', 'deactivated') OR status IS NULL");
  const byId = new Map(users.map(user => [user.id, user]));
  const byHomeowner = new Map(users.filter(user => user.homeowner_id).map(user => [user.homeowner_id, user]));
  const [notifications] = await db.query('SELECT id, audience, targetIds, dismissedBy FROM notifications');
  const issues = [];
  for (const notification of notifications) {
    const audience = notification.audience || 'all';
    const targets = parseList(notification.targetIds);
    const dismissed = new Set(parseList(notification.dismissedBy));
    let recipients;
    if (audience === 'all') recipients = users;
    else if (audience === 'roles') recipients = users.filter(user => targets.includes(user.role));
    else recipients = targets.map(id => byId.get(id) || byHomeowner.get(id)).filter(Boolean);
    for (const target of targets) {
      if (audience === 'users' && !byId.has(target) && !byHomeowner.has(target)) {
        issues.push({ type: 'missing_notification_recipient', table: 'notifications', recordId: notification.id, details: 'A legacy target does not map to an active user account.' });
      }
    }
    for (const user of new Map(recipients.map(user => [user.id, user])).values()) {
      await db.execute(
        `INSERT INTO notification_recipients (notification_id, user_id, dismissed_at)
         VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE dismissed_at = COALESCE(dismissed_at, VALUES(dismissed_at))`,
        [notification.id, user.id, dismissed.has(user.id) ? new Date() : null]
      );
    }
  }
  if (issues.length) {
    const details = `${issues.length} legacy notification target(s) do not map to an active user account. The notifications and legacy target arrays were preserved.`;
    await db.execute(
      `INSERT INTO migration_issues (migration_version, issue_type, table_name, details)
       SELECT '005', 'missing_notification_recipient', 'notifications', ? FROM DUAL
        WHERE NOT EXISTS (
          SELECT 1 FROM migration_issues
           WHERE migration_version = '005' AND issue_type = 'missing_notification_recipient' AND table_name = 'notifications' AND details = ?
        )`,
      [details, details]
    );
  }
}

module.exports = { up, parseList };
