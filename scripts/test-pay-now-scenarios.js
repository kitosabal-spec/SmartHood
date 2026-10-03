const mysql = require('mysql2/promise');
const http = require('http');

const BASE_URL = 'http://localhost:3000';
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'san_alfonso_homes',
};

function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const req = http.request(
      url,
      { method, headers },
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

const SAMPLE_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

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

function getPreviousMonthKey(year, monthIdx) {
  const prevDate = new Date(year, monthIdx - 2, 1);
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
}

// Client-side Pay Now month status evaluation function (identical to public/js/billing.js)
function evaluateMonthStatus({ selectedYear, m, myBillings, myPayments, defaultMonthlyDues }) {
  const monthKey = `${selectedYear}-${String(m).padStart(2, '0')}`;
  const matchingBill = myBillings.find(b =>
    b.monthly_dues_month === monthKey || parseMonthFromTitle(b.title) === monthKey
  );

  const approvedPayments = myPayments.filter(p =>
    p.status === 'approved' &&
    (p.monthly_dues_month === monthKey || (matchingBill && p.billingId === matchingBill.id))
  );
  const paidPayment = approvedPayments[approvedPayments.length - 1] || null;

  const pendingPayment = myPayments.find(p =>
    p.status === 'pending' &&
    (p.monthly_dues_month === monthKey || (matchingBill && p.billingId === matchingBill.id))
  );

  const rejectedPayment = myPayments.find(p =>
    p.status === 'rejected' &&
    (p.monthly_dues_month === monthKey || (matchingBill && p.billingId === matchingBill.id))
  );

  const totalPaid = approvedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const originalAmount = Number(matchingBill?.amount || defaultMonthlyDues);
  const remainingBalance = Math.max(0, Math.round((originalAmount - totalPaid) * 100) / 100);

  if ((matchingBill && remainingBalance === 0 && originalAmount > 0) || (!matchingBill && paidPayment)) {
    return { status: 'paid', matchingBill, paidPayment, amount: 0, totalPaid, remainingBalance };
  } else if (pendingPayment) {
    return { status: 'pending', matchingBill, pendingPayment, amount: remainingBalance, totalPaid, remainingBalance };
  } else if (matchingBill && totalPaid > 0) {
    return { status: 'partially_paid', matchingBill, paidPayment, rejectedPayment, amount: remainingBalance, totalPaid, remainingBalance };
  } else if (matchingBill) {
    return { status: 'pay_now', matchingBill, rejectedPayment, amount: remainingBalance, totalPaid, remainingBalance };
  } else {
    // Unbilled month: payable if preceding month is paid
    const prevMonthKey = getPreviousMonthKey(selectedYear, m);
    const previousBill = myBillings.find(b => b.monthly_dues_month === prevMonthKey || parseMonthFromTitle(b.title) === prevMonthKey);
    const previousApproved = previousBill
      ? myPayments.filter(p => p.billingId === previousBill.id && p.status === 'approved').reduce((sum, p) => sum + Number(p.amount || 0), 0)
      : 0;
    const prevMonthPaid = previousBill
      ? previousApproved >= Number(previousBill.amount || 0)
      : myPayments.some(p => p.status === 'approved' && !p.billingId && p.monthly_dues_month === prevMonthKey);

    if (prevMonthPaid) {
      return { status: 'pay_now', isAdvanceUnbilled: true, amount: defaultMonthlyDues };
    }
    return { status: 'not_billed', amount: null };
  }
}

async function runPayNowTests() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('   SMARTHOOD RESIDENT PAY NOW REDESIGN & SYNC COMPREHENSIVE TESTS    ');
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

  console.log('[Unit scenarios] Verifying partial-payment month status calculations...');
  const partialBill = { id: 'b_partial_unit', title: 'Monthly Dues - October 2026', monthly_dues_month: '2026-10', amount: 1000 };
  const pendingEval = evaluateMonthStatus({ selectedYear: 2026, m: 10, myBillings: [partialBill], myPayments: [
    { id: 'p_pending', billingId: partialBill.id, monthly_dues_month: '2026-10', status: 'pending', amount: 500 },
  ], defaultMonthlyDues: 1000 });
  assert(pendingEval.status === 'pending' && pendingEval.remainingBalance === 1000, 'Pending ₱500 leaves the approved balance at ₱1,000');

  const partialEval = evaluateMonthStatus({ selectedYear: 2026, m: 10, myBillings: [partialBill], myPayments: [
    { id: 'p_500', billingId: partialBill.id, monthly_dues_month: '2026-10', status: 'approved', amount: 500 },
    { id: 'p_rejected', billingId: partialBill.id, monthly_dues_month: '2026-10', status: 'rejected', amount: 400 },
  ], defaultMonthlyDues: 1000 });
  assert(partialEval.status === 'partially_paid' && partialEval.totalPaid === 500 && partialEval.remainingBalance === 500, 'Rejected payments are ignored and approved ₱500 shows Partially Paid');

  const almostPaidEval = evaluateMonthStatus({ selectedYear: 2026, m: 10, myBillings: [partialBill], myPayments: [
    { billingId: partialBill.id, monthly_dues_month: '2026-10', status: 'approved', amount: 500 },
    { billingId: partialBill.id, monthly_dues_month: '2026-10', status: 'approved', amount: 300 },
  ], defaultMonthlyDues: 1000 });
  assert(almostPaidEval.status === 'partially_paid' && almostPaidEval.remainingBalance === 200, 'Approved ₱500 + ₱300 leaves ₱200');

  const paidEval = evaluateMonthStatus({ selectedYear: 2026, m: 10, myBillings: [partialBill], myPayments: [
    { billingId: partialBill.id, monthly_dues_month: '2026-10', status: 'approved', amount: 500 },
    { billingId: partialBill.id, monthly_dues_month: '2026-10', status: 'approved', amount: 300 },
    { billingId: partialBill.id, monthly_dues_month: '2026-10', status: 'approved', amount: 200 },
  ], defaultMonthlyDues: 1000 });
  assert(paidEval.status === 'paid' && paidEval.totalPaid === 1000 && paidEval.remainingBalance === 0, 'Approved payments totaling ₱1,000 mark the billing Paid');

  const pool = mysql.createPool({ ...dbConfig, waitForConnections: true, connectionLimit: 3 });

  try {
    // 1. Authenticate Admin and Homeowner
    console.log('[Setup] Authenticating test accounts...');
    const adminRes = await makeRequest('POST', '/api/login', { 'Content-Type': 'application/json' }, {
      username: 'admin',
      password: 'admin123',
    });
    assert(adminRes.status === 200 && adminRes.body.role === 'admin', 'Admin authenticated');
    const adminId = adminRes.body.id;

    // Use test homeowner u002 (Juan Dela Cruz) or keith
    const hoRes = await makeRequest('POST', '/api/login', { 'Content-Type': 'application/json' }, {
      username: 'keith',
      password: 'keith123',
    });
    assert(hoRes.status === 200, 'Homeowner (Keith) authenticated');
    const hoId = hoRes.body.id;

    // Clean up any test artifacts for 2026-10 and 2026-11
    await pool.query('DELETE FROM payments WHERE homeownerId = ? AND monthly_dues_month IN ("2026-10", "2026-11", "2026-12", "2027-01")', [hoId]);
    await pool.query('DELETE FROM billings WHERE monthly_dues_month IN ("2026-10", "2026-11", "2026-12", "2027-01")');

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario A: Billing does not exist for October (and September is not paid)
    // Result: October -> Not Billed Yet
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Scenario A] Billing does not exist for October...');
    const evalA = evaluateMonthStatus({
      selectedYear: 2026,
      m: 10,
      myBillings: [],
      myPayments: [],
      defaultMonthlyDues: 1850,
    });
    assert(evalA.status === 'not_billed', 'Scenario A: October status is "not_billed" when no billing exists');
    assert(evalA.amount === null, 'Scenario A: October amount is null/unbilled');

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario B: October billing exists and is unpaid
    // Result: October -> Pay Now
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Scenario B] Admin creates October 2026 billing (₱500)...');
    const billOctPayload = {
      title: 'Monthly Association Dues - October 2026',
      amount: 500.00,
      dueDate: '2026-10-31',
      description: 'October 2026 HOA Dues',
      assignedTo: [hoId],
      status: 'active',
      createdAt: '2026-10-01',
      monthly_dues_month: '2026-10',
    };
    const createOctRes = await makeRequest('POST', '/api/billings', {
      'Content-Type': 'application/json',
      'X-User-Id': adminId,
    }, billOctPayload);
    assert(createOctRes.status === 201 || createOctRes.status === 200, 'October billing created by admin');
    const octBillingId = createOctRes.body.id;

    // Fetch data for homeowner
    const dataHo1 = await makeRequest('GET', '/api/data', { 'X-User-Id': hoId });
    const hoBills1 = (dataHo1.body.billings || []).filter(b => (b.assignedTo || []).includes(hoId));
    const hoPayments1 = (dataHo1.body.payments || []).filter(p => p.homeownerId === hoId);

    const evalB = evaluateMonthStatus({
      selectedYear: 2026,
      m: 10,
      myBillings: hoBills1,
      myPayments: hoPayments1,
      defaultMonthlyDues: 1850,
    });
    assert(evalB.status === 'pay_now', 'Scenario B: October status is "pay_now"');
    assert(evalB.amount === 500, 'Scenario B: October amount matches exact billing amount (₱500)');

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario C: October payment is submitted
    // Result: October -> Pending, duplicate submission blocked
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Scenario C] Homeowner submits payment proof for October billing...');
    const octRefNum = 'GCH-OCT-' + Date.now().toString(36);
    const octMultipart = createMultipartFormData(
      {
        billingId: octBillingId,
        refNum: octRefNum,
        payment_date: '2026-10-05',
        payment_method: 'GCash',
        amount: '500.00',
        remarks: 'Payment for October 2026 dues',
      },
      [{ fieldname: 'receipt', filename: 'oct_receipt.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
    );
    const submitOctRes = await makeRequest(
      'POST',
      '/api/payments/submit',
      { ...octMultipart.headers, 'X-User-Id': hoId },
      octMultipart.buffer
    );
    assert(submitOctRes.status === 201, 'Scenario C: Payment submitted successfully (HTTP 201)');
    assert(submitOctRes.body.payment.status === 'pending', 'Scenario C: Payment recorded with status "pending"');
    assert(submitOctRes.body.payment.billingId === octBillingId, 'Scenario C: Payment links to October billing');
    const octPaymentId = submitOctRes.body.payment.id;

    // Verify duplicate payment blocked
    const dupMultipart = createMultipartFormData(
      {
        billingId: octBillingId,
        refNum: 'GCH-OCT-DUP-' + Date.now().toString(36),
        payment_date: '2026-10-06',
        payment_method: 'GCash',
        amount: '500.00',
      },
      [{ fieldname: 'receipt', filename: 'receipt.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
    );
    const dupRes = await makeRequest('POST', '/api/payments/submit', { ...dupMultipart.headers, 'X-User-Id': hoId }, dupMultipart.buffer);
    assert(dupRes.status === 400, 'Scenario C: Backend blocks duplicate payment submission while pending');

    // Verify status in Pay Now evaluation
    const dataHo2 = await makeRequest('GET', '/api/data', { 'X-User-Id': hoId });
    const hoBills2 = (dataHo2.body.billings || []).filter(b => (b.assignedTo || []).includes(hoId));
    const hoPayments2 = (dataHo2.body.payments || []).filter(p => p.homeownerId === hoId);
    const evalC = evaluateMonthStatus({
      selectedYear: 2026,
      m: 10,
      myBillings: hoBills2,
      myPayments: hoPayments2,
      defaultMonthlyDues: 1850,
    });
    assert(evalC.status === 'pending', 'Scenario C: Pay Now view shows October as "pending"');

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario E: October payment is rejected
    // Result: October -> Pay Now again with rejection notice
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Scenario E] Admin rejects October payment with reason...');
    const rejectRes = await makeRequest('POST', `/api/payments/${octPaymentId}/reject`, {
      'Content-Type': 'application/json',
      'X-User-Id': adminId,
    }, { rejection_reason: 'Blurry GCash receipt image.' });
    assert(rejectRes.status === 200, 'Admin rejected payment');

    const dataHo3 = await makeRequest('GET', '/api/data', { 'X-User-Id': hoId });
    const hoBills3 = (dataHo3.body.billings || []).filter(b => (b.assignedTo || []).includes(hoId));
    const hoPayments3 = (dataHo3.body.payments || []).filter(p => p.homeownerId === hoId);
    const evalE = evaluateMonthStatus({
      selectedYear: 2026,
      m: 10,
      myBillings: hoBills3,
      myPayments: hoPayments3,
      defaultMonthlyDues: 1850,
    });
    assert(evalE.status === 'pay_now', 'Scenario E: October reverts to "pay_now" after rejection');
    assert(evalE.rejectedPayment && evalE.rejectedPayment.rejection_reason === 'Blurry GCash receipt image.', 'Scenario E: Rejection reason is captured');

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario D: October payment is resubmitted and approved
    // Result: October -> Paid
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Scenario D] Homeowner resubmits October payment and Admin approves...');
    const octRefNumNew = 'GCH-OCT-CORRECTED-' + Date.now().toString(36);
    const octCorrectedMultipart = createMultipartFormData(
      {
        billingId: octBillingId,
        refNum: octRefNumNew,
        payment_date: '2026-10-07',
        payment_method: 'GCash',
        amount: '500.00',
        remarks: 'Resubmitted with clear screenshot',
      },
      [{ fieldname: 'receipt', filename: 'clear_receipt.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
    );
    const resubmitRes = await makeRequest(
      'POST',
      '/api/payments/submit',
      { ...octCorrectedMultipart.headers, 'X-User-Id': hoId },
      octCorrectedMultipart.buffer
    );
    assert(resubmitRes.status === 201, 'Payment resubmitted');
    const newOctPaymentId = resubmitRes.body.payment.id;

    const approveRes = await makeRequest('POST', `/api/payments/${newOctPaymentId}/approve`, {
      'Content-Type': 'application/json',
      'X-User-Id': adminId,
    });
    assert(approveRes.status === 200, 'Admin approved payment');

    const dataHo4 = await makeRequest('GET', '/api/data', { 'X-User-Id': hoId });
    const hoBills4 = (dataHo4.body.billings || []).filter(b => (b.assignedTo || []).includes(hoId));
    const hoPayments4 = (dataHo4.body.payments || []).filter(p => p.homeownerId === hoId);
    const evalD = evaluateMonthStatus({
      selectedYear: 2026,
      m: 10,
      myBillings: hoBills4,
      myPayments: hoPayments4,
      defaultMonthlyDues: 1850,
    });
    assert(evalD.status === 'paid', 'Scenario D: October status is "paid" after admin approval');

    // ──────────────────────────────────────────────────────────────────────────
    // User Special Rule: October is paid -> November (even without admin billing) is payable!
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[User Rule] Preceding month (October) is Paid -> Next month (November) becomes payable even without admin bill...');
    const evalNovAdvance = evaluateMonthStatus({
      selectedYear: 2026,
      m: 11, // November 2026
      myBillings: hoBills4, // No billing for November yet
      myPayments: hoPayments4, // October is approved
      defaultMonthlyDues: 1850,
    });
    assert(evalNovAdvance.status === 'pay_now', 'User Rule: November is "pay_now" because October was paid');
    assert(evalNovAdvance.isAdvanceUnbilled === true, 'User Rule: Correctly identified as advance unbilled month');

    // But December (since November is not paid) is NOT billed yet
    const evalDec = evaluateMonthStatus({
      selectedYear: 2026,
      m: 12,
      myBillings: hoBills4,
      myPayments: hoPayments4,
      defaultMonthlyDues: 1850,
    });
    assert(evalDec.status === 'not_billed', 'User Rule: December remains "not_billed" because November is not paid');

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario G: November billing exists even though October is unpaid
    // Result: Both can show Pay Now independently (not forced to pay sequentially)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Scenario G] Independent payable months without sequential forcing...');
    const simulatedBills = [
      { id: 'b-oct', title: 'Monthly Dues - October 2026', amount: 500, monthly_dues_month: '2026-10', assignedTo: [hoId] },
      { id: 'b-nov', title: 'Monthly Dues - November 2026', amount: 500, monthly_dues_month: '2026-11', assignedTo: [hoId] },
    ];
    const evalOctG = evaluateMonthStatus({ selectedYear: 2026, m: 10, myBillings: simulatedBills, myPayments: [], defaultMonthlyDues: 500 });
    const evalNovG = evaluateMonthStatus({ selectedYear: 2026, m: 11, myBillings: simulatedBills, myPayments: [], defaultMonthlyDues: 500 });
    assert(evalOctG.status === 'pay_now' && evalNovG.status === 'pay_now', 'Scenario G: Both October and November show "pay_now" independently');

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario H: Resident pays November in advance -> Auto billing does NOT duplicate
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Scenario H] Resident pays November in advance -> Automatic billing does not duplicate...');
    const [uRows] = await pool.query('SELECT lotArea FROM users WHERE id = ?', [hoId]);
    const [rateRows] = await pool.query('SELECT value FROM appSettings WHERE id = ?', ['duesRatePerSqm']);
    const lotAreaVal = parseFloat(uRows[0]?.lotArea || 0);
    const rateVal = parseFloat(rateRows[0]?.value || 5.725);
    const expectedDuesAmt = Math.round((lotAreaVal > 0 ? lotAreaVal * rateVal : 1500) * 100) / 100;

    const novRefNum = 'GCH-NOV-ADV-' + Date.now().toString(36);
    const novMultipart = createMultipartFormData(
      {
        monthly_dues_month: '2026-11',
        refNum: novRefNum,
        payment_date: '2026-10-15',
        payment_method: 'GCash',
        amount: expectedDuesAmt.toString(),
        remarks: 'Advance payment for November',
      },
      [{ fieldname: 'receipt', filename: 'nov_receipt.png', mimetype: 'image/png', buffer: SAMPLE_PNG_BUFFER }]
    );
    const submitNovRes = await makeRequest(
      'POST',
      '/api/payments/submit',
      { ...novMultipart.headers, 'X-User-Id': hoId },
      novMultipart.buffer
    );
    assert(submitNovRes.status === 201, 'November advance payment submitted');
    const novPaymentId = submitNovRes.body?.payment?.id;

    // Admin approves November advance payment
    const approveNov = await makeRequest('POST', `/api/payments/${novPaymentId}/approve`, {
      'Content-Type': 'application/json',
      'X-User-Id': adminId,
    });
    assert(approveNov.status === 200, 'November advance payment approved');

    // Admin generates monthly dues for November 2026
    const autoGenRes = await makeRequest('POST', '/api/billings/generate-monthly-dues', {
      'Content-Type': 'application/json',
      'X-User-Id': adminId,
    }, { month: '2026-11' });
    assert(autoGenRes.status === 200, 'Auto-generation executed');
    assert(autoGenRes.body.excludedCount > 0, 'Scenario H: Keith is excluded from November billing because already paid in advance');

    // Verify Keith did not get a duplicate billing created for November
    const [keithNovBills] = await pool.query(
      'SELECT * FROM billings WHERE monthly_dues_month = "2026-11"'
    );
    let keithBilledForNov = false;
    for (const b of keithNovBills) {
      const assigned = JSON.parse(b.assignedTo || '[]');
      if (assigned.includes(hoId)) keithBilledForNov = true;
    }
    assert(!keithBilledForNov, 'Scenario H: Verified Keith has NO duplicate billing record in MySQL for November');

    // ──────────────────────────────────────────────────────────────────────────
    // Scenario I: Year Selection & Rollover (e.g. 2027 arrival)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Scenario I] Dynamic year selection & rollover handling...');
    function getAvailableYearsTest(myBillings, myPayments, currentCalendarYear) {
      const yearsSet = new Set([currentCalendarYear]);
      myBillings.forEach(b => {
        if (b.monthly_dues_month) yearsSet.add(Number(b.monthly_dues_month.split('-')[0]));
      });
      myPayments.forEach(p => {
        if (p.monthly_dues_month) yearsSet.add(Number(p.monthly_dues_month.split('-')[0]));
      });
      return Array.from(yearsSet).sort((a, b) => b - a);
    }

    // In 2026 with 2026 payments:
    const years2026 = getAvailableYearsTest(
      [{ monthly_dues_month: '2026-10' }],
      [{ monthly_dues_month: '2026-11' }],
      2026
    );
    assert(years2026.includes(2026), 'Scenario I: 2026 is present in 2026');

    // When 2027 arrives:
    const years2027 = getAvailableYearsTest(
      [{ monthly_dues_month: '2026-10' }],
      [{ monthly_dues_month: '2026-11' }],
      2027
    );
    assert(years2027.includes(2027) && years2027.includes(2026), 'Scenario I: When 2027 arrives, both 2027 (current) and 2026 (history) are available');
    assert(years2027[0] === 2027, 'Scenario I: 2027 is sorted first as current year');

    // Clean up test data
    await pool.query('DELETE FROM payments WHERE id IN (?, ?)', [octPaymentId, novPaymentId]);
    await pool.query('DELETE FROM billings WHERE id = ?', [octBillingId]);
    await pool.query('DELETE FROM billings WHERE monthly_dues_month = "2026-11"');

    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log(`  SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

runPayNowTests();
