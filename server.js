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
};

let db;

app.use(express.json({ limit: '15mb' }));
app.use('/public', express.static(path.join(__dirname, 'public')));

const PROFILE_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'profile');
fs.mkdirSync(PROFILE_UPLOAD_DIR, { recursive: true });
const ANNOUNCEMENT_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'announcements');
fs.mkdirSync(ANNOUNCEMENT_UPLOAD_DIR, { recursive: true });
const BOARD_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'board');
fs.mkdirSync(BOARD_UPLOAD_DIR, { recursive: true });
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
    columns: ['id', 'homeownerId', 'billingId', 'amount', 'refNum', 'status', 'receipt', 'submittedAt', 'remarks', 'reviewedAt'],
    jsonColumns: [],
    booleanColumns: [],
  },
  announcements: {
    columns: ['id', 'title', 'description', 'content', 'category', 'date', 'urgent', 'createdBy', 'user_id', 'image_path', 'images', 'created_at', 'updated_at'],
    jsonColumns: ['images'],
    booleanColumns: ['urgent'],
  },
  announcement_comments: {
    columns: ['id', 'announcement_id', 'user_id', 'comment', 'created_at', 'updated_at'],
    jsonColumns: [],
    booleanColumns: [],
  },
  complaints: {
    columns: ['id', 'homeownerId', 'category', 'description', 'status', 'adminResponse', 'dateFiled', 'updatedAt', 'resolvedAt'],
    jsonColumns: [],
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
    columns: ['id', 'reportType', 'itemType', 'itemName', 'description', 'location', 'eventDate', 'contactName', 'contactNumber', 'image', 'status', 'remarks', 'createdAt', 'updatedAt', 'claimedAt'],
    jsonColumns: [],
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

const staffUsers = [
  {
    id: 'staff-president',
    username: 'president',
    password: 'president123',
    role: 'president',
    name: 'HOA President',
    email: 'president@sanalfonsohomes.com',
    block: null,
    lot: null,
    lotArea: null,
    contact: null,
    balance: 0,
    profile_photo: null,
    permissions: ['complaints'],
    status: 'active',
  },
  {
    id: 'staff-security',
    username: 'security',
    password: 'security123',
    role: 'security',
    name: 'Security Guard',
    email: 'security@sanalfonsohomes.com',
    block: null,
    lot: null,
    lotArea: null,
    contact: null,
    balance: 0,
    profile_photo: null,
    permissions: ['complaints', 'vehicles', 'lostfound'],
    status: 'active',
  },
  {
    id: 'staff-treasurer',
    username: 'treasurer',
    password: 'treasurer123',
    role: 'treasurer',
    name: 'HOA Treasurer',
    email: 'treasurer@sanalfonsohomes.com',
    block: null,
    lot: null,
    lotArea: null,
    contact: null,
    balance: 0,
    profile_photo: null,
    permissions: ['payments', 'reports'],
    status: 'active',
  },
  {
    id: 'staff-auditor',
    username: 'auditor',
    password: 'auditor123',
    role: 'auditor',
    name: 'HOA Auditor',
    email: 'auditor@sanalfonsohomes.com',
    block: null,
    lot: null,
    lotArea: null,
    contact: null,
    balance: 0,
    profile_photo: null,
    permissions: ['billing', 'reports'],
    status: 'active',
  },
];

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
  users: [adminUser, ...staffUsers, ...loadHomeownerSeed()],
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
  const setupPool = mysql.createPool({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
    waitForConnections: true,
    connectionLimit: 2,
  });

  await setupPool.query(
    `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(DB_CONFIG.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await setupPool.end();

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
  if (config.jsonColumns.includes(column)) return JSON.stringify(value || []);
  if (config.booleanColumns.includes(column)) return value ? 1 : 0;
  return value === undefined ? null : value;
}

function deserializeRow(table, row) {
  const config = tableConfig[table];
  const output = { ...row };

  for (const column of config.jsonColumns) {
    try {
      output[column] = row[column] ? JSON.parse(row[column]) : [];
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
      output.permissions = Array.isArray(output.permissions) && output.permissions.length ? output.permissions : ['*'];
    } else if (output.role === 'homeowner') {
      output.permissions = Array.isArray(output.permissions) && output.permissions.length ? output.permissions : [
        'ho-dashboard', 'ho-billing', 'ho-payments', 'ho-history', 'ho-amenities', 'ho-vehicles', 'ho-complaints', 'ho-announcements', 'ho-profile'
      ];
    } else if (!Array.isArray(output.permissions) || !output.permissions.length) {
      const staffDefaults = {
        president: ['complaints'],
        security: ['complaints', 'vehicles', 'lostfound'],
        treasurer: ['payments', 'reports'],
        auditor: ['billing', 'reports'],
      };
      output.permissions = staffDefaults[output.role] || ['dashboard'];
    }
    output.status = output.status || 'active';
  }

  return output;
}

function sanitizeRecord(table, item) {
  if (table !== 'users') return item;
  const output = { ...item };
  delete output.password;
  output.status = output.status || 'active';
  return output;
}

function validateTable(req, res) {
  const table = req.params.table;
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
  if (!item.id) throw new Error('Record id is required.');

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
  const rows = await all(`SELECT * FROM ${tableName(table)}`);
  return rows.map((row) => deserializeRow(table, row));
}

async function loadAllData() {
  const data = {};
  for (const table of Object.keys(tableConfig)) {
    data[table] = await getTableData(table);
  }
  return data;
}

async function createTables() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(255) UNIQUE,
    password TEXT,
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
  await run('ALTER TABLE users ADD COLUMN lotArea DOUBLE').catch(() => {});
  await run('ALTER TABLE users ADD COLUMN profile_photo TEXT').catch(() => {});
  await run('ALTER TABLE users ADD COLUMN permissions LONGTEXT').catch(() => {});
  await run("ALTER TABLE users ADD COLUMN status VARCHAR(32) DEFAULT 'active'").catch(() => {});
  await run("UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''").catch(() => {});

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

  await run(`CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(64) PRIMARY KEY,
    homeownerId TEXT,
    billingId TEXT,
    amount DOUBLE,
    refNum TEXT,
    status TEXT,
    receipt LONGTEXT,
    submittedAt TEXT,
    remarks TEXT,
    reviewedAt TEXT
  )`);

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
    comment LONGTEXT,
    created_at TEXT,
    updated_at TEXT
  )`);

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
    audience TEXT DEFAULT 'all',
    targetIds LONGTEXT,
    dismissedBy LONGTEXT
  )`);
  await run(`ALTER TABLE notifications ADD COLUMN audience TEXT DEFAULT 'all'`).catch(() => {});
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
}

async function ensureStaffUsers() {
  for (const user of [adminUser, ...staffUsers]) {
    const existing = await get('SELECT id, permissions, status FROM users WHERE username = ?', [user.username]);
    if (!existing) {
      await saveRecord('users', user);
    } else {
      if (!existing.permissions || !existing.status) {
        await saveRecord('users', {
          id: existing.id,
          permissions: existing.permissions ? JSON.parse(existing.permissions) : user.permissions,
          status: existing.status || 'active',
        });
      }
    }
  }
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

function getRequestUserId(req) {
  return req.get('x-user-id') || req.body.userId || req.query.userId || null;
}

const announcementUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ANNOUNCEMENT_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = ALLOWED_PHOTO_MIMES[file.mimetype] || '.jpg';
      const unique = `announcement-${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, unique);
    },
  }),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 10 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_PHOTO_MIMES[file.mimetype] || !ALLOWED_PHOTO_EXTS.has(ext)) {
      cb(new Error('Only JPG, PNG, or WebP images are allowed.'));
      return;
    }
    cb(null, true);
  },
});

const announcementUploadMiddleware = announcementUpload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'image', maxCount: 1 }
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
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  if (perms.includes('*')) return true;
  return perms.includes(moduleKey);
}

const TABLE_PERMISSIONS = {
  billings: 'billing',
  payments: 'payments',
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
    res.status(401).json({ error: 'Login required.' });
    return null;
  }

  if (requester.status === 'inactive' || requester.status === 'deactivated') {
    res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
    return null;
  }

  // Administrator has 100% full access
  if (requester.role === 'admin') return requester;

  // Homeowner access rules
  if (requester.role === 'homeowner') {
    if (action === 'read') return requester;
    if (action === 'create' && ['complaints', 'payments', 'amenityBookings', 'vehicleRegistrations', 'lostFound'].includes(table)) {
      return requester;
    }
    if (action === 'update' && table === 'users' && req.params.id === requester.id) {
      return requester;
    }
    const perm = TABLE_PERMISSIONS[table];
    if (perm && userHasPermission(requester, perm)) return requester;

    res.status(403).json({ error: `Access Denied: You do not have permission to ${action} ${table}.` });
    return null;
  }

  // Staff and custom accounts
  const requiredPerm = TABLE_PERMISSIONS[table];
  if (requiredPerm && userHasPermission(requester, requiredPerm)) return requester;

  if (action === 'read') {
    if (table === 'users' && (userHasPermission(requester, 'users') || userHasPermission(requester, 'homeowners'))) return requester;
    if (table === 'billings' && userHasPermission(requester, 'reports')) return requester;
    if (table === 'payments' && userHasPermission(requester, 'reports')) return requester;
    if (table === 'announcements') return requester;
  }

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
          ? 'Image must be 5 MB or smaller.'
          : (uploadErr.message || 'Invalid image upload.');
        return res.status(400).json({ error: msg });
      }

      const uploadedFiles = [
        ...((req.files && req.files.images) || []),
        ...((req.files && req.files.image) || []),
      ];

      try {
        const title = (req.body.title || '').trim();
        const contentText = (req.body.content || req.body.description || '').trim();
        if (!title || !contentText) {
          for (const f of uploadedFiles) await fs.promises.unlink(f.path).catch(() => {});
          return res.status(400).json({ error: 'Title and content are required.' });
        }

        const imagePaths = [];
        for (const f of uploadedFiles) {
          const buffer = await fs.promises.readFile(f.path);
          if (!isValidImageBuffer(buffer)) {
            for (const uf of uploadedFiles) await fs.promises.unlink(uf.path).catch(() => {});
            return res.status(400).json({ error: 'Uploaded file is not a valid JPG, PNG, or WebP image.' });
          }
          imagePaths.push(`/uploads/announcements/${f.filename}`);
        }

        const primaryImage = imagePaths[0] || null;
        const imagesJson = JSON.stringify(imagePaths);

        const id = req.body.id || ('a' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'));
        const nowIso = new Date().toISOString();
        const dateStr = req.body.date || nowIso.split('T')[0];
        const urgent = req.body.urgent === 'true' || req.body.urgent === true ? 1 : 0;
        const category = req.body.category || 'General';
        const createdBy = author ? author.id : 'u001';

        await run(
          `INSERT INTO announcements (id, title, description, content, category, date, urgent, createdBy, user_id, image_path, images, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, title, contentText, contentText, category, dateStr, urgent, createdBy, createdBy, primaryImage, imagesJson, nowIso, nowIso]
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
          ? 'Image must be 5 MB or smaller.'
          : (uploadErr.message || 'Invalid image upload.');
        return res.status(400).json({ error: msg });
      }

      const uploadedFiles = [
        ...((req.files && req.files.images) || []),
        ...((req.files && req.files.image) || []),
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

        // Determine existing images to keep
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

        // Process newly uploaded images
        for (const f of uploadedFiles) {
          const buffer = await fs.promises.readFile(f.path);
          if (!isValidImageBuffer(buffer)) {
            for (const uf of uploadedFiles) await fs.promises.unlink(uf.path).catch(() => {});
            return res.status(400).json({ error: 'Uploaded file is not a valid JPG, PNG, or WebP image.' });
          }
          currentImages.push(`/uploads/announcements/${f.filename}`);
        }

        const primaryImage = currentImages[0] || null;
        const imagesJson = JSON.stringify(currentImages);

        const category = req.body.category || existing.category;
        const dateStr = req.body.date || existing.date;
        const urgent = req.body.urgent !== undefined ? (req.body.urgent === 'true' || req.body.urgent === true ? 1 : 0) : existing.urgent;
        const nowIso = new Date().toISOString();

        await run(
          `UPDATE announcements SET title = ?, description = ?, content = ?, category = ?, date = ?, urgent = ?, image_path = ?, images = ?, updated_at = ? WHERE id = ?`,
          [title, contentText, contentText, category, dateStr, urgent, primaryImage, imagesJson, nowIso, req.params.id]
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
    `SELECT c.*, u.name AS author_name, u.role AS author_role, u.profile_photo AS author_photo
     FROM announcement_comments c
     LEFT JOIN users u ON c.user_id = u.id
     WHERE c.announcement_id = ?
     ORDER BY c.created_at ASC`,
    [req.params.id]
  );
  res.json(rows);
}));

app.post('/api/announcements/:id/comments', asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const announcement = await get('SELECT id FROM announcements WHERE id = ?', [req.params.id]);
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

  const id = 'cm' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  const nowIso = new Date().toISOString();

  await run(
    `INSERT INTO announcement_comments (id, announcement_id, user_id, comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, req.params.id, user.id, commentText, nowIso, nowIso]
  );

  const created = await get(
    `SELECT c.*, u.name AS author_name, u.role AS author_role, u.profile_photo AS author_photo
     FROM announcement_comments c
     LEFT JOIN users u ON c.user_id = u.id
     WHERE c.id = ?`,
    [id]
  );
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
    `SELECT c.*, u.name AS author_name, u.role AS author_role, u.profile_photo AS author_photo
     FROM announcement_comments c
     LEFT JOIN users u ON c.user_id = u.id
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

  await run('DELETE FROM announcement_comments WHERE id = ?', [req.params.commentId]);
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
  res.json(await loadAllData());
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const user = await get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
  if (!user) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }
  if (user.status === 'inactive' || user.status === 'deactivated') {
    res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
    return;
  }
  res.json(deserializeRow('users', user));
}));

app.get('/api/:table', asyncHandler(async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  const allowed = await checkTableAccess(req, res, table, 'read');
  if (!allowed) return;
  res.json(await getTableData(table));
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

app.post('/api/:table', asyncHandler(async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  const allowed = await checkTableAccess(req, res, table, 'create');
  if (!allowed) return;
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

  await run(`DELETE FROM ${tableName(table)} WHERE \`id\` = ?`, [req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/reset', asyncHandler(async (req, res) => {
  await resetDatabase();
  res.json(await loadAllData());
}));

app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error. Check the VS Code terminal.' });
});

ensureDatabase()
  .then(createTables)
  .then(seedIfEmpty)
  .then(ensureStaffUsers)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SmartHood is running at http://localhost:${PORT}`);
      console.log(`MySQL database: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
  });
