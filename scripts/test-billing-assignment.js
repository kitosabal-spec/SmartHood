const BASE_URL = 'http://localhost:3000';

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
  const headers = { ...(options.headers || {}) };
  if (userId) headers['x-user-id'] = userId;
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runTests() {
  console.log('=== Starting Billing Assignment Bug Verification ===\n');
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

  // 1. Admin Login
  const adminLogin = await postLogin('admin', 'admin123');
  expect('Admin login successful (200)', adminLogin.status === 200 && adminLogin.data.role === 'admin');
  const adminId = adminLogin.userId;

  // 2. Homeowner 1: Keith Bernard Osabal (uMPNN7FC5)
  const ho1Login = await postLogin('keith', 'keith123');
  expect(`Homeowner 1 (keith) login successful (200)`, ho1Login.status === 200);
  const ho1Id = ho1Login.userId;
  expect(`Homeowner 1 ID is uMPNN7FC5`, ho1Id === 'uMPNN7FC5');
  expect(`Homeowner 1 has 'resident' permission`, Array.isArray(ho1Login.data.permissions) && ho1Login.data.permissions.includes('resident'));

  // 3. Homeowner 2: SAN LUIS, JOY (u002)
  const ho2Login = await postLogin('sanluisjoy', 'sah0002');
  expect(`Homeowner 2 (sanluisjoy) login successful (200)`, ho2Login.status === 200);
  const ho2Id = ho2Login.userId;
  expect(`Homeowner 2 ID is u002`, ho2Id === 'u002');
  expect(`Homeowner 2 has 'resident' permission`, Array.isArray(ho2Login.data.permissions) && ho2Login.data.permissions.includes('resident'));

  // 4. Admin creates a billing specifically assigned to Homeowner 1 (Keith)
  const testBill = {
    title: 'Special Drainage Project Fee - Unit Test',
    type: 'Special Assessment',
    amount: 1750,
    dueDate: '2026-11-30',
    description: 'Special fee assigned only to Keith Bernard Osabal',
    assignedTo: [ho1Id],
    status: 'unpaid',
    createdAt: new Date().toISOString()
  };

  const createRes = await request('/api/billings', adminId, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(testBill)
  });

  expect('Admin created billing successfully (200/201)', createRes.status === 200 || createRes.status === 201);
  const createdBillId = createRes.data?.id;
  expect('Created billing has a valid ID', !!createdBillId);

  // 5. Admin checks GET /api/billings - verify billing appears in Admin Billing Management
  const adminBillingsRes = await request('/api/billings', adminId);
  const foundInAdmin = (adminBillingsRes.data || []).find(b => b.id === createdBillId);
  expect('Billing appears in Admin Billing Management (GET /api/billings)', !!foundInAdmin);
  if (foundInAdmin) {
    const assignedIds = Array.isArray(foundInAdmin.assignedTo)
      ? foundInAdmin.assignedTo
      : (typeof foundInAdmin.assignedTo === 'string' ? JSON.parse(foundInAdmin.assignedTo) : []);
    expect('Admin view shows assignedTo containing Keith\'s ID (uMPNN7FC5)', assignedIds.includes(ho1Id));
  }

  // 6. Homeowner 1 checks GET /api/data (which powers SmartHood UI startup)
  const ho1DataRes = await request('/api/data', ho1Id);
  const ho1Billings = ho1DataRes.data?.billings || [];
  const foundInHo1Data = ho1Billings.find(b => b.id === createdBillId);
  expect('Billing appears in Homeowner 1 GET /api/data (loadAllData)', !!foundInHo1Data);

  // 7. Homeowner 1 checks GET /api/billings
  const ho1BillingsRes = await request('/api/billings', ho1Id);
  const foundInHo1Direct = (Array.isArray(ho1BillingsRes.data) ? ho1BillingsRes.data : []).find(b => b.id === createdBillId);
  expect('Billing appears in Homeowner 1 GET /api/billings', !!foundInHo1Direct);

  // 8. Homeowner 2 checks GET /api/data (must NOT see billing assigned to Keith)
  const ho2DataRes = await request('/api/data', ho2Id);
  const ho2Billings = ho2DataRes.data?.billings || [];
  const foundInHo2Data = ho2Billings.find(b => b.id === createdBillId);
  expect('Billing is correctly ISOLATED from Homeowner 2 in GET /api/data', !foundInHo2Data);

  // 9. Homeowner 2 checks GET /api/billings (must NOT see billing assigned to Keith)
  const ho2BillingsRes = await request('/api/billings', ho2Id);
  const foundInHo2Direct = (Array.isArray(ho2BillingsRes.data) ? ho2BillingsRes.data : []).find(b => b.id === createdBillId);
  expect('Billing is correctly ISOLATED from Homeowner 2 in GET /api/billings', !foundInHo2Direct);

  // 10. Clean up: Delete test billing via admin
  const deleteRes = await request(`/api/billings/${createdBillId}`, adminId, {
    method: 'DELETE'
  });
  expect('Admin deleted test billing successfully', deleteRes.status === 200);

  // 11. Confirm deletion in Homeowner 1's view
  const ho1PostDeleteRes = await request('/api/billings', ho1Id);
  const deletedInHo1 = !(Array.isArray(ho1PostDeleteRes.data) ? ho1PostDeleteRes.data : []).some(b => b.id === createdBillId);
  expect('Deleted billing is no longer returned to Homeowner 1', deletedInHo1);

  console.log(`\n=== Verification Complete: ${passed}/${total} checks passed ===\n`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed with error:', err);
  process.exit(1);
});
