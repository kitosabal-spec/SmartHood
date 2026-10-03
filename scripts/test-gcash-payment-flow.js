/**
 * Comprehensive Automated Verification Script for SmartHood GCash Payment System
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

// Fake text buffer disguised as image
const FAKE_EXE_BUFFER = Buffer.from('MZFakeExecutableOrBadDataThisIsNotAnImage12345678');

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SMARTHOOD REAL-WORLD GCASH PAYMENT SYSTEM VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

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
    // 1. Login as Admin
    console.log('[Step 1] Authenticating as Admin (u001)...');
    const adminLoginRes = await makeRequest('POST', '/api/login', { 'Content-Type': 'application/json' }, {
      username: 'admin',
      password: 'admin123',
    });
    assert(adminLoginRes.status === 200 && adminLoginRes.body.role === 'admin', 'Admin login successful');
    const adminId = adminLoginRes.body.id;

    // 2. Configure GCash Payment Settings
    console.log('\n[Step 2] Admin Configuring GCash Payment Settings...');
    const updateSettingsRes = await makeRequest(
      'PUT',
      '/api/payment-settings',
      { 'Content-Type': 'application/json', 'X-User-Id': adminId },
      {
        account_name: 'San Alfonso Homes HOA Inc.',
        account_number: '09179988776',
        instructions: '1. Open GCash.\n2. Scan QR or transfer.\n3. Save receipt.\n4. Submit proof.',
        is_active: 1,
      }
    );
    assert(updateSettingsRes.status === 200, 'Admin can update GCash settings');
    assert(updateSettingsRes.body.account_name === 'San Alfonso Homes HOA Inc.', 'Account name correctly updated in DB');
    assert(updateSettingsRes.body.account_number === '09179988776', 'GCash number correctly updated in DB');

    // 3. Admin Uploads GCash QR Code Image
    console.log('\n[Step 3] Admin Uploading GCash QR Code Image...');
    const qrMultipart = createMultipartFormData({}, [
      { fieldname: 'qr', filename: 'gcash_qr_sample.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER },
    ]);
    const uploadQrRes = await makeRequest(
      'POST',
      '/api/payment-settings/upload-qr',
      { ...qrMultipart.headers, 'X-User-Id': adminId },
      qrMultipart.buffer
    );
    assert(uploadQrRes.status === 200 && uploadQrRes.body.ok, 'QR code image uploaded successfully');
    assert(uploadQrRes.body.qr_code_path && uploadQrRes.body.qr_code_path.startsWith('/uploads/qrcodes/'), 'QR code path returned and points to /uploads/qrcodes/');

    // 4. Resident Fetches Payment Settings
    console.log('\n[Step 4] Resident Fetching GCash Payment Settings...');
    const residentId = 'u002'; // sanluisjoy
    const getSettingsRes = await makeRequest('GET', '/api/payment-settings', { 'X-User-Id': residentId });
    assert(getSettingsRes.status === 200, 'Resident can fetch GCash settings');
    assert(getSettingsRes.body.account_number === '09179988776', 'Resident receives configured GCash mobile number');
    assert(Boolean(getSettingsRes.body.qr_code_path), 'Resident receives configured QR code path');

    // 5. Ensure Resident has an active Billing
    console.log('\n[Step 5] Ensuring Billing Record exists for Resident...');
    const billId = 'b_test_' + Date.now().toString(36);
    const testBill = {
      id: billId,
      title: 'October 2026 Association Dues',
      amount: 1000,
      dueDate: '2026-10-31',
      description: 'Monthly dues test',
      assignedTo: [residentId],
      status: 'active',
      createdAt: '2026-09-23',
      billing_type: 'Other Billing',
    };
    const createBillRes = await makeRequest(
      'POST',
      '/api/billings',
      { 'Content-Type': 'application/json', 'X-User-Id': adminId },
      testBill
    );
    assert(createBillRes.status === 201, 'Test billing created for resident');

    // 6. Security Validation: Disguised File / Bad Magic Bytes Rejected
    console.log('\n[Step 6] Testing Security: Disguised executable / non-image file upload...');
    const badFileMultipart = createMultipartFormData(
      {
        billingId: billId,
        refNum: 'GCASH-12345678901',
        payment_date: '2026-09-23',
        amount: '500',
      },
      [{ fieldname: 'receipt', filename: 'virus.png', mimetype: 'image/png', buffer: FAKE_EXE_BUFFER }]
    );
    const badFileRes = await makeRequest(
      'POST',
      '/api/payments/submit',
      { ...badFileMultipart.headers, 'X-User-Id': residentId },
      badFileMultipart.buffer
    );
    assert(badFileRes.status === 400, 'Server rejects invalid/disguised file with 400 Bad Request');

    // 7. Security Validation: Overpayment Rejected
    console.log('\n[Step 7] Testing Security: Payment above remaining balance rejected...');
    const tamperedAmountMultipart = createMultipartFormData(
      {
        billingId: billId,
        refNum: 'GCASH-12345678902',
        payment_date: '2026-09-23',
        amount: '1000.01',
      },
      [{ fieldname: 'receipt', filename: 'receipt.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
    );
    const tamperedRes = await makeRequest(
      'POST',
      '/api/payments/submit',
      { ...tamperedAmountMultipart.headers, 'X-User-Id': residentId },
      tamperedAmountMultipart.buffer
    );
    assert(tamperedRes.status === 400, 'Server rejects payment greater than the remaining balance');

    for (const invalidAmount of ['0', '-1']) {
      const invalidMultipart = createMultipartFormData(
        { billingId: billId, refNum: `INVALID-${invalidAmount}-${Date.now()}`, payment_date: '2026-09-23', amount: invalidAmount },
        [{ fieldname: 'receipt', filename: 'receipt.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
      );
      const invalidRes = await makeRequest('POST', '/api/payments/submit', { ...invalidMultipart.headers, 'X-User-Id': residentId }, invalidMultipart.buffer);
      assert(invalidRes.status === 400, `Server rejects ${invalidAmount} payment amount`);
    }

    // 8. Resident Submits Valid Payment Proof
    console.log('\n[Step 8] Resident Submitting Valid Payment Proof...');
    const uniqueRef = 'GCH-' + Date.now() + '-999';
    const validMultipart = createMultipartFormData(
      {
        billingId: billId,
        refNum: uniqueRef,
        payment_date: '2026-09-23',
        amount: '500',
        remarks: 'Paid via GCash app',
      },
      [{ fieldname: 'receipt', filename: 'gcash_receipt.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
    );
    const submitRes = await makeRequest(
      'POST',
      '/api/payments/submit',
      { ...validMultipart.headers, 'X-User-Id': residentId },
      validMultipart.buffer
    );
    assert(submitRes.status === 201 && submitRes.body.ok, 'Payment successfully submitted');
    const paymentId = submitRes.body.payment.id;
    assert(submitRes.body.payment.status === 'pending', 'Payment status is "pending" (not automatically marked paid)');
    assert(submitRes.body.payment.refNum === uniqueRef, 'GCash reference number saved correctly');
    let balanceData = await makeRequest('GET', '/api/data', { 'X-User-Id': residentId });
    let approvedTotal = balanceData.body.payments
      .filter(p => p.billingId === billId && p.status === 'approved')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    assert(approvedTotal === 0, 'Pending ₱500 payment does not reduce the ₱1,000 remaining balance');

    // 9. Security Validation: Duplicate Reference Number Protection
    console.log('\n[Step 9] Testing Duplicate GCash Reference Number Protection...');
    const dupMultipart = createMultipartFormData(
      {
        billingId: billId,
        refNum: uniqueRef, // Same reference number!
        payment_date: '2026-09-23',
        amount: '500',
      },
      [{ fieldname: 'receipt', filename: 'receipt.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
    );
    const dupRes = await makeRequest(
      'POST',
      '/api/payments/submit',
      { ...dupMultipart.headers, 'X-User-Id': residentId },
      dupMultipart.buffer
    );
    assert(dupRes.status === 400, 'Server rejects duplicate GCash reference number');
    assert(
      dupRes.body.error && dupRes.body.error.toLowerCase().includes('already been submitted'),
      'Clear error message explaining reference number was already submitted'
    );

    const secondPendingMultipart = createMultipartFormData(
      { billingId: billId, refNum: `SECOND-PENDING-${Date.now()}`, payment_date: '2026-09-23', amount: '100' },
      [{ fieldname: 'receipt', filename: 'receipt.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
    );
    const secondPendingRes = await makeRequest('POST', '/api/payments/submit', { ...secondPendingMultipart.headers, 'X-User-Id': residentId }, secondPendingMultipart.buffer);
    assert([400, 409].includes(secondPendingRes.status), 'Server prevents a second pending submission for the same billing');

    // 10. Admin Payment Rejection Validation (Reason Required)
    console.log('\n[Step 10] Testing Admin Rejection Validation...');
    const rejectNoReasonRes = await makeRequest(
      'POST',
      `/api/payments/${paymentId}/reject`,
      { 'Content-Type': 'application/json', 'X-User-Id': adminId },
      { rejection_reason: '' }
    );
    assert(rejectNoReasonRes.status === 400, 'Rejection without reason is rejected with 400');

    // 11. Admin Rejection with Reason
    console.log('\n[Step 11] Admin Rejecting Payment with Valid Reason...');
    const rejectValidRes = await makeRequest(
      'POST',
      `/api/payments/${paymentId}/reject`,
      { 'Content-Type': 'application/json', 'X-User-Id': adminId },
      { rejection_reason: 'Receipt is unclear: Reference digits cannot be verified' }
    );
    assert(rejectValidRes.status === 200 && rejectValidRes.body.ok, 'Payment rejected with reason provided');

    // Verify rejection in DB
    const allDataResident = await makeRequest('GET', '/api/data', { 'X-User-Id': residentId });
    const rejectedPayment = allDataResident.body.payments.find((p) => p.id === paymentId);
    assert(rejectedPayment && rejectedPayment.status === 'rejected', 'Payment status updated to "rejected" in DB');
    assert(
      rejectedPayment.rejection_reason && rejectedPayment.rejection_reason.includes('Receipt is unclear'),
      'Rejection reason stored and accessible to resident'
    );
    approvedTotal = allDataResident.body.payments
      .filter(p => p.billingId === billId && p.status === 'approved')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    assert(approvedTotal === 0, 'Rejected payment does not reduce the remaining balance');

    // 12. Resident Resubmits Payment for the Rejected Bill
    console.log('\n[Step 12] Resident Resubmitting Payment for Rejected Bill...');
    const newRef = 'GCH-' + Date.now() + '-NEW';
    const resubmitMultipart = createMultipartFormData(
      {
        billingId: billId,
        refNum: newRef,
        payment_date: '2026-09-23',
        amount: '500',
        remarks: 'Clearer screenshot re-uploaded',
      },
      [{ fieldname: 'receipt', filename: 'clear_receipt.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
    );
    const resubmitRes = await makeRequest(
      'POST',
      '/api/payments/submit',
      { ...resubmitMultipart.headers, 'X-User-Id': residentId },
      resubmitMultipart.buffer
    );
    assert(resubmitRes.status === 201 && resubmitRes.body.ok, 'Resident successfully resubmitted payment');
    const newPaymentId = resubmitRes.body.payment.id;

    // 13. Admin Approves Payment
    console.log('\n[Step 13] Admin Approving Payment...');
    const approveRes = await makeRequest(
      'POST',
      `/api/payments/${newPaymentId}/approve`,
      { 'Content-Type': 'application/json', 'X-User-Id': adminId },
      {}
    );
    assert(approveRes.status === 200 && approveRes.body.ok, 'Payment approved by admin');
    assert(approveRes.body.billingSummary?.totalPaid === 500, 'Approved ₱500 produces Total Paid of ₱500');
    assert(approveRes.body.billingSummary?.remainingBalance === 500, 'Approved ₱500 leaves ₱500 remaining');
    assert(approveRes.body.billingSummary?.status === 'partially_paid', 'Billing becomes Partially Paid after first approval');

    async function submitAndApprovePartial(amountValue, suffix) {
      const multipart = createMultipartFormData(
        { billingId: billId, refNum: `GCH-${Date.now()}-${suffix}`, payment_date: '2026-09-24', amount: String(amountValue) },
        [{ fieldname: 'receipt', filename: `partial-${suffix}.png`, mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
      );
      const submitted = await makeRequest('POST', '/api/payments/submit', { ...multipart.headers, 'X-User-Id': residentId }, multipart.buffer);
      assert(submitted.status === 201, `Homeowner submits another ₱${amountValue} partial payment`);
      const approved = await makeRequest('POST', `/api/payments/${submitted.body.payment.id}/approve`, { 'Content-Type': 'application/json', 'X-User-Id': adminId }, {});
      assert(approved.status === 200, `Admin approves ₱${amountValue} partial payment`);
      return approved.body.billingSummary;
    }

    const after300 = await submitAndApprovePartial(300, 'PARTIAL-300');
    assert(after300?.totalPaid === 800 && after300?.remainingBalance === 200 && after300?.status === 'partially_paid', '₱500 + ₱300 leaves ₱200 and remains Partially Paid');
    const after200 = await submitAndApprovePartial(200, 'PARTIAL-200');
    assert(after200?.totalPaid === 1000 && after200?.remainingBalance === 0 && after200?.status === 'paid', 'Final ₱200 settles the bill and marks it Paid');

    const legacyBillId = `b_full_${Date.now().toString(36)}`;
    const legacyBillRes = await makeRequest('POST', '/api/billings', { 'Content-Type': 'application/json', 'X-User-Id': adminId }, {
      id: legacyBillId,
      title: 'Legacy Full Payment Compatibility Test',
      amount: 400,
      dueDate: '2026-10-31',
      description: 'Full-payment compatibility test',
      assignedTo: [residentId],
      status: 'active',
      createdAt: '2026-09-23',
      billing_type: 'Other Billing',
    });
    assert(legacyBillRes.status === 201, 'Compatibility billing created');
    const legacyMultipart = createMultipartFormData(
      { billingId: legacyBillId, refNum: `GCH-${Date.now()}-FULL`, payment_date: '2026-09-25', amount: '400' },
      [{ fieldname: 'receipt', filename: 'full.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
    );
    const legacySubmit = await makeRequest('POST', '/api/payments/submit', { ...legacyMultipart.headers, 'X-User-Id': residentId }, legacyMultipart.buffer);
    const legacyApprove = await makeRequest('POST', `/api/payments/${legacySubmit.body.payment.id}/approve`, { 'Content-Type': 'application/json', 'X-User-Id': adminId }, {});
    assert(legacyApprove.body.billingSummary?.status === 'paid' && legacyApprove.body.billingSummary?.remainingBalance === 0, 'Existing one-shot full-payment behavior remains compatible');

    // 14. Verification of Audit Log and Notifications
    console.log('\n[Step 14] Verifying Audit Logs & Notifications...');
    const allDataAdmin = await makeRequest('GET', '/api/data', { 'X-User-Id': adminId });
    const auditLogs = allDataAdmin.body.auditLog || [];
    const hasApprovalLog = auditLogs.some((l) => l.action && l.action.includes('approved payment'));
    const hasRejectionLog = auditLogs.some((l) => l.action && l.action.includes('rejected payment'));
    const hasSubmissionLog = auditLogs.some((l) => l.action && l.action.includes('submitted payment'));
    assert(hasApprovalLog, 'Audit log recorded payment approval');
    assert(hasRejectionLog, 'Audit log recorded payment rejection');
    assert(hasSubmissionLog, 'Audit log recorded resident payment submission');

    const latestDataResident = await makeRequest('GET', '/api/data', { 'X-User-Id': residentId });
    const notifications = latestDataResident.body.notifications || [];
    assert(notifications.length > 0, 'Notifications created and accessible in system');

    // 15. Privacy & Access Control: Resident only sees own payments
    console.log('\n[Step 15] Verifying Privacy & Access Control (Resident only sees own payments)...');
    const residentPayments = latestDataResident.body.payments || [];
    const onlyOwnPayments = residentPayments.every((p) => p.homeownerId === residentId);
    assert(onlyOwnPayments, 'Resident data isolation: resident only receives their own payments');

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('═══════════════════════════════════════════════════════════════');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Test execution error:', error);
    process.exit(1);
  }
}

runTests();
