const mysql = require('mysql2/promise');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3101';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD before running this integration test.');
  process.exit(2);
}

let cookie = '';
const created = { homeowners: [], users: [], billings: [] };
let passed = 0;
let failed = 0;

function expect(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
}

async function request(path, options = {}, useCookie = true) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (useCookie && cookie) headers.Cookie = cookie;
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function login(email, password) {
  const result = await request('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false);
  const setCookie = result.response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return result;
}

async function cleanup() {
  if (!cookie) return;
  for (const id of created.billings.reverse()) await request(`/api/billings/${encodeURIComponent(id)}`, { method: 'DELETE' });
  for (const id of created.users.reverse()) await request(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  for (const id of created.homeowners.reverse()) await request(`/api/homeowners/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

(async () => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const homeownerId = `test-ho-${stamp}`;
  const secondHomeownerId = `test-ho-duplicate-${stamp}`;
  const billingId = `test-billing-${stamp}`;
  const email = `separation-${stamp}@example.com`;
  const initialPassword = `Initial-${stamp}!`;
  const resetPassword = `Reset-${stamp}-Password!`;

  try {
    const adminLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect('Admin login succeeds', adminLogin.response.status === 200 && adminLogin.data.role === 'admin');

    const createHomeowner = await request('/api/homeowners', {
      method: 'POST',
      body: JSON.stringify({
        id: homeownerId,
        name: 'Account Separation Test',
        block: 'Block 99',
        lot: 'Lot 98',
        lotArea: 123.5,
        balance: 0,
      }),
    });
    created.homeowners.push(homeownerId);
    expect('Admin can add homeowner without credentials', createHomeowner.response.status === 201);
    expect('Homeowner creation response exposes no password', !Object.hasOwn(createHomeowner.data, 'password'));

    let dataResult = await request('/api/data');
    let homeowner = dataResult.data.homeowners?.find(item => item.id === homeownerId);
    expect('New homeowner appears as No Account', homeowner?.accountStatus === 'No Account');

    const createBilling = await request('/api/billings', {
      method: 'POST',
      body: JSON.stringify({
        id: billingId,
        title: 'Account Separation Test Billing',
        amount: 250,
        dueDate: '2099-12-31',
        assignedTo: [homeownerId],
        status: 'active',
        billing_type: 'Other Billing',
      }),
    });
    created.billings.push(billingId);
    expect('No-account homeowner can receive billing', createBilling.response.status === 201);

    const register = await request(`/api/homeowners/${encodeURIComponent(homeownerId)}/account`, {
      method: 'POST',
      body: JSON.stringify({ email, mobile: '09171234567', password: initialPassword }),
    });
    if (register.data.id) created.users.push(register.data.id);
    expect('Existing homeowner account registration succeeds', register.response.status === 201);
    expect('Registration response exposes no password or hash', !Object.hasOwn(register.data, 'password') && !Object.hasOwn(register.data, 'password_hash'));

    dataResult = await request('/api/data');
    homeowner = dataResult.data.homeowners?.find(item => item.id === homeownerId);
    expect('Account status becomes Registered', homeowner?.accountStatus === 'Registered');
    expect('Registration does not create a duplicate homeowner', dataResult.data.homeowners?.filter(item => item.id === homeownerId).length === 1);
    expect('Existing billing remains linked to homeowner', dataResult.data.billings?.some(item => item.id === billingId && item.assignedTo.includes(homeownerId)));

    const createSecond = await request('/api/homeowners', {
      method: 'POST',
      body: JSON.stringify({ id: secondHomeownerId, name: 'Duplicate Email Test', block: 'Block 99', lot: 'Lot 97' }),
    });
    created.homeowners.push(secondHomeownerId);
    expect('Second no-account homeowner can be added', createSecond.response.status === 201);
    const duplicate = await request(`/api/homeowners/${encodeURIComponent(secondHomeownerId)}/account`, {
      method: 'POST',
      body: JSON.stringify({ email, mobile: '09171234568', password: initialPassword }),
    });
    expect('Duplicate email registration is rejected', duplicate.response.status === 409);

    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'san_alfonso_homes',
    });
    const [rows] = await connection.execute('SELECT username, password, homeowner_id FROM users WHERE id = ?', [register.data.id]);
    await connection.end();
    expect('Homeowner username is not stored', rows[0]?.username === null);
    expect('Account links to the existing homeowner_id', rows[0]?.homeowner_id === homeownerId);
    expect('Password is stored as bcrypt and not plaintext', /^\$2[aby]?\$\d{2}\$/.test(rows[0]?.password || '') && rows[0]?.password !== initialPassword);

    const homeownerLogin = await login(email, initialPassword);
    expect('Homeowner logs in with email and password', homeownerLogin.response.status === 200 && homeownerLogin.data.homeowner_id === homeownerId);
    expect('Login response never exposes password', !Object.hasOwn(homeownerLogin.data, 'password'));
    const wrongPassword = await login(email, 'Definitely-Wrong-Password!');
    expect('Incorrect password is rejected', wrongPassword.response.status === 401);
    const blockLotLogin = await login('Block 99 Lot 98', initialPassword);
    expect('Block/Lot homeowner login is rejected', blockLotLogin.response.status === 401);
    const usernameLogin = await login(register.data.id, initialPassword);
    expect('Username/account-ID homeowner login is rejected', usernameLogin.response.status === 401);

    await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    const reset = await request(`/api/homeowners/${encodeURIComponent(homeownerId)}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password: resetPassword }),
    });
    expect('Admin can reset password without seeing the old password', reset.response.status === 200);
    const oldAfterReset = await login(email, initialPassword);
    expect('Old password is rejected after reset', oldAfterReset.response.status === 401);
    const newAfterReset = await login(email, resetPassword);
    expect('Reset password works', newAfterReset.response.status === 200);
  } catch (error) {
    failed += 1;
    console.error(error);
  } finally {
    await login(ADMIN_EMAIL, ADMIN_PASSWORD).catch(() => {});
    await cleanup().catch(error => console.error('Cleanup failed:', error.message));
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
})();
