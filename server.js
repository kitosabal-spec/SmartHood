const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'san_alfonso_homes',
  ssl: (process.env.MYSQL_SSL === 'true' || (process.env.MYSQL_HOST && process.env.MYSQL_HOST !== 'localhost'))
    ? { rejectUnauthorized: false }
    : undefined,
};

let db;

app.use(express.json({ limit: '15mb' }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));

const PROFILE_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'profile');
fs.mkdirSync(PROFILE_UPLOAD_DIR, { recursive: true });
const ANNOUNCEMENT_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'announcements');
fs.mkdirSync(ANNOUNCEMENT_UPLOAD_DIR, { recursive: true });
const BOARD_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'board');
fs.mkdirSync(BOARD_UPLOAD_DIR, { recursive: true });
const COMPLAINT_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'complaints');
fs.mkdirSync(COMPLAINT_UPLOAD_DIR, { recursive: true });
const LOSTFOUND_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'lostfound');
fs.mkdirSync(LOSTFOUND_UPLOAD_DIR, { recursive: true });
const RECEIPT_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'receipts');
fs.mkdirSync(RECEIPT_UPLOAD_DIR, { recursive: true });
const QRCODE_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'qrcodes');
fs.mkdirSync(QRCODE_UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

const tableConfig = {
  users: {
    columns: ['id', 'username', 'password', 'role', 'name', 'email', 'block', 'lot', 'lotArea', 'contact', 'balance', 'profile_photo', 'permissions', 'status'],
    jsonColumns: ['permissions'],
    booleanColumns: [],
  },
  billings: {
    columns: ['id', 'title', 'amount', 'dueDate', 'description', 'assignedTo', 'status', 'createdAt'],
    jsonColumns: ['assignedTo'],
    booleanColumns: [],
  },
  payments: {
    columns: ['id', 'homeownerId', 'billingId', 'amount', 'refNum', 'status', 'receipt', 'submittedAt', 'remarks', 'reviewedAt', 'payment_method', 'payment_date', 'verified_by', 'verified_at', 'rejection_reason', 'created_at', 'updated_at'],
    jsonColumns: [],
    booleanColumns: [],
  },
  payment_settings: {
    columns: ['id', 'payment_method', 'account_name', 'account_number', 'qr_code_path', 'instructions', 'is_active', 'updated_by', 'updated_at'],
    jsonColumns: [],
    booleanColumns: ['is_active'],
  },
  announcements: {
    columns: ['id', 'title', 'description', 'content', 'category', 'date', 'urgent', 'createdBy', 'user_id', 'image_path', 'images', 'created_at', 'updated_at'],
    jsonColumns: ['images'],
    booleanColumns: ['urgent'],
  },
  announcement_comments: {
    columns: ['id', 'announcement_id', 'user_id', 'parent_id', 'reply_to_user_id', 'comment', 'created_at', 'updated_at'],
    jsonColumns: [],
    booleanColumns: [],
  },
  complaints: {
    columns: ['id', 'homeownerId', 'category', 'description', 'status', 'adminResponse', 'dateFiled', 'updatedAt', 'resolvedAt', 'otherCategory', 'attachment', 'media_url', 'media_type', 'attachments'],
    jsonColumns: ['attachments'],
    booleanColumns: [],
  },
  amenityBookings: {
    columns: ['id', 'homeownerId', 'amenity', 'bookingDate', 'startTime', 'endTime', 'purpose', 'status', 'adminRemarks', 'createdAt', 'reviewedAt'],
    jsonColumns: [],
    booleanColumns: [],
  },
  vehicleRegistrations: {
    columns: ['id', 'homeownerId', 'ownerName', 'block', 'lot', 'plateNumber', 'vehicleType', 'registrantType', 'fee', 'registrationStatus', 'paymentStatus', 'stickerNumber', 'remarks', 'createdAt', 'updatedAt', 'releasedAt'],
    jsonColumns: [],
    booleanColumns: [],
  },
  lostFound: {
    columns: ['id', 'reportType', 'itemType', 'itemName', 'description', 'location', 'eventDate', 'contactName', 'contactNumber', 'image', 'images', 'media_type', 'status', 'remarks', 'createdAt', 'updatedAt', 'claimedAt'],
    jsonColumns: ['images'],
    booleanColumns: [],
  },
  auditLog: {
    columns: ['id', 'action', 'adminId', 'timestamp'],
    jsonColumns: [],
    booleanColumns: [],
  },
  notifications: {
    columns: ['id', 'title', 'message', 'time', 'audience', 'targetIds', 'dismissedBy'],
    jsonColumns: ['targetIds', 'dismissedBy'],
    booleanColumns: [],
  },
  appSettings: {
    columns: ['id', 'value'],
    jsonColumns: [],
    booleanColumns: [],
  },
  board_of_directors: {
    columns: ['id', 'name', 'position', 'contact_number', 'photo', 'term_years', 'display_order', 'created_at', 'updated_at'],
    jsonColumns: [],
    booleanColumns: [],
  },
};

const adminUser = {
  id: 'u001',
  username: 'admin',
  password: 'admin123',
  role: 'admin',
  name: 'Amy Antipolo',
  email: 'admin@sanalfonsohomes.com',
  block: null,
  lot: null,
  lotArea: null,
  contact: null,
  balance: 0,
  profile_photo: null,
  permissions: ['*'],
  status: 'active',
};



function loadHomeownerSeed() {
  const seedPath = path.join(__dirname, 'data', 'homeowners.seed.json');
  try {
    const raw = fs.readFileSync(seedPath, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Could not load homeowner seed from ${seedPath}. Falling back to demo homeowners.`);
    return [
      { id: 'u002', username: 'juandelacruz', password: 'home123', role: 'homeowner', name: 'Juan Dela Cruz', email: 'juan@email.com', block: 'Block 3', lot: 'Lot 7', lotArea: 0, contact: '09171234567', balance: 3500, profile_photo: null },
      { id: 'u003', username: 'annamaria', password: 'home123', role: 'homeowner', name: 'Anna Maria Reyes', email: 'anna@email.com', block: 'Block 1', lot: 'Lot 2', lotArea: 0, contact: '09281234567', balance: 0, profile_photo: null },
      { id: 'u004', username: 'carlosmagno', password: 'home123', role: 'homeowner', name: 'Carlos Magno', email: 'carlos@email.com', block: 'Block 2', lot: 'Lot 5', lotArea: 0, contact: '09351234567', balance: 7000, profile_photo: null },
      { id: 'u005', username: 'ritaflores', password: 'home123', role: 'homeowner', name: 'Rita Flores', email: 'rita@email.com', block: 'Block 4', lot: 'Lot 1', lotArea: 0, contact: '09461234567', balance: 1500, profile_photo: null },
      { id: 'u006', username: 'pedroparcero', password: 'home123', role: 'homeowner', name: 'Pedro Parcero', email: 'pedro@email.com', block: 'Block 1', lot: 'Lot 8', lotArea: 0, contact: '09571234567', balance: 0, profile_photo: null },
    ];
  }
}

const seed = {
  users: [adminUser, ...loadHomeownerSeed()],
  billings: [],
  payments: [],
  announcements: [],
  announcement_comments: [],
  complaints: [],
  amenityBookings: [],
  vehicleRegistrations: [],
  lostFound: [],
  auditLog: [],
  notifications: [],
  payment_settings: [
    {
      id: 'ps_gcash',
      payment_method: 'gcash',
      account_name: 'San Alfonso Homes HOA',
      account_number: '09171234567',
      qr_code_path: null,
      instructions: '1. Open GCash.\n2. Scan the QR code or enter the GCash mobile number.\n3. Pay the exact amount shown in SmartHood.\n4. Save your GCash receipt or take a screenshot.\n5. Submit the payment reference number and receipt in SmartHood.',
      is_active: 1,
      updated_by: 'u001',
      updated_at: new Date().toISOString(),
    },
  ],
  appSettings: [{ id: 'duesRatePerSqm', value: '5.725' }],
  board_of_directors: [
    {
      id: 'bod-01',
      name: 'Arturo Tuy',
      position: 'President',
      contact_number: '09125225210',
      photo: '/uploads/board/arturo_tuy.jpg',
      term_years: '2026 - 2028',
      display_order: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'bod-02',
      name: 'Mrs. Marian Ciudadano',
      position: 'Vice President',
      contact_number: '09171234567',
      photo: '/uploads/board/marian_ciudadano.jpg',
      term_years: '2026 - 2028',
      display_order: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'bod-03',
      name: 'Mrs. Mary Ann Celis',
      position: 'Secretary',
      contact_number: '09615508124',
      photo: '/uploads/board/mary_ann_celis.jpg',
      term_years: '2026 - 2028',
      display_order: 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'bod-04',
      name: 'Mrs. Claudette Delaon',
      position: 'Treasurer',
      contact_number: '09478534457',
      photo: '/uploads/board/claudette_delaon.jpg',
      term_years: '2026 - 2028',
      display_order: 4,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'bod-05',
      name: 'Mrs. Mitch Aganan',
      position: 'Auditor',
      contact_number: '09618828545',
      photo: '/uploads/board/mitch_aganan.jpg',
      term_years: '2026 - 2028',
      display_order: 5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
};

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function tableName(table) {
  if (!tableConfig[table]) throw new Error(`Unknown table: ${table}`);
  return quoteIdentifier(table);
}

async function ensureDatabase() {
  try {
    const setupPool = mysql.createPool({
      host: DB_CONFIG.host,
      port: DB_CONFIG.port,
      user: DB_CONFIG.user,
      password: DB_CONFIG.password,
      ssl: DB_CONFIG.ssl,
      waitForConnections: true,
      connectionLimit: 2,
    });

    await setupPool.query(
      `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(DB_CONFIG.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await setupPool.end();
  } catch (err) {
    console.warn(`[Database Notice] Could not run CREATE DATABASE (${err.message}). Connecting directly to ${DB_CONFIG.database}...`);
  }

  db = mysql.createPool({
    ...DB_CONFIG,
    waitForConnections: true,
    connectionLimit: 10,
  });
}

async function run(sql, params = []) {
  const [result] = await db.execute(sql, params);
  return result;
}

async function all(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows;
}

async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0];
}

function serializeValue(table, column, value) {
  const config = tableConfig[table];
  if (config.jsonColumns.includes(column)) {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
      } catch {
        return JSON.stringify(value.split(',').map(s => s.trim()).filter(Boolean));
      }
    }
    return JSON.stringify(Array.isArray(value) ? value : (value ? [value] : []));
  }
  if (config.booleanColumns.includes(column)) return value ? 1 : 0;
  return value === undefined ? null : value;
}

function getAssignedHomeownerIds(billing) {
  if (Array.isArray(billing?.assignedTo)) return billing.assignedTo;
  if (!billing?.assignedTo) return [];
  if (typeof billing.assignedTo !== 'string') return [String(billing.assignedTo)];
  try {
    let parsed = JSON.parse(billing.assignedTo);
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { parsed = parsed.split(',').map(id => id.trim()).filter(Boolean); }
    }
    return Array.isArray(parsed) ? parsed : (parsed ? [String(parsed)] : []);
  } catch {
    return billing.assignedTo.split(',').map(id => id.trim()).filter(Boolean);
  }
}

function deserializeRow(table, row) {
  const config = tableConfig[table];
  const output = { ...row };

  for (const column of config.jsonColumns) {
    try {
      let parsed = [];
      if (typeof row[column] === 'string' && row[column].trim()) {
        try {
          parsed = JSON.parse(row[column]);
        } catch {
          parsed = row[column].split(',').map(s => s.trim()).filter(Boolean);
        }
      } else if (Array.isArray(row[column])) {
        parsed = row[column];
      }
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { parsed = parsed.split(',').map(s => s.trim()).filter(Boolean); }
      }
      output[column] = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    } catch {
      output[column] = [];
    }
  }

  for (const column of config.booleanColumns) {
    output[column] = Boolean(row[column]);
  }

  if (table === 'users') {
    delete output.password;
    if (output.role === 'admin') {
      output.permissions = ['*'];
    } else {
      let perms = Array.isArray(output.permissions) ? [...output.permissions] : [];
      // Strip legacy 'ho-*' IDs, wildcard, and admin-only modules
      const hadLegacyHo = perms.some(p => p.startsWith('ho-'));
      perms = perms.filter(p => !p.startsWith('ho-') && p !== '*' && p !== 'users' && p !== 'settings');
      if (output.role === 'homeowner' && (perms.length === 0 || hadLegacyHo) && !perms.includes('resident')) {
        perms.unshift('resident');
      }
      output.permissions = perms;
    }
    output.status = output.status || 'active';
  }

  return output;
}

function sanitizeRecord(table, item) {
  if (table === 'billings') {
    const output = { ...item };
    output.assignedTo = getAssignedHomeownerIds(output);
    return output;
  }
  if (table !== 'users') return item;
  const output = { ...item };
  delete output.password;
  output.status = output.status || 'active';
  return output;
}

function validateTable(req, res) {
  let table = req.params.table;
  if (!tableConfig[table] && tableConfig[table?.replace(/-/g, '_')]) {
    table = table.replace(/-/g, '_');
  }
  if (!tableConfig[table]) {
    res.status(404).json({ error: 'Unknown table.' });
    return null;
  }
  return table;
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function saveRecord(table, item) {
  if (!item.id) {
    const prefix = table === 'users' ? 'u' : (table === 'billings' ? 'b' : (table === 'payments' ? 'p' : 'id'));
    item.id = prefix + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  }

  const columns = tableConfig[table].columns;
  const sqlTable = tableName(table);
  const existing = await get(`SELECT \`id\` FROM ${sqlTable} WHERE \`id\` = ?`, [item.id]);
  const values = columns.map((column) => serializeValue(table, column, item[column]));

  if (existing) {
    const updateColumns = columns.filter((column) => column !== 'id' && item[column] !== undefined);
    if (!updateColumns.length) return;
    const setClause = updateColumns.map((column) => `${quoteIdentifier(column)} = ?`).join(', ');
    const updateValues = updateColumns.map((column) => serializeValue(table, column, item[column]));
    await run(`UPDATE ${sqlTable} SET ${setClause} WHERE \`id\` = ?`, [...updateValues, item.id]);
  } else {
    const placeholders = columns.map(() => '?').join(', ');
    const columnList = columns.map(quoteIdentifier).join(', ');
    await run(`INSERT INTO ${sqlTable} (${columnList}) VALUES (${placeholders})`, values);
  }
}

async function getTableData(table) {
  if (table === 'notifications') {
    const rows = await all('SELECT * FROM notifications ORDER BY id DESC');
    return rows.map((row) => deserializeRow(table, row));
  }
  const rows = await all(`SELECT * FROM ${tableName(table)}`);
  return rows.map((row) => deserializeRow(table, row));
}

async function loadAllData(requester = null) {
  const data = {};
  for (const table of Object.keys(tableConfig)) {
    data[table] = await getTableData(table);
  }
  // Filter table data for non-admins based on permissions
  if (!requester || requester.role !== 'admin') {
    if (!requester || !userHasPermission(requester, 'auditlog')) {
      data.auditLog = [];
    }
    if (requester && (userHasPermission(requester, 'resident') || requester.role === 'homeowner') && !userHasPermission(requester, 'billing')) {
      data.billings = (data.billings || []).filter(b => getAssignedHomeownerIds(b).includes(requester.id));
    } else if (!requester || (!userHasPermission(requester, 'resident') && !userHasPermission(requester, 'billing') && requester.role !== 'homeowner')) {
      data.billings = [];
    }
    if (requester && userHasPermission(requester, 'resident') && !userHasPermission(requester, 'payments')) {
      data.payments = (data.payments || []).filter(p => p.homeownerId === requester.id);
    } else if (!requester || (!userHasPermission(requester, 'resident') && !userHasPermission(requester, 'payments'))) {
      data.payments = [];
    }
    if (!requester || (!userHasPermission(requester, 'resident') && !userHasPermission(requester, 'amenities'))) {
      data.amenityBookings = [];
    }
    if (!requester || (!userHasPermission(requester, 'resident') && !userHasPermission(requester, 'complaints'))) {
      data.complaints = [];
    }
    if (!requester || (!userHasPermission(requester, 'resident') && !userHasPermission(requester, 'vehicles'))) {
      data.vehicleRegistrations = [];
    }
  }
  return data;
}

async function createTables() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin UNIQUE,
    password TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    role VARCHAR(64),
    name TEXT,
    email TEXT,
    block TEXT,
    lot TEXT,
    lotArea DOUBLE,
    contact TEXT,
    balance DOUBLE DEFAULT 0,
    profile_photo TEXT
  )`);
  await run('ALTER TABLE users MODIFY username VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin').catch(() => {});
  await run('ALTER TABLE users MODIFY password TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin').catch(() => {});
  await run('ALTER TABLE users ADD COLUMN lotArea DOUBLE').catch(() => {});
  await run('ALTER TABLE users ADD COLUMN profile_photo TEXT').catch(() => {});
  await run('ALTER TABLE users ADD COLUMN permissions LONGTEXT').catch(() => {});
  await run("ALTER TABLE users ADD COLUMN status VARCHAR(32) DEFAULT 'active'").catch(() => {});
  await run("UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''").catch(() => {});
  await run("UPDATE users SET permissions = '[\"*\"]' WHERE role = 'admin' AND (permissions IS NULL OR permissions = '' OR permissions = '[]')").catch(() => {});
  await run("UPDATE users SET permissions = '[\"resident\"]' WHERE role = 'homeowner' AND (permissions IS NULL OR permissions = '' OR permissions = '[]' OR permissions LIKE '%ho-%')").catch(() => {});
  await run("UPDATE users SET permissions = '[]' WHERE role NOT IN ('admin', 'homeowner') AND (permissions IS NULL OR permissions = '')").catch(() => {});

  await run(`CREATE TABLE IF NOT EXISTS billings (
    id VARCHAR(64) PRIMARY KEY,
    title TEXT,
    amount DOUBLE,
    dueDate TEXT,
    description TEXT,
    assignedTo LONGTEXT,
    status TEXT,
    createdAt TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS payment_settings (
    id VARCHAR(64) PRIMARY KEY,
    payment_method VARCHAR(64),
    account_name VARCHAR(255),
    account_number VARCHAR(64),
    qr_code_path TEXT,
    instructions TEXT,
    is_active TINYINT(1) DEFAULT 1,
    updated_by VARCHAR(64),
    updated_at TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(64) PRIMARY KEY,
    homeownerId TEXT,
    billingId TEXT,
    amount DOUBLE,
    refNum VARCHAR(191),
    status TEXT,
    receipt LONGTEXT,
    submittedAt TEXT,
    remarks TEXT,
    reviewedAt TEXT,
    payment_method VARCHAR(64) DEFAULT 'GCash',
    payment_date TEXT,
    verified_by VARCHAR(64),
    verified_at TEXT,
    rejection_reason TEXT,
    created_at TEXT,
    updated_at TEXT
  )`);
  await run('ALTER TABLE payments MODIFY refNum VARCHAR(191)').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN payment_method VARCHAR(64) DEFAULT "GCash"').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN payment_date TEXT').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN verified_by VARCHAR(64)').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN verified_at TEXT').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN rejection_reason TEXT').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN created_at TEXT').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN updated_at TEXT').catch(() => {});
  await run('ALTER TABLE payments ADD UNIQUE INDEX idx_payments_refNum (refNum)').catch(() => {});

  await run(`CREATE TABLE IF NOT EXISTS announcements (
    id VARCHAR(64) PRIMARY KEY,
    title TEXT,
    description LONGTEXT,
    content LONGTEXT,
    category TEXT,
    date TEXT,
    urgent TINYINT(1) DEFAULT 0,
    createdBy TEXT,
    user_id TEXT,
    image_path TEXT,
    created_at TEXT,
    updated_at TEXT
  )`);
  await run('ALTER TABLE announcements ADD COLUMN content LONGTEXT').catch(() => {});
  await run('ALTER TABLE announcements ADD COLUMN user_id TEXT').catch(() => {});
  await run('ALTER TABLE announcements ADD COLUMN image_path TEXT').catch(() => {});
  await run('ALTER TABLE announcements ADD COLUMN created_at TEXT').catch(() => {});
  await run('ALTER TABLE announcements ADD COLUMN updated_at TEXT').catch(() => {});
  await run('ALTER TABLE announcements ADD COLUMN images LONGTEXT').catch(() => {});

  await run(`CREATE TABLE IF NOT EXISTS announcement_comments (
    id VARCHAR(64) PRIMARY KEY,
    announcement_id VARCHAR(64),
    user_id VARCHAR(64),
    parent_id VARCHAR(64) DEFAULT NULL,
    reply_to_user_id VARCHAR(64) DEFAULT NULL,
    comment LONGTEXT,
    created_at TEXT,
    updated_at TEXT
  )`);
  await run('ALTER TABLE announcement_comments ADD COLUMN parent_id VARCHAR(64) DEFAULT NULL').catch(() => {});
  await run('ALTER TABLE announcement_comments ADD COLUMN reply_to_user_id VARCHAR(64) DEFAULT NULL').catch(() => {});

  await run(`CREATE TABLE IF NOT EXISTS complaints (
    id VARCHAR(64) PRIMARY KEY,
    homeownerId TEXT,
    category TEXT,
    description LONGTEXT,
    status TEXT,
    adminResponse LONGTEXT,
    dateFiled TEXT,
    updatedAt TEXT,
    resolvedAt TEXT
  )`);
  await run('ALTER TABLE complaints ADD COLUMN otherCategory TEXT').catch(() => {});
  await run('ALTER TABLE complaints ADD COLUMN attachment TEXT').catch(() => {});
  await run('ALTER TABLE complaints ADD COLUMN media_url TEXT').catch(() => {});
  await run('ALTER TABLE complaints ADD COLUMN media_type TEXT').catch(() => {});
  await run('ALTER TABLE complaints ADD COLUMN attachments TEXT').catch(() => {});

  await run(`CREATE TABLE IF NOT EXISTS amenityBookings (
    id VARCHAR(64) PRIMARY KEY,
    homeownerId TEXT,
    amenity TEXT,
    bookingDate TEXT,
    startTime TEXT,
    endTime TEXT,
    purpose TEXT,
    status TEXT,
    adminRemarks TEXT,
    createdAt TEXT,
    reviewedAt TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS vehicleRegistrations (
    id VARCHAR(64) PRIMARY KEY,
    homeownerId TEXT,
    ownerName TEXT,
    block TEXT,
    lot TEXT,
    plateNumber VARCHAR(255),
    vehicleType TEXT,
    registrantType TEXT,
    fee DOUBLE,
    registrationStatus TEXT,
    paymentStatus TEXT,
    stickerNumber VARCHAR(255) UNIQUE,
    remarks TEXT,
    createdAt TEXT,
    updatedAt TEXT,
    releasedAt TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS lostFound (
    id VARCHAR(64) PRIMARY KEY,
    reportType TEXT,
    itemType TEXT,
    itemName TEXT,
    description LONGTEXT,
    location TEXT,
    eventDate TEXT,
    contactName TEXT,
    contactNumber TEXT,
    image LONGTEXT,
    status TEXT,
    remarks TEXT,
    createdAt TEXT,
    updatedAt TEXT,
    claimedAt TEXT
  )`);
  await run('ALTER TABLE lostFound ADD COLUMN media_type TEXT').catch(() => {});
  await run('ALTER TABLE lostFound ADD COLUMN images LONGTEXT').catch(() => {});

  await run(`CREATE TABLE IF NOT EXISTS auditLog (
    id VARCHAR(64) PRIMARY KEY,
    action TEXT,
    adminId TEXT,
    timestamp TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    title TEXT,
    message LONGTEXT,
    time TEXT,
    audience VARCHAR(255) DEFAULT 'all',
    targetIds LONGTEXT,
    dismissedBy LONGTEXT
  )`);
  await run(`ALTER TABLE notifications ADD COLUMN audience VARCHAR(255) DEFAULT 'all'`).catch(() => {});
  await run(`ALTER TABLE notifications ADD COLUMN targetIds LONGTEXT`).catch(() => {});
  await run(`ALTER TABLE notifications ADD COLUMN dismissedBy LONGTEXT`).catch(() => {});

  await run(`CREATE TABLE IF NOT EXISTS appSettings (
    id VARCHAR(64) PRIMARY KEY,
    value TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS board_of_directors (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    position VARCHAR(100) NOT NULL,
    contact_number VARCHAR(64),
    photo TEXT,
    term_years VARCHAR(64) DEFAULT '2026 - 2028',
    display_order INT DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  )`);
}

async function seedIfEmpty() {
  const row = await get('SELECT COUNT(*) AS count FROM users');
  if (Number(row.count) === 0) {
    for (const [table, records] of Object.entries(seed)) {
      for (const record of records) {
        await saveRecord(table, record);
      }
    }
  }

  const bodRow = await get('SELECT COUNT(*) AS count FROM board_of_directors').catch(() => ({ count: 0 }));
  if (Number(bodRow.count) === 0 && Array.isArray(seed.board_of_directors)) {
    for (const record of seed.board_of_directors) {
      await saveRecord('board_of_directors', record);
    }
  }

  const psRow = await get('SELECT COUNT(*) AS count FROM payment_settings').catch(() => ({ count: 0 }));
  if (Number(psRow.count) === 0 && Array.isArray(seed.payment_settings)) {
    for (const record of seed.payment_settings) {
      await saveRecord('payment_settings', record);
    }
  }
}

async function ensureAdminUser() {
  const existing = await get('SELECT id, permissions, status FROM users WHERE username = ?', [adminUser.username]);
  if (!existing) {
    await saveRecord('users', adminUser);
  } else {
    if (!existing.permissions || !existing.status) {
      await saveRecord('users', {
        id: existing.id,
        permissions: existing.permissions ? JSON.parse(existing.permissions) : adminUser.permissions,
        status: existing.status || 'active',
      });
    }
  }

  // Ensure all existing homeowners have at least the 'resident' permission and no legacy 'ho-*' permission strings in DB
  await run(
    'UPDATE users SET permissions = ? WHERE role = ? AND (permissions IS NULL OR permissions = "" OR permissions = "[]" OR permissions LIKE "%ho-%")',
    [JSON.stringify(['resident']), 'homeowner']
  ).catch(() => {});
}

async function resetDatabase() {
  for (const table of Object.keys(tableConfig)) {
    await run(`DELETE FROM ${tableName(table)}`);
  }

  for (const [table, records] of Object.entries(seed)) {
    for (const record of records) {
      await saveRecord(table, record);
    }
  }
}

const ALLOWED_PHOTO_MIMES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const ALLOWED_PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const profileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PROFILE_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = ALLOWED_PHOTO_MIMES[file.mimetype] || '.jpg';
      const unique = `${Date.now().toString(36)}${crypto.randomBytes(12).toString('hex')}${ext}`;
      cb(null, unique);
    },
  }),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_PHOTO_MIMES[file.mimetype] || !ALLOWED_PHOTO_EXTS.has(ext)) {
      cb(new Error('Only JPG, PNG, or WebP images are allowed.'));
      return;
    }
    cb(null, true);
  },
});

function isValidImageBuffer(buffer) {
  if (!buffer || buffer.length < 12) return false;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return true;
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return true;
  return false;
}

const MAX_PAYMENT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const receiptUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, RECEIPT_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const origExt = path.extname(file.originalname || '').toLowerCase();
      const ext = ALLOWED_PHOTO_MIMES[file.mimetype] || (ALLOWED_PHOTO_EXTS.has(origExt) ? origExt : '.jpg');
      const cleanExt = ext === '.jpeg' ? '.jpg' : ext;
      const unique = `receipt-${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${cleanExt}`;
      cb(null, unique);
    },
  }),
  limits: { fileSize: MAX_PAYMENT_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_PHOTO_MIMES[file.mimetype] || !ALLOWED_PHOTO_EXTS.has(ext)) {
      cb(new Error('Only JPG, JPEG, PNG, or WebP receipt images are allowed.'));
      return;
    }
    cb(null, true);
  },
});

const qrUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, QRCODE_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const origExt = path.extname(file.originalname || '').toLowerCase();
      const ext = ALLOWED_PHOTO_MIMES[file.mimetype] || (ALLOWED_PHOTO_EXTS.has(origExt) ? origExt : '.jpg');
      const cleanExt = ext === '.jpeg' ? '.jpg' : ext;
      const unique = `qr-${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${cleanExt}`;
      cb(null, unique);
    },
  }),
  limits: { fileSize: MAX_PAYMENT_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_PHOTO_MIMES[file.mimetype] || !ALLOWED_PHOTO_EXTS.has(ext)) {
      cb(new Error('Only JPG, JPEG, PNG, or WebP images are allowed.'));
      return;
    }
    cb(null, true);
  },
});

function getRequestUserId(req) {
  return req.get('x-user-id') || req.body.userId || req.query.userId || null;
}

const ALLOWED_ANNOUNCEMENT_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_ANNOUNCEMENT_VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm']);
const ALLOWED_ANNOUNCEMENT_MEDIA_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm']);
const MAX_ANNOUNCEMENT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ANNOUNCEMENT_VIDEO_BYTES = 30 * 1024 * 1024;

function getAnnouncementMediaExt(file) {
  const origExt = path.extname(file.originalname || '').toLowerCase();
  if (ALLOWED_ANNOUNCEMENT_MEDIA_EXTS.has(origExt)) {
    return origExt === '.jpeg' ? '.jpg' : origExt;
  }
  if (file.mimetype === 'video/mp4') return '.mp4';
  if (file.mimetype === 'video/quicktime') return '.mov';
  if (file.mimetype === 'video/webm') return '.webm';
  if (ALLOWED_PHOTO_MIMES[file.mimetype]) return ALLOWED_PHOTO_MIMES[file.mimetype];
  return '.bin';
}

function isValidVideoBuffer(buffer, ext) {
  if (!buffer || buffer.length < 8) return false;
  // MP4/MOV: usually has 'ftyp' at offset 4
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') return true;
  // WebM: EBML header 0x1A 0x45 0xDF 0xA3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return true;
  // QuickTime / MP4 common atoms or container signature
  if (['.mp4', '.mov', '.webm'].includes(ext)) {
    const headerStr = buffer.slice(0, 32).toString('ascii');
    if (headerStr.includes('moov') || headerStr.includes('mdat') || headerStr.includes('wide') || headerStr.includes('skip') || headerStr.includes('pnot') || headerStr.includes('ftyp')) return true;
    return true;
  }
  return false;
}

function isValidAnnouncementMediaBuffer(buffer, ext) {
  if (ALLOWED_ANNOUNCEMENT_IMAGE_EXTS.has(ext)) {
    return isValidImageBuffer(buffer);
  }
  if (ALLOWED_ANNOUNCEMENT_VIDEO_EXTS.has(ext)) {
    return isValidVideoBuffer(buffer, ext);
  }
  return false;
}

const announcementUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ANNOUNCEMENT_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = getAnnouncementMediaExt(file);
      const unique = `announcement-${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, unique);
    },
  }),
  limits: { fileSize: MAX_ANNOUNCEMENT_VIDEO_BYTES, files: 10 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isVideoMime = file.mimetype && (file.mimetype.startsWith('video/') || file.mimetype === 'video/quicktime');
    const isImageMime = file.mimetype && file.mimetype.startsWith('image/');
    if (!ALLOWED_ANNOUNCEMENT_MEDIA_EXTS.has(ext) && !isVideoMime && !isImageMime) {
      cb(new Error('Unsupported file format. Allowed formats: JPG, PNG, WebP (Images) and MP4, MOV, WebM (Videos).'));
      return;
    }
    cb(null, true);
  },
});

const announcementUploadMiddleware = announcementUpload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'image', maxCount: 1 },
  { name: 'videos', maxCount: 10 },
  { name: 'video', maxCount: 1 },
  { name: 'media', maxCount: 10 },
]);

const boardUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, BOARD_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = ALLOWED_PHOTO_MIMES[file.mimetype] || '.jpg';
      const unique = `bod-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      cb(null, unique);
    },
  }),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_PHOTO_MIMES[file.mimetype] || !ALLOWED_PHOTO_EXTS.has(ext)) {
      cb(new Error('Only JPG, PNG, or WebP images are allowed.'));
      return;
    }
    cb(null, true);
  },
});

const ALLOWED_COMPLAINT_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_COMPLAINT_VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm']);
const ALLOWED_COMPLAINT_MEDIA_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm']);
const MAX_COMPLAINT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_COMPLAINT_VIDEO_BYTES = 30 * 1024 * 1024;

const complaintUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, COMPLAINT_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
      const unique = `complaint-${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, unique);
    },
  }),
  limits: { fileSize: MAX_COMPLAINT_VIDEO_BYTES, files: 15 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_COMPLAINT_MEDIA_EXTS.has(ext)) {
      cb(new Error('Unsupported file format. Allowed formats: JPG, JPEG, PNG, WEBP (Images) and MP4, MOV, WEBM (Videos).'));
      return;
    }
    cb(null, true);
  },
});

const lostFoundUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, LOSTFOUND_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
      const unique = `lf-${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, unique);
    },
  }),
  limits: { fileSize: MAX_COMPLAINT_VIDEO_BYTES, files: 10 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_COMPLAINT_MEDIA_EXTS.has(ext)) {
      cb(new Error('Unsupported file format. Allowed formats: JPG, JPEG, PNG, WEBP (Images) and MP4, MOV, WEBM (Videos).'));
      return;
    }
    cb(null, true);
  },
});

async function getRequester(req) {
  const userId = getRequestUserId(req);
  if (!userId) return null;
  const row = await get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!row) return null;
  return deserializeRow('users', row);
}

async function requireAuth(req, res) {
  const requester = await getRequester(req);
  if (!requester) {
    res.status(401).json({ error: 'Login required.' });
    return null;
  }
  return requester;
}


function userHasPermission(user, moduleKey) {
  if (!user) return false;
  if (user.status === 'inactive' || user.status === 'deactivated') return false;
  if (user.role === 'admin') return true; // Administrator always has full unrestricted access

  // Administrator-only modules can NEVER be assigned to or accessed by normal residents
  if (moduleKey === 'users' || moduleKey === 'settings') return false;

  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  if (perms.includes('*') && user.role === 'admin') return true;
  return perms.includes(moduleKey);
}

const TABLE_PERMISSIONS = {
  billings: 'billing',
  payments: 'payments',
  payment_settings: 'payments',
  amenityBookings: 'amenities',
  vehicleRegistrations: 'vehicles',
  lostFound: 'lostfound',
  complaints: 'complaints',
  announcements: 'announcements',
  auditLog: 'auditlog',
  users: 'users',
  appSettings: 'settings',
  board_of_directors: 'board',
};

async function checkTableAccess(req, res, table, action = 'read') {
  if (table === 'notifications' || table === 'announcement_comments') return true;

  const requester = await getRequester(req);
  if (!requester) {
    if (action === 'read' && (table === 'announcements' || table === 'lostFound' || table === 'board_of_directors')) return true;
    if (action === 'create' && table === 'lostFound') return true;
    res.status(401).json({ error: 'Login required.' });
    return null;
  }

  if (requester.status === 'inactive' || requester.status === 'deactivated') {
    res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
    return null;
  }

  // Administrator has 100% full access to all tables and actions
  if (requester.role === 'admin') return requester;

  // 1. Accounts & Roles (users table): Strictly Administrator-only
  if (table === 'users') {
    if (action === 'update' && req.params.id === requester.id) {
      return requester; // User updating their own profile
    }
    res.status(403).json({ error: 'Access Denied: Only administrators can access Accounts & Roles.' });
    return null;
  }

  // 2. Settings (appSettings table): Strictly Administrator-only
  if (table === 'appSettings') {
    res.status(403).json({ error: 'Access Denied: Only administrators can access system settings.' });
    return null;
  }

  // 2b. Payment Settings (payment_settings table): Read by all authenticated users; manage by admin/payments
  if (table === 'payment_settings') {
    if (action === 'read') return requester;
    if (userHasPermission(requester, 'payments')) return requester;
    res.status(403).json({ error: 'Access Denied: You do not have permission to manage payment settings.' });
    return null;
  }

  // 3. Audit Logs (auditLog table): Requires auditlog permission
  if (table === 'auditLog') {
    if (userHasPermission(requester, 'auditlog')) return requester;
    res.status(403).json({ error: 'Access Denied: You do not have permission to access Audit Logs.' });
    return null;
  }

  // 4. Billings: Read is accessible for dues view if user has resident or billing permission; manage requires billing permission
  if (table === 'billings') {
    if (action === 'read' && (userHasPermission(requester, 'resident') || userHasPermission(requester, 'billing'))) return requester;
    if (userHasPermission(requester, 'billing')) return requester;
    res.status(403).json({ error: 'Access Denied: You do not have permission to manage billing.' });
    return null;
  }

  // 5. Payments: Read and self-submission require resident permission; managing approvals requires payments permission
  if (table === 'payments') {
    if (action === 'read' && (userHasPermission(requester, 'resident') || userHasPermission(requester, 'payments'))) return requester;
    if (action === 'create' && userHasPermission(requester, 'resident')) return requester; // Homeowner submitting payment receipt
    if (userHasPermission(requester, 'payments')) return requester;
    res.status(403).json({ error: 'Access Denied: You do not have permission to manage payments.' });
    return null;
  }

  // 6. Complaints: Read and filing require resident permission; resolution/response requires complaints permission
  if (table === 'complaints') {
    if (action === 'read' && (userHasPermission(requester, 'resident') || userHasPermission(requester, 'complaints'))) return requester;
    if (action === 'create' && userHasPermission(requester, 'resident')) return requester; // Homeowner filing a complaint
    if (userHasPermission(requester, 'complaints')) return requester;
    res.status(403).json({ error: 'Access Denied: You do not have permission to manage complaints.' });
    return null;
  }

  // 7. Vehicle Registrations: Read and applying require resident permission; approving requires vehicles permission
  if (table === 'vehicleRegistrations') {
    if (action === 'read' && (userHasPermission(requester, 'resident') || userHasPermission(requester, 'vehicles'))) return requester;
    if (action === 'create' && userHasPermission(requester, 'resident')) return requester; // Homeowner submitting vehicle registration
    if (userHasPermission(requester, 'vehicles')) return requester;
    res.status(403).json({ error: 'Access Denied: You do not have permission to manage vehicle registrations.' });
    return null;
  }

  // 8. Amenity Bookings: Read and booking require resident permission; approving requires amenities permission
  if (table === 'amenityBookings') {
    if (action === 'read' && (userHasPermission(requester, 'resident') || userHasPermission(requester, 'amenities'))) return requester;
    if (action === 'create' && userHasPermission(requester, 'resident')) return requester; // Homeowner requesting booking
    if (userHasPermission(requester, 'amenities')) return requester;
    res.status(403).json({ error: 'Access Denied: You do not have permission to manage amenity bookings.' });
    return null;
  }

  // 9. Lost & Found: Read and posting are accessible; managing/deleting requires lostfound permission
  if (table === 'lostFound') {
    if (action === 'read') return requester;
    if (action === 'create') return requester;
    if (userHasPermission(requester, 'lostfound')) return requester;
    res.status(403).json({ error: 'Access Denied: You do not have permission to manage lost & found items.' });
    return null;
  }

  // 10. Announcements: Read is accessible; managing requires announcements permission
  if (table === 'announcements') {
    if (action === 'read') return requester;
    if (userHasPermission(requester, 'announcements')) return requester;
    res.status(403).json({ error: 'Access Denied: You do not have permission to manage announcements.' });
    return null;
  }

  // 11. Board of Directors: Read is accessible; managing requires admin role
  if (table === 'board_of_directors') {
    if (action === 'read') return requester;
    if (requester.role === 'admin') return requester;
    res.status(403).json({ error: 'Access Denied: Only administrators can manage Board of Directors.' });
    return null;
  }

  // General fallback
  const requiredPerm = TABLE_PERMISSIONS[table];
  if (requiredPerm && userHasPermission(requester, requiredPerm)) return requester;

  res.status(403).json({ error: `Access Denied: You do not have permission to ${action} ${table}.` });
  return null;
}

async function requireAdmin(req, res) {
  const requester = await getRequester(req);
  if (!requester) {
    res.status(401).json({ error: 'Login required.' });
    return null;
  }
  if (requester.role !== 'admin') {
    res.status(403).json({ error: 'Only administrators can perform this action.' });
    return null;
  }
  return requester;
}

async function requirePermission(req, res, permissionKey) {
  const requester = await getRequester(req);
  if (!requester) {
    res.status(401).json({ error: 'Login required.' });
    return null;
  }
  if (requester.status === 'inactive' || requester.status === 'deactivated') {
    res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
    return null;
  }
  if (requester.role === 'admin' || userHasPermission(requester, permissionKey)) {
    return requester;
  }
  res.status(403).json({ error: `Access Denied: You do not have permission to perform this action.` });
  return null;
}


function requireOwnPhotoAccess(req, res) {
  const requesterId = getRequestUserId(req);
  if (!requesterId) {
    res.status(401).json({ error: 'Login required.' });
    return null;
  }
  if (requesterId !== req.params.id) {
    res.status(403).json({ error: 'You can only change your own profile photo.' });
    return null;
  }
  return requesterId;
}

function photoRecordToUrl(value) {
  if (!value) return null;
  return `/uploads/profile/${path.basename(value)}`;
}

function deleteProfileFile(photoPath) {
  if (!photoPath) return;
  const filePath = path.join(PROFILE_UPLOAD_DIR, path.basename(photoPath));
  if (!filePath.startsWith(PROFILE_UPLOAD_DIR)) return;
  fs.promises.unlink(filePath).catch(() => {});
}

function stripProfilePhotoField(table, body) {
  if (table !== 'users' || !body) return body;
  if (Array.isArray(body)) {
    return body.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const copy = { ...item };
      delete copy.profile_photo;
      return copy;
    });
  }
  if (typeof body === 'object') {
    const copy = { ...body };
    delete copy.profile_photo;
    return copy;
  }
  return body;
}

app.post('/api/users/:id/photo', (req, res) => {
  if (!requireOwnPhotoAccess(req, res)) return;
  profileUpload.single('photo')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const message = uploadErr.code === 'LIMIT_FILE_SIZE'
        ? 'Photo must be 5 MB or smaller.'
        : (uploadErr.message || 'Invalid photo upload.');
      res.status(400).json({ error: message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No photo file received.' });
      return;
    }
    try {
      const buffer = await fs.promises.readFile(req.file.path);
      if (!isValidImageBuffer(buffer)) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        res.status(400).json({ error: 'Uploaded file is not a valid JPG, PNG, or WebP image.' });
        return;
      }
      const target = await get('SELECT id, profile_photo FROM users WHERE id = ?', [req.params.id]);
      if (!target) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      const photoPath = photoRecordToUrl(req.file.filename);
      await run('UPDATE users SET profile_photo = ? WHERE id = ?', [photoPath, req.params.id]);
      deleteProfileFile(target.profile_photo);
      res.json({ ok: true, profile_photo: photoPath });
    } catch (err) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      console.error(err);
      res.status(500).json({ error: 'Could not save the profile photo.' });
    }
  });
});

app.delete('/api/users/:id/photo', asyncHandler(async (req, res) => {
  if (!requireOwnPhotoAccess(req, res)) return;
  const target = await get('SELECT id, profile_photo FROM users WHERE id = ?', [req.params.id]);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  await run('UPDATE users SET profile_photo = NULL WHERE id = ?', [req.params.id]);
  deleteProfileFile(target.profile_photo);
  res.json({ ok: true, profile_photo: null });
}));


// ── ANNOUNCEMENTS & COMMENTS SECURE APIS ──

app.post('/api/announcements', (req, res) => {
  requirePermission(req, res, 'announcements').then(author => {
    if (!author) return;

    announcementUploadMiddleware(req, res, async (uploadErr) => {
      if (uploadErr) {
        const msg = uploadErr.code === 'LIMIT_FILE_SIZE'
          ? 'A file exceeds the maximum allowed size (5 MB for photos, 30 MB for videos).'
          : (uploadErr.message || 'Invalid media upload.');
        return res.status(400).json({ error: msg });
      }

      const uploadedFiles = [
        ...((req.files && req.files.images) || []),
        ...((req.files && req.files.image) || []),
        ...((req.files && req.files.videos) || []),
        ...((req.files && req.files.video) || []),
        ...((req.files && req.files.media) || []),
      ];

      try {
        const title = (req.body.title || '').trim();
        const contentText = (req.body.content || req.body.description || '').trim();
        if (!title || !contentText) {
          for (const f of uploadedFiles) await fs.promises.unlink(f.path).catch(() => {});
          return res.status(400).json({ error: 'Title and content are required.' });
        }

        const oversized = [];
        for (const f of uploadedFiles) {
          const ext = path.extname(f.originalname || '').toLowerCase();
          const isVideo = ALLOWED_ANNOUNCEMENT_VIDEO_EXTS.has(ext) || (f.mimetype && f.mimetype.startsWith('video/'));
          if (!isVideo && f.size > MAX_ANNOUNCEMENT_IMAGE_BYTES) {
            oversized.push(`Image "${f.originalname}" exceeds the 5 MB limit.`);
          }
          if (isVideo && f.size > MAX_ANNOUNCEMENT_VIDEO_BYTES) {
            oversized.push(`Video "${f.originalname}" exceeds the 30 MB limit.`);
          }
        }
        if (oversized.length > 0) {
          for (const f of uploadedFiles) await fs.promises.unlink(f.path).catch(() => {});
          return res.status(400).json({ error: oversized.join(' ') });
        }

        const mediaPaths = [];
        for (const f of uploadedFiles) {
          const ext = path.extname(f.filename || f.originalname || '').toLowerCase();
          const buffer = await fs.promises.readFile(f.path);
          if (!isValidAnnouncementMediaBuffer(buffer, ext)) {
            for (const uf of uploadedFiles) await fs.promises.unlink(uf.path).catch(() => {});
            return res.status(400).json({ error: `Uploaded file "${f.originalname}" is not a valid JPG, PNG, WebP image or MP4, MOV, WebM video.` });
          }
          mediaPaths.push(`/uploads/announcements/${f.filename}`);
        }

        const primaryMedia = mediaPaths[0] || null;
        const mediaJson = JSON.stringify(mediaPaths);

        const id = req.body.id || ('a' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'));
        const nowIso = new Date().toISOString();
        const dateStr = req.body.date || nowIso.split('T')[0];
        const urgent = req.body.urgent === 'true' || req.body.urgent === true ? 1 : 0;
        const category = req.body.category || 'General';
        const createdBy = author ? author.id : 'u001';

        await run(
          `INSERT INTO announcements (id, title, description, content, category, date, urgent, createdBy, user_id, image_path, images, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, title, contentText, contentText, category, dateStr, urgent, createdBy, createdBy, primaryMedia, mediaJson, nowIso, nowIso]
        );

        const created = await get('SELECT * FROM announcements WHERE id = ?', [id]);
        res.status(201).json(deserializeRow('announcements', created));
      } catch (err) {
        for (const f of uploadedFiles) await fs.promises.unlink(f.path).catch(() => {});
        console.error(err);
        res.status(500).json({ error: 'Could not create announcement.' });
      }
    });
  }).catch(err => {
    console.error(err);
    res.status(500).json({ error: 'Server error checking authorization.' });
  });
});

app.put('/api/announcements/:id', (req, res) => {
  requirePermission(req, res, 'announcements').then(author => {
    if (!author) return;

    announcementUploadMiddleware(req, res, async (uploadErr) => {
      if (uploadErr) {
        const msg = uploadErr.code === 'LIMIT_FILE_SIZE'
          ? 'A file exceeds the maximum allowed size (5 MB for photos, 30 MB for videos).'
          : (uploadErr.message || 'Invalid media upload.');
        return res.status(400).json({ error: msg });
      }

      const uploadedFiles = [
        ...((req.files && req.files.images) || []),
        ...((req.files && req.files.image) || []),
        ...((req.files && req.files.videos) || []),
        ...((req.files && req.files.video) || []),
        ...((req.files && req.files.media) || []),
      ];

      try {
        const existing = await get('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
        if (!existing) {
          for (const f of uploadedFiles) await fs.promises.unlink(f.path).catch(() => {});
          return res.status(404).json({ error: 'Announcement not found.' });
        }

        const title = req.body.title !== undefined ? String(req.body.title).trim() : existing.title;
        const contentText = req.body.content !== undefined
          ? String(req.body.content).trim()
          : (req.body.description !== undefined ? String(req.body.description).trim() : (existing.content || existing.description));

        if (!title || !contentText) {
          for (const f of uploadedFiles) await fs.promises.unlink(f.path).catch(() => {});
          return res.status(400).json({ error: 'Title and content are required.' });
        }

        const oversized = [];
        for (const f of uploadedFiles) {
          const ext = path.extname(f.originalname || '').toLowerCase();
          const isVideo = ALLOWED_ANNOUNCEMENT_VIDEO_EXTS.has(ext) || (f.mimetype && f.mimetype.startsWith('video/'));
          if (!isVideo && f.size > MAX_ANNOUNCEMENT_IMAGE_BYTES) {
            oversized.push(`Image "${f.originalname}" exceeds the 5 MB limit.`);
          }
          if (isVideo && f.size > MAX_ANNOUNCEMENT_VIDEO_BYTES) {
            oversized.push(`Video "${f.originalname}" exceeds the 30 MB limit.`);
          }
        }
        if (oversized.length > 0) {
          for (const f of uploadedFiles) await fs.promises.unlink(f.path).catch(() => {});
          return res.status(400).json({ error: oversized.join(' ') });
        }

        // Determine existing media to keep
        let currentImages = [];
        if (existing.images) {
          try {
            const parsed = typeof existing.images === 'string' ? JSON.parse(existing.images) : existing.images;
            if (Array.isArray(parsed)) currentImages = parsed;
          } catch { currentImages = []; }
        } else if (existing.image_path) {
          currentImages = [existing.image_path];
        }

        if (req.body.remove_image === 'true' || req.body.remove_all_images === 'true') {
          for (const imgPath of currentImages) {
            if (imgPath && imgPath.startsWith('/uploads/announcements/')) {
              const oldFile = path.join(__dirname, 'public', imgPath);
              fs.promises.unlink(oldFile).catch(() => {});
            }
          }
          currentImages = [];
        } else if (req.body.existing_images !== undefined) {
          let keptImages = [];
          try {
            keptImages = typeof req.body.existing_images === 'string' ? JSON.parse(req.body.existing_images) : req.body.existing_images;
            if (!Array.isArray(keptImages)) keptImages = [];
          } catch { keptImages = currentImages; }

          for (const oldImg of currentImages) {
            if (!keptImages.includes(oldImg) && oldImg && oldImg.startsWith('/uploads/announcements/')) {
              const oldFile = path.join(__dirname, 'public', oldImg);
              fs.promises.unlink(oldFile).catch(() => {});
            }
          }
          currentImages = keptImages;
        }

        // Process newly uploaded media files
        for (const f of uploadedFiles) {
          const ext = path.extname(f.filename || f.originalname || '').toLowerCase();
          const buffer = await fs.promises.readFile(f.path);
          if (!isValidAnnouncementMediaBuffer(buffer, ext)) {
            for (const uf of uploadedFiles) await fs.promises.unlink(uf.path).catch(() => {});
            return res.status(400).json({ error: `Uploaded file "${f.originalname}" is not a valid JPG, PNG, WebP image or MP4, MOV, WebM video.` });
          }
          currentImages.push(`/uploads/announcements/${f.filename}`);
        }

        const primaryMedia = currentImages[0] || null;
        const mediaJson = JSON.stringify(currentImages);

        const category = req.body.category || existing.category;
        const dateStr = req.body.date || existing.date;
        const urgent = req.body.urgent !== undefined ? (req.body.urgent === 'true' || req.body.urgent === true ? 1 : 0) : existing.urgent;
        const nowIso = new Date().toISOString();

        await run(
          `UPDATE announcements SET title = ?, description = ?, content = ?, category = ?, date = ?, urgent = ?, image_path = ?, images = ?, updated_at = ? WHERE id = ?`,
          [title, contentText, contentText, category, dateStr, urgent, primaryMedia, mediaJson, nowIso, req.params.id]
        );

        const updated = await get('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
        res.json(deserializeRow('announcements', updated));
      } catch (err) {
        for (const f of uploadedFiles) await fs.promises.unlink(f.path).catch(() => {});
        console.error(err);
        res.status(500).json({ error: 'Could not update announcement.' });
      }
    });
  }).catch(err => {
    console.error(err);
    res.status(500).json({ error: 'Server error checking authorization.' });
  });
});

app.delete('/api/announcements/:id', asyncHandler(async (req, res) => {
  const requester = await getRequester(req);
  if (!requester || !userHasPermission(requester, 'announcements')) {
    return res.status(403).json({ error: 'Access Denied: You do not have permission to delete announcements.' });
  }

  const existing = await get('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'Announcement not found.' });
  }

  let allImages = [];
  if (existing.images) {
    try {
      const parsed = typeof existing.images === 'string' ? JSON.parse(existing.images) : existing.images;
      if (Array.isArray(parsed)) allImages = parsed;
    } catch {}
  }
  if (existing.image_path && !allImages.includes(existing.image_path)) {
    allImages.push(existing.image_path);
  }

  for (const imgPath of allImages) {
    if (imgPath && imgPath.startsWith('/uploads/announcements/')) {
      const oldFile = path.join(__dirname, 'public', imgPath);
      fs.promises.unlink(oldFile).catch(() => {});
    }
  }

  await run('DELETE FROM announcement_comments WHERE announcement_id = ?', [req.params.id]);
  await run('DELETE FROM announcements WHERE id = ?', [req.params.id]);

  res.json({ ok: true });
}));

app.get('/api/announcements/:id/comments', asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT c.*, 
            u.name AS author_name, u.role AS author_role, u.profile_photo AS author_photo,
            ru.name AS reply_to_name
     FROM announcement_comments c
     LEFT JOIN users u ON c.user_id = u.id
     LEFT JOIN users ru ON c.reply_to_user_id = ru.id
     WHERE c.announcement_id = ?
     ORDER BY c.created_at ASC`,
    [req.params.id]
  );
  res.json(rows);
}));

app.post('/api/announcements/:id/comments', asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const announcement = await get('SELECT id, title, createdBy, user_id FROM announcements WHERE id = ?', [req.params.id]);
  if (!announcement) {
    return res.status(404).json({ error: 'Announcement not found.' });
  }

  const commentText = (req.body.comment || '').trim();
  if (!commentText) {
    return res.status(400).json({ error: 'Comment cannot be empty.' });
  }
  if (commentText.length > 3000) {
    return res.status(400).json({ error: 'Comment is too long (max 3000 characters).' });
  }

  let parentId = (req.body.parent_id || req.body.parentId || null);
  let replyToUserId = (req.body.reply_to_user_id || req.body.replyToUserId || null);

  if (parentId) {
    const parentComment = await get(
      'SELECT id, parent_id, user_id FROM announcement_comments WHERE id = ? AND announcement_id = ?',
      [parentId, req.params.id]
    );
    if (!parentComment) {
      return res.status(400).json({ error: 'Parent comment not found.' });
    }
    // Flattening (Facebook 1-level threading model):
    // If the parent comment is itself a reply, attach to its root parent comment
    if (parentComment.parent_id) {
      parentId = parentComment.parent_id;
    }
    if (!replyToUserId && parentComment.user_id) {
      replyToUserId = parentComment.user_id;
    }
  }

  const id = 'cm' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  const nowIso = new Date().toISOString();

  await run(
    `INSERT INTO announcement_comments (id, announcement_id, user_id, parent_id, reply_to_user_id, comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.params.id, user.id, parentId, replyToUserId, commentText, nowIso, nowIso]
  );

  const created = await get(
    `SELECT c.*, 
            u.name AS author_name, u.role AS author_role, u.profile_photo AS author_photo,
            ru.name AS reply_to_name
     FROM announcement_comments c
     LEFT JOIN users u ON c.user_id = u.id
     LEFT JOIN users ru ON c.reply_to_user_id = ru.id
     WHERE c.id = ?`,
    [id]
  );

  // Trigger notifications (Replies, Post Author & Mentions)
  try {
    const annTitle = announcement.title || 'Announcement';
    const previewText = commentText.length > 80 ? (commentText.slice(0, 77) + '...') : commentText;
    const commenterName = user.name || 'A resident';
    const notificationsToSend = new Map(); // targetUserId -> { title, message }

    // 1. Mentions Parsing: match @Name
    const mentionRegex = /@([A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+){0,2})/g;
    const mentionedNames = new Set();
    let mMatch;
    while ((mMatch = mentionRegex.exec(commentText)) !== null) {
      if (mMatch[1]) {
        mentionedNames.add(mMatch[1].trim().toLowerCase());
      }
    }

    if (mentionedNames.size > 0) {
      const allUsers = await all('SELECT id, name, username FROM users');
      for (const u of allUsers) {
        const uNameLower = (u.name || '').trim().toLowerCase();
        const uUsernameLower = (u.username || '').trim().toLowerCase();
        if (mentionedNames.has(uNameLower) || mentionedNames.has(uUsernameLower)) {
          notificationsToSend.set(u.id, {
            title: 'Mentioned in Announcement Comment',
            message: `${commenterName} mentioned you in a comment on "${annTitle}": "${previewText}"`,
          });
        }
      }
    }

    // 2. Comment Reply Notification
    if (parentId) {
      const targetRepliedUserId = replyToUserId;
      if (targetRepliedUserId) {
        if (!notificationsToSend.has(targetRepliedUserId)) {
          notificationsToSend.set(targetRepliedUserId, {
            title: 'New Reply to Your Comment',
            message: `${commenterName} replied to your comment on "${annTitle}": "${previewText}"`,
          });
        }
      }
    }

    // 3. Post Author (Admin) Notification
    const postAuthorId = announcement.user_id || announcement.createdBy || null;
    if (postAuthorId && postAuthorId !== user.id) {
      if (!notificationsToSend.has(postAuthorId)) {
        notificationsToSend.set(postAuthorId, {
          title: 'New Comment on Your Announcement',
          message: `${commenterName} commented on your announcement "${annTitle}": "${previewText}"`,
        });
      }
    } else if (!postAuthorId && user.role !== 'admin') {
      await createServerNotification(
        'New Comment on Announcement',
        `${commenterName} commented on "${annTitle}": "${previewText}"`,
        { roles: ['admin'] }
      );
    }

    // Dispatch queued notifications
    for (const [targetUserId, notif] of notificationsToSend.entries()) {
      await createServerNotification(notif.title, notif.message, { userIds: [targetUserId] });
    }
  } catch (notifErr) {
    console.error('Error sending announcement comment notifications:', notifErr);
  }

  res.status(201).json(created);
}));

app.put('/api/announcements/:announcementId/comments/:commentId', asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const existing = await get('SELECT * FROM announcement_comments WHERE id = ? AND announcement_id = ?', [
    req.params.commentId,
    req.params.announcementId,
  ]);
  if (!existing) {
    return res.status(404).json({ error: 'Comment not found.' });
  }

  if (existing.user_id !== user.id) {
    return res.status(403).json({ error: 'You can only edit your own comments.' });
  }

  const commentText = (req.body.comment || '').trim();
  if (!commentText) {
    return res.status(400).json({ error: 'Comment cannot be empty.' });
  }
  if (commentText.length > 3000) {
    return res.status(400).json({ error: 'Comment is too long (max 3000 characters).' });
  }

  const nowIso = new Date().toISOString();
  await run(
    'UPDATE announcement_comments SET comment = ?, updated_at = ? WHERE id = ?',
    [commentText, nowIso, req.params.commentId]
  );

  const updated = await get(
    `SELECT c.*, 
            u.name AS author_name, u.role AS author_role, u.profile_photo AS author_photo,
            ru.name AS reply_to_name
     FROM announcement_comments c
     LEFT JOIN users u ON c.user_id = u.id
     LEFT JOIN users ru ON c.reply_to_user_id = ru.id
     WHERE c.id = ?`,
    [req.params.commentId]
  );
  res.json(updated);
}));

app.delete('/api/announcements/:announcementId/comments/:commentId', asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const existing = await get('SELECT * FROM announcement_comments WHERE id = ? AND announcement_id = ?', [
    req.params.commentId,
    req.params.announcementId,
  ]);
  if (!existing) {
    return res.status(404).json({ error: 'Comment not found.' });
  }

  if (existing.user_id !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: 'You do not have permission to delete this comment.' });
  }

  // Delete comment and any nested replies if it is a parent comment
  await run('DELETE FROM announcement_comments WHERE id = ? OR parent_id = ?', [req.params.commentId, req.params.commentId]);
  res.json({ ok: true });
}));

// ── BOARD OF DIRECTORS SECURE APIS ──

app.get('/api/board', asyncHandler(async (req, res) => {
  const rows = await all('SELECT * FROM board_of_directors ORDER BY display_order ASC, created_at ASC');
  res.json(rows.map(r => deserializeRow('board_of_directors', r)));
}));

app.post('/api/board', (req, res) => {
  requirePermission(req, res, 'board').then(author => {
    if (!author) return;

    boardUpload.single('photo')(req, res, async (uploadErr) => {
      if (uploadErr) {
        const msg = uploadErr.code === 'LIMIT_FILE_SIZE'
          ? 'Photo must be 5 MB or smaller.'
          : (uploadErr.message || 'Invalid photo upload.');
        return res.status(400).json({ error: msg });
      }

      try {
        const name = (req.body.name || '').trim();
        const position = (req.body.position || '').trim();
        const contactNumber = (req.body.contact_number || '').trim();
        const termYears = (req.body.term_years || '2026 - 2028').trim();
        const displayOrder = parseInt(req.body.display_order, 10) || 0;

        if (!name || !position) {
          if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
          return res.status(400).json({ error: 'Name and position are required.' });
        }

        let photoPath = null;
        if (req.file) {
          const buffer = await fs.promises.readFile(req.file.path);
          if (!isValidImageBuffer(buffer)) {
            await fs.promises.unlink(req.file.path).catch(() => {});
            return res.status(400).json({ error: 'Uploaded file is not a valid JPG, PNG, or WebP image.' });
          }
          photoPath = `/uploads/board/${req.file.filename}`;
        } else if (req.body.photo) {
          photoPath = req.body.photo.trim();
        }

        const id = req.body.id || ('bod-' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'));
        const nowIso = new Date().toISOString();

        await run(
          `INSERT INTO board_of_directors (id, name, position, contact_number, photo, term_years, display_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, name, position, contactNumber, photoPath, termYears, displayOrder, nowIso, nowIso]
        );

        const created = await get('SELECT * FROM board_of_directors WHERE id = ?', [id]);
        res.status(201).json(deserializeRow('board_of_directors', created));
      } catch (err) {
        if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
        console.error(err);
        res.status(500).json({ error: 'Could not create board member.' });
      }
    });
  }).catch(err => {
    console.error(err);
    res.status(500).json({ error: 'Server error checking authorization.' });
  });
});

app.put('/api/board/:id', (req, res) => {
  requirePermission(req, res, 'board').then(author => {
    if (!author) return;

    boardUpload.single('photo')(req, res, async (uploadErr) => {
      if (uploadErr) {
        const msg = uploadErr.code === 'LIMIT_FILE_SIZE'
          ? 'Photo must be 5 MB or smaller.'
          : (uploadErr.message || 'Invalid photo upload.');
        return res.status(400).json({ error: msg });
      }

      try {
        const existing = await get('SELECT * FROM board_of_directors WHERE id = ?', [req.params.id]);
        if (!existing) {
          if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
          return res.status(404).json({ error: 'Board member not found.' });
        }

        const name = req.body.name !== undefined ? req.body.name.trim() : existing.name;
        const position = req.body.position !== undefined ? req.body.position.trim() : existing.position;
        const contactNumber = req.body.contact_number !== undefined ? req.body.contact_number.trim() : existing.contact_number;
        const termYears = req.body.term_years !== undefined ? req.body.term_years.trim() : existing.term_years;
        const displayOrder = req.body.display_order !== undefined ? (parseInt(req.body.display_order, 10) || 0) : existing.display_order;

        if (!name || !position) {
          if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
          return res.status(400).json({ error: 'Name and position cannot be empty.' });
        }

        let photoPath = existing.photo;
        if (req.file) {
          const buffer = await fs.promises.readFile(req.file.path);
          if (!isValidImageBuffer(buffer)) {
            await fs.promises.unlink(req.file.path).catch(() => {});
            return res.status(400).json({ error: 'Uploaded file is not a valid JPG, PNG, or WebP image.' });
          }
          photoPath = `/uploads/board/${req.file.filename}`;

          // Unlink old photo if custom uploaded
          if (existing.photo && existing.photo.startsWith('/uploads/board/') && !existing.photo.includes('arturo_tuy') && !existing.photo.includes('marian_ciudadano') && !existing.photo.includes('mary_ann_celis') && !existing.photo.includes('claudette_delaon') && !existing.photo.includes('mitch_aganan')) {
            const oldFile = path.join(__dirname, 'public', existing.photo);
            fs.promises.unlink(oldFile).catch(() => {});
          }
        } else if (req.body.remove_photo === 'true') {
          if (existing.photo && existing.photo.startsWith('/uploads/board/') && !existing.photo.includes('arturo_tuy') && !existing.photo.includes('marian_ciudadano') && !existing.photo.includes('mary_ann_celis') && !existing.photo.includes('claudette_delaon') && !existing.photo.includes('mitch_aganan')) {
            const oldFile = path.join(__dirname, 'public', existing.photo);
            fs.promises.unlink(oldFile).catch(() => {});
          }
          photoPath = null;
        }

        const nowIso = new Date().toISOString();

        await run(
          `UPDATE board_of_directors SET name = ?, position = ?, contact_number = ?, photo = ?, term_years = ?, display_order = ?, updated_at = ? WHERE id = ?`,
          [name, position, contactNumber, photoPath, termYears, displayOrder, nowIso, req.params.id]
        );

        const updated = await get('SELECT * FROM board_of_directors WHERE id = ?', [req.params.id]);
        res.json(deserializeRow('board_of_directors', updated));
      } catch (err) {
        if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
        console.error(err);
        res.status(500).json({ error: 'Could not update board member.' });
      }
    });
  }).catch(err => {
    console.error(err);
    res.status(500).json({ error: 'Server error checking authorization.' });
  });
});

app.delete('/api/board/:id', asyncHandler(async (req, res) => {
  const author = await requirePermission(req, res, 'board');
  if (!author) return;

  const existing = await get('SELECT * FROM board_of_directors WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'Board member not found.' });
  }

  if (existing.photo && existing.photo.startsWith('/uploads/board/') && !existing.photo.includes('arturo_tuy') && !existing.photo.includes('marian_ciudadano') && !existing.photo.includes('mary_ann_celis') && !existing.photo.includes('claudette_delaon') && !existing.photo.includes('mitch_aganan')) {
    const oldFile = path.join(__dirname, 'public', existing.photo);
    fs.promises.unlink(oldFile).catch(() => {});
  }

  await run('DELETE FROM board_of_directors WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

app.get('/api/health', asyncHandler(async (req, res) => {
  const row = await get('SELECT COUNT(*) AS users FROM users');
  res.json({
    ok: true,
    database: DB_CONFIG.database,
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    users: Number(row.users),
  });
}));

app.get('/api/data', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const requester = await getRequester(req);
  res.json(await loadAllData(requester));
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }
  const user = await get(
    'SELECT * FROM users WHERE (BINARY username = ? OR BINARY email = ? OR (block IS NOT NULL AND lot IS NOT NULL AND (BINARY CONCAT(block, " ", lot) = ? OR BINARY CONCAT(block, ", ", lot) = ?))) AND BINARY password = ?',
    [username, username, username, username, password]
  );
  const matchesIdentifier = Boolean(
    user && (
      user.username === username ||
      user.email === username ||
      (user.block && user.lot && (
        `${user.block} ${user.lot}` === username ||
        `${user.block}, ${user.lot}` === username
      ))
    )
  );
  if (!user || !matchesIdentifier || user.password !== password) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }
  if (user.status === 'inactive' || user.status === 'deactivated') {
    res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
    return;
  }
  res.json(deserializeRow('users', user));
}));

// ── PAYMENT SETTINGS APIS ──

app.get('/api/payment-settings', asyncHandler(async (req, res) => {
  const requester = await requireAuth(req, res);
  if (!requester) return;

  let setting = await get('SELECT * FROM payment_settings WHERE payment_method = "gcash" LIMIT 1');
  if (!setting) {
    setting = {
      id: 'ps_gcash',
      payment_method: 'gcash',
      account_name: 'San Alfonso Homes HOA',
      account_number: '09171234567',
      qr_code_path: null,
      instructions: '1. Open GCash.\n2. Scan the QR code or enter the GCash mobile number.\n3. Pay the exact amount shown in SmartHood.\n4. Save your GCash receipt or take a screenshot.\n5. Submit the payment reference number and receipt in SmartHood.',
      is_active: 1,
      updated_by: 'u001',
      updated_at: new Date().toISOString(),
    };
    await saveRecord('payment_settings', setting);
  }
  res.json(deserializeRow('payment_settings', setting));
}));

app.put('/api/payment-settings', asyncHandler(async (req, res) => {
  const requester = await requirePermission(req, res, 'payments');
  if (!requester) return;

  let existing = await get('SELECT * FROM payment_settings WHERE payment_method = "gcash" LIMIT 1');
  const body = req.body || {};
  const updated = {
    id: existing ? existing.id : 'ps_gcash',
    payment_method: 'gcash',
    account_name: body.account_name !== undefined ? String(body.account_name).trim() : (existing?.account_name || 'San Alfonso Homes HOA'),
    account_number: body.account_number !== undefined ? String(body.account_number).trim() : (existing?.account_number || '09171234567'),
    qr_code_path: existing ? existing.qr_code_path : null,
    instructions: body.instructions !== undefined ? String(body.instructions).trim() : (existing?.instructions || ''),
    is_active: body.is_active !== undefined ? (body.is_active ? 1 : 0) : (existing ? existing.is_active : 1),
    updated_by: requester.id,
    updated_at: new Date().toISOString(),
  };

  await saveRecord('payment_settings', updated);

  // Detailed audit logging based on changes
  if (existing) {
    if (existing.account_name !== updated.account_name) {
      await recordAuditLog(`Admin changed GCash account name to "${updated.account_name}"`, requester.id);
    }
    if (existing.account_number !== updated.account_number) {
      await recordAuditLog(`Admin changed GCash number to "${updated.account_number}"`, requester.id);
    }
    if (Boolean(existing.is_active) !== Boolean(updated.is_active)) {
      await recordAuditLog(`Admin ${updated.is_active ? 'enabled' : 'disabled'} GCash payment method`, requester.id);
    }
    if (existing.instructions !== updated.instructions) {
      await recordAuditLog('Admin changed payment settings instructions', requester.id);
    }
  } else {
    await recordAuditLog('Admin configured GCash payment settings', requester.id);
  }

  res.json(deserializeRow('payment_settings', updated));
}));

app.post('/api/payment-settings/upload-qr', (req, res) => {
  qrUpload.single('qr')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const message = uploadErr.code === 'LIMIT_FILE_SIZE'
        ? 'QR code image exceeds the 10 MB size limit.'
        : (uploadErr.message || 'Invalid QR code upload.');
      return res.status(400).json({ error: message });
    }

    try {
      const requester = await requirePermission(req, res, 'payments');
      if (!requester) {
        if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
        return;
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No QR code image received.' });
      }

      const buffer = await fs.promises.readFile(req.file.path);
      if (!isValidImageBuffer(buffer)) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ error: 'Uploaded file is not a valid JPG, JPEG, PNG, or WebP image.' });
      }

      const existing = await get('SELECT * FROM payment_settings WHERE payment_method = "gcash" LIMIT 1');
      if (existing && existing.qr_code_path) {
        const oldFile = path.join(__dirname, 'public', existing.qr_code_path.replace(/^\//, ''));
        fs.promises.unlink(oldFile).catch(() => {});
      }

      const qrPath = `/uploads/qrcodes/${req.file.filename}`;
      const record = {
        id: existing ? existing.id : 'ps_gcash',
        payment_method: 'gcash',
        account_name: existing?.account_name || 'San Alfonso Homes HOA',
        account_number: existing?.account_number || '09171234567',
        qr_code_path: qrPath,
        instructions: existing?.instructions || '',
        is_active: existing ? existing.is_active : 1,
        updated_by: requester.id,
        updated_at: new Date().toISOString(),
      };
      await saveRecord('payment_settings', record);
      await recordAuditLog('Admin uploaded/replaced QR code', requester.id);

      res.json({ ok: true, qr_code_path: qrPath, message: 'GCash QR code updated successfully.' });
    } catch (err) {
      if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
      console.error(err);
      res.status(500).json({ error: 'Could not upload QR code image.' });
    }
  });
});

app.delete('/api/payment-settings/qr', asyncHandler(async (req, res) => {
  const requester = await requirePermission(req, res, 'payments');
  if (!requester) return;

  const existing = await get('SELECT * FROM payment_settings WHERE payment_method = "gcash" LIMIT 1');
  if (existing && existing.qr_code_path) {
    const oldFile = path.join(__dirname, 'public', existing.qr_code_path.replace(/^\//, ''));
    fs.promises.unlink(oldFile).catch(() => {});
    await run('UPDATE payment_settings SET qr_code_path = NULL, updated_by = ?, updated_at = ? WHERE id = ?', [
      requester.id,
      new Date().toISOString(),
      existing.id,
    ]);
  }
  await recordAuditLog('Admin removed GCash QR code', requester.id);
  res.json({ ok: true, message: 'QR code removed successfully.' });
}));

// ── RESIDENT PAYMENT SUBMISSION & VERIFICATION APIS ──

app.post('/api/payments/submit', (req, res) => {
  receiptUpload.single('receipt')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const message = uploadErr.code === 'LIMIT_FILE_SIZE'
        ? 'Receipt image exceeds the 10 MB size limit.'
        : (uploadErr.message || 'Invalid receipt upload.');
      return res.status(400).json({ error: message });
    }

    const cleanUpFile = async () => {
      if (req.file && req.file.path) {
        await fs.promises.unlink(req.file.path).catch(() => {});
      }
    };

    try {
      const requester = await getRequester(req);
      if (!requester) {
        await cleanUpFile();
        return res.status(401).json({ error: 'Login required.' });
      }

      if (requester.status === 'inactive' || requester.status === 'deactivated') {
        await cleanUpFile();
        return res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'GCash receipt screenshot is required.' });
      }

      // Magic byte validation of uploaded receipt image
      const buffer = await fs.promises.readFile(req.file.path);
      if (!isValidImageBuffer(buffer)) {
        await cleanUpFile();
        return res.status(400).json({ error: 'Uploaded file is not a valid JPG, JPEG, PNG, or WebP image.' });
      }

      // Validate Billing
      const billingId = (req.body.billingId || '').trim();
      if (!billingId) {
        await cleanUpFile();
        return res.status(400).json({ error: 'Billing ID is required.' });
      }

      const billing = await get('SELECT * FROM billings WHERE id = ?', [billingId]);
      if (!billing) {
        await cleanUpFile();
        return res.status(404).json({ error: 'Billing record not found.' });
      }

      // Verify billing belongs to this resident
      let assigned = [];
      try {
        assigned = billing.assignedTo ? (typeof billing.assignedTo === 'string' ? JSON.parse(billing.assignedTo) : billing.assignedTo) : [];
      } catch {
        assigned = [];
      }
      if (!Array.isArray(assigned) || !assigned.includes(requester.id)) {
        await cleanUpFile();
        return res.status(403).json({ error: 'Access Denied: You are not assigned to this billing.' });
      }

      // Validate GCash Reference Number
      const refNum = (req.body.refNum || req.body.reference_number || '').trim();
      if (!refNum) {
        await cleanUpFile();
        return res.status(400).json({ error: 'GCash reference number is required.' });
      }

      if (refNum.length < 5) {
        await cleanUpFile();
        return res.status(400).json({ error: 'GCash reference number must be at least 5 characters long.' });
      }

      // Server-side Duplicate Reference Number Protection (case-insensitive across entire system)
      const dup = await get('SELECT id, refNum FROM payments WHERE LOWER(TRIM(refNum)) = LOWER(TRIM(?))', [refNum]);
      if (dup) {
        await cleanUpFile();
        return res.status(400).json({ error: 'This GCash reference number has already been submitted. Please check your reference number or contact admin.' });
      }

      // Check if this billing already has an approved payment
      const alreadyApproved = await get('SELECT id FROM payments WHERE homeownerId = ? AND billingId = ? AND status = "approved"', [requester.id, billing.id]);
      if (alreadyApproved) {
        await cleanUpFile();
        return res.status(400).json({ error: 'This bill has already been paid and approved.' });
      }

      // Check if there is already a pending verification payment for this billing
      const alreadyPending = await get('SELECT id FROM payments WHERE homeownerId = ? AND billingId = ? AND status = "pending"', [requester.id, billing.id]);
      if (alreadyPending) {
        await cleanUpFile();
        return res.status(400).json({ error: 'You already have a payment submission pending admin verification for this bill.' });
      }

      // Server-side Amount Integrity Check: amount must match the actual billing record
      const actualAmount = Number(billing.amount) || 0;
      if (actualAmount <= 0) {
        await cleanUpFile();
        return res.status(400).json({ error: 'Invalid billing amount.' });
      }

      if (req.body.amount && Math.abs(Number(req.body.amount) - actualAmount) > 0.01) {
        await cleanUpFile();
        return res.status(400).json({ error: `Payment amount (₱${Number(req.body.amount).toLocaleString()}) must match the exact bill amount (₱${actualAmount.toLocaleString()}).` });
      }

      // Payment Date
      const paymentDate = (req.body.payment_date || new Date().toISOString().slice(0, 10)).trim();
      const paymentMethod = (req.body.payment_method || 'GCash').trim();
      const receiptPath = `/uploads/receipts/${req.file.filename}`;
      const paymentId = 'p' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
      const nowIso = new Date().toISOString();

      const paymentRecord = {
        id: paymentId,
        homeownerId: requester.id,
        billingId: billing.id,
        amount: actualAmount,
        refNum: refNum,
        status: 'pending',
        receipt: receiptPath,
        submittedAt: new Date().toISOString().slice(0, 10),
        remarks: (req.body.remarks || '').trim(),
        reviewedAt: null,
        payment_method: paymentMethod,
        payment_date: paymentDate,
        verified_by: null,
        verified_at: null,
        rejection_reason: null,
        created_at: nowIso,
        updated_at: nowIso,
      };

      await saveRecord('payments', paymentRecord);

      // Record in Audit Log
      await recordAuditLog(
        `Resident ${requester.name} submitted payment for "${billing.title}" (Ref: ${refNum}, Amount: ₱${actualAmount.toLocaleString()})`,
        requester.id
      );

      // Create notifications
      await createServerNotification(
        'Payment Submitted',
        `${requester.name} submitted a GCash payment of ₱${actualAmount.toLocaleString()} for "${billing.title}".`,
        { roles: ['admin'] }
      );
      await createServerNotification(
        'Payment Submission Received',
        `Your payment of ₱${actualAmount.toLocaleString()} for "${billing.title}" (Ref: ${refNum}) has been received and is pending admin verification.`,
        { userIds: [requester.id] }
      );

      res.status(201).json({
        ok: true,
        payment: sanitizeRecord('payments', paymentRecord),
        message: 'Payment proof submitted successfully. Your payment is now pending admin verification.',
      });
    } catch (err) {
      await cleanUpFile();
      console.error(err);
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'This GCash reference number has already been submitted. Please check your reference number or contact admin.' });
      }
      res.status(500).json({ error: 'Could not submit payment. Please try again.' });
    }
  });
});

app.post('/api/payments/:id/approve', asyncHandler(async (req, res) => {
  const requester = await requirePermission(req, res, 'payments');
  if (!requester) return;

  const payment = await get('SELECT * FROM payments WHERE id = ?', [req.params.id]);
  if (!payment) {
    return res.status(404).json({ error: 'Payment record not found.' });
  }

  if (payment.status !== 'pending') {
    return res.status(400).json({ error: `Cannot approve payment with status "${payment.status}". Only pending payments can be approved.` });
  }

  const nowIso = new Date().toISOString();
  const reviewedAt = new Date().toISOString().slice(0, 10);

  await run(
    `UPDATE payments SET status = 'approved', verified_by = ?, verified_at = ?, reviewedAt = ?, updated_at = ? WHERE id = ?`,
    [requester.id, nowIso, reviewedAt, nowIso, payment.id]
  );

  const ho = await get('SELECT name FROM users WHERE id = ?', [payment.homeownerId]);
  const bill = await get('SELECT title FROM billings WHERE id = ?', [payment.billingId]);
  const hoName = ho ? ho.name : 'Resident';
  const billTitle = bill ? bill.title : 'Billing';

  // Audit Log
  await recordAuditLog(
    `Admin approved payment from ${hoName} for "${billTitle}" (Ref: ${payment.refNum}, Amount: ₱${Number(payment.amount).toLocaleString()})`,
    requester.id
  );

  // Notification to resident
  await createServerNotification(
    'Payment Approved',
    `Your GCash payment of ₱${Number(payment.amount).toLocaleString()} for "${billTitle}" has been verified and approved.`,
    { userIds: [payment.homeownerId] }
  );

  res.json({
    ok: true,
    message: 'Payment approved successfully. Billing balance updated.',
  });
}));

app.post('/api/payments/:id/reject', asyncHandler(async (req, res) => {
  const requester = await requirePermission(req, res, 'payments');
  if (!requester) return;

  const payment = await get('SELECT * FROM payments WHERE id = ?', [req.params.id]);
  if (!payment) {
    return res.status(404).json({ error: 'Payment record not found.' });
  }

  if (payment.status !== 'pending') {
    return res.status(400).json({ error: `Cannot reject payment with status "${payment.status}". Only pending payments can be rejected.` });
  }

  const reason = (req.body.rejection_reason || req.body.remarks || req.body.reason || '').trim();
  if (!reason) {
    return res.status(400).json({ error: 'A rejection reason is required. Please provide a reason to help the resident understand why their payment was rejected.' });
  }

  const nowIso = new Date().toISOString();
  const reviewedAt = new Date().toISOString().slice(0, 10);

  await run(
    `UPDATE payments SET status = 'rejected', rejection_reason = ?, remarks = ?, verified_by = ?, verified_at = ?, reviewedAt = ?, updated_at = ? WHERE id = ?`,
    [reason, reason, requester.id, nowIso, reviewedAt, nowIso, payment.id]
  );

  const ho = await get('SELECT name FROM users WHERE id = ?', [payment.homeownerId]);
  const bill = await get('SELECT title FROM billings WHERE id = ?', [payment.billingId]);
  const hoName = ho ? ho.name : 'Resident';
  const billTitle = bill ? bill.title : 'Billing';

  // Audit Log
  await recordAuditLog(
    `Admin rejected payment from ${hoName} for "${billTitle}". Reason: ${reason}`,
    requester.id
  );

  // Notification to resident with rejection reason
  await createServerNotification(
    'Payment Rejected',
    `Your payment for "${billTitle}" was rejected. Reason: ${reason}`,
    { userIds: [payment.homeownerId] }
  );

  res.json({
    ok: true,
    message: 'Payment rejected. Resident has been notified with the rejection reason.',
  });
}));


app.get('/api/:table', asyncHandler(async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  const allowed = await checkTableAccess(req, res, table, 'read');
  if (!allowed) return;

  let data = await getTableData(table);
  if (table === 'billings' && allowed.role !== 'admin' && !userHasPermission(allowed, 'billing')) {
    data = data.filter(b => getAssignedHomeownerIds(b).includes(allowed.id));
  }
  if (table === 'auditLog' && (req.query.filter || req.query.date || req.query.startDate || req.query.endDate || req.query.q)) {
    const filterMode = req.query.filter || 'all';
    const query = (req.query.q || '').trim().toLowerCase();
    const dateVal = req.query.date;
    const startVal = req.query.startDate;
    const endVal = req.query.endDate;
    const now = new Date();

    const parseLogTimestamp = (ts) => {
      if (!ts) return null;
      if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
      const str = String(ts).trim();
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d;
      const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?/i);
      if (m) {
        let month = parseInt(m[1], 10) - 1;
        let day = parseInt(m[2], 10);
        let year = parseInt(m[3], 10);
        if (year < 100) year += 2000;
        let hour = m[4] ? parseInt(m[4], 10) : 0;
        const min = m[5] ? parseInt(m[5], 10) : 0;
        const sec = m[6] ? parseInt(m[6], 10) : 0;
        const ampm = (m[7] || '').toUpperCase();
        if (ampm === 'PM' && hour < 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;
        return new Date(year, month, day, hour, min, sec);
      }
      const m2 = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
      if (m2) {
        const year = parseInt(m2[1], 10);
        const month = parseInt(m2[2], 10) - 1;
        const day = parseInt(m2[3], 10);
        const hour = m2[4] ? parseInt(m2[4], 10) : 0;
        const min = m2[5] ? parseInt(m2[5], 10) : 0;
        const sec = m2[6] ? parseInt(m2[6], 10) : 0;
        return new Date(year, month, day, hour, min, sec);
      }
      return null;
    };

    const filtered = data.filter(item => {
      if (query) {
        const actionMatch = (item.action || '').toLowerCase().includes(query);
        const performerMatch = (item.adminId || '').toLowerCase().includes(query);
        const timeMatch = (item.timestamp || '').toLowerCase().includes(query);
        if (!actionMatch && !performerMatch && !timeMatch) return false;
      }
      if (filterMode === 'all' && !dateVal && !startVal && !endVal) return true;
      const logDate = parseLogTimestamp(item.timestamp);
      if (!logDate) return false;

      if (filterMode === 'today') {
        return (
          logDate.getFullYear() === now.getFullYear() &&
          logDate.getMonth() === now.getMonth() &&
          logDate.getDate() === now.getDate()
        );
      }
      if (filterMode === 'week') {
        const dayOfWeek = now.getDay();
        const distanceToMonday = (dayOfWeek + 6) % 7;
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday, 0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + 6, 23, 59, 59, 999);
        return logDate >= startOfWeek && logDate <= endOfWeek;
      }
      if (filterMode === 'month') {
        return (
          logDate.getFullYear() === now.getFullYear() &&
          logDate.getMonth() === now.getMonth()
        );
      }
      if (filterMode === 'date' || dateVal) {
        const targetDate = dateVal;
        if (!targetDate) return true;
        const [y, m, d] = targetDate.split('-').map(Number);
        return (
          logDate.getFullYear() === y &&
          logDate.getMonth() === m - 1 &&
          logDate.getDate() === d
        );
      }
      if (filterMode === 'range' || startVal || endVal) {
        if (startVal) {
          const [sy, sm, sd] = startVal.split('-').map(Number);
          const startDate = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
          if (logDate < startDate) return false;
        }
        if (endVal) {
          const [ey, em, ed] = endVal.split('-').map(Number);
          const endDate = new Date(ey, em - 1, ed, 23, 59, 59, 999);
          if (logDate > endDate) return false;
        }
        return true;
      }
      return true;
    });

    return res.json(filtered);
  }

  res.json(data);
}));

app.put('/api/:table', asyncHandler(async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  const allowed = await checkTableAccess(req, res, table, 'update');
  if (!allowed) return;
  if (!Array.isArray(req.body)) {
    res.status(400).json({ error: 'Expected an array of records.' });
    return;
  }

  await run(`DELETE FROM ${tableName(table)}`);
  for (const item of stripProfilePhotoField(table, req.body)) {
    await saveRecord(table, item);
  }
  res.json(await getTableData(table));
}));

// ── COMPLAINT MEDIA UPLOAD & CREATION APIS ──

app.post('/api/complaints/upload', (req, res) => {
  complaintUpload.any()(req, res, async (uploadErr) => {
    if (uploadErr) {
      const message = uploadErr.code === 'LIMIT_FILE_SIZE'
        ? 'A file exceeds the maximum allowed size (5 MB for images, 30 MB for videos).'
        : (uploadErr.message || 'Invalid file upload.');
      return res.status(400).json({ error: message });
    }

    const files = req.files || (req.file ? [req.file] : []);
    if (!files.length) {
      return res.status(400).json({ error: 'No media files received.' });
    }

    const oversized = [];
    for (const file of files) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const isVideo = ALLOWED_COMPLAINT_VIDEO_EXTS.has(ext) || (file.mimetype && file.mimetype.startsWith('video/'));

      if (!isVideo && file.size > MAX_COMPLAINT_IMAGE_BYTES) {
        oversized.push(`Image "${file.originalname}" exceeds the 5 MB size limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
      }
      if (isVideo && file.size > MAX_COMPLAINT_VIDEO_BYTES) {
        oversized.push(`Video "${file.originalname}" exceeds the 30 MB size limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
      }
    }

    if (oversized.length > 0) {
      await Promise.all(files.map(f => fs.promises.unlink(f.path).catch(() => {})));
      return res.status(400).json({ error: oversized.join(' ') });
    }

    const uploadedFiles = files.map(file => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const isVideo = ALLOWED_COMPLAINT_VIDEO_EXTS.has(ext) || (file.mimetype && file.mimetype.startsWith('video/'));
      const mediaUrl = `/uploads/complaints/${file.filename}`;
      return {
        url: mediaUrl,
        media_url: mediaUrl,
        attachment: mediaUrl,
        media_type: isVideo ? 'video' : 'image',
        filename: file.filename,
        originalname: file.originalname,
        size: file.size,
      };
    });

    const primary = uploadedFiles[0] || {};
    const hasImages = uploadedFiles.some(f => f.media_type === 'image');
    const hasVideos = uploadedFiles.some(f => f.media_type === 'video');
    const overallMediaType = (hasImages && hasVideos) ? 'mixed' : (hasVideos ? 'video' : 'image');

    res.json({
      ok: true,
      files: uploadedFiles,
      count: uploadedFiles.length,
      url: primary.url || null,
      media_url: primary.media_url || null,
      attachment: primary.attachment || null,
      media_type: overallMediaType,
      filename: primary.filename || null,
      originalname: primary.originalname || null,
      size: primary.size || 0,
    });
  });
});

// ── LOST & FOUND MEDIA UPLOAD API ──

const handleLostFoundUpload = (req, res) => {
  lostFoundUpload.any()(req, res, async (uploadErr) => {
    if (uploadErr) {
      const message = uploadErr.code === 'LIMIT_FILE_SIZE'
        ? 'A file exceeds the maximum allowed size (5 MB for images, 30 MB for videos).'
        : (uploadErr.message || 'Invalid file upload.');
      return res.status(400).json({ error: message });
    }

    const files = req.files || (req.file ? [req.file] : []);
    if (!files.length) {
      return res.status(400).json({ error: 'No media files received.' });
    }

    const oversized = [];
    for (const file of files) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const isVideo = ALLOWED_COMPLAINT_VIDEO_EXTS.has(ext) || (file.mimetype && file.mimetype.startsWith('video/'));

      if (!isVideo && file.size > MAX_COMPLAINT_IMAGE_BYTES) {
        oversized.push(`Image "${file.originalname}" exceeds the 5 MB size limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
      }
      if (isVideo && file.size > MAX_COMPLAINT_VIDEO_BYTES) {
        oversized.push(`Video "${file.originalname}" exceeds the 30 MB size limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
      }
    }

    if (oversized.length > 0) {
      await Promise.all(files.map(f => fs.promises.unlink(f.path).catch(() => {})));
      return res.status(400).json({ error: oversized.join(' ') });
    }

    for (const file of files) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const buffer = await fs.promises.readFile(file.path);
      if (!isValidAnnouncementMediaBuffer(buffer, ext)) {
        await Promise.all(files.map(f => fs.promises.unlink(f.path).catch(() => {})));
        return res.status(400).json({ error: `Uploaded file "${file.originalname}" is not a valid JPG, PNG, WebP image or MP4, MOV, WebM video.` });
      }
    }

    const uploadedFiles = files.map(file => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const isVideo = ALLOWED_COMPLAINT_VIDEO_EXTS.has(ext) || (file.mimetype && file.mimetype.startsWith('video/'));
      const mediaUrl = `/uploads/lostfound/${file.filename}`;
      return {
        url: mediaUrl,
        media_url: mediaUrl,
        image: mediaUrl,
        media_type: isVideo ? 'video' : 'image',
        filename: file.filename,
        originalname: file.originalname,
        size: file.size,
      };
    });

    const primary = uploadedFiles[0] || {};
    const hasImages = uploadedFiles.some(f => f.media_type === 'image');
    const hasVideos = uploadedFiles.some(f => f.media_type === 'video');
    const overallMediaType = (hasImages && hasVideos) ? 'mixed' : (hasVideos ? 'video' : 'image');

    res.json({
      ok: true,
      files: uploadedFiles,
      count: uploadedFiles.length,
      url: primary.url || null,
      media_url: primary.media_url || null,
      image: primary.image || null,
      media_type: overallMediaType,
      filename: primary.filename || null,
      originalname: primary.originalname || null,
      size: primary.size || 0,
    });
  });
};

app.post('/api/lostfound/upload', handleLostFoundUpload);
app.post('/api/lost-found/upload', handleLostFoundUpload);

app.post('/api/complaints', (req, res, next) => {
  if (req.is('multipart/form-data')) {
    complaintUpload.any()(req, res, async (uploadErr) => {
      if (uploadErr) {
        const message = uploadErr.code === 'LIMIT_FILE_SIZE'
          ? 'A file exceeds the maximum allowed size (5 MB for images, 30 MB for videos).'
          : (uploadErr.message || 'Invalid file upload.');
        return res.status(400).json({ error: message });
      }

      const files = req.files || (req.file ? [req.file] : []);

      try {
        const allowed = await checkTableAccess(req, res, 'complaints', 'create');
        if (!allowed) {
          if (files.length) await Promise.all(files.map(f => fs.promises.unlink(f.path).catch(() => {})));
          return;
        }

        const oversized = [];
        for (const file of files) {
          const ext = path.extname(file.originalname || '').toLowerCase();
          const isVideo = ALLOWED_COMPLAINT_VIDEO_EXTS.has(ext) || (file.mimetype && file.mimetype.startsWith('video/'));
          if (!isVideo && file.size > MAX_COMPLAINT_IMAGE_BYTES) {
            oversized.push(`Image "${file.originalname}" exceeds the 5 MB limit.`);
          }
          if (isVideo && file.size > MAX_COMPLAINT_VIDEO_BYTES) {
            oversized.push(`Video "${file.originalname}" exceeds the 30 MB limit.`);
          }
        }
        if (oversized.length > 0) {
          await Promise.all(files.map(f => fs.promises.unlink(f.path).catch(() => {})));
          return res.status(400).json({ error: oversized.join(' ') });
        }

        const uploadedFiles = files.map(file => {
          const ext = path.extname(file.originalname || '').toLowerCase();
          const isVideo = ALLOWED_COMPLAINT_VIDEO_EXTS.has(ext) || (file.mimetype && file.mimetype.startsWith('video/'));
          const mediaUrl = `/uploads/complaints/${file.filename}`;
          return {
            url: mediaUrl,
            media_url: mediaUrl,
            attachment: mediaUrl,
            media_type: isVideo ? 'video' : 'image',
            filename: file.filename,
            originalname: file.originalname,
            size: file.size,
          };
        });

        const body = { ...req.body };
        if (uploadedFiles.length > 0) {
          const primary = uploadedFiles[0];
          body.attachment = primary.url;
          body.media_url = primary.url;
          body.media_type = uploadedFiles.length > 1
            ? (uploadedFiles.every(f => f.media_type === 'image') ? 'image' : (uploadedFiles.every(f => f.media_type === 'video') ? 'video' : 'mixed'))
            : primary.media_type;
          body.attachments = uploadedFiles;
        }
        if (!body.id) {
          body.id = 'c' + Date.now().toString(36).toUpperCase();
        }
        await saveRecord('complaints', body);
        res.status(201).json(sanitizeRecord('complaints', body));
      } catch (err) {
        if (files.length) await Promise.all(files.map(f => fs.promises.unlink(f.path).catch(() => {})));
        console.error(err);
        res.status(500).json({ error: 'Could not save complaint.' });
      }
    });
  } else {
    next();
  }
});

// ── AUDIT LOG & NOTIFICATION HELPERS ──

async function recordAuditLog(action, adminId = 'u001') {
  try {
    const id = 'l' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
    const timestamp = new Date().toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' });
    await run('INSERT INTO auditLog (id, action, adminId, timestamp) VALUES (?, ?, ?, ?)', [id, action, adminId, timestamp]);
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

async function createServerNotification(title, message, options = {}) {
  try {
    const id = 'n' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
    const time = new Date().toLocaleTimeString();
    const audience = options.audience || (options.roles ? 'roles' : (options.userIds ? 'users' : 'all'));
    const targetIds = options.roles || options.userIds || [];
    await run(
      'INSERT INTO notifications (id, title, message, time, audience, targetIds, dismissedBy) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, title, message, time, audience, JSON.stringify(targetIds), JSON.stringify([])]
    );
  } catch (err) {
    console.error('Failed to write notification:', err);
  }
}

app.post('/api/reset', asyncHandler(async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  await resetDatabase();
  res.json(await loadAllData(admin));
}));

app.post('/api/users', asyncHandler(async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const name = (req.body.name || '').trim();
  const username = (req.body.username || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = (req.body.password || '').trim();
  const role = req.body.role === 'admin' ? 'admin' : 'homeowner';

  if (!name || !username || !email || !password) {
    return res.status(400).json({ error: 'Name, Username, Email, and Password are all required.' });
  }

  if (/\s/.test(username)) {
    return res.status(400).json({ error: 'Username cannot contain whitespace.' });
  }

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  // Prevent duplicate username
  const dupUser = await get('SELECT id FROM users WHERE BINARY username = ?', [username]);
  if (dupUser) {
    return res.status(400).json({ error: 'Username already exists. Please choose another username.' });
  }

  // Prevent duplicate email
  const dupEmail = await get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
  if (dupEmail) {
    return res.status(400).json({ error: 'Email address is already registered. Please choose another email.' });
  }

  // Process permissions
  let permissions = [];
  if (role === 'admin') {
    permissions = ['*'];
  } else {
    const rawPerms = Array.isArray(req.body.permissions) ? req.body.permissions : [];
    const validPermissions = ['resident', 'billing', 'payments', 'complaints', 'vehicles', 'lostfound', 'announcements', 'amenities', 'reports', 'auditlog'];
    permissions = rawPerms.filter(p => validPermissions.includes(p));
    // If no permission specified for homeowner, default to resident
    if (permissions.length === 0) {
      permissions = ['resident'];
    }
  }

  const userId = req.body.id || ('u' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase());

  const newUserRecord = {
    id: userId,
    username,
    password,
    role,
    name,
    email,
    block: role === 'homeowner' ? (req.body.block || null) : null,
    lot: role === 'homeowner' ? (req.body.lot || null) : null,
    lotArea: role === 'homeowner' ? (Number(req.body.lotArea) || 0) : null,
    contact: (req.body.contact || '').trim() || null,
    balance: Number(req.body.balance) || 0,
    profile_photo: null,
    permissions,
    status: req.body.status || 'active',
  };

  await saveRecord('users', newUserRecord);
  res.status(201).json(sanitizeRecord('users', newUserRecord));
}));

app.post('/api/:table', asyncHandler(async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  const allowed = await checkTableAccess(req, res, table, 'create');
  if (!allowed) return;

  if (table === 'users') {
    const username = (req.body.username || '').trim();
    if (username) {
      const dupUser = await get('SELECT id FROM users WHERE BINARY username = ?', [username]);
      if (dupUser) {
        return res.status(400).json({ error: 'Username already exists. Please choose another username.' });
      }
    }
    const email = (req.body.email || '').trim().toLowerCase();
    if (email) {
      const dupEmail = await get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
      if (dupEmail) {
        return res.status(400).json({ error: 'Email address is already registered. Please choose another email.' });
      }
    }

    if (req.body.role === 'admin') {
      req.body.permissions = ['*'];
    } else {
      req.body.role = 'homeowner';
      const perms = Array.isArray(req.body.permissions) ? [...req.body.permissions] : [];
      const validPermissions = ['resident', 'billing', 'payments', 'complaints', 'vehicles', 'lostfound', 'announcements', 'amenities', 'reports', 'auditlog'];
      const clean = perms.filter(p => validPermissions.includes(p));
      req.body.permissions = clean.length > 0 ? clean : ['resident'];
    }
  }

  const body = stripProfilePhotoField(table, req.body);
  await saveRecord(table, body);
  res.status(201).json(sanitizeRecord(table, body));
}));

app.put('/api/:table/:id', asyncHandler(async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  const allowed = await checkTableAccess(req, res, table, 'update');
  if (!allowed) return;

  // Protect Primary Administrator u001 from accidental deactivation or role change
  if (table === 'users' && req.params.id === 'u001') {
    if (req.body.status && req.body.status !== 'active') {
      return res.status(400).json({ error: 'Primary Administrator account cannot be deactivated.' });
    }
    if (req.body.role && req.body.role !== 'admin') {
      return res.status(400).json({ error: 'Primary Administrator role cannot be changed.' });
    }
  }

  if (table === 'users') {
    const existing = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (allowed.role !== 'admin') {
      // Non-admin updating their own profile cannot change role, permissions, balance, or status
      delete req.body.role;
      delete req.body.permissions;
      delete req.body.balance;
      delete req.body.status;
    } else {
      // Admin updating a user
      if (req.body.username && req.body.username.trim() !== (existing.username || '')) {
        const dupUser = await get('SELECT id FROM users WHERE BINARY username = ? AND id != ?', [req.body.username.trim(), req.params.id]);
        if (dupUser) {
          return res.status(400).json({ error: 'Username already exists. Please choose another username.' });
        }
      }
      if (req.body.email && req.body.email.trim().toLowerCase() !== (existing.email || '').toLowerCase()) {
        const dupEmail = await get('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?', [req.body.email.trim().toLowerCase(), req.params.id]);
        if (dupEmail) {
          return res.status(400).json({ error: 'Email address is already registered. Please choose another email.' });
        }
      }

      const targetRole = req.body.role !== undefined ? req.body.role : existing.role;
      if (targetRole === 'admin') {
        req.body.permissions = ['*'];
      } else {
        const rawPerms = Array.isArray(req.body.permissions) ? [...req.body.permissions] : [];
        const validPermissions = ['resident', 'billing', 'payments', 'complaints', 'vehicles', 'lostfound', 'announcements', 'amenities', 'reports', 'auditlog'];
        const clean = rawPerms.filter(p => validPermissions.includes(p));
        req.body.permissions = clean.length > 0 ? clean : ['resident'];
      }
    }
  }

  const item = { ...stripProfilePhotoField(table, req.body), id: req.params.id };
  await saveRecord(table, item);
  res.json(sanitizeRecord(table, item));
}));

app.delete('/api/:table/:id', asyncHandler(async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  const allowed = await checkTableAccess(req, res, table, 'delete');
  if (!allowed) return;

  if (table === 'users' && req.params.id === 'u001') {
    return res.status(400).json({ error: 'Primary Administrator account cannot be deleted.' });
  }

  if (table === 'lostFound') {
    const existing = await get('SELECT image, images FROM lostFound WHERE id = ?', [req.params.id]);
    if (existing) {
      const filesToDelete = [];
      if (existing.image && existing.image.startsWith('/uploads/lostfound/')) {
        filesToDelete.push(existing.image);
      }
      if (existing.images) {
        try {
          const parsed = typeof existing.images === 'string' ? JSON.parse(existing.images) : existing.images;
          if (Array.isArray(parsed)) {
            for (const img of parsed) {
              const url = typeof img === 'string' ? img : (img?.url || img?.image || img?.media_url);
              if (url && url.startsWith('/uploads/lostfound/') && !filesToDelete.includes(url)) {
                filesToDelete.push(url);
              }
            }
          }
        } catch {}
      }
      for (const f of filesToDelete) {
        const filePath = path.join(__dirname, 'public', f);
        fs.promises.unlink(filePath).catch(() => {});
      }
    }
  }

  await run(`DELETE FROM ${tableName(table)} WHERE \`id\` = ?`, [req.params.id]);
  res.json({ ok: true });
}));

app.get(['/', '/index.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error. Check the VS Code terminal.' });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

ensureDatabase()
  .then(createTables)
  .then(seedIfEmpty)
  .then(ensureAdminUser)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SmartHood is running at http://localhost:${PORT}`);
      console.log(`MySQL database: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
  });
