const express = require('express');
const path = require('path');
const fs = require('fs');
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

const tableConfig = {
  users: {
    columns: ['id', 'username', 'password', 'role', 'name', 'email', 'block', 'lot', 'lotArea', 'contact', 'balance'],
    jsonColumns: [],
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
    columns: ['id', 'title', 'description', 'category', 'date', 'urgent', 'createdBy'],
    jsonColumns: [],
    booleanColumns: ['urgent'],
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
      { id: 'u002', username: 'juandelacruz', password: 'home123', role: 'homeowner', name: 'Juan Dela Cruz', email: 'juan@email.com', block: 'Block 3', lot: 'Lot 7', lotArea: 0, contact: '09171234567', balance: 3500 },
      { id: 'u003', username: 'annamaria', password: 'home123', role: 'homeowner', name: 'Anna Maria Reyes', email: 'anna@email.com', block: 'Block 1', lot: 'Lot 2', lotArea: 0, contact: '09281234567', balance: 0 },
      { id: 'u004', username: 'carlosmagno', password: 'home123', role: 'homeowner', name: 'Carlos Magno', email: 'carlos@email.com', block: 'Block 2', lot: 'Lot 5', lotArea: 0, contact: '09351234567', balance: 7000 },
      { id: 'u005', username: 'ritaflores', password: 'home123', role: 'homeowner', name: 'Rita Flores', email: 'rita@email.com', block: 'Block 4', lot: 'Lot 1', lotArea: 0, contact: '09461234567', balance: 1500 },
      { id: 'u006', username: 'pedroparcero', password: 'home123', role: 'homeowner', name: 'Pedro Parcero', email: 'pedro@email.com', block: 'Block 1', lot: 'Lot 8', lotArea: 0, contact: '09571234567', balance: 0 },
    ];
  }
}

const seed = {
  users: [adminUser, ...staffUsers, ...loadHomeownerSeed()],
  billings: [],
  payments: [],
  announcements: [],
  complaints: [],
  amenityBookings: [],
  vehicleRegistrations: [],
  lostFound: [],
  auditLog: [],
  notifications: [],
  appSettings: [{ id: 'duesRatePerSqm', value: '5.725' }],
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
  }

  return output;
}

function sanitizeRecord(table, item) {
  if (table !== 'users') return item;
  const output = { ...item };
  delete output.password;
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
    balance DOUBLE DEFAULT 0
  )`);
  await run('ALTER TABLE users ADD COLUMN lotArea DOUBLE').catch(() => {});

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
    category TEXT,
    date TEXT,
    urgent TINYINT(1) DEFAULT 0,
    createdBy TEXT
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
}

async function seedIfEmpty() {
  const row = await get('SELECT COUNT(*) AS count FROM users');
  if (Number(row.count) > 0) return;

  for (const [table, records] of Object.entries(seed)) {
    for (const record of records) {
      await saveRecord(table, record);
    }
  }
}

async function ensureStaffUsers() {
  for (const user of [adminUser, ...staffUsers]) {
    const existing = await get('SELECT id FROM users WHERE username = ?', [user.username]);
    if (!existing) {
      await saveRecord('users', user);
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
  res.json(deserializeRow('users', user));
}));

app.get('/api/:table', asyncHandler(async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  res.json(await getTableData(table));
}));

app.put('/api/:table', asyncHandler(async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  if (!Array.isArray(req.body)) {
    res.status(400).json({ error: 'Expected an array of records.' });
    return;
  }

  await run(`DELETE FROM ${tableName(table)}`);
  for (const item of req.body) {
    await saveRecord(table, item);
  }
  res.json(await getTableData(table));
}));

app.post('/api/:table', asyncHandler(async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  await saveRecord(table, req.body);
  res.status(201).json(sanitizeRecord(table, req.body));
}));

app.put('/api/:table/:id', asyncHandler(async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
  const item = { ...req.body, id: req.params.id };
  await saveRecord(table, item);
  res.json(sanitizeRecord(table, item));
}));

app.delete('/api/:table/:id', asyncHandler(async (req, res) => {
  const table = validateTable(req, res);
  if (!table) return;
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
