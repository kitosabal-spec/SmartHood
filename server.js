const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

function isBcryptHash(str) {
  return typeof str === 'string' && /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(str);
}

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
// Set FILE_ACCESS_SECRET in production so signed file links survive restarts.
const FILE_ACCESS_SECRET = process.env.FILE_ACCESS_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_COOKIE_NAME = 'smarthood_session';
if (!process.env.FILE_ACCESS_SECRET) console.warn('FILE_ACCESS_SECRET is not set; private file links will expire after a server restart.');
if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET is not set; sessions will expire after a server restart.');

app.use(express.json({ limit: '15mb' }));
// index.html still uses /public for CSS, JS, and images. Block its upload
// subtree before the broad static mount so it cannot bypass /uploads rules.
app.use('/public/uploads', (req, res) => res.status(404).end());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));

// Public media is deliberately limited to community-facing images and videos.
// Never add resident profiles, payment QR codes, receipts, complaint evidence,
// or resident documents to this tree.
const PUBLIC_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const ANNOUNCEMENT_UPLOAD_DIR = path.join(PUBLIC_UPLOAD_DIR, 'announcements');
fs.mkdirSync(ANNOUNCEMENT_UPLOAD_DIR, { recursive: true });
const BOARD_UPLOAD_DIR = path.join(PUBLIC_UPLOAD_DIR, 'board');
fs.mkdirSync(BOARD_UPLOAD_DIR, { recursive: true });
const LOSTFOUND_UPLOAD_DIR = path.join(PUBLIC_UPLOAD_DIR, 'lostfound');
fs.mkdirSync(LOSTFOUND_UPLOAD_DIR, { recursive: true });

// Private uploads are not served by express.static. They are returned only by
// the authorization-checked /api/files routes below.
const PRIVATE_UPLOAD_DIR = path.join(__dirname, 'private_uploads');
const PRIVATE_RECEIPT_UPLOAD_DIR = path.join(PRIVATE_UPLOAD_DIR, 'receipts');
const PRIVATE_COMPLAINT_UPLOAD_DIR = path.join(PRIVATE_UPLOAD_DIR, 'complaints');
const PRIVATE_RESIDENT_DOCUMENT_UPLOAD_DIR = path.join(PRIVATE_UPLOAD_DIR, 'resident-documents');
const PRIVATE_PROFILE_UPLOAD_DIR = path.join(PRIVATE_UPLOAD_DIR, 'profile-photos');
const PRIVATE_QRCODE_UPLOAD_DIR = path.join(PRIVATE_UPLOAD_DIR, 'payment-qrcodes');
for (const directory of [PRIVATE_RECEIPT_UPLOAD_DIR, PRIVATE_COMPLAINT_UPLOAD_DIR, PRIVATE_RESIDENT_DOCUMENT_UPLOAD_DIR, PRIVATE_PROFILE_UPLOAD_DIR, PRIVATE_QRCODE_UPLOAD_DIR]) {
  fs.mkdirSync(directory, { recursive: true });
}

// Keep only genuinely public content public. In particular, there is no
// /uploads/profile, /uploads/qrcodes, /uploads/receipts, or
// /uploads/complaints static route.
for (const [urlPath, directory] of [
  ['/uploads/announcements', ANNOUNCEMENT_UPLOAD_DIR],
  ['/uploads/board', BOARD_UPLOAD_DIR],
  ['/uploads/lostfound', LOSTFOUND_UPLOAD_DIR],
]) {
  app.use(urlPath, express.static(directory));
}

function moveLegacyPrivateUploads(legacyDirectory, privateDirectory) {
  // Existing sensitive files are moved once on startup, so old /uploads URLs
  // stop working without losing records that still contain their old paths.
  if (!fs.existsSync(legacyDirectory)) return;
  for (const entry of fs.readdirSync(legacyDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === '.gitkeep') continue;
    const source = path.join(legacyDirectory, entry.name);
    const destination = path.join(privateDirectory, path.basename(entry.name));
    if (!fs.existsSync(destination)) fs.renameSync(source, destination);
    else fs.unlinkSync(source);
  }
}

moveLegacyPrivateUploads(path.join(PUBLIC_UPLOAD_DIR, 'receipts'), PRIVATE_RECEIPT_UPLOAD_DIR);
moveLegacyPrivateUploads(path.join(PUBLIC_UPLOAD_DIR, 'complaints'), PRIVATE_COMPLAINT_UPLOAD_DIR);
moveLegacyPrivateUploads(path.join(PUBLIC_UPLOAD_DIR, 'profile'), PRIVATE_PROFILE_UPLOAD_DIR);
moveLegacyPrivateUploads(path.join(PUBLIC_UPLOAD_DIR, 'qrcodes'), PRIVATE_QRCODE_UPLOAD_DIR);

const tableConfig = {
  users: {
    columns: ['id', 'username', 'password', 'role', 'name', 'email', 'block', 'lot', 'lotArea', 'contact', 'balance', 'profile_photo', 'permissions', 'status'],
    jsonColumns: ['permissions'],
    booleanColumns: [],
  },
  billings: {
    columns: ['id', 'title', 'amount', 'dueDate', 'description', 'assignedTo', 'status', 'createdAt', 'monthly_dues_month', 'billing_type'],
    jsonColumns: ['assignedTo'],
    booleanColumns: [],
  },
  payments: {
    columns: ['id', 'homeownerId', 'billingId', 'amount', 'refNum', 'status', 'receipt', 'submittedAt', 'remarks', 'reviewedAt', 'payment_method', 'payment_date', 'verified_by', 'verified_at', 'rejection_reason', 'monthly_dues_month', 'payment_type', 'payment_source', 'recorded_by', 'created_at', 'updated_at'],
    jsonColumns: [],
    booleanColumns: [],
  },
  payment_settings: {
    columns: ['id', 'payment_method', 'account_name', 'account_number', 'qr_code_path', 'instructions', 'is_active', 'updated_by', 'updated_at'],
    jsonColumns: [],
    booleanColumns: ['is_active'],
  },
  announcements: {
    columns: ['id', 'title', 'description', 'content', 'category', 'date', 'urgent', 'is_pinned', 'createdBy', 'user_id', 'image_path', 'images', 'created_at', 'updated_at'],
    jsonColumns: ['images'],
    booleanColumns: ['urgent', 'is_pinned'],
  },
  announcement_comments: {
    columns: ['id', 'announcement_id', 'user_id', 'parent_id', 'reply_to_user_id', 'comment', 'created_at', 'updated_at'],
    jsonColumns: [],
    booleanColumns: [],
  },
  complaints: {
    columns: ['id', 'homeownerId', 'category', 'description', 'status', 'adminResponse', 'dateFiled', 'updatedAt', 'resolvedAt', 'otherCategory', 'attachment', 'media_url', 'media_type', 'attachments', 'dateOfOccurrence'],
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
    columns: ['id', 'homeownerId', 'reportType', 'itemType', 'itemName', 'description', 'location', 'eventDate', 'contactName', 'contactNumber', 'image', 'images', 'media_type', 'status', 'remarks', 'createdAt', 'updatedAt', 'claimedAt'],
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

function initialAdminUser() {
  const password = String(process.env.INITIAL_ADMIN_PASSWORD || '');
  if (password.length < 12) {
    throw new Error('INITIAL_ADMIN_PASSWORD must be set to a password of at least 12 characters before initializing or resetting the database.');
  }
  return { ...adminUser, password };
}


function loadHomeownerSeed() {
  const seedPath = path.join(__dirname, 'data', 'homeowners.seed.json');
  try {
    const raw = fs.readFileSync(seedPath, 'utf8').replace(/^\uFEFF/, '');
    // Seed records are directory data, not credentials. Accounts start disabled
    // and must be provisioned with a password by an administrator.
    return JSON.parse(raw).map(({ password, ...homeowner }) => ({
      ...homeowner,
      status: 'inactive',
    }));
  } catch (error) {
    console.warn(`Could not load homeowner seed from ${seedPath}. Falling back to demo homeowners.`);
    return [
      { id: 'u002', username: 'juandelacruz', role: 'homeowner', name: 'Juan Dela Cruz', email: 'juan@email.com', block: 'Block 3', lot: 'Lot 7', lotArea: 0, contact: '09171234567', balance: 3500, profile_photo: null, status: 'inactive' },
      { id: 'u003', username: 'annamaria', role: 'homeowner', name: 'Anna Maria Reyes', email: 'anna@email.com', block: 'Block 1', lot: 'Lot 2', lotArea: 0, contact: '09281234567', balance: 0, profile_photo: null, status: 'inactive' },
      { id: 'u004', username: 'carlosmagno', role: 'homeowner', name: 'Carlos Magno', email: 'carlos@email.com', block: 'Block 2', lot: 'Lot 5', lotArea: 0, contact: '09351234567', balance: 7000, profile_photo: null, status: 'inactive' },
      { id: 'u005', username: 'ritaflores', role: 'homeowner', name: 'Rita Flores', email: 'rita@email.com', block: 'Block 4', lot: 'Lot 1', lotArea: 0, contact: '09461234567', balance: 1500, profile_photo: null, status: 'inactive' },
      { id: 'u006', username: 'pedroparcero', role: 'homeowner', name: 'Pedro Parcero', email: 'pedro@email.com', block: 'Block 1', lot: 'Lot 8', lotArea: 0, contact: '09571234567', balance: 0, profile_photo: null, status: 'inactive' },
    ];
  }
}

const seed = {
  users: [],
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

function parseMonthFromTitle(title) {
  if (!title || typeof title !== 'string') return null;
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const regex = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i;
  const match = title.match(regex);
  if (match) {
    const monthIdx = monthNames.indexOf(match[1].toLowerCase());
    if (monthIdx !== -1) {
      const year = match[2];
      return `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
    }
  }
  return null;
}

const BILLING_TYPE_MONTHLY_DUES = 'Monthly Association Dues';
const BILLING_TYPE_OTHER = 'Other Billing';

function isMonthlyDuesTitle(title) {
  const text = String(title || '').toLowerCase();
  return text.includes('monthly') && text.includes('dues');
}

function normalizeBillingType(value, title = '', monthlyDuesMonth = '') {
  const raw = String(value || '').trim();
  if (raw === BILLING_TYPE_MONTHLY_DUES || raw === BILLING_TYPE_OTHER) return raw;
  if (isMonthlyDuesTitle(title) || monthlyDuesMonth) return BILLING_TYPE_MONTHLY_DUES;
  return BILLING_TYPE_OTHER;
}

function isMonthlyAssociationDuesBilling(billing) {
  if (!billing) return false;
  if (billing.billing_type === BILLING_TYPE_MONTHLY_DUES) return true;
  if (billing.billing_type === BILLING_TYPE_OTHER) return false;
  return Boolean(billing.monthly_dues_month && isMonthlyDuesTitle(billing.title));
}

function formatMonthYearDisplay(monthStr) {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return monthStr || '';
  const [yr, mo] = monthStr.split('-');
  const date = new Date(Number(yr), Number(mo) - 1, 1);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
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

async function findMonthlyDuesBillingForHomeowner(homeownerId, month, excludeBillingId = null) {
  if (!homeownerId || !month) return null;
  const rows = await all(
    `SELECT * FROM billings
      WHERE monthly_dues_month = ?
        AND (billing_type = ? OR (billing_type IS NULL OR billing_type = '') OR LOWER(title) LIKE '%monthly%dues%')`,
    [month, BILLING_TYPE_MONTHLY_DUES]
  );
  return rows.find((billing) => {
    if (excludeBillingId && billing.id === excludeBillingId) return false;
    if (!isMonthlyAssociationDuesBilling(billing)) return false;
    return getAssignedHomeownerIds(billing).includes(homeownerId);
  }) || null;
}

async function findApprovedMonthlyDuesPayment(homeownerId, month) {
  if (!homeownerId || !month) return null;
  const direct = await get(
    `SELECT * FROM payments
      WHERE homeownerId = ?
        AND monthly_dues_month = ?
        AND status = 'approved'
        AND (payment_type = 'monthly_dues' OR billingId IS NULL OR billingId = '')`,
    [homeownerId, month]
  );
  if (direct) return direct;

  const linked = await all(
    `SELECT p.*
      FROM payments p
      JOIN billings b ON p.billingId = b.id
      WHERE p.homeownerId = ?
        AND p.monthly_dues_month = ?
        AND p.status = 'approved'
        AND b.billing_type = ?`,
    [homeownerId, month, BILLING_TYPE_MONTHLY_DUES]
  );
  return linked[0] || null;
}

async function validateAndPrepareBillingPayload(payload, res, excludeBillingId = null) {
  const inferredMonth = payload.monthly_dues_month || payload.billingMonth || (payload.title ? parseMonthFromTitle(payload.title) : null);
  const billingType = normalizeBillingType(payload.billing_type || payload.billingType, payload.title, inferredMonth);
  payload.billing_type = billingType;

  if (billingType !== BILLING_TYPE_MONTHLY_DUES) {
    payload.billing_type = BILLING_TYPE_OTHER;
    payload.monthly_dues_month = null;
    return true;
  }

  const rawMonth = String(inferredMonth || '').trim();
  if (!rawMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth)) {
    res.status(400).json({ error: 'Billing Month is required for Monthly Association Dues.' });
    return false;
  }

  const assigned = getAssignedHomeownerIds(payload);
  for (const hid of assigned) {
    const approvedPayment = await findApprovedMonthlyDuesPayment(hid, rawMonth);
    if (approvedPayment && (!excludeBillingId || approvedPayment.billingId !== excludeBillingId)) {
      const ho = await get('SELECT name FROM users WHERE id = ?', [hid]);
      const hoName = ho ? ho.name : 'Resident';
      const monthDisplay = formatMonthYearDisplay(rawMonth);
      res.status(400).json({
        error: `This homeowner (${hoName}) has already paid the Monthly Association Dues for ${monthDisplay}.`,
      });
      return false;
    }

    const existingBilling = await findMonthlyDuesBillingForHomeowner(hid, rawMonth, excludeBillingId);
    if (existingBilling) {
      const ho = await get('SELECT name FROM users WHERE id = ?', [hid]);
      const hoName = ho ? ho.name : 'Resident';
      const monthDisplay = formatMonthYearDisplay(rawMonth);
      res.status(400).json({
        error: `Monthly Association Dues billing already exists for ${hoName} for ${monthDisplay}.`,
      });
      return false;
    }
  }

  payload.monthly_dues_month = rawMonth;
  if (!payload.title || !String(payload.title).trim()) {
    payload.title = `Monthly Association Dues - ${formatMonthYearDisplay(rawMonth)}`;
  }
  return true;
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
    const canViewResidentDirectory = requester && [
      'billing', 'payments', 'complaints', 'vehicles', 'amenities', 'lostfound',
    ].some(permission => userHasPermission(requester, permission));
    if (!canViewResidentDirectory) {
      data.users = requester ? (data.users || []).filter(user => user.id === requester.id) : [];
    }
    if (!requester || !userHasPermission(requester, 'auditlog')) {
      data.auditLog = [];
    }
    data.notifications = requester
      ? (data.notifications || []).filter(notification => canUserSeeNotification(notification, requester))
      : [];
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
    } else if (!userHasPermission(requester, 'complaints')) {
      // Residents can see their own cases, while complaint staff can see all.
      data.complaints = (data.complaints || []).filter(c => c.homeownerId === requester.id);
    }
    if (!requester || (!userHasPermission(requester, 'resident') && !userHasPermission(requester, 'vehicles'))) {
      data.vehicleRegistrations = [];
    }
    const canManageLf = requester && (requester.role === 'admin' || userHasPermission(requester, 'lostfound'));
    if (!canManageLf) {
      const requesterId = requester?.id;
      data.lostFound = (data.lostFound || []).filter(item => {
        const isPublic = ['Approved', 'Posted', 'Claimed'].includes(item.status);
        const isOwn = Boolean(requesterId && item.homeownerId === requesterId);
        return isPublic || isOwn;
      });
    }
  }
  // Replace storage keys with short-lived, record-specific secure URLs only
  // after permission filtering. Raw private filenames never leave the server.
  if (requester) {
    data.users = (data.users || []).map(record => presentPrivateFiles('users', record, requester));
    data.payments = (data.payments || []).map(record => presentPrivateFiles('payments', record, requester));
    data.complaints = (data.complaints || []).map(record => presentPrivateFiles('complaints', record, requester));
    data.payment_settings = (data.payment_settings || []).map(record => presentPrivateFiles('payment_settings', record, requester));
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
    createdAt TEXT,
    monthly_dues_month VARCHAR(7),
    billing_type VARCHAR(64) DEFAULT 'Other Billing'
  )`);
  await run('ALTER TABLE billings ADD COLUMN monthly_dues_month VARCHAR(7)').catch(() => {});
  await run('ALTER TABLE billings ADD COLUMN billing_type VARCHAR(64) DEFAULT "Other Billing"').catch(() => {});

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
    monthly_dues_month VARCHAR(7),
    payment_type VARCHAR(32) DEFAULT 'billing',
    payment_source VARCHAR(32) DEFAULT 'resident_submission',
    recorded_by VARCHAR(64),
    created_at TEXT,
    updated_at TEXT
  )`);
  await run('ALTER TABLE payments MODIFY refNum VARCHAR(191)').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN payment_method VARCHAR(64) DEFAULT "GCash"').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN payment_date TEXT').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN verified_by VARCHAR(64)').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN verified_at TEXT').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN rejection_reason TEXT').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN monthly_dues_month VARCHAR(7)').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN payment_type VARCHAR(32) DEFAULT "billing"').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN payment_source VARCHAR(32) DEFAULT "resident_submission"').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN recorded_by VARCHAR(64)').catch(() => {});
  await run("UPDATE payments SET payment_source = 'resident_submission' WHERE payment_source IS NULL OR payment_source = ''").catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN created_at TEXT').catch(() => {});
  await run('ALTER TABLE payments ADD COLUMN updated_at TEXT').catch(() => {});
  await run('ALTER TABLE payments ADD UNIQUE INDEX idx_payments_refNum (refNum)').catch(() => {});

  // Backfill existing billings where monthly_dues_month IS NULL
  try {
    const existingBills = await all('SELECT id, title FROM billings WHERE monthly_dues_month IS NULL OR monthly_dues_month = ""');
    for (const b of existingBills) {
      const parsed = parseMonthFromTitle(b.title);
      if (parsed && isMonthlyDuesTitle(b.title)) {
        await run('UPDATE billings SET monthly_dues_month = ? WHERE id = ?', [parsed, b.id]);
      }
    }
    await run(`
      UPDATE billings
      SET billing_type = CASE
        WHEN (monthly_dues_month IS NOT NULL AND monthly_dues_month != '') OR LOWER(title) LIKE '%monthly%dues%'
          THEN 'Monthly Association Dues'
        ELSE 'Other Billing'
      END
      WHERE billing_type IS NULL OR billing_type = ''
    `).catch(() => {});
    await run(`
      UPDATE billings
      SET billing_type = 'Monthly Association Dues'
      WHERE billing_type = 'Other Billing'
        AND ((monthly_dues_month IS NOT NULL AND monthly_dues_month != '') OR LOWER(title) LIKE '%monthly%dues%')
    `).catch(() => {});
    // Backfill existing payments where monthly_dues_month IS NULL but billing has monthly_dues_month
    await run(`
      UPDATE payments p
      JOIN billings b ON p.billingId = b.id
      SET p.monthly_dues_month = b.monthly_dues_month,
          p.payment_type = 'monthly_dues'
      WHERE (p.monthly_dues_month IS NULL OR p.monthly_dues_month = '')
        AND b.monthly_dues_month IS NOT NULL AND b.monthly_dues_month != ''
        AND b.billing_type = 'Monthly Association Dues'
    `).catch(() => {});
    await run(`
      UPDATE payments
      SET payment_type = 'monthly_dues'
      WHERE billingId IS NULL
        AND monthly_dues_month IS NOT NULL
        AND monthly_dues_month != ''
        AND (payment_type IS NULL OR payment_type = '' OR payment_type = 'billing')
    `).catch(() => {});
  } catch (err) {
    console.error('Error during monthly_dues_month migration:', err.message);
  }

  await run(`CREATE TABLE IF NOT EXISTS announcements (
    id VARCHAR(64) PRIMARY KEY,
    title TEXT,
    description LONGTEXT,
    content LONGTEXT,
    category TEXT,
    date TEXT,
    urgent TINYINT(1) DEFAULT 0,
    is_pinned TINYINT(1) DEFAULT 0,
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
  await run('ALTER TABLE announcements ADD COLUMN is_pinned TINYINT(1) DEFAULT 0').catch(() => {});

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
    resolvedAt TEXT,
    dateOfOccurrence TEXT
  )`);
  await run('ALTER TABLE complaints ADD COLUMN otherCategory TEXT').catch(() => {});
  await run('ALTER TABLE complaints ADD COLUMN attachment TEXT').catch(() => {});
  await run('ALTER TABLE complaints ADD COLUMN media_url TEXT').catch(() => {});
  await run('ALTER TABLE complaints ADD COLUMN media_type TEXT').catch(() => {});
  await run('ALTER TABLE complaints ADD COLUMN attachments TEXT').catch(() => {});
  await run('ALTER TABLE complaints ADD COLUMN dateOfOccurrence TEXT').catch(() => {});

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
    homeownerId VARCHAR(64),
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
  await run('ALTER TABLE lostFound ADD COLUMN homeownerId VARCHAR(64)').catch(() => {});
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
    const initialSeed = { ...seed, users: [initialAdminUser(), ...loadHomeownerSeed()] };
    for (const [table, records] of Object.entries(initialSeed)) {
      for (const record of records) {
        const seedRecord = { ...record };
        if (table === 'users' && !isBcryptHash(seedRecord.password)) {
          // Directory-only homeowners do not have a reusable default password.
          // The random value is hashed before it is ever stored.
          const plaintext = seedRecord.password || crypto.randomBytes(32).toString('base64url');
          seedRecord.password = await bcrypt.hash(plaintext, 10);
        }
        await saveRecord(table, seedRecord);
      }
    }
    await run("UPDATE payments SET payment_source = 'resident_submission' WHERE payment_source IS NULL OR payment_source = ''");
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
    const adminRecord = initialAdminUser();
    adminRecord.password = await bcrypt.hash(adminRecord.password, 10);
    await saveRecord('users', adminRecord);
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

async function migrateLegacyPasswords() {
  const users = await all('SELECT id, password FROM users WHERE password IS NOT NULL AND password != ""');
  for (const user of users) {
    if (!isBcryptHash(user.password)) {
      await run('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(user.password, 10), user.id]);
    }
  }
}

async function resetDatabase() {
  // Validate before deleting anything so a missing deployment secret cannot
  // leave the system without an administrator account.
  const resetSeed = { ...seed, users: [initialAdminUser(), ...loadHomeownerSeed()] };
  for (const table of Object.keys(tableConfig)) {
    await run(`DELETE FROM ${tableName(table)}`);
  }

  for (const [table, records] of Object.entries(resetSeed)) {
    for (const record of records) {
      const resetRecord = { ...record };
      if (table === 'users' && !isBcryptHash(resetRecord.password)) {
        const plaintext = resetRecord.password || crypto.randomBytes(32).toString('base64url');
        resetRecord.password = await bcrypt.hash(plaintext, 10);
      }
      await saveRecord(table, resetRecord);
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
const ALLOWED_VIDEO_MIMES = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

function randomUploadName(prefix, extension) {
  // The filename never includes a user-supplied name, preventing traversal and
  // making stored private filenames unguessable.
  return `${prefix}-${crypto.randomUUID()}${extension}`;
}

const profileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PRIVATE_PROFILE_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = ALLOWED_PHOTO_MIMES[file.mimetype] || '.jpg';
      const unique = randomUploadName('profile', ext);
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
    destination: (req, file, cb) => cb(null, PRIVATE_RECEIPT_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const origExt = path.extname(file.originalname || '').toLowerCase();
      const ext = ALLOWED_PHOTO_MIMES[file.mimetype] || (ALLOWED_PHOTO_EXTS.has(origExt) ? origExt : '.jpg');
      const cleanExt = ext === '.jpeg' ? '.jpg' : ext;
      const unique = randomUploadName('receipt', cleanExt);
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
    destination: (req, file, cb) => cb(null, PRIVATE_QRCODE_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const origExt = path.extname(file.originalname || '').toLowerCase();
      const ext = ALLOWED_PHOTO_MIMES[file.mimetype] || (ALLOWED_PHOTO_EXTS.has(origExt) ? origExt : '.jpg');
      const cleanExt = ext === '.jpeg' ? '.jpg' : ext;
      const unique = randomUploadName('qr', cleanExt);
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

function signedSessionToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, expires: Date.now() + (8 * 60 * 60 * 1000) })).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function sessionUserId(req) {
  const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => {
    const index = part.indexOf('=');
    return index < 0 ? [] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(pair => pair.length));
  const [payload, signature] = String(cookies[SESSION_COOKIE_NAME] || '').split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims.userId && Number(claims.expires) > Date.now() ? claims.userId : null;
  } catch {
    return null;
  }
}

function getRequestUserId(req) {
  return sessionUserId(req);
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
  // Do not trust an extension alone: a valid MP4/MOV/WebM container has one
  // of the signatures above. Unsupported content is rejected.
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
      const unique = randomUploadName('announcement', ext);
      cb(null, unique);
    },
  }),
  limits: { fileSize: MAX_ANNOUNCEMENT_VIDEO_BYTES, files: 10 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_ANNOUNCEMENT_MEDIA_EXTS.has(ext) || !isAllowedMediaMime(file.mimetype, ext)) {
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
      const unique = randomUploadName('board', ext);
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

function getSafeMediaExt(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_COMPLAINT_MEDIA_EXTS.has(extension)) return '.bin';
  return extension === '.jpeg' ? '.jpg' : extension;
}

function isAllowedMediaMime(mime, extension) {
  const normalizedExt = extension === '.jpeg' ? '.jpg' : extension;
  return ALLOWED_PHOTO_MIMES[mime] === normalizedExt || ALLOWED_VIDEO_MIMES[mime] === normalizedExt;
}

const complaintUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PRIVATE_COMPLAINT_UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = getSafeMediaExt(file);
      const unique = randomUploadName('complaint', ext);
      cb(null, unique);
    },
  }),
  limits: { fileSize: MAX_COMPLAINT_VIDEO_BYTES, files: 15 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_COMPLAINT_MEDIA_EXTS.has(ext) || !isAllowedMediaMime(file.mimetype, ext)) {
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
      const ext = getSafeMediaExt(file);
      const unique = randomUploadName('lostfound', ext);
      cb(null, unique);
    },
  }),
  limits: { fileSize: MAX_COMPLAINT_VIDEO_BYTES, files: 10 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_COMPLAINT_MEDIA_EXTS.has(ext) || !isAllowedMediaMime(file.mimetype, ext)) {
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
  // These are internal tables. Their dedicated routes below enforce ownership
  // and audience checks; never expose them through the generic CRUD API.
  if (table === 'notifications' || table === 'announcement_comments') {
    res.status(405).json({ error: 'Use the dedicated API route for this resource.' });
    return null;
  }

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

const PRIVATE_FILE_TICKET_TTL_MS = 10 * 60 * 1000;
const privateUploadTickets = new Map();

function privateStorageKey(kind, filename) {
  return `private:${kind}/${path.basename(filename)}`;
}

function registerStagedPrivateUpload(kind, filename, userId) {
  // Complaint uploads are staged briefly before their complaint record is
  // saved. Binding the random filename to the uploader prevents one resident
  // from attaching another resident's staged file.
  const now = Date.now();
  cleanExpiredPrivateUploads(now);
  privateUploadTickets.set(`${kind}/${filename}`, { userId, expires: now + 15 * 60 * 1000 });
}

function cleanExpiredPrivateUploads(now = Date.now()) {
  for (const [key, value] of privateUploadTickets) {
    if (value.expires >= now) continue;
    privateUploadTickets.delete(key);
    const [kind, filename] = key.split('/', 2);
    deletePrivateFiles(kind, [filename]);
  }
}

// Remove abandoned staged complaint uploads without touching saved records.
setInterval(cleanExpiredPrivateUploads, 5 * 60 * 1000).unref();

function claimStagedPrivateUpload(kind, filename, requester) {
  const key = `${kind}/${filename}`;
  const staged = privateUploadTickets.get(key);
  if (!staged || staged.expires < Date.now() || staged.userId !== requester.id) return false;
  privateUploadTickets.delete(key);
  return true;
}

function storedPrivateFilename(value, kind) {
  if (!value || typeof value !== 'string') return null;
  const prefix = `private:${kind}/`;
  const legacyFolder = { 'profile-photos': 'profile', 'payment-qrcodes': 'qrcodes' }[kind] || kind;
  const legacyPrefix = `/uploads/${legacyFolder}/`;
  const candidate = value.startsWith(prefix)
    ? value.slice(prefix.length)
    : (value.startsWith(legacyPrefix) ? value.slice(legacyPrefix.length) : null);
  if (!candidate || path.basename(candidate) !== candidate || !/^[A-Za-z0-9._-]+$/.test(candidate)) return null;
  return candidate;
}

function complaintAttachmentItems(record) {
  let items = [];
  if (Array.isArray(record?.attachments)) items = record.attachments;
  else if (typeof record?.attachments === 'string') {
    try { items = JSON.parse(record.attachments); } catch { items = []; }
  }
  if (!Array.isArray(items) || !items.length) {
    const value = record?.attachment || record?.media_url;
    if (value) items = [{ url: value, media_url: value, attachment: value, media_type: record?.media_type }];
  }
  return items.filter(Boolean);
}

function privateFilenameFromComplaintItem(item) {
  const value = typeof item === 'string' ? item : (item?.url || item?.media_url || item?.attachment);
  return storedPrivateFilename(value, 'complaints');
}

function privateFileTicket(kind, recordId, requester, index = 0) {
  if (!requester?.id) return null;
  const payload = Buffer.from(JSON.stringify({ kind, recordId, userId: requester.id, index, expires: Date.now() + PRIVATE_FILE_TICKET_TTL_MS })).toString('base64url');
  const signature = crypto.createHmac('sha256', FILE_ACCESS_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function privateFileUrl(kind, recordId, requester, index = null) {
  const route = index === null ? `/api/files/${kind}/${encodeURIComponent(recordId)}` : `/api/files/${kind}/${encodeURIComponent(recordId)}/${index}`;
  const ticket = privateFileTicket(kind, recordId, requester, index || 0);
  return ticket ? `${route}?access=${encodeURIComponent(ticket)}` : null;
}

async function requesterFromPrivateFileTicket(req, res, kind, recordId, index = 0) {
  const ticket = String(req.query.access || '');
  const [payload, signature] = ticket.split('.');
  if (!payload || !signature) {
    res.status(401).json({ error: 'Login required.' });
    return null;
  }
  const expected = crypto.createHmac('sha256', FILE_ACCESS_SECRET)
    .update(payload)
    .digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    res.status(403).json({ error: 'Invalid file access link.' });
    return null;
  }
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (claims.kind !== kind || claims.recordId !== recordId || Number(claims.index) !== Number(index) || !claims.userId || Number(claims.expires) < Date.now()) {
      res.status(403).json({ error: 'File access link has expired.' });
      return null;
    }
    if (getRequestUserId(req) !== claims.userId) {
      res.status(401).json({ error: 'Login required.' });
      return null;
    }
    const row = await get('SELECT * FROM users WHERE id = ?', [claims.userId]);
    const requester = row && deserializeRow('users', row);
    if (!requester || requester.status === 'inactive' || requester.status === 'deactivated') {
      res.status(401).json({ error: 'Login required.' });
      return null;
    }
    return requester;
  } catch {
    res.status(403).json({ error: 'Invalid file access link.' });
    return null;
  }
}

function privateFilePath(kind, filename) {
  const directories = {
    receipts: PRIVATE_RECEIPT_UPLOAD_DIR,
    complaints: PRIVATE_COMPLAINT_UPLOAD_DIR,
    'resident-documents': PRIVATE_RESIDENT_DOCUMENT_UPLOAD_DIR,
    'profile-photos': PRIVATE_PROFILE_UPLOAD_DIR,
    'payment-qrcodes': PRIVATE_QRCODE_UPLOAD_DIR,
  };
  const directory = directories[kind];
  if (!directory || !filename || path.basename(filename) !== filename) return null;
  const candidate = path.join(directory, filename);
  return candidate.startsWith(directory + path.sep) ? candidate : null;
}

function sendPrivateFile(res, filename, kind) {
  const filePath = privateFilePath(kind, filename);
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found.' });
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(path.extname(filename));
  return res.sendFile(filePath, { headers: { 'Content-Disposition': 'inline' } });
}

function presentPrivateFiles(table, record, requester) {
  const output = { ...record };
  if (table === 'payments' && output.receipt) {
    output.receipt = privateFileUrl('receipts', output.id, requester);
  }
  if (table === 'users' && output.profile_photo) {
    output.profile_photo = privateFileUrl('profile-photos', output.id, requester);
  }
  if (table === 'payment_settings' && output.qr_code_path) {
    output.qr_code_path = privateFileUrl('payment-qrcodes', output.id, requester);
  }
  if (table === 'complaints') {
    const items = complaintAttachmentItems(record);
    const safeItems = items.map((item, index) => {
      if (!privateFilenameFromComplaintItem(item)) return item;
      const url = privateFileUrl('complaints', output.id, requester, index);
      if (typeof item === 'string') return { url, media_url: url, attachment: url };
      const { storage_key, ...safeItem } = item;
      return { ...safeItem, url, media_url: url, attachment: url };
    });
    output.attachments = safeItems;
    if (safeItems.length) {
      const first = safeItems[0];
      output.attachment = typeof first === 'string' ? first : (first.url || first.media_url || first.attachment);
      output.media_url = output.attachment;
    }
  }
  return output;
}

function presentCommentAuthorPhoto(comment, requester) {
  const output = { ...comment };
  if (output.author_photo) {
    output.author_photo = requester ? privateFileUrl('profile-photos', output.user_id, requester) : null;
  }
  return output;
}

function complaintStoredFilenames(record) {
  return complaintAttachmentItems(record)
    .map(privateFilenameFromComplaintItem)
    .filter(Boolean);
}

function deletePrivateFiles(kind, filenames) {
  for (const filename of new Set(filenames.filter(Boolean))) {
    const filePath = privateFilePath(kind, filename);
    if (filePath) fs.promises.unlink(filePath).catch(() => {});
  }
}

function prepareComplaintPrivateAttachments(body, requester, existing = null) {
  const incomingItems = complaintAttachmentItems(body);
  const submittedStorageKeys = incomingItems.map((item) => {
    const value = typeof item === 'string' ? item : (item?.url || item?.media_url || item?.attachment);
    return typeof value === 'string' && value.startsWith('private:complaints/') ? storedPrivateFilename(value, 'complaints') : null;
  }).filter(Boolean);
  const oldFilenames = existing ? complaintStoredFilenames(deserializeRow('complaints', existing)) : [];

  // UI updates send the current signed display URLs back. They are never
  // trusted as storage paths; keep the already saved attachment metadata.
  if (existing && !submittedStorageKeys.length) {
    body.attachment = existing.attachment;
    body.media_url = existing.media_url;
    body.media_type = existing.media_type;
    body.attachments = deserializeRow('complaints', existing).attachments;
    return { oldFilenames, newFilenames: oldFilenames };
  }

  if (!existing && incomingItems.length && submittedStorageKeys.length !== incomingItems.length) {
    throw new Error('Complaint attachments must be uploaded through the secure upload endpoint.');
  }

  for (const filename of submittedStorageKeys) {
    const staged = privateUploadTickets.get(`complaints/${filename}`);
    if (!oldFilenames.includes(filename) && (!staged || staged.expires < Date.now() || staged.userId !== requester.id)) {
      throw new Error('One or more complaint uploads have expired. Please upload them again.');
    }
  }
  return { oldFilenames, newFilenames: submittedStorageKeys };
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
  return privateStorageKey('profile-photos', path.basename(value));
}

function deleteProfileFile(photoPath) {
  const filename = storedPrivateFilename(photoPath, 'profile-photos');
  if (filename) deletePrivateFiles('profile-photos', [filename]);
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
  const requesterId = requireOwnPhotoAccess(req, res);
  if (!requesterId) return;
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
      res.json({ ok: true, profile_photo: privateFileUrl('profile-photos', target.id, { id: requesterId }) });
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

// ── Pin/Unpin Announcement ──
app.patch('/api/announcements/:id/pin', asyncHandler(async (req, res) => {
  const requester = await getRequester(req);
  if (!requester || !userHasPermission(requester, 'announcements')) {
    return res.status(403).json({ error: 'Access Denied: You do not have permission to pin/unpin announcements.' });
  }

  const existing = await get('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'Announcement not found.' });
  }

  const currentPinned = existing.is_pinned ? 1 : 0;
  let newPinned;
  if (req.body && req.body.is_pinned !== undefined) {
    newPinned = (req.body.is_pinned === true || req.body.is_pinned === 1 || req.body.is_pinned === '1' || req.body.is_pinned === 'true') ? 1 : 0;
  } else {
    newPinned = currentPinned === 1 ? 0 : 1;
  }

  await run('UPDATE announcements SET is_pinned = ? WHERE id = ?', [newPinned, req.params.id]);

  const updated = await get('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
  res.json(deserializeRow('announcements', updated));
}));

// ── Announcement Comment Counts ──
app.get('/api/announcements/comment-counts', asyncHandler(async (req, res) => {
  const rows = await all(
    'SELECT announcement_id, COUNT(*) AS count FROM announcement_comments GROUP BY announcement_id'
  );
  const counts = {};
  for (const row of rows) {
    counts[row.announcement_id] = row.count;
  }
  res.json(counts);
}));

app.get('/api/announcements/:id/comments', asyncHandler(async (req, res) => {
  const requester = await getRequester(req);
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
  res.json(rows.map(row => presentCommentAuthorPhoto(row, requester)));
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

  res.status(201).json(presentCommentAuthorPhoto(created, user));
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
  res.json(presentCommentAuthorPhoto(updated, user));
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
  const requester = await requireAuth(req, res);
  if (!requester) return;
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
    'SELECT * FROM users WHERE (BINARY username = ? OR BINARY email = ? OR (block IS NOT NULL AND lot IS NOT NULL AND (BINARY CONCAT(block, " ", lot) = ? OR BINARY CONCAT(block, ", ", lot) = ?))) LIMIT 1',
    [username, username, username, username]
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
  if (!user || !matchesIdentifier) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }

  let passwordMatches = false;
  if (isBcryptHash(user.password)) {
    passwordMatches = await bcrypt.compare(password, user.password);
  } else {
    // Legacy plain-text password comparison (case-sensitive)
    if (user.password === password) {
      passwordMatches = true;
      // Immediately migrate legacy plain-text password to bcrypt hash in database
      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id]);
        user.password = hashedPassword;
      } catch (migrationErr) {
        console.error('Password migration error:', migrationErr);
      }
    }
  }

  if (!passwordMatches) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }

  if (user.status === 'inactive' || user.status === 'deactivated') {
    res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
    return;
  }
  res.cookie(SESSION_COOKIE_NAME, signedSessionToken(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
  res.json(deserializeRow('users', user));
}));

app.post('/api/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  res.json({ ok: true });
});

app.post('/api/change-password', asyncHandler(async (req, res) => {
  const requester = await requireAuth(req, res);
  if (!requester) return;

  const currentPassword = (req.body.currentPassword || '').trim();
  const newPassword = (req.body.newPassword || '').trim();

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current password and new password are required.' });
    return;
  }

  const user = await get('SELECT * FROM users WHERE id = ?', [requester.id]);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  let currentValid = false;
  if (isBcryptHash(user.password)) {
    currentValid = await bcrypt.compare(currentPassword, user.password);
  } else {
    currentValid = (user.password === currentPassword);
  }

  if (!currentValid) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  if (newPassword.length < 12) {
    res.status(400).json({ error: 'Password must be at least 12 characters long.' });
    return;
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id]);

  res.json({ ok: true, message: 'Password updated successfully.' });
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
  res.json(presentPrivateFiles('payment_settings', deserializeRow('payment_settings', setting), requester));
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

  res.json(presentPrivateFiles('payment_settings', deserializeRow('payment_settings', updated), requester));
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
        const oldFilename = storedPrivateFilename(existing.qr_code_path, 'payment-qrcodes');
        if (oldFilename) deletePrivateFiles('payment-qrcodes', [oldFilename]);
      }

      const qrPath = privateStorageKey('payment-qrcodes', req.file.filename);
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

      res.json({ ok: true, qr_code_path: privateFileUrl('payment-qrcodes', record.id, requester), message: 'GCash QR code updated successfully.' });
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
    const oldFilename = storedPrivateFilename(existing.qr_code_path, 'payment-qrcodes');
    if (oldFilename) deletePrivateFiles('payment-qrcodes', [oldFilename]);
    await run('UPDATE payment_settings SET qr_code_path = NULL, updated_by = ?, updated_at = ? WHERE id = ?', [
      requester.id,
      new Date().toISOString(),
      existing.id,
    ]);
  }
  await recordAuditLog('Admin removed GCash QR code', requester.id);
  res.json({ ok: true, message: 'QR code removed successfully.' });
}));

// ── BILLING AUTO-GENERATION APIS ──

app.post('/api/billings/generate-monthly-dues', asyncHandler(async (req, res) => {
  const requester = await requirePermission(req, res, 'billing');
  if (!requester) return;

  const month = (req.body.month || req.body.monthly_dues_month || '').trim();
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({ error: 'Valid monthly dues month is required in YYYY-MM format (e.g., 2026-09).' });
  }

  const [yrStr, moStr] = month.split('-');
  const yr = parseInt(yrStr, 10);
  const mo = parseInt(moStr, 10);
  const monthDate = new Date(yr, mo - 1, 1);
  const monthName = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const lastDayDate = new Date(yr, mo, 0);
  const defaultDueDate = `${yr}-${String(mo).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
  const dueDate = (req.body.dueDate || defaultDueDate).trim();
  const today = new Date().toISOString().slice(0, 10);

  const rateSetting = await get('SELECT value FROM appSettings WHERE id = "duesRatePerSqm"');
  const rate = rateSetting && parseFloat(rateSetting.value) > 0 ? parseFloat(rateSetting.value) : 5.725;

  // Retrieve all active homeowners
  const homeowners = await all("SELECT * FROM users WHERE role = 'homeowner' AND (status = 'active' OR status IS NULL)");
  if (!homeowners.length) {
    return res.status(400).json({ error: 'No active homeowners found.' });
  }

  // Retrieve existing Monthly Association Dues billings for this month to prevent duplicate generation.
  const existingBillings = await all(
    `SELECT * FROM billings
      WHERE monthly_dues_month = ?
        AND (billing_type = ? OR (billing_type IS NULL OR billing_type = '') OR LOWER(title) LIKE '%monthly%dues%')`,
    [month, BILLING_TYPE_MONTHLY_DUES]
  );

  const alreadyBilledHomeownerIds = new Set();
  existingBillings.forEach(b => {
    if (!isMonthlyAssociationDuesBilling(b)) return;
    let assigned = [];
    try {
      assigned = typeof b.assignedTo === 'string' ? JSON.parse(b.assignedTo) : b.assignedTo;
    } catch {}
    if (Array.isArray(assigned)) {
      assigned.forEach(id => alreadyBilledHomeownerIds.add(id));
    }
  });

  const createdBillings = [];
  const excludedHomeowners = [];
  const alreadyBilledHomeowners = [];

  for (const ho of homeowners) {
    // 1. Check if already billed for this month
    if (alreadyBilledHomeownerIds.has(ho.id)) {
      alreadyBilledHomeowners.push({ id: ho.id, name: ho.name });
      continue;
    }

    // 2. Check if homeowner has an APPROVED payment for this monthly dues month
    const approvedPayment = await findApprovedMonthlyDuesPayment(ho.id, month);

    if (approvedPayment) {
      // EXCLUDE from billing!
      excludedHomeowners.push({
        id: ho.id,
        name: ho.name,
        paymentId: approvedPayment.id,
        refNum: approvedPayment.refNum,
        reason: 'Approved advance payment',
      });
      continue;
    }

    // 3. Check if homeowner has a PENDING payment for this month
    const pendingPayment = await get(
      `SELECT * FROM payments WHERE homeownerId = ? AND monthly_dues_month = ? AND status = 'pending'`,
      [ho.id, month]
    );

    // Calculate monthly dues amount
    const lotArea = parseFloat(ho.lotArea || 0);
    const amount = Math.round((Number.isFinite(lotArea) && lotArea > 0 ? lotArea * rate : 1500) * 100) / 100;
    const billId = 'b' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
    const billTitle = `Monthly Dues - ${monthName}`;
    const desc = pendingPayment
      ? `Auto-generated monthly dues at PHP ${rate.toFixed(3)} per sqm for ${ho.lotArea || 0} sqm lot area. Note: Resident has a pending payment submission under review. Billing month: ${monthName}.`
      : `Auto-generated monthly dues at PHP ${rate.toFixed(3)} per sqm for ${ho.lotArea || 0} sqm lot area. Billing month: ${monthName}.`;

    const newBill = {
      id: billId,
      title: billTitle,
      amount: amount,
      dueDate: dueDate,
      description: desc,
      assignedTo: [ho.id],
      status: 'active',
      createdAt: today,
      monthly_dues_month: month,
      billing_type: BILLING_TYPE_MONTHLY_DUES,
    };

    await saveRecord('billings', newBill);
    createdBillings.push(newBill);

    // If there is a pending payment for this month that didn't have billingId, link it
    if (pendingPayment && !pendingPayment.billingId) {
      await run('UPDATE payments SET billingId = ?, updated_at = ? WHERE id = ?', [
        billId,
        new Date().toISOString(),
        pendingPayment.id,
      ]);
    }
  }

  // Audit Logs
  await recordAuditLog(
    `Admin generated monthly dues for ${monthName}: ${createdBillings.length} created, ${excludedHomeowners.length} excluded (advance paid), ${alreadyBilledHomeowners.length} already billed`,
    requester.id
  );

  if (excludedHomeowners.length > 0) {
    const excludedNames = excludedHomeowners.map(h => h.name).join(', ');
    await recordAuditLog(
      `Monthly dues generation for ${monthName} excluded ${excludedHomeowners.length} homeowner(s) who already paid: ${excludedNames}`,
      requester.id
    );
  }

  // Notifications to billed homeowners
  if (createdBillings.length > 0) {
    const billedUserIds = createdBillings.map(b => b.assignedTo[0]);
    await createServerNotification(
      'Monthly Dues Billing',
      `Monthly Dues for ${monthName} have been generated and assigned to your account.`,
      { userIds: billedUserIds }
    );
  }

  res.json({
    ok: true,
    month,
    monthName,
    createdCount: createdBillings.length,
    excludedCount: excludedHomeowners.length,
    alreadyBilledCount: alreadyBilledHomeowners.length,
    excludedHomeowners,
    message: createdBillings.length > 0
      ? `Generated ${createdBillings.length} billing(s) for ${monthName}.${excludedHomeowners.length > 0 ? ` ${excludedHomeowners.length} homeowner(s) were excluded because their dues were already paid in advance.` : ''}`
      : (excludedHomeowners.length > 0
          ? `All remaining homeowners have already paid in advance for ${monthName} (${excludedHomeowners.length} excluded).`
          : `Monthly dues for ${monthName} have already been generated for all homeowners.`),
  });
}));

// ── RESIDENT PAYMENT SUBMISSION & VERIFICATION APIS ──

// A manual payment is immediately verified because it is recorded by an authorized
// payments administrator. It intentionally requires an existing assigned billing;
// advance-payment handling remains exclusive to the resident payment flow.
app.post('/api/payments/manual', asyncHandler(async (req, res) => {
  const requester = await requirePermission(req, res, 'payments');
  if (!requester) return;

  const homeownerId = String(req.body.homeownerId || '').trim();
  const billingId = String(req.body.billingId || '').trim();
  const paymentMethod = String(req.body.payment_method || '').trim();
  const paymentDate = String(req.body.payment_date || '').trim();
  const refNum = String(req.body.refNum || req.body.reference_number || '').trim();
  const remarks = String(req.body.remarks || '').trim();
  const validMethods = new Set(['Cash', 'GCash', 'Other']);

  if (!homeownerId) return res.status(400).json({ error: 'A resident is required.' });
  if (!billingId) return res.status(400).json({ error: 'An existing billing is required.' });
  if (!validMethods.has(paymentMethod)) return res.status(400).json({ error: 'Choose Cash, GCash, or Other as the payment method.' });
  const paymentDateParts = paymentDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsedPaymentDate = paymentDateParts
    ? new Date(Number(paymentDateParts[1]), Number(paymentDateParts[2]) - 1, Number(paymentDateParts[3]))
    : null;
  if (!parsedPaymentDate || Number.isNaN(parsedPaymentDate.getTime()) ||
    parsedPaymentDate.getFullYear() !== Number(paymentDateParts[1]) ||
    parsedPaymentDate.getMonth() !== Number(paymentDateParts[2]) - 1 ||
    parsedPaymentDate.getDate() !== Number(paymentDateParts[3])) {
    return res.status(400).json({ error: 'A valid payment date is required.' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [residentRows] = await connection.execute('SELECT id, name, status FROM users WHERE id = ? AND role = "homeowner" FOR UPDATE', [homeownerId]);
    const resident = residentRows[0];
    if (!resident) {
      await connection.rollback();
      return res.status(404).json({ error: 'Resident not found.' });
    }
    if (['inactive', 'deactivated'].includes(resident.status)) {
      await connection.rollback();
      return res.status(400).json({ error: 'Payments cannot be recorded for an inactive resident.' });
    }

    // Lock the billing row so two fast submits cannot both create an approved payment.
    const [billingRows] = await connection.execute('SELECT * FROM billings WHERE id = ? FOR UPDATE', [billingId]);
    const billing = billingRows[0];
    if (!billing) {
      await connection.rollback();
      return res.status(404).json({ error: 'Billing record not found.' });
    }
    if (!getAssignedHomeownerIds(billing).includes(homeownerId)) {
      await connection.rollback();
      return res.status(403).json({ error: 'The selected billing does not belong to this resident.' });
    }

    const amount = Number(billing.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'The selected billing has an invalid amount.' });
    }
    if (req.body.amount !== undefined && Math.abs(Number(req.body.amount) - amount) > 0.01) {
      await connection.rollback();
      return res.status(400).json({ error: `Payment amount must exactly match the billing balance of ₱${amount.toLocaleString()}.` });
    }

    const [existingRows] = await connection.execute(
      `SELECT id, status FROM payments
       WHERE homeownerId = ? AND billingId = ? AND status IN ('pending', 'approved')
       LIMIT 1 FOR UPDATE`,
      [homeownerId, billingId]
    );
    if (existingRows[0]) {
      await connection.rollback();
      const message = existingRows[0].status === 'approved'
        ? 'This billing has already been paid.'
        : 'This billing already has a payment pending verification.';
      return res.status(409).json({ error: message });
    }

    if (refNum) {
      const [duplicateReference] = await connection.execute(
        'SELECT id FROM payments WHERE LOWER(TRIM(refNum)) = LOWER(TRIM(?)) LIMIT 1', [refNum]
      );
      if (duplicateReference[0]) {
        await connection.rollback();
        return res.status(400).json({ error: 'This reference or receipt number is already in use.' });
      }
    }

    const nowIso = new Date().toISOString();
    const monthlyDuesMonth = isMonthlyAssociationDuesBilling(billing)
      ? (billing.monthly_dues_month || parseMonthFromTitle(billing.title) || null)
      : null;
    const paymentRecord = {
      id: 'p' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
      homeownerId,
      billingId,
      amount,
      refNum: refNum || null,
      status: 'approved',
      receipt: null,
      submittedAt: paymentDate,
      remarks,
      reviewedAt: paymentDate,
      payment_method: paymentMethod,
      payment_date: paymentDate,
      verified_by: requester.id,
      verified_at: nowIso,
      rejection_reason: null,
      monthly_dues_month: monthlyDuesMonth,
      payment_type: monthlyDuesMonth ? 'monthly_dues' : 'billing',
      payment_source: 'manual_admin',
      recorded_by: requester.id,
      created_at: nowIso,
      updated_at: nowIso,
    };
    const columns = tableConfig.payments.columns;
    await connection.execute(
      `INSERT INTO payments (${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map(column => serializeValue('payments', column, paymentRecord[column]))
    );
    await connection.commit();

    const billingLabel = billing.title || 'Billing';
    await recordAuditLog(
      `Created manual payment: Admin ${requester.name || requester.id} recorded ₱${amount.toLocaleString()} via ${paymentMethod} for ${resident.name} — "${billingLabel}" (Payment date: ${paymentDate}${refNum ? `, Reference: ${refNum}` : ''})`,
      requester.id
    );
    await createServerNotification(
      'Payment Recorded',
      `A ${paymentMethod} payment of ₱${amount.toLocaleString()} for "${billingLabel}" was recorded by the HOA office and is marked paid.`,
      { userIds: [homeownerId] }
    );

    res.status(201).json({
      ok: true,
      payment: sanitizeRecord('payments', paymentRecord),
      message: 'Manual payment recorded and marked as paid.',
    });
  } catch (err) {
    await connection.rollback().catch(() => {});
    console.error('Could not create manual payment:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A duplicate payment or reference number was detected.' });
    }
    res.status(500).json({ error: 'Could not record the manual payment. Please try again.' });
  } finally {
    connection.release();
  }
}));

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

      const billingId = (req.body.billingId || '').trim();
      const monthlyDuesMonth = (req.body.monthly_dues_month || req.body.monthlyDuesMonth || '').trim();

      if (!billingId && !monthlyDuesMonth) {
        await cleanUpFile();
        return res.status(400).json({ error: 'Either Billing ID or Monthly Dues Month is required.' });
      }

      let actualAmount = 0;
      let finalBillingId = null;
      let finalMonthlyDuesMonth = null;
      let paymentType = 'billing';
      let billingTitle = '';

      if (billingId) {
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

        actualAmount = Number(billing.amount) || 0;
        if (actualAmount <= 0) {
          await cleanUpFile();
          return res.status(400).json({ error: 'Invalid billing amount.' });
        }

        finalBillingId = billing.id;
        billingTitle = billing.title || 'Billing';
        finalMonthlyDuesMonth = isMonthlyAssociationDuesBilling(billing)
          ? (billing.monthly_dues_month || parseMonthFromTitle(billing.title) || null)
          : null;
        if (finalMonthlyDuesMonth) {
          paymentType = 'monthly_dues';

          // Additional verification: ensure homeowner does not already have an approved payment for this month
          const alreadyApprovedMonth = await get(
            'SELECT id FROM payments WHERE homeownerId = ? AND monthly_dues_month = ? AND status = "approved"',
            [requester.id, finalMonthlyDuesMonth]
          );
          if (alreadyApprovedMonth) {
            await cleanUpFile();
            return res.status(400).json({ error: `You have already paid your monthly dues for this month.` });
          }

          // Ensure homeowner does not already have a pending payment for this month
          const alreadyPendingMonth = await get(
            'SELECT id FROM payments WHERE homeownerId = ? AND monthly_dues_month = ? AND status = "pending"',
            [requester.id, finalMonthlyDuesMonth]
          );
          if (alreadyPendingMonth) {
            await cleanUpFile();
            return res.status(400).json({ error: `You already have a payment submission pending admin verification for this month.` });
          }
        }
      } else {
        // Advance Monthly Dues Payment flow
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthlyDuesMonth)) {
          await cleanUpFile();
          return res.status(400).json({ error: 'Invalid monthly dues month. Format must be YYYY-MM (e.g., 2026-09).' });
        }

        finalMonthlyDuesMonth = monthlyDuesMonth;
        paymentType = 'monthly_dues';
        const [yrStr, moStr] = monthlyDuesMonth.split('-');
        const monthDate = new Date(parseInt(yrStr, 10), parseInt(moStr, 10) - 1, 1);
        const monthName = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        billingTitle = `Monthly Dues - ${monthName}`;

        // Check if homeowner already has an APPROVED payment for this monthly dues month
        const alreadyApproved = await get(
          'SELECT id FROM payments WHERE homeownerId = ? AND monthly_dues_month = ? AND status = "approved"',
          [requester.id, monthlyDuesMonth]
        );
        if (alreadyApproved) {
          await cleanUpFile();
          return res.status(400).json({ error: `You have already paid your monthly dues for ${monthName}.` });
        }

        // Check if homeowner already has a PENDING payment for this monthly dues month
        const alreadyPending = await get(
          'SELECT id FROM payments WHERE homeownerId = ? AND monthly_dues_month = ? AND status = "pending"',
          [requester.id, monthlyDuesMonth]
        );
        if (alreadyPending) {
          await cleanUpFile();
          return res.status(400).json({ error: `You already have a payment submission under review for ${monthName}.` });
        }

        // Calculate expected monthly dues amount based on lotArea and duesRatePerSqm
        const rateSetting = await get('SELECT value FROM appSettings WHERE id = "duesRatePerSqm"');
        const rate = rateSetting && parseFloat(rateSetting.value) > 0 ? parseFloat(rateSetting.value) : 5.725;
        const lotArea = parseFloat(requester.lotArea || 0);
        const calculated = Math.round((Number.isFinite(lotArea) && lotArea > 0 ? lotArea * rate : 1500) * 100) / 100;
        actualAmount = calculated > 0 ? calculated : 1500;

        // Check if an existing billing record already exists for this homeowner and month
        const matchingBills = await all(
          `SELECT * FROM billings
            WHERE monthly_dues_month = ?
              AND (billing_type = ? OR (billing_type IS NULL OR billing_type = '') OR LOWER(title) LIKE '%monthly%dues%')`,
          [monthlyDuesMonth, BILLING_TYPE_MONTHLY_DUES]
        );
        for (const mb of matchingBills) {
          if (!isMonthlyAssociationDuesBilling(mb)) continue;
          let assigned = [];
          try {
            assigned = typeof mb.assignedTo === 'string' ? JSON.parse(mb.assignedTo) : mb.assignedTo;
          } catch {}
          if (Array.isArray(assigned) && assigned.includes(requester.id)) {
            finalBillingId = mb.id;
            actualAmount = Number(mb.amount) || actualAmount;
            break;
          }
        }
      }

      // Server-side Amount Integrity Check
      if (req.body.amount && Math.abs(Number(req.body.amount) - actualAmount) > 0.01) {
        await cleanUpFile();
        return res.status(400).json({ error: `Payment amount (₱${Number(req.body.amount).toLocaleString()}) must match the required dues amount (₱${actualAmount.toLocaleString()}).` });
      }

      // Payment Date
      const paymentDate = (req.body.payment_date || new Date().toISOString().slice(0, 10)).trim();
      const paymentMethod = (req.body.payment_method || 'GCash').trim();
      const receiptPath = privateStorageKey('receipts', req.file.filename);
      const paymentId = 'p' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
      const nowIso = new Date().toISOString();

      const paymentRecord = {
        id: paymentId,
        homeownerId: requester.id,
        billingId: finalBillingId,
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
        monthly_dues_month: finalMonthlyDuesMonth,
      payment_type: paymentType,
      payment_source: 'resident_submission',
      recorded_by: null,
      created_at: nowIso,
        updated_at: nowIso,
      };

      await saveRecord('payments', paymentRecord);

      // Record in Audit Log
      const displayDesc = finalMonthlyDuesMonth
        ? `advance payment for "${billingTitle}" (${finalMonthlyDuesMonth})`
        : `payment for "${billingTitle}"`;
      await recordAuditLog(
        `Resident ${requester.name} submitted ${displayDesc} (Ref: ${refNum}, Amount: ₱${actualAmount.toLocaleString()})`,
        requester.id
      );

      // Create notifications
      await createServerNotification(
        'Payment Submitted',
        `${requester.name} submitted a GCash payment of ₱${actualAmount.toLocaleString()} for "${billingTitle}".`,
        { roles: ['admin'] }
      );
      await createServerNotification(
        'Payment Submission Received',
        `Your payment of ₱${actualAmount.toLocaleString()} for "${billingTitle}" (Ref: ${refNum}) has been received and is pending admin verification.`,
        { userIds: [requester.id] }
      );

      res.status(201).json({
        ok: true,
        payment: presentPrivateFiles('payments', sanitizeRecord('payments', paymentRecord), requester),
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

// A replacement receipt is kept private and removes the old proof only after
// the database points at the newly verified upload.
app.post('/api/payments/:id/receipt', asyncHandler(async (req, res) => {
  const requester = await requireAuth(req, res);
  if (!requester) return;
  receiptUpload.single('receipt')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const message = uploadErr.code === 'LIMIT_FILE_SIZE' ? 'Receipt image exceeds the 10 MB size limit.' : (uploadErr.message || 'Invalid receipt upload.');
      return res.status(400).json({ error: message });
    }
    const cleanUpFile = () => req.file?.path && fs.promises.unlink(req.file.path).catch(() => {});
    try {
      const payment = await get('SELECT * FROM payments WHERE id = ?', [req.params.id]);
      if (!payment) {
        await cleanUpFile();
        return res.status(404).json({ error: 'Payment record not found.' });
      }
      const mayReplace = requester.id === payment.homeownerId || requester.role === 'admin' || userHasPermission(requester, 'payments');
      if (!mayReplace) {
        await cleanUpFile();
        return res.status(403).json({ error: 'You do not have permission to replace this receipt.' });
      }
      if (!req.file || !isValidImageBuffer(await fs.promises.readFile(req.file.path))) {
        await cleanUpFile();
        return res.status(400).json({ error: 'Uploaded file is not a valid JPG, PNG, or WebP image.' });
      }
      const oldFilename = storedPrivateFilename(payment.receipt, 'receipts');
      const receipt = privateStorageKey('receipts', req.file.filename);
      await run('UPDATE payments SET receipt = ?, updated_at = ? WHERE id = ?', [receipt, new Date().toISOString(), payment.id]);
      if (oldFilename) deletePrivateFiles('receipts', [oldFilename]);
      res.json({ ok: true, payment: presentPrivateFiles('payments', deserializeRow('payments', { ...payment, receipt }), requester) });
    } catch (error) {
      await cleanUpFile();
      console.error(error);
      res.status(500).json({ error: 'Could not replace the receipt.' });
    }
  });
}));

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

  // If payment has monthly_dues_month but no billingId, check if a matching billing was created
  let updatedBillingId = payment.billingId;
  if (!updatedBillingId && payment.monthly_dues_month) {
    const matchingBills = await all(
      `SELECT id, assignedTo, billing_type, title, monthly_dues_month
        FROM billings
        WHERE monthly_dues_month = ?
          AND (billing_type = ? OR (billing_type IS NULL OR billing_type = '') OR LOWER(title) LIKE '%monthly%dues%')`,
      [payment.monthly_dues_month, BILLING_TYPE_MONTHLY_DUES]
    );
    for (const mb of matchingBills) {
      if (!isMonthlyAssociationDuesBilling(mb)) continue;
      let assigned = [];
      try {
        assigned = typeof mb.assignedTo === 'string' ? JSON.parse(mb.assignedTo) : mb.assignedTo;
      } catch {}
      if (Array.isArray(assigned) && assigned.includes(payment.homeownerId)) {
        updatedBillingId = mb.id;
        break;
      }
    }
  }

  await run(
    `UPDATE payments SET status = 'approved', billingId = ?, verified_by = ?, verified_at = ?, reviewedAt = ?, updated_at = ? WHERE id = ?`,
    [updatedBillingId, requester.id, nowIso, reviewedAt, nowIso, payment.id]
  );

  const ho = await get('SELECT name FROM users WHERE id = ?', [payment.homeownerId]);
  const bill = updatedBillingId ? await get('SELECT title FROM billings WHERE id = ?', [updatedBillingId]) : null;
  const hoName = ho ? ho.name : 'Resident';
  let billTitle = bill ? bill.title : '';
  if (!billTitle && payment.monthly_dues_month) {
    billTitle = `Monthly Dues - ${formatMonthYearDisplay(payment.monthly_dues_month)}`;
  }
  if (!billTitle) billTitle = 'Billing';

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
  const bill = payment.billingId ? await get('SELECT title FROM billings WHERE id = ?', [payment.billingId]) : null;
  const hoName = ho ? ho.name : 'Resident';
  let billTitle = bill ? bill.title : '';
  if (!billTitle && payment.monthly_dues_month) {
    billTitle = `Monthly Dues - ${formatMonthYearDisplay(payment.monthly_dues_month)}`;
  }
  if (!billTitle) billTitle = 'Billing';

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

// ── PRIVATE FILE ACCESS ────────────────────────────────────────────────────
// Receipts and complaint evidence never have public /uploads URLs. The short-
// lived signed link identifies a logged-in user, then ownership/role checks
// decide whether that user may see the specific record.
app.get('/api/files/receipts/:id', asyncHandler(async (req, res) => {
  const requester = await requesterFromPrivateFileTicket(req, res, 'receipts', req.params.id);
  if (!requester) return;
  const payment = await get('SELECT * FROM payments WHERE id = ?', [req.params.id]);
  if (!payment) return res.status(404).json({ error: 'Payment record not found.' });
  const mayView = requester.id === payment.homeownerId || requester.role === 'admin' || userHasPermission(requester, 'payments');
  if (!mayView) return res.status(403).json({ error: 'You do not have permission to view this receipt.' });
  const filename = storedPrivateFilename(payment.receipt, 'receipts');
  if (!filename) return res.status(404).json({ error: 'Receipt file not found.' });
  return sendPrivateFile(res, filename, 'receipts');
}));

app.get('/api/files/complaints/:id/:index?', asyncHandler(async (req, res) => {
  const index = Number(req.params.index || 0);
  if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'Invalid attachment index.' });
  const requester = await requesterFromPrivateFileTicket(req, res, 'complaints', req.params.id, index);
  if (!requester) return;
  const complaint = await get('SELECT * FROM complaints WHERE id = ?', [req.params.id]);
  if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });
  const mayView = requester.id === complaint.homeownerId || requester.role === 'admin' || userHasPermission(requester, 'complaints');
  if (!mayView) return res.status(403).json({ error: 'You do not have permission to view this complaint attachment.' });
  const item = complaintAttachmentItems(deserializeRow('complaints', complaint))[index];
  const filename = privateFilenameFromComplaintItem(item);
  if (!filename) return res.status(404).json({ error: 'Complaint attachment not found.' });
  return sendPrivateFile(res, filename, 'complaints');
}));

// Profile photos and payment QR codes are private to authenticated residents.
// They are intentionally not ownership-restricted because logged-in residents
// need avatars and the HOA payment QR code throughout the application.
app.get('/api/files/profile-photos/:id', asyncHandler(async (req, res) => {
  const requester = await requesterFromPrivateFileTicket(req, res, 'profile-photos', req.params.id);
  if (!requester) return;
  const user = await get('SELECT profile_photo FROM users WHERE id = ?', [req.params.id]);
  const filename = storedPrivateFilename(user?.profile_photo, 'profile-photos');
  if (!filename) return res.status(404).json({ error: 'Profile photo not found.' });
  return sendPrivateFile(res, filename, 'profile-photos');
}));

app.get('/api/files/payment-qrcodes/:id', asyncHandler(async (req, res) => {
  const requester = await requesterFromPrivateFileTicket(req, res, 'payment-qrcodes', req.params.id);
  if (!requester) return;
  const setting = await get('SELECT qr_code_path FROM payment_settings WHERE id = ?', [req.params.id]);
  const filename = storedPrivateFilename(setting?.qr_code_path, 'payment-qrcodes');
  if (!filename) return res.status(404).json({ error: 'Payment QR code not found.' });
  return sendPrivateFile(res, filename, 'payment-qrcodes');
}));

// ── LOST & FOUND APPROVE / REJECT APIS ──

app.post(['/api/lostfound/:id/approve', '/api/lost-found/:id/approve'], asyncHandler(async (req, res) => {
  const requester = await requirePermission(req, res, 'lostfound');
  if (!requester) return;

  const report = await get('SELECT * FROM lostFound WHERE id = ?', [req.params.id]);
  if (!report) {
    return res.status(404).json({ error: 'Lost & Found report not found.' });
  }

  const nowIso = new Date().toISOString();
  const remarks = req.body.remarks !== undefined ? String(req.body.remarks).trim() : (report.remarks || '');
  await run('UPDATE lostFound SET status = ?, remarks = ?, updatedAt = ? WHERE id = ?', [
    'Approved',
    remarks,
    nowIso,
    req.params.id
  ]);

  if (report.homeownerId) {
    try {
      await createServerNotification(
        'Lost & Found Report Approved',
        `Your lost & found report for "${report.itemName}" has been approved and published to the community board.`,
        { userIds: [report.homeownerId] }
      );
    } catch (e) {
      console.warn('Notification warning:', e.message);
    }
  }

  await recordAuditLog(
    `Admin approved lost and found report for "${report.itemName}" (${report.id})`,
    requester.id
  );

  const updated = await get('SELECT * FROM lostFound WHERE id = ?', [req.params.id]);
  res.json({
    ok: true,
    message: 'Report approved successfully and published to community.',
    report: deserializeRow('lostFound', updated)
  });
}));

app.post(['/api/lostfound/:id/reject', '/api/lost-found/:id/reject'], asyncHandler(async (req, res) => {
  const requester = await requirePermission(req, res, 'lostfound');
  if (!requester) return;

  const report = await get('SELECT * FROM lostFound WHERE id = ?', [req.params.id]);
  if (!report) {
    return res.status(404).json({ error: 'Lost & Found report not found.' });
  }

  const nowIso = new Date().toISOString();
  const reason = (req.body.reason || req.body.remarks || '').trim();
  await run('UPDATE lostFound SET status = ?, remarks = ?, updatedAt = ? WHERE id = ?', [
    'Rejected',
    reason,
    nowIso,
    req.params.id
  ]);

  if (report.homeownerId) {
    try {
      await createServerNotification(
        'Lost & Found Report Rejected',
        `Your lost & found report for "${report.itemName}" was not approved.${reason ? ' Reason: ' + reason : ''}`,
        { userIds: [report.homeownerId] }
      );
    } catch (e) {
      console.warn('Notification warning:', e.message);
    }
  }

  await recordAuditLog(
    `Admin rejected lost and found report for "${report.itemName}" (${report.id}). Reason: ${reason || 'None provided'}`,
    requester.id
  );

  const updated = await get('SELECT * FROM lostFound WHERE id = ?', [req.params.id]);
  res.json({
    ok: true,
    message: 'Report rejected.',
    report: deserializeRow('lostFound', updated)
  });
}));

function canUserSeeNotification(notification, user) {
  const dismissedBy = Array.isArray(notification.dismissedBy) ? notification.dismissedBy : [];
  if (dismissedBy.includes(user.id)) return false;
  const audience = notification.audience || 'all';
  const targetIds = Array.isArray(notification.targetIds) ? notification.targetIds : [];
  if (audience === 'all') return true;
  if (audience === 'roles') return targetIds.includes(user.role);
  if (audience === 'users') return targetIds.includes(user.id);
  return false;
}

app.get('/api/notifications', asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const notifications = await getTableData('notifications');
  res.json(notifications.filter(notification => canUserSeeNotification(notification, user)));
}));

app.patch('/api/notifications/:id/dismiss', asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const notification = await get('SELECT * FROM notifications WHERE id = ?', [req.params.id]);
  if (!notification) return res.status(404).json({ error: 'Notification not found.' });
  const record = deserializeRow('notifications', notification);
  if (!canUserSeeNotification(record, user)) return res.status(403).json({ error: 'You cannot dismiss this notification.' });
  record.dismissedBy = [...new Set([...(record.dismissedBy || []), user.id])];
  await saveRecord('notifications', record);
  res.json({ ok: true, id: record.id });
}));

app.post('/api/notifications/dismiss-all', asyncHandler(async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const notifications = await getTableData('notifications');
  await Promise.all(notifications
    .filter(notification => canUserSeeNotification(notification, user))
    .map((notification) => saveRecord('notifications', {
      id: notification.id,
      dismissedBy: [...new Set([...(notification.dismissedBy || []), user.id])],
    })));
  res.json({ ok: true });
}));

app.get('/api/public-data', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const [announcements, lostFound, board] = await Promise.all([
    getTableData('announcements'),
    getTableData('lostFound'),
    getTableData('board_of_directors'),
  ]);
  res.json({
    announcements,
    lostFound: lostFound.filter(item => ['Approved', 'Posted', 'Claimed'].includes(item.status)),
    board_of_directors: board,
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
  if (table === 'lostFound') {
    const isManager = allowed && typeof allowed === 'object' && (allowed.role === 'admin' || userHasPermission(allowed, 'lostfound'));
    if (!isManager) {
      const requesterId = (allowed && typeof allowed === 'object') ? allowed.id : null;
      data = data.filter(item => {
        const isPublic = ['Approved', 'Posted', 'Claimed'].includes(item.status);
        const isOwn = Boolean(requesterId && item.homeownerId === requesterId);
        return isPublic || isOwn;
      });
    }
  }
  if (table === 'complaints' && allowed.role !== 'admin' && !userHasPermission(allowed, 'complaints')) {
    data = data.filter(item => item.homeownerId === allowed.id);
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

  res.json(data.map(record => presentPrivateFiles(table, record, allowed)));
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

  let complaintReplaceMeta = null;
  let previousComplaintRows = [];
  if (table === 'complaints') {
    previousComplaintRows = await all('SELECT * FROM complaints');
    try {
      complaintReplaceMeta = req.body.map((record) => {
        const item = { ...record };
        const existing = previousComplaintRows.find(row => row.id === item.id) || null;
        const meta = prepareComplaintPrivateAttachments(item, allowed, existing);
        if (allowed.role !== 'admin' && !userHasPermission(allowed, 'complaints')) item.homeownerId = allowed.id;
        return { item, meta };
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    req.body = complaintReplaceMeta.map(entry => entry.item);
  }

  await run(`DELETE FROM ${tableName(table)}`);
  for (const item of stripProfilePhotoField(table, req.body)) {
    await saveRecord(table, item);
  }
  if (complaintReplaceMeta) {
    const oldFilenames = previousComplaintRows.flatMap(row => complaintStoredFilenames(deserializeRow('complaints', row)));
    const newFilenames = complaintReplaceMeta.flatMap(entry => entry.meta.newFilenames);
    for (const filename of newFilenames) claimStagedPrivateUpload('complaints', filename, allowed);
    deletePrivateFiles('complaints', oldFilenames.filter(filename => !newFilenames.includes(filename)));
  }
  res.json((await getTableData(table)).map(record => presentPrivateFiles(table, record, allowed)));
}));

// ── COMPLAINT MEDIA UPLOAD & CREATION APIS ──

app.post('/api/complaints/upload', asyncHandler(async (req, res) => {
  const requester = await requirePermission(req, res, 'resident');
  if (!requester) return;
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

    for (const file of files) {
      const ext = path.extname(file.filename || '').toLowerCase();
      const buffer = await fs.promises.readFile(file.path);
      if (!isValidAnnouncementMediaBuffer(buffer, ext)) {
        await Promise.all(files.map(f => fs.promises.unlink(f.path).catch(() => {})));
        return res.status(400).json({ error: `Uploaded file "${file.originalname}" is not a valid JPG, PNG, WebP image or MP4, MOV, WebM video.` });
      }
    }

    const uploadedFiles = files.map(file => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const isVideo = ALLOWED_COMPLAINT_VIDEO_EXTS.has(ext) || (file.mimetype && file.mimetype.startsWith('video/'));
      const storageKey = privateStorageKey('complaints', file.filename);
      registerStagedPrivateUpload('complaints', file.filename, requester.id);
      return {
        // This is a storage key, not a public URL. It becomes a signed API URL
        // only after the complaint record has been created.
        url: storageKey,
        media_url: storageKey,
        attachment: storageKey,
        storage_key: storageKey,
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
}));

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
          const mediaUrl = privateStorageKey('complaints', file.filename);
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
        if (allowed.role !== 'admin' && !userHasPermission(allowed, 'complaints')) body.homeownerId = allowed.id;
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
        if (!body.dateOfOccurrence && body.dateFiled) {
          body.dateOfOccurrence = body.dateFiled;
        }
        await saveRecord('complaints', body);
        res.status(201).json(presentPrivateFiles('complaints', sanitizeRecord('complaints', body), allowed));
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

  if (password.length < 12) {
    return res.status(400).json({ error: 'Password must be at least 12 characters long.' });
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
  const hashedPassword = await bcrypt.hash(password, 10);

  const newUserRecord = {
    id: userId,
    username,
    password: hashedPassword,
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

  // Payments have dedicated flows so they always receive ownership, amount,
  // duplicate, and billing validation. Do not permit a raw unassigned record.
  if (table === 'payments') {
    return res.status(405).json({ error: 'Use the payment submission or manual payment endpoint.' });
  }

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

    if (req.body.password) {
      const pass = String(req.body.password).trim();
      if (pass.length < 12) {
        return res.status(400).json({ error: 'Password must be at least 12 characters long.' });
      }
      if (!isBcryptHash(pass)) {
        req.body.password = await bcrypt.hash(pass, 10);
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

  if (table === 'billings') {
    const validBilling = await validateAndPrepareBillingPayload(req.body, res);
    if (!validBilling) return;
  }

  if (table === 'lostFound') {
    const isManager = allowed && typeof allowed === 'object' && (allowed.role === 'admin' || userHasPermission(allowed, 'lostfound'));
    if (!isManager) {
      req.body.status = 'Pending';
      if (allowed && typeof allowed === 'object') {
        req.body.homeownerId = allowed.id;
      }
    }
    if (!req.body.status) {
      req.body.status = 'Pending';
    }
    const nowIso = new Date().toISOString();
    if (!req.body.createdAt) {
      req.body.createdAt = nowIso;
    }
    req.body.updatedAt = nowIso;
  }

  let complaintFiles = null;
  if (table === 'complaints') {
    // A resident may only create a complaint in their own name.
    if (allowed.role !== 'admin' && !userHasPermission(allowed, 'complaints')) req.body.homeownerId = allowed.id;
    try {
      complaintFiles = prepareComplaintPrivateAttachments(req.body, allowed);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  const body = stripProfilePhotoField(table, req.body);
  await saveRecord(table, body);
  if (complaintFiles) {
    for (const filename of complaintFiles.newFilenames) claimStagedPrivateUpload('complaints', filename, allowed);
  }

  // Notifications are authored here instead of the browser so recipients cannot
  // be forged by an untrusted client.
  if (table === 'billings') {
    const assignedHomeownerIds = getAssignedHomeownerIds(body);
    if (assignedHomeownerIds.length > 0) {
      await createServerNotification(
        'New Billing Created',
        `"${body.title || 'A new billing'}" has been assigned to your account.`,
        { userIds: assignedHomeownerIds }
      );
    }
  }
  res.status(201).json(presentPrivateFiles(table, sanitizeRecord(table, body), allowed));
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
      // Non-admin updating their own profile cannot change role, permissions, balance, status, or password via PUT
      delete req.body.role;
      delete req.body.permissions;
      delete req.body.balance;
      delete req.body.status;
      delete req.body.password;
    } else {
      // Admin updating a user
      if (req.body.password !== undefined && req.body.password !== null && String(req.body.password).trim() !== '') {
        const pass = String(req.body.password).trim();
        if (pass.length < 12) {
          return res.status(400).json({ error: 'Password must be at least 12 characters long.' });
        }
        if (!isBcryptHash(pass)) {
          req.body.password = await bcrypt.hash(pass, 10);
        }
      } else {
        delete req.body.password;
      }

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

  if (table === 'billings') {
    const existing = await get('SELECT * FROM billings WHERE id = ?', [req.params.id]);
    if (!existing) {
      res.status(404).json({ error: 'Billing not found.' });
      return;
    }
    const merged = { ...deserializeRow('billings', existing), ...req.body };
    const validBilling = await validateAndPrepareBillingPayload(merged, res, req.params.id);
    if (!validBilling) return;
    req.body = merged;
  }

  let complaintFiles = null;
  if (table === 'complaints') {
    const existing = await get('SELECT * FROM complaints WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Complaint not found.' });
    try {
      complaintFiles = prepareComplaintPrivateAttachments(req.body, allowed, existing);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  const item = { ...stripProfilePhotoField(table, req.body), id: req.params.id };
  await saveRecord(table, item);
  if (complaintFiles) {
    for (const filename of complaintFiles.newFilenames) claimStagedPrivateUpload('complaints', filename, allowed);
    deletePrivateFiles('complaints', complaintFiles.oldFilenames.filter(filename => !complaintFiles.newFilenames.includes(filename)));
  }
  res.json(presentPrivateFiles(table, sanitizeRecord(table, item), allowed));
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

  if (table === 'complaints') {
    const existing = await get('SELECT * FROM complaints WHERE id = ?', [req.params.id]);
    if (existing) deletePrivateFiles('complaints', complaintStoredFilenames(deserializeRow('complaints', existing)));
  }

  if (table === 'payments') {
    const existing = await get('SELECT receipt FROM payments WHERE id = ?', [req.params.id]);
    const filename = storedPrivateFilename(existing?.receipt, 'receipts');
    if (filename) deletePrivateFiles('receipts', [filename]);
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
  .then(migrateLegacyPasswords)
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
