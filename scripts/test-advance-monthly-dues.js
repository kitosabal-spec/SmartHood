/**
 * Comprehensive Automated Verification Script for
 * Advance Monthly Dues Payment ("Pay Now") & Billing Auto-Generation Exclusion
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

function createMultipartFormData(fields, files) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const crlf = '\r\n';
  const parts = [];

  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="${key}"${crlf}${crlf}${value}${crlf}`
      )
    );
  }

  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"${crlf}Content-Type: ${file.mimetype}${crlf}${crlf}`
      )
    );
    parts.push(file.buffer);
    parts.push(Buffer.from(crlf));
  }

  parts.push(Buffer.from(`--${boundary}--${crlf}`));
  const buffer = Buffer.concat(parts);

  return {
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': buffer.length,
    },
    buffer,
  };
}

// 1x1 transparent PNG buffer
const SAMPLE_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function runAdvanceMonthlyDuesTests() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  ADVANCE MONTHLY DUES ("PAY NOW") FULL ARCHITECTURE & FLOW VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // Clean up any previous test artifacts for test months (2028-09 and 2028-10)
    const testMonth1 = '2028-09';
    const testMonth2 = '2028-10';

    // 1. Authenticate Admin and Homeowner
    console.log('[Step 1] Authenticating Admin (u001)...');
    const adminLoginRes = await makeRequest('POST', '/api/login', { 'Content-Type': 'application/json' }, {
      username: 'admin',
      password: 'admin123',
    });
    assert(adminLoginRes.status === 200 && adminLoginRes.body.role === 'admin', 'Admin login successful');
    const adminId = adminLoginRes.body.id;

    // Use test homeowner u003 (Anna Maria Reyes)
    const residentId = 'u003';
    console.log(`\n[Step 2] Using Homeowner account (${residentId}) for advance dues flow...`);

    // Clean up any existing billings/payments for 2028-09 and 2028-10 for u003
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: 'san_alfonso_homes',
    });
    await conn.query('DELETE FROM payments WHERE homeownerId = ? AND monthly_dues_month IN (?, ?)', [residentId, testMonth1, testMonth2]);
    await conn.query('DELETE FROM billings WHERE monthly_dues_month IN (?, ?)', [testMonth1, testMonth2]);

    const [uRows] = await conn.query('SELECT lotArea FROM users WHERE id = ?', [residentId]);
    const [rateRows] = await conn.query('SELECT value FROM appSettings WHERE id = ?', ['duesRatePerSqm']);
    const lotAreaVal = parseFloat(uRows[0]?.lotArea || 0);
    const rateVal = parseFloat(rateRows[0]?.value || 5.725);
    const duesAmount = Math.round((lotAreaVal > 0 ? lotAreaVal * rateVal : 1500) * 100) / 100;
    console.log(`  -> Resident lot area: ${lotAreaVal} sqm, rate: ${rateVal}/sqm, dues amount: ₱${duesAmount}`);
    await conn.end();

    // SCENARIO 1: Homeowner has no payment for 2028-09 -> Auto-generation includes homeowner
    console.log('\n[Scenario 1] Homeowner has no payment for September 2028 -> Auto-generation includes homeowner...');
    const genRes1 = await makeRequest('POST', '/api/billings/generate-monthly-dues', {
      'Content-Type': 'application/json',
      'X-User-Id': adminId,
    }, { month: testMonth1 });

    assert(genRes1.status === 200, 'Admin can generate monthly dues for September 2028');
    assert(genRes1.body.createdCount > 0, `Created ${genRes1.body.createdCount} billings`);
    assert(genRes1.body.excludedCount === 0, 'Zero homeowners excluded initially because none paid in advance');

    // Clean up that generated billing so we can test advance payment before generation
    const conn2 = await mysql.createConnection({ host: 'localhost', port: 3306, user: 'root', password: '', database: 'san_alfonso_homes' });
    await conn2.query('DELETE FROM billings WHERE monthly_dues_month = ?', [testMonth1]);
    await conn2.end();

    // SCENARIO 2: Homeowner submits advance payment for September 2028 in August (earlier date)
    console.log('\n[Scenario 2] Homeowner submits advance payment for September 2028 in August (earlier date)...');
    const refNum1 = 'ADV-GCH-' + Date.now().toString(36) + '-1';
    const advancePayMultipart = createMultipartFormData(
      {
        monthly_dues_month: testMonth1,
        refNum: refNum1,
        payment_date: '2028-08-15', // Paid in August for September dues!
        payment_method: 'GCash',
        amount: duesAmount.toString(),
        remarks: 'Advance payment for September 2028 dues',
      },
      [{ fieldname: 'receipt', filename: 'advance_receipt.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
    );

    const submitRes = await makeRequest(
      'POST',
      '/api/payments/submit',
      { ...advancePayMultipart.headers, 'X-User-Id': residentId },
      advancePayMultipart.buffer
    );

    assert(submitRes.status === 201, 'Advance monthly dues payment submitted successfully (status 201)');
    assert(submitRes.body.payment.status === 'pending', 'Payment status is "pending" (not immediately marked paid)');
    assert(submitRes.body.payment.monthly_dues_month === testMonth1, 'Stored monthly_dues_month is explicitly "2028-09"');
    assert(submitRes.body.payment.payment_date === '2028-08-15', 'Payment date remains 2028-08-15 (different from dues month)');
    const paymentId = submitRes.body.payment.id;

    // SCENARIO 3: Homeowner tries to pay September 2028 twice while pending -> Prevent duplicate
    console.log('\n[Scenario 3] Homeowner tries to pay September 2028 twice while pending -> Prevent duplicate...');
    const dupPendingMultipart = createMultipartFormData(
      {
        monthly_dues_month: testMonth1,
        refNum: 'ADV-GCH-' + Date.now().toString(36) + '-DUP',
        payment_date: '2028-08-16',
        payment_method: 'GCash',
        amount: duesAmount.toString(),
      },
      [{ fieldname: 'receipt', filename: 'receipt.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
    );
    const dupPendingRes = await makeRequest(
      'POST',
      '/api/payments/submit',
      { ...dupPendingMultipart.headers, 'X-User-Id': residentId },
      dupPendingMultipart.buffer
    );
    assert(dupPendingRes.status === 400, 'Server rejects duplicate submission while payment is pending under review (status 400)');
    assert(dupPendingRes.body.error && dupPendingRes.body.error.toLowerCase().includes('under review'), 'Clear message that payment is already under review');

    // SCENARIO 4: Auto-generation with PENDING payment -> Do NOT treat as approved/paid
    console.log('\n[Scenario 4] Auto-generation with PENDING payment -> Does NOT treat as approved/paid...');
    const genResPending = await makeRequest('POST', '/api/billings/generate-monthly-dues', {
      'Content-Type': 'application/json',
      'X-User-Id': adminId,
    }, { month: testMonth1 });

    assert(genResPending.status === 200, 'Admin can generate dues with pending payments');
    assert(genResPending.body.excludedCount === 0, 'Pending payment was NOT excluded (only approved payments are excluded)');

    // SCENARIO 5: Admin rejects payment with reason
    console.log('\n[Scenario 5] Admin rejects payment with reason...');
    const rejectRes = await makeRequest('POST', `/api/payments/${paymentId}/reject`, {
      'Content-Type': 'application/json',
      'X-User-Id': adminId,
    }, { rejection_reason: 'Reference number is unreadable on the receipt.' });

    assert(rejectRes.status === 200, 'Admin successfully rejected payment');

    // SCENARIO 6: Homeowner can submit a new payment for that month after rejection
    console.log('\n[Scenario 6] Homeowner submits a new payment for September 2028 after rejection...');
    const refNum2 = 'ADV-GCH-' + Date.now().toString(36) + '-NEW';
    const resubmitMultipart = createMultipartFormData(
      {
        monthly_dues_month: testMonth1,
        refNum: refNum2,
        payment_date: '2028-08-20',
        payment_method: 'GCash',
        amount: duesAmount.toString(),
        remarks: 'Resubmitted with clearer receipt',
      },
      [{ fieldname: 'receipt', filename: 'clean_receipt.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
    );
    const resubmitRes = await makeRequest(
      'POST',
      '/api/payments/submit',
      { ...resubmitMultipart.headers, 'X-User-Id': residentId },
      resubmitMultipart.buffer
    );
    assert(resubmitRes.status === 201, 'Homeowner successfully resubmitted payment for rejected month');
    const newPaymentId = resubmitRes.body.payment.id;

    // SCENARIO 7: Admin approves the resubmitted payment
    console.log('\n[Scenario 7] Admin approves the resubmitted advance payment...');
    const approveRes = await makeRequest('POST', `/api/payments/${newPaymentId}/approve`, {
      'Content-Type': 'application/json',
      'X-User-Id': adminId,
    }, {});
    assert(approveRes.status === 200, 'Admin approved resubmitted payment');

    // SCENARIO 8: Homeowner tries to pay September 2028 again after approval -> Prevent duplicate
    console.log('\n[Scenario 8] Homeowner tries to pay September 2028 again after approval -> Prevent duplicate...');
    const dupApprovedMultipart = createMultipartFormData(
      {
        monthly_dues_month: testMonth1,
        refNum: 'ADV-GCH-' + Date.now().toString(36) + '-AFTER',
        payment_date: '2028-08-25',
        payment_method: 'GCash',
        amount: duesAmount.toString(),
      },
      [{ fieldname: 'receipt', filename: 'receipt.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
    );
    const dupApprovedRes = await makeRequest(
      'POST',
      '/api/payments/submit',
      { ...dupApprovedMultipart.headers, 'X-User-Id': residentId },
      dupApprovedMultipart.buffer
    );
    assert(dupApprovedRes.status === 400, 'Server rejects payment for already approved month (status 400)');
    assert(dupApprovedRes.body.error && dupApprovedRes.body.error.toLowerCase().includes('already paid'), 'Clear error stating monthly dues are already paid');

    // Clean up the temporary billing generated during Step 4 so we can test the pure exclusion run
    const conn3 = await mysql.createConnection({ host: 'localhost', port: 3306, user: 'root', password: '', database: 'san_alfonso_homes' });
    await conn3.query('DELETE FROM billings WHERE monthly_dues_month = ?', [testMonth1]);
    await conn3.end();

    // SCENARIO 9: Auto-generation with APPROVED payment -> Homeowner is EXCLUDED from billing!
    console.log('\n[Scenario 9] Auto-generation with APPROVED payment -> Homeowner is EXCLUDED from billing...');
    const genResApproved = await makeRequest('POST', '/api/billings/generate-monthly-dues', {
      'Content-Type': 'application/json',
      'X-User-Id': adminId,
    }, { month: testMonth1 });

    assert(genResApproved.status === 200, 'Monthly dues auto-generation completed');
    assert(genResApproved.body.excludedCount >= 1, `At least 1 homeowner excluded (${genResApproved.body.excludedCount} excluded)`);
    const excludedResident = genResApproved.body.excludedHomeowners.find(h => h.id === residentId);
    assert(Boolean(excludedResident), `Resident ${residentId} specifically excluded because dues were already paid in advance`);

    // Verify resident does not have a billing record for 2028-09
    const allDataResident = await makeRequest('GET', '/api/data', { 'X-User-Id': residentId });
    const residentBillings = allDataResident.body.billings || [];
    const hasSep2028Billing = residentBillings.some(b => b.monthly_dues_month === testMonth1);
    assert(!hasSep2028Billing, 'Resident does NOT receive a billing record for September 2028');

    // SCENARIO 10: Admin generates September 2028 monthly dues twice -> No duplicates created
    console.log('\n[Scenario 10] Admin generates September 2028 monthly dues twice -> No duplicates created...');
    const genResTwice = await makeRequest('POST', '/api/billings/generate-monthly-dues', {
      'Content-Type': 'application/json',
      'X-User-Id': adminId,
    }, { month: testMonth1 });

    assert(genResTwice.status === 200, 'Second generation call succeeded');
    assert(genResTwice.body.createdCount === 0, 'Zero new billings created on duplicate run (duplicate prevention active)');

    // SCENARIO 11: Admin generates October 2028 after September was paid -> October generated normally
    console.log('\n[Scenario 11] Admin generates October 2028 after September was paid -> October generated normally...');
    const genResOct = await makeRequest('POST', '/api/billings/generate-monthly-dues', {
      'Content-Type': 'application/json',
      'X-User-Id': adminId,
    }, { month: testMonth2 });

    assert(genResOct.status === 200, 'October 2028 generation succeeded');
    assert(genResOct.body.createdCount > 0, `Created ${genResOct.body.createdCount} billings for October 2028`);
    const allDataResidentOct = await makeRequest('GET', '/api/data', { 'X-User-Id': residentId });
    const hasOct2028Billing = (allDataResidentOct.body.billings || []).some(b => b.monthly_dues_month === testMonth2);
    assert(hasOct2028Billing, `Resident ${residentId} receives their normal October 2028 billing`);

    // SCENARIO 12: Manual billing creation for an already approved month is rejected
    console.log('\n[Scenario 12] Manual billing creation for an already approved month is rejected...');
    const manualDupBill = {
      title: 'Manual Dues - September 2028',
      monthly_dues_month: testMonth1,
      amount: 1500,
      dueDate: '2028-09-30',
      description: 'Test duplicate manual bill',
      assignedTo: [residentId],
      status: 'active',
      createdAt: '2028-08-01',
    };
    const manualDupRes = await makeRequest('POST', '/api/billings', {
      'Content-Type': 'application/json',
      'X-User-Id': adminId,
    }, manualDupBill);
    assert(manualDupRes.status === 400, 'Server rejects manual monthly billing for already paid homeowner (status 400)');
    assert(manualDupRes.body.error && manualDupRes.body.error.toLowerCase().includes('already paid'), 'Server returned clear message that homeowner has already paid');

    // SCENARIO 13: Audit log records advance payment submission, approval, and exclusion
    console.log('\n[Scenario 13] Verifying Audit Logs & Notifications...');
    const allDataAdmin = await makeRequest('GET', '/api/data', { 'X-User-Id': adminId });
    const auditLogs = allDataAdmin.body.auditLog || [];
    const hasAdvanceSubmitLog = auditLogs.some(l => l.action && l.action.toLowerCase().includes('advance payment'));
    const hasExclusionLog = auditLogs.some(l => l.action && l.action.toLowerCase().includes('excluded'));
    assert(hasAdvanceSubmitLog, 'Audit log recorded advance payment submission');
    assert(hasExclusionLog, 'Audit log recorded billing generation exclusion for already-paid homeowner');

    // SCENARIO 14: Non-monthly manual billing continues working normally
    console.log('\n[Scenario 14] Non-monthly manual billing continues working normally...');
    const nonMonthlyBill = {
      title: 'Special Tree Trimming Project 2028',
      amount: 450,
      dueDate: '2028-11-30',
      description: 'Tree trimming fee',
      assignedTo: [residentId],
      status: 'active',
      createdAt: '2028-08-01',
    };
    const nonMonthlyRes = await makeRequest('POST', '/api/billings', {
      'Content-Type': 'application/json',
      'X-User-Id': adminId,
    }, nonMonthlyBill);
    assert(nonMonthlyRes.status === 201, 'Non-monthly billing created without restriction');

    // Clean up test data
    console.log('\n[Cleanup] Cleaning up test records for 2028-09 and 2028-10...');
    const conn4 = await mysql.createConnection({ host: 'localhost', port: 3306, user: 'root', password: '', database: 'san_alfonso_homes' });
    await conn4.query('DELETE FROM payments WHERE homeownerId = ? AND monthly_dues_month IN (?, ?)', [residentId, testMonth1, testMonth2]);
    await conn4.query('DELETE FROM billings WHERE monthly_dues_month IN (?, ?)', [testMonth1, testMonth2]);
    if (nonMonthlyRes.body?.id) {
      await conn4.query('DELETE FROM billings WHERE id = ?', [nonMonthlyRes.body.id]);
    }
    await conn4.end();
    console.log('  ✓ Test records cleaned up successfully.');

    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('═══════════════════════════════════════════════════════════════════════');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runAdvanceMonthlyDuesTests();
