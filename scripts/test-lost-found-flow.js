const fs = require('fs');
const path = require('path');
const http = require('http');

async function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING LOST & FOUND END-TO-END TESTS ---');

  // 1. Resident A (u002) submits a lost item report
  console.log('\n[Test 1] Resident A (u002) submits a report...');
  const resASubmit = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/lostFound',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': 'u002',
    }
  }, {
    reportType: 'Lost',
    itemType: 'Wallet',
    itemName: 'Black Leather Wallet',
    description: 'Lost near clubhouse with ID and cards',
    location: 'Clubhouse Garden',
    eventDate: '2026-09-28',
    contactName: 'Juan Dela Cruz',
    contactNumber: '09171234567',
    status: 'Pending',
  });

  if (resASubmit.status !== 201) {
    throw new Error(`Failed to submit report. Status: ${resASubmit.status}, body: ${JSON.stringify(resASubmit.body)}`);
  }
  const reportA = resASubmit.body;
  console.log(`✓ Report created with id=${reportA.id}, status=${reportA.status}, homeownerId=${reportA.homeownerId}`);
  if (reportA.status !== 'Pending') {
    throw new Error(`Expected status to be "Pending", got "${reportA.status}"`);
  }
  if (reportA.homeownerId !== 'u002') {
    throw new Error(`Expected homeownerId to be "u002", got "${reportA.homeownerId}"`);
  }

  // 2. Test backend enforcement: Resident attempts to bypass and send status='Approved'
  console.log('\n[Test 2] Testing backend tamper-proofing (resident sends status="Approved")...');
  const resTamper = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/lostFound',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': 'u002',
    }
  }, {
    reportType: 'Found',
    itemType: 'Keys',
    itemName: 'House Keys with Red Keychain',
    description: 'Found on playground bench',
    location: 'Playground',
    eventDate: '2026-09-28',
    contactName: 'Juan Dela Cruz',
    contactNumber: '09171234567',
    status: 'Approved', // Resident maliciously tries to self-approve
  });

  const reportTamper = resTamper.body;
  console.log(`✓ Tamper attempt result: status=${reportTamper.status}`);
  if (reportTamper.status !== 'Pending') {
    throw new Error(`Backend failed to enforce "Pending" status! Status was "${reportTamper.status}"`);
  }

  // 3. Resident A reads reports (via /api/data and /api/lostFound)
  console.log('\n[Test 3] Resident A fetches reports...');
  const resAFetch = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/lostFound',
    method: 'GET',
    headers: { 'X-User-Id': 'u002' },
  });
  const resAReports = resAFetch.body;
  const resAHasOwnPending = resAReports.some(r => r.id === reportA.id);
  console.log(`✓ Resident A sees their own pending report: ${resAHasOwnPending}`);
  if (!resAHasOwnPending) {
    throw new Error('Resident A should see their own submitted pending report!');
  }

  // 4. Resident B (u003) reads reports
  console.log('\n[Test 4] Resident B (u003) fetches reports...');
  const resBFetch = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/lostFound',
    method: 'GET',
    headers: { 'X-User-Id': 'u003' },
  });
  const resBReports = resBFetch.body;
  const resBHasPending = resBReports.some(r => r.id === reportA.id || r.id === reportTamper.id);
  console.log(`✓ Resident B sees Resident A's pending reports: ${resBHasPending}`);
  if (resBHasPending) {
    throw new Error('LEAK DETECTED: Resident B should NOT see Resident A\'s pending reports!');
  }

  // 5. Unauthenticated guest reads reports
  console.log('\n[Test 5] Unauthenticated guest fetches reports...');
  const resGuestFetch = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/lostFound',
    method: 'GET',
  });
  const guestReports = resGuestFetch.body;
  const guestHasPending = guestReports.some(r => r.id === reportA.id || r.id === reportTamper.id);
  console.log(`✓ Guest sees pending reports: ${guestHasPending}`);
  if (guestHasPending) {
    throw new Error('LEAK DETECTED: Guest should NOT see pending reports!');
  }

  // 6. Admin (u001) reads reports -> sees pending reports
  console.log('\n[Test 6] Admin fetches reports...');
  const resAdminFetch = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/lostFound',
    method: 'GET',
    headers: { 'X-User-Id': 'u001' },
  });
  const adminReports = resAdminFetch.body;
  const adminHasPendingA = adminReports.some(r => r.id === reportA.id);
  console.log(`✓ Admin sees pending report: ${adminHasPendingA}`);
  if (!adminHasPendingA) {
    throw new Error('Admin should see pending reports for review!');
  }

  // 7. Admin approves report A
  console.log('\n[Test 7] Admin approves report A...');
  const resApprove = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/lostfound/${reportA.id}/approve`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': 'u001',
    },
  }, { remarks: 'Verified with security office' });

  if (resApprove.status !== 200 || !resApprove.body.ok) {
    throw new Error(`Approval failed: ${JSON.stringify(resApprove.body)}`);
  }
  console.log(`✓ Admin successfully approved report A: status=${resApprove.body.report.status}`);
  if (resApprove.body.report.status !== 'Approved') {
    throw new Error(`Expected Approved status, got ${resApprove.body.report.status}`);
  }

  // 8. Now Resident B fetches reports again -> should see report A!
  console.log('\n[Test 8] Resident B fetches reports after approval...');
  const resBAfterApprove = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/lostFound',
    method: 'GET',
    headers: { 'X-User-Id': 'u003' },
  });
  const resBHasApprovedA = resBAfterApprove.body.some(r => r.id === reportA.id && r.status === 'Approved');
  console.log(`✓ Resident B now sees the approved report: ${resBHasApprovedA}`);
  if (!resBHasApprovedA) {
    throw new Error('Resident B should see the approved report on the community board!');
  }

  // 9. Admin rejects reportTamper
  console.log('\n[Test 9] Admin rejects reportTamper...');
  const resReject = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/lostfound/${reportTamper.id}/reject`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': 'u001',
    },
  }, { reason: 'Duplicate report. Keychain was already submitted earlier.' });

  if (resReject.status !== 200 || !resReject.body.ok) {
    throw new Error(`Rejection failed: ${JSON.stringify(resReject.body)}`);
  }
  console.log(`✓ Admin successfully rejected report: status=${resReject.body.report.status}, remarks="${resReject.body.report.remarks}"`);
  if (resReject.body.report.status !== 'Rejected') {
    throw new Error(`Expected Rejected status, got ${resReject.body.report.status}`);
  }

  // 10. Check visibility of rejected report:
  // Resident B should NOT see it:
  console.log('\n[Test 10] Checking visibility of rejected report...');
  const resBCheckReject = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/lostFound',
    method: 'GET',
    headers: { 'X-User-Id': 'u003' },
  });
  const resBHasRejected = resBCheckReject.body.some(r => r.id === reportTamper.id);
  console.log(`✓ Resident B sees rejected report: ${resBHasRejected}`);
  if (resBHasRejected) {
    throw new Error('LEAK DETECTED: Resident B should NOT see another resident\'s rejected report!');
  }

  // Resident A DOES see it and sees updated status & remarks:
  const resACheckReject = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/lostFound',
    method: 'GET',
    headers: { 'X-User-Id': 'u002' },
  });
  const resAOwnRejected = resACheckReject.body.find(r => r.id === reportTamper.id);
  console.log(`✓ Resident A sees their rejected report: ${Boolean(resAOwnRejected)}, status=${resAOwnRejected?.status}, remarks="${resAOwnRejected?.remarks}"`);
  if (!resAOwnRejected || resAOwnRejected.status !== 'Rejected') {
    throw new Error('Resident A should see their rejected report with updated status!');
  }
  if (!resAOwnRejected.remarks.includes('Duplicate report')) {
    throw new Error('Resident A should see the admin rejection remarks!');
  }

  // 11. Cleanup test reports
  console.log('\n[Cleanup] Cleaning up test records...');
  await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/lostFound/${reportA.id}`,
    method: 'DELETE',
    headers: { 'X-User-Id': 'u001' },
  });
  await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/lostFound/${reportTamper.id}`,
    method: 'DELETE',
    headers: { 'X-User-Id': 'u001' },
  });
  console.log('✓ Cleanup complete.');

  console.log('\n✓ ALL BACKEND AND ACCESS CONTROL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('\n✗ Test Failed:', err);
  process.exit(1);
});
