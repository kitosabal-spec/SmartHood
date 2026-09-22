const mysql = require('mysql2/promise');

const BASE_URL = 'http://localhost:3000';
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'san_alfonso_homes',
};

async function postLogin(username, password) {
  const res = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, userId: data?.id };
}

async function request(path, userId, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (userId) headers['x-user-id'] = userId;
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function run() {
  console.log('=== Starting Full Billing Persistence & Lifecycle Verification ===\n');
  let passed = 0;
  let total = 0;

  function expect(description, condition) {
    total++;
    if (condition) {
      console.log(`[PASS] ${description}`);
      passed++;
    } else {
      console.error(`[FAIL] ${description}`);
    }
  }

  const pool = mysql.createPool({ ...dbConfig, waitForConnections: true, connectionLimit: 2 });

  try {
    // 1. Logins
    const admin = await postLogin('admin', 'admin123');
    expect('Admin login successful', admin.status === 200 && admin.data.role === 'admin');
    const adminId = admin.userId;

    const ho1 = await postLogin('keith', 'keith123');
    expect('Homeowner 1 (Keith) login successful', ho1.status === 200);
    const ho1Id = ho1.userId;

    const ho2 = await postLogin('sanluisjoy', 'sah0002');
    expect('Homeowner 2 (Joy) login successful', ho2.status === 200);
    const ho2Id = ho2.userId;

    // 2. Admin creates billing assigned to Homeowner 1
    const testBill1 = {
      title: 'Monthly Association Dues - October 2026',
      amount: 1850.50,
      dueDate: '2026-10-31',
      description: 'Monthly dues for October 2026',
      assignedTo: [ho1Id],
      status: 'active',
      createdAt: '2026-10-01'
    };

    const createRes1 = await request('/api/billings', adminId, {
      method: 'POST',
      body: JSON.stringify(testBill1)
    });
    expect('Single-homeowner billing created via POST /api/billings', createRes1.status === 201 || createRes1.status === 200);
    const bill1Id = createRes1.data?.id;
    expect('Created billing returned an ID and assignedTo as array', !!bill1Id && Array.isArray(createRes1.data?.assignedTo));

    // 3. Verify MySQL database persistence directly
    const [mysqlRows] = await pool.query('SELECT * FROM billings WHERE id = ?', [bill1Id]);
    expect('Billing exists in MySQL billings table', mysqlRows.length === 1);
    if (mysqlRows.length > 0) {
      const dbRow = mysqlRows[0];
      expect('MySQL title matches', dbRow.title === testBill1.title);
      expect('MySQL amount matches', Number(dbRow.amount) === testBill1.amount);
      const assignedParsed = JSON.parse(dbRow.assignedTo);
      expect('MySQL assignedTo stores homeowner ID (not username/name)', Array.isArray(assignedParsed) && assignedParsed.includes(ho1Id));
    }

    // 4. Admin views billing in GET /api/data and GET /api/billings
    const adminData = await request('/api/data', adminId);
    const adminFound = (adminData.data?.billings || []).find(b => b.id === bill1Id);
    expect('Billing is visible to Admin in GET /api/data', !!adminFound);
    expect('Admin view shows assignedTo deserialized array with Keith ID', Array.isArray(adminFound?.assignedTo) && adminFound.assignedTo.includes(ho1Id));

    // 5. Homeowner 1 views billing in GET /api/data
    const ho1Data = await request('/api/data', ho1Id);
    const ho1Found = (ho1Data.data?.billings || []).find(b => b.id === bill1Id);
    expect('Billing is visible to Homeowner 1 (Keith) in GET /api/data', !!ho1Found);
    expect('Homeowner 1 sees correct amount and title', ho1Found?.amount === testBill1.amount && ho1Found?.title === testBill1.title);

    // 6. Homeowner 2 must NOT see billing 1
    const ho2Data = await request('/api/data', ho2Id);
    const ho2Found = (ho2Data.data?.billings || []).find(b => b.id === bill1Id);
    expect('Billing 1 is completely isolated from Homeowner 2 (Joy)', !ho2Found);

    // 7. Multi-Homeowner Assignment: Admin creates billing assigned to BOTH Keith and Joy
    const testBillMulti = {
      title: 'Security Improvement Fund Q4 2026',
      amount: 750.00,
      dueDate: '2026-11-15',
      description: 'Security improvement project fee',
      assignedTo: [ho1Id, ho2Id],
      status: 'active',
      createdAt: '2026-10-01'
    };

    const createResMulti = await request('/api/billings', adminId, {
      method: 'POST',
      body: JSON.stringify(testBillMulti)
    });
    expect('Multi-homeowner billing created successfully', createResMulti.status === 201 || createResMulti.status === 200);
    const multiBillId = createResMulti.data?.id;
    expect('Multi-billing assignedTo contains 2 homeowner IDs', createResMulti.data?.assignedTo?.length === 2);

    // Verify MySQL for multi billing
    const [mysqlMulti] = await pool.query('SELECT * FROM billings WHERE id = ?', [multiBillId]);
    expect('Multi-billing persists in MySQL', mysqlMulti.length === 1);
    if (mysqlMulti.length > 0) {
      const parsedMulti = JSON.parse(mysqlMulti[0].assignedTo);
      expect('MySQL multi assignedTo contains both IDs', parsedMulti.includes(ho1Id) && parsedMulti.includes(ho2Id));
    }

    // Both Keith and Joy must see the multi-assigned billing
    const ho1MultiData = await request('/api/data', ho1Id);
    const ho1MultiFound = (ho1MultiData.data?.billings || []).find(b => b.id === multiBillId);
    expect('Multi-assigned billing visible to Keith', !!ho1MultiFound);

    const ho2MultiData = await request('/api/data', ho2Id);
    const ho2MultiFound = (ho2MultiData.data?.billings || []).find(b => b.id === multiBillId);
    expect('Multi-assigned billing visible to Joy', !!ho2MultiFound);

    // 8. Clean up created test billings
    const del1 = await request(`/api/billings/${bill1Id}`, adminId, { method: 'DELETE' });
    expect('Deleted test bill 1', del1.status === 200);
    const del2 = await request(`/api/billings/${multiBillId}`, adminId, { method: 'DELETE' });
    expect('Deleted multi test bill', del2.status === 200);

    // Verify deletion in MySQL
    const [mysqlAfterDel] = await pool.query('SELECT COUNT(*) AS count FROM billings WHERE id IN (?, ?)', [bill1Id, multiBillId]);
    expect('Test billings removed from MySQL', Number(mysqlAfterDel[0].count) === 0);

    console.log(`\n=== Verification Finished: ${passed}/${total} checks passed ===\n`);
    if (passed !== total) {
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

run().catch(err => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
