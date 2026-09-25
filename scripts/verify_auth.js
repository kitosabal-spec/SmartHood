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

  // 8. New Account Creation with bcrypt hash
  {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: 'san_alfonso_homes'
    });

    const testNewId = 'test_u_new_bcrypt_' + Date.now();
    try {
      // Login as admin first
      const adminLogin = await postLogin('admin', 'admin123');
      const adminId = adminLogin.data.id;

      // Attempt creating user with short password (< 12 chars)
      const resShort = await fetch(`${BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': adminId },
        body: JSON.stringify({
          id: testNewId + '_short',
          username: 'shortuser99',
          email: 'short@example.com',
          name: 'Short Pass User',
          password: 'only10char', // 10 chars
          role: 'homeowner'
        })
      });
      expect('User creation with password < 12 characters rejected (400)', resShort.status === 400);

      // Create user with valid 12+ character password
      const newPlainPass = 'SecurePass2026!';
      const resCreate = await fetch(`${BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': adminId },
        body: JSON.stringify({
          id: testNewId,
          username: 'bcryptuser01',
          email: 'bcrypt01@example.com',
          name: 'Bcrypt Test User',
          password: newPlainPass,
          role: 'homeowner',
          block: 'Block 5',
          lot: 'Lot 9'
        })
      });
      const createData = await resCreate.json().catch(() => ({}));
      expect('User creation with password >= 12 characters succeeds (201)', resCreate.status === 201);
      expect('User creation response never exposes password or hash', createData.password === undefined && createData.password_hash === undefined);

      // Check database to ensure password is stored as bcrypt hash
      const [rows] = await conn.execute('SELECT password FROM users WHERE id = ?', [testNewId]);
      const storedPass = rows[0]?.password || '';
      const isHash = storedPass.startsWith('$2') && storedPass.length === 60;
      expect('New user password in MySQL is a bcrypt hash (starts with $2, length 60)', isHash);
      expect('New user password in MySQL is NOT plain text', storedPass !== newPlainPass);

      // Test login with the newly created account
      const resNewLogin = await postLogin('bcryptuser01', newPlainPass);
      expect('Login with new bcrypt account succeeds (200)', resNewLogin.status === 200 && resNewLogin.data.username === 'bcryptuser01');
      expect('Login response never exposes password or hash', resNewLogin.data.password === undefined && resNewLogin.data.password_hash === undefined);

      // Test wrong password fails
      const resNewWrongPass = await postLogin('bcryptuser01', 'WrongPassword123!');
      expect('Login with wrong password fails (401)', resNewWrongPass.status === 401);

      // 9. Change Password Flow
      // Try wrong current password
      const resChangeWrongCurr = await fetch(`${BASE_URL}/api/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': testNewId },
        body: JSON.stringify({ currentPassword: 'IncorrectOldPass!', newPassword: 'BrandNewPass2026!' })
      });
      expect('Change password fails with incorrect current password (400)', resChangeWrongCurr.status === 400);

      // Try new password < 12 characters
      const resChangeShort = await fetch(`${BASE_URL}/api/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': testNewId },
        body: JSON.stringify({ currentPassword: newPlainPass, newPassword: 'tooshort' })
      });
      expect('Change password fails when new password < 12 characters (400)', resChangeShort.status === 400);

      // Successful password change
      const updatedPlainPass = 'UpdatedSecurePass2026!';
      const resChangeSuccess = await fetch(`${BASE_URL}/api/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': testNewId },
        body: JSON.stringify({ currentPassword: newPlainPass, newPassword: updatedPlainPass })
      });
      expect('Change password succeeds with valid current and new password (200)', resChangeSuccess.status === 200);

      // Verify old password no longer works
      const resOldPassFail = await postLogin('bcryptuser01', newPlainPass);
      expect('Old password no longer works after password change (401)', resOldPassFail.status === 401);

      // Verify new password works
      const resNewPassSuccess = await postLogin('bcryptuser01', updatedPlainPass);
      expect('New password works after password change (200)', resNewPassSuccess.status === 200);

      // Check DB contains updated bcrypt hash
      const [updatedRows] = await conn.execute('SELECT password FROM users WHERE id = ?', [testNewId]);
      const newStoredPass = updatedRows[0]?.password || '';
      expect('Updated password in MySQL is a new bcrypt hash', newStoredPass.startsWith('$2') && newStoredPass !== storedPass);

      // 10. Admin Account Editing without changing password (ensure no accidental overwrite or double-hashing)
      const resAdminEditNoPass = await fetch(`${BASE_URL}/api/users/${testNewId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': adminId },
        body: JSON.stringify({
          name: 'Bcrypt Test User Updated Name',
          contact: '09123456789'
          // Notice: password is intentionally omitted
        })
      });
      expect('Admin editing user without password succeeds (200)', resAdminEditNoPass.status === 200);

      const [afterEditRows] = await conn.execute('SELECT password, name FROM users WHERE id = ?', [testNewId]);
      expect('User password hash was NOT changed or corrupted during profile edit', afterEditRows[0]?.password === newStoredPass);
      expect('User name was successfully updated', afterEditRows[0]?.name === 'Bcrypt Test User Updated Name');

      // Verify login still works with existing password
      const resPostEditLogin = await postLogin('bcryptuser01', updatedPlainPass);
      expect('Login still works after admin profile update without password change (200)', resPostEditLogin.status === 200);

      // 11. Admin Account Editing with new password
      const adminSetPassword = 'AdminSetNewPass2026!';
      const resAdminEditWithPass = await fetch(`${BASE_URL}/api/users/${testNewId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': adminId },
        body: JSON.stringify({
          password: adminSetPassword
        })
      });
      expect('Admin updating user with new password succeeds (200)', resAdminEditWithPass.status === 200);

      const [adminPassRows] = await conn.execute('SELECT password FROM users WHERE id = ?', [testNewId]);
      const adminHashedPass = adminPassRows[0]?.password || '';
      expect('Admin-updated password is stored as bcrypt hash in DB', adminHashedPass.startsWith('$2') && adminHashedPass !== adminSetPassword);

      // Verify login with admin-set password works
      const resAdminPassLogin = await postLogin('bcryptuser01', adminSetPassword);
      expect('Login succeeds with admin-set password (200)', resAdminPassLogin.status === 200);

      // 12. Roles and Permissions check
      expect('Admin has role "admin" and full wildcard permissions', adminLogin.data.role === 'admin' && adminLogin.data.permissions.includes('*'));
      expect('Homeowner has role "homeowner" and "resident" permission', resAdminPassLogin.data.role === 'homeowner' && resAdminPassLogin.data.permissions.includes('resident'));

    } finally {
      await conn.execute('DELETE FROM users WHERE id = ?', [testNewId]);
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
