const assert = require('assert');

const BASE_URL = 'http://localhost:3000';

async function postLogin(username, password) {
  const res = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runTests() {
  console.log('--- Starting Authentication Verification Tests ---');
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

  // 1. Correct username + correct password -> Login succeeds
  {
    const res = await postLogin('admin', 'admin123');
    expect('admin / admin123 succeeds (200)', res.status === 200 && res.data.username === 'admin');
  }

  // 2. Wrong capitalization in username -> Login fails
  {
    const res1 = await postLogin('Admin', 'admin123');
    expect('Admin / admin123 fails (401)', res1.status === 401);

    const res2 = await postLogin('ADMIN', 'admin123');
    expect('ADMIN / admin123 fails (401)', res2.status === 401);

    const res3 = await postLogin('aDmin', 'admin123');
    expect('aDmin / admin123 fails (401)', res3.status === 401);
  }

  // 3. Wrong capitalization in password -> Login fails
  {
    const res1 = await postLogin('admin', 'Admin123');
    expect('admin / Admin123 fails (401)', res1.status === 401);

    const res2 = await postLogin('admin', 'ADMIN123');
    expect('admin / ADMIN123 fails (401)', res2.status === 401);
  }

  // 4. Completely wrong credentials -> Login fails
  {
    const res = await postLogin('wronguser999', 'wrongpass999');
    expect('wronguser999 / wrongpass999 fails (401)', res.status === 401);
  }

  // 5. Existing homeowner accounts continue working
  {
    const res = await postLogin('sanluisjoy', 'sah0002');
    expect('sanluisjoy / sah0002 succeeds (200)', res.status === 200 && res.data.username === 'sanluisjoy');

    const resWrongUser = await postLogin('SanLuisJoy', 'sah0002');
    expect('SanLuisJoy / sah0002 fails (401) - wrong username case', resWrongUser.status === 401);

    const resWrongPass = await postLogin('sanluisjoy', 'SAH0002');
    expect('sanluisjoy / SAH0002 fails (401) - wrong password case', resWrongPass.status === 401);
  }

  // 6. Homeowner block-lot matching case sensitivity
  {
    // sanluisjoy is Block 2, Lot 2
    const resBlockLotExact = await postLogin('Block 2 Lot 2', 'sah0002');
    expect('"Block 2 Lot 2" / sah0002 succeeds (200)', resBlockLotExact.status === 200 && resBlockLotExact.data.username === 'sanluisjoy');

    const resBlockLotLower = await postLogin('block 2 lot 2', 'sah0002');
    expect('"block 2 lot 2" / sah0002 fails (401)', resBlockLotLower.status === 401);

    const resBlockLotUpper = await postLogin('BLOCK 2 LOT 2', 'sah0002');
    expect('"BLOCK 2 LOT 2" / sah0002 fails (401)', resBlockLotUpper.status === 401);

    const resBlockLotComma = await postLogin('Block 2, Lot 2', 'sah0002');
    expect('"Block 2, Lot 2" / sah0002 succeeds (200)', resBlockLotComma.status === 200 && resBlockLotComma.data.username === 'sanluisjoy');

    const resBlockLotCommaLower = await postLogin('block 2, lot 2', 'sah0002');
    expect('"block 2, lot 2" / sah0002 fails (401)', resBlockLotCommaLower.status === 401);
  }

  // 7. Test prompt example: ABC123 vs abc123 and SmartHood123 vs smarthood123
  {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: 'san_alfonso_homes'
    });

    try {
      // Insert ABC123 and abc123 as two distinct accounts
      await conn.execute(
        'INSERT INTO users (id, username, password, role, name, email, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['test_u_upper', 'ABC123', 'SmartHood123', 'homeowner', 'Upper User', 'upper@example.com', 'active']
      );
      await conn.execute(
        'INSERT INTO users (id, username, password, role, name, email, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['test_u_lower', 'abc123', 'DifferentPass456', 'homeowner', 'Lower User', 'lower@example.com', 'active']
      );

      // Test ABC123 credentials
      const resUpperCorrect = await postLogin('ABC123', 'SmartHood123');
      expect('ABC123 / SmartHood123 succeeds (200)', resUpperCorrect.status === 200 && resUpperCorrect.data.username === 'ABC123');

      const resUpperWrongUserCase = await postLogin('abc123', 'SmartHood123');
      expect('abc123 / SmartHood123 fails (401) - wrong username capitalization', resUpperWrongUserCase.status === 401);

      const resUpperWrongPassCase = await postLogin('ABC123', 'smarthood123');
      expect('ABC123 / smarthood123 fails (401) - wrong password capitalization', resUpperWrongPassCase.status === 401);

      // Test abc123 credentials (different account)
      const resLowerCorrect = await postLogin('abc123', 'DifferentPass456');
      expect('abc123 / DifferentPass456 succeeds (200)', resLowerCorrect.status === 200 && resLowerCorrect.data.username === 'abc123');

      const resLowerWrongCase = await postLogin('ABC123', 'DifferentPass456');
      expect('ABC123 / DifferentPass456 fails (401) - wrong username capitalization for lower account', resLowerWrongCase.status === 401);

    } finally {
      await conn.execute('DELETE FROM users WHERE id IN (?, ?)', ['test_u_upper', 'test_u_lower']);
      await conn.end();
    }
  }

  console.log(`\n--- Test Results: ${passed}/${total} passed ---`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
