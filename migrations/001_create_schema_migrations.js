'use strict';

// Baseline tables intentionally retain legacy names used by the current API.
// Later migrations add snake_case relational structures alongside them.
async function up(db, h) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY, username VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin UNIQUE,
      password TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin, role VARCHAR(64), name TEXT, email VARCHAR(255),
      block TEXT, lot TEXT, lotArea DECIMAL(10,2), contact TEXT, balance DECIMAL(12,2) DEFAULT 0,
      profile_photo TEXT, permissions LONGTEXT, status VARCHAR(32) DEFAULT 'active', mobile VARCHAR(64),
      homeowner_id VARCHAR(64), reset_token_hash CHAR(64), reset_token_expires_at DATETIME(3),
      terms_accepted_at DATETIME(3), terms_version VARCHAR(32), privacy_acknowledged_at DATETIME(3),
      privacy_version VARCHAR(32), legal_consent_recorded_by VARCHAR(64), archived_at DATETIME(3), archived_by VARCHAR(64)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS homeowners (
      id VARCHAR(64) PRIMARY KEY, name TEXT NOT NULL, block TEXT, lot TEXT, lotArea DECIMAL(10,2) DEFAULT 0,
      contact TEXT, balance DECIMAL(12,2) DEFAULT 0, profile_photo TEXT, created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), archived_at DATETIME(3), archived_by VARCHAR(64)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS billings (
      id VARCHAR(64) PRIMARY KEY, title TEXT, amount DECIMAL(12,2), dueDate TEXT, due_date DATE,
      description TEXT, assignedTo LONGTEXT, status VARCHAR(32), createdAt TEXT,
      created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      monthly_dues_month VARCHAR(7), billing_type VARCHAR(64) DEFAULT 'Other Billing', archived_at DATETIME(3), archived_by VARCHAR(64)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS payment_settings (
      id VARCHAR(64) PRIMARY KEY, payment_method VARCHAR(64), account_name VARCHAR(255), account_number VARCHAR(64),
      qr_code_path TEXT, instructions TEXT, is_active TINYINT(1) DEFAULT 1, updated_by VARCHAR(64), updated_at DATETIME(3)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(64) PRIMARY KEY, homeownerId VARCHAR(64), billingId VARCHAR(64), amount DECIMAL(12,2),
      refNum VARCHAR(191), status VARCHAR(32), receipt LONGTEXT, submittedAt TEXT, remarks TEXT, reviewedAt TEXT,
      payment_method VARCHAR(64) DEFAULT 'GCash', payment_date DATE, verified_by VARCHAR(64), verified_at DATETIME(3),
      rejection_reason TEXT, monthly_dues_month VARCHAR(7), payment_type VARCHAR(32) DEFAULT 'billing',
      payment_source VARCHAR(32) DEFAULT 'resident_submission', recorded_by VARCHAR(64),
      created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      archived_at DATETIME(3), archived_by VARCHAR(64), voided_at DATETIME(3), voided_by VARCHAR(64), void_reason VARCHAR(500)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS announcements (
      id VARCHAR(64) PRIMARY KEY, title TEXT, description LONGTEXT, content LONGTEXT, category TEXT, date TEXT,
      urgent TINYINT(1) DEFAULT 0, is_pinned TINYINT(1) DEFAULT 0, createdBy TEXT, user_id VARCHAR(64),
      image_path TEXT, images LONGTEXT, created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS announcement_reactions (
      announcement_id VARCHAR(64) NOT NULL, user_id VARCHAR(64) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (announcement_id, user_id), INDEX announcement_reaction_user (user_id)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS announcement_comments (
      id VARCHAR(64) PRIMARY KEY, announcement_id VARCHAR(64), user_id VARCHAR(64), parent_id VARCHAR(64),
      reply_to_user_id VARCHAR(64), comment LONGTEXT, created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS complaints (
      id VARCHAR(64) PRIMARY KEY, homeownerId VARCHAR(64), category TEXT, description LONGTEXT, status VARCHAR(32),
      adminResponse LONGTEXT, dateFiled TEXT, updatedAt TEXT, resolvedAt TEXT, otherCategory TEXT, attachment TEXT,
      media_url TEXT, media_type TEXT, attachments TEXT, dateOfOccurrence TEXT, date_filed DATETIME(3),
      occurrence_date DATE, updated_at DATETIME(3), resolved_at DATETIME(3), archived_at DATETIME(3), archived_by VARCHAR(64)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS amenityBookings (
      id VARCHAR(64) PRIMARY KEY, homeownerId VARCHAR(64), amenity TEXT, bookingDate TEXT, startTime TEXT, endTime TEXT,
      purpose TEXT, status VARCHAR(32), adminRemarks TEXT, createdAt TEXT, reviewedAt TEXT, booking_date DATE,
      start_time TIME, end_time TIME, created_at DATETIME(3), reviewed_at DATETIME(3), archived_at DATETIME(3), archived_by VARCHAR(64)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS vehicleRegistrations (
      id VARCHAR(64) PRIMARY KEY, homeownerId VARCHAR(64), ownerName TEXT, block TEXT, lot TEXT, plateNumber VARCHAR(255),
      vehicleType TEXT, registrantType TEXT, fee DECIMAL(12,2), registrationStatus VARCHAR(32), paymentStatus VARCHAR(32),
      stickerNumber VARCHAR(255) UNIQUE, remarks TEXT, createdAt TEXT, updatedAt TEXT, releasedAt TEXT,
      created_at DATETIME(3), updated_at DATETIME(3), released_at DATETIME(3), archived_at DATETIME(3), archived_by VARCHAR(64)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS lostFound (
      id VARCHAR(64) PRIMARY KEY, homeownerId VARCHAR(64), reportType TEXT, itemType TEXT, itemName TEXT,
      description LONGTEXT, location TEXT, eventDate TEXT, contactName TEXT, contactNumber TEXT, image LONGTEXT,
      images LONGTEXT, media_type TEXT, status VARCHAR(32), remarks TEXT, createdAt TEXT, updatedAt TEXT, claimedAt TEXT,
      event_date DATE, created_at DATETIME(3), updated_at DATETIME(3), claimed_at DATETIME(3), archived_at DATETIME(3), archived_by VARCHAR(64)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS auditLog (
      id VARCHAR(64) PRIMARY KEY, action TEXT, adminId VARCHAR(64), timestamp TEXT,
      actor_name VARCHAR(255), actor_role VARCHAR(64), action_type VARCHAR(64), entity_type VARCHAR(64), entity_id VARCHAR(64),
      old_values JSON, new_values JSON, ip_address VARCHAR(64), created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(64) PRIMARY KEY, title TEXT, message LONGTEXT, time TEXT, audience VARCHAR(32) DEFAULT 'all',
      targetIds LONGTEXT, dismissedBy LONGTEXT, created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS appSettings (id VARCHAR(64) PRIMARY KEY, value TEXT) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS board_of_directors (
      id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, position VARCHAR(100) NOT NULL, contact_number VARCHAR(64),
      photo TEXT, term_years VARCHAR(64) DEFAULT '2026 - 2028', display_order INT DEFAULT 0,
      created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB`,
  ];
  for (const sql of statements) await db.query(sql);

  // Upgrade the historical schema explicitly. Each operation is guarded by
  // information_schema instead of relying on duplicate-column errors.
  const columns = {
    users: [
      ['lotArea','DECIMAL(10,2) NULL'], ['profile_photo','TEXT NULL'], ['permissions','LONGTEXT NULL'],
      ['status',"VARCHAR(32) DEFAULT 'active'"], ['mobile','VARCHAR(64) NULL'], ['homeowner_id','VARCHAR(64) NULL'],
      ['reset_token_hash','CHAR(64) NULL'], ['reset_token_expires_at','DATETIME(3) NULL'], ['terms_accepted_at','DATETIME(3) NULL'],
      ['terms_version','VARCHAR(32) NULL'], ['privacy_acknowledged_at','DATETIME(3) NULL'], ['privacy_version','VARCHAR(32) NULL'],
      ['legal_consent_recorded_by','VARCHAR(64) NULL'],
    ],
    billings: [['monthly_dues_month','VARCHAR(7) NULL'], ['billing_type',"VARCHAR(64) DEFAULT 'Other Billing'"]],
    payments: [
      ['payment_method',"VARCHAR(64) DEFAULT 'GCash'"], ['payment_date','TEXT NULL'], ['verified_by','VARCHAR(64) NULL'],
      ['verified_at','TEXT NULL'], ['rejection_reason','TEXT NULL'], ['monthly_dues_month','VARCHAR(7) NULL'],
      ['payment_type',"VARCHAR(32) DEFAULT 'billing'"], ['payment_source',"VARCHAR(32) DEFAULT 'resident_submission'"],
      ['recorded_by','VARCHAR(64) NULL'], ['created_at','TEXT NULL'], ['updated_at','TEXT NULL'],
    ],
    announcements: [['content','LONGTEXT NULL'], ['user_id','VARCHAR(64) NULL'], ['image_path','TEXT NULL'], ['created_at','TEXT NULL'], ['updated_at','TEXT NULL'], ['images','LONGTEXT NULL'], ['is_pinned','TINYINT(1) DEFAULT 0']],
    announcement_comments: [['parent_id','VARCHAR(64) NULL'], ['reply_to_user_id','VARCHAR(64) NULL']],
    complaints: [['otherCategory','TEXT NULL'], ['attachment','TEXT NULL'], ['media_url','TEXT NULL'], ['media_type','TEXT NULL'], ['attachments','TEXT NULL'], ['dateOfOccurrence','TEXT NULL']],
    lostFound: [['homeownerId','VARCHAR(64) NULL'], ['media_type','TEXT NULL'], ['images','LONGTEXT NULL']],
    notifications: [['audience',"VARCHAR(32) DEFAULT 'all'"], ['targetIds','LONGTEXT NULL'], ['dismissedBy','LONGTEXT NULL']],
  };
  for (const [table, definitions] of Object.entries(columns)) {
    for (const [column, definition] of definitions) await h.addColumn(db, table, column, definition);
  }
  await db.query("UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''");
  await db.query("UPDATE users SET permissions = '[\"*\"]' WHERE role = 'admin' AND (permissions IS NULL OR permissions = '' OR permissions = '[]')");
  await db.query("UPDATE users SET permissions = '[\"resident\"]' WHERE role = 'homeowner' AND (permissions IS NULL OR permissions = '' OR permissions = '[]' OR permissions LIKE '%ho-%')");
  await db.query("UPDATE payments SET payment_source = 'resident_submission' WHERE payment_source IS NULL OR payment_source = ''");
  await h.addIndex(db, 'users', 'idx_users_homeowner_id', '`homeowner_id`', { unique: true });
  await h.addIndex(db, 'users', 'idx_users_reset_token_hash', '`reset_token_hash`');
  await h.addIndex(db, 'payments', 'idx_payments_refNum', '`refNum`', { unique: true });
}

module.exports = { up };
