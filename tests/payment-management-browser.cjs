'use strict';
// Real browser controls and application styles, isolated from production data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/playwright');

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.REPORT_BROWSER_EXECUTABLE ? { executablePath: process.env.REPORT_BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
      <main id="contentArea" class="content-area"></main>
      <div id="modalOverlay" class="modal-overlay hidden"><div id="modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-header"><h3 id="modalTitle"></h3></div><div id="modalBody" class="modal-body"></div><div id="modalFooter" class="modal-footer"></div></div></div></body></html>`);
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'public/css/style.css'), 'utf8').replace(/^@import[^\r\n]*[\r\n]*/m, '') });
    await page.addStyleTag({ path: path.join(root, 'public/css/billing.css') });
    const main = fs.readFileSync(path.join(root, 'public/js/main.js'), 'utf8');
    await page.addScriptTag({ content: main.slice(main.indexOf('function openModal('), main.indexOf('function closeModalOutside(')) });
    await page.addScriptTag({ content: main.slice(main.indexOf('function getBillingPaymentSummary('), main.indexOf('function getBillingCollectionStatus(')) });
    await page.addScriptTag({ path: path.join(root, 'public/js/billing.js') });
    await page.evaluate(() => {
      window.pendingPhotoFile = window.pendingPhotoPreviewUrl = null;
      window.manage = true;
      window.canManagePayments = () => manage;
      window.canViewPayments = () => true;
      window.toMoneyNumber = value => Number(value || 0);
      window.syncHomeownerBalances = window.showLoading = window.hideLoading = () => {};
      window.showToast = (...args) => { window.lastToast = args; };
      window.openConfirm = (title, message, action) => openModal(title, message, [{ label: 'Confirm', cls: 'btn-primary', action }]);
      window.cache = {
        homeowners: [{ id: 'h1', name: 'Alex Example', block: 'Block 1', lot: 'Lot 2', contact: '09123456789' }],
        users: [{ id: 'admin', name: 'HOA Administrator' }],
        billings: [
          { id: 'dues', title: 'Monthly Association Dues — November 2026', billing_type: 'Monthly Association Dues', monthly_dues_month: '2026-11' },
          { id: 'vehicle', title: 'Vehicle registration — E951BB', vehicle_registration_id: 'v1' },
          { id: 'amenity', title: 'Basketball Court reservation', amenity_booking_id: 'a1' },
          { id: 'other', title: 'Community maintenance contribution with a long billing description' },
        ].map(b => ({ amount: 229, status: 'active', assignedTo: ['h1'], ...b })),
        payments: [
          { id: 'dues-payment', billingId: 'dues', status: 'approved' },
          { id: 'vehicle-payment', billingId: 'vehicle', status: 'pending', refNum: 'VEHICLE-REF' },
          { id: 'amenity-payment', billingId: 'amenity', status: 'approved', payment_source: 'manual_admin', payment_method: 'Cash', recorded_by: 'admin' },
          { id: 'advance-payment', monthly_dues_month: '2026-12', status: 'pending' },
          ...Array.from({ length: 12 }, (_, i) => ({ id: `other-${String(i).padStart(2, '0')}`, billingId: 'other', status: i === 0 ? 'rejected' : 'approved' })),
        ].map(p => ({ homeownerId: 'h1', amount: 20, payment_method: 'GCash', payment_source: 'resident_submission',
          refNum: '100020203004567890', submittedAt: '2026-11-05', payment_date: '2026-11-01', ...p })),
      };
      window.db = { get: key => cache[key] || [], getOne: (key, id) => (cache[key] || []).find(row => row.id === id) };
      window.getHomeowners = () => cache.homeowners;
      window.getHomeownerById = id => cache.homeowners.find(h => h.id === id);
      window.api = { loadAll: async () => {}, approvePayment: async id => {
        window.approveCalls = (window.approveCalls || 0) + 1;
        await new Promise(resolve => setTimeout(resolve, 30));
        cache.payments.find(p => p.id === id).status = 'approved';
      }, rejectPayment: async (id, reason) => {
        window.rejectCalls = (window.rejectCalls || 0) + 1;
        await new Promise(resolve => setTimeout(resolve, 30));
        Object.assign(cache.payments.find(p => p.id === id), { status: 'rejected', rejection_reason: reason });
      } };
      window.beforeRecords = JSON.stringify(cache);
      renderPayments();
    });
    assert.deepEqual(await page.locator('#paymentSummary strong').allTextContents(), ['16', '2', '13']);
    assert.equal(await page.locator('#payTableBody tr').count(), 10);
    assert.equal(await page.locator('#payTableBody button').count(), 10, 'one Review action per row');
    await page.getByRole('button', { name: 'Next payment page' }).click();
    assert.equal(await page.locator('#payTableBody tr').count(), 6);
    await page.getByRole('button', { name: /^Vehicle Fees/ }).click();
    assert.match(await page.locator('#paymentPagination').innerText(), /Page 1 of 1/);
    await page.getByLabel('Payment status', { exact: true }).selectOption('pending');
    await page.getByLabel('Payment source', { exact: true }).selectOption('resident_submission');
    await page.getByLabel('Search payments').fill('VEHICLE-REF');
    await page.getByLabel('Payment date', { exact: true }).selectOption('date');
    await page.locator('#payDate').fill('2026-11-01');
    assert.match(await page.locator('#payTableBody').innerText(), /E951BB/);
    assert.deepEqual(await page.locator('#paymentSummary strong').allTextContents(), ['1', '1', '0']);
    await page.locator('#payDate').fill('2026-11-05');
    assert.match(await page.locator('#payTableBody').innerText(), /E951BB/, 'submission dates still match');
    await page.getByLabel('Payment date', { exact: true }).selectOption('range');
    await page.locator('#payStartDate').fill('2026-11-05');
    await page.locator('#payEndDate').fill('2026-11-01');
    assert.match(await page.locator('#payTableBody').innerText(), /E951BB/, 'reversed date range includes both boundary dates');
    await page.getByLabel('Payment source', { exact: true }).selectOption('manual_admin');
    assert.match(await page.locator('#payTableBody').innerText(), /No payments found/);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByRole('button', { name: /^Monthly Association Dues/ }).click();
    assert.equal(await page.locator('#payTableBody tr').count(), 2);
    assert.match(await page.locator('#payTableBody').innerText(), /Advance/);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByLabel('Payments per page').selectOption('25');
    assert.equal(await page.locator('#payTableBody tr').count(), 16);
    assert.equal(await page.evaluate(() => JSON.stringify(cache) === beforeRecords), true);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
      for (const width of [1280, 900, 768, 375, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const layout = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth,
          cards: [...document.querySelectorAll('#paymentSummary > div')].map(el => el.getBoundingClientRect().y) }));
        assert.ok(layout.scroll <= layout.viewport + 1, `${theme} ${width}px overflow: ${JSON.stringify(layout)}`);
        assert.equal(new Set(layout.cards).size, 1);
        await page.screenshot({ animations: 'disabled', path: path.join(output, `payment-management-${theme}-${width}.png`), fullPage: true });
        await page.locator('[data-review-payment="vehicle-payment"]').click();
        assert.match(await page.locator('#modalBody').innerText(), /Vehicle Fees/);
        assert.match(await page.locator('#modalBody').innerText(), /Remaining balance/);
        assert.ok(await page.evaluate(() => document.getElementById('modalBody').scrollWidth <= document.getElementById('modalBody').clientWidth + 1));
        await page.screenshot({ animations: 'disabled', path: path.join(output, `payment-review-${theme}-${width}.png`) });
        await page.getByRole('button', { name: 'Close', exact: true }).click();
      }
    }
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.evaluate(() => { document.getElementById('contentArea').style.width = 'calc(100% - 260px)'; });
    assert.ok(await page.locator('.table-wrapper').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'sidebar-sized content does not scroll horizontally');
    await page.evaluate(() => { document.getElementById('contentArea').style.width = ''; });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: /^Vehicle Fees/ }).click();
    await page.locator('[data-review-payment="vehicle-payment"]').click();
    await page.getByRole('button', { name: 'Reject Payment', exact: true }).click();
    await page.getByRole('button', { name: 'Reject Payment', exact: true }).click();
    assert.equal(await page.evaluate(() => window.rejectCalls || 0), 0);
    await page.getByLabel('Reason for Rejection').selectOption('Other');
    await page.getByRole('button', { name: 'Reject Payment', exact: true }).click();
    assert.equal(await page.evaluate(() => lastToast[1]), 'Reason Required');
    await page.getByLabel('Specific Reason for Rejection').fill('Please upload a readable proof');
    await page.evaluate(() => Promise.all([executeRejectPayment('vehicle-payment'), executeRejectPayment('vehicle-payment')]));
    assert.equal(await page.evaluate(() => rejectCalls), 1);
    assert.deepEqual(await page.locator('#paymentSummary strong').allTextContents(), ['1', '0', '0']);
    assert.match(await page.locator('#payTableBody').innerText(), /Rejected/);
    await page.locator('[data-review-payment="vehicle-payment"]').click();
    assert.match(await page.locator('#modalBody').innerText(), /Please upload a readable proof/);
    assert.equal(await page.getByRole('button', { name: 'Approve Payment', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: /^Monthly Association Dues/ }).click();
    await page.locator('[data-review-payment="advance-payment"]').click();
    await page.getByRole('button', { name: 'Approve Payment', exact: true }).click();
    assert.match(await page.locator('#modalBody').innerText(), /December 2026/);
    await page.evaluate(() => Promise.all([executeApprovePayment('advance-payment'), executeApprovePayment('advance-payment')]));
    assert.equal(await page.evaluate(() => approveCalls), 1);
    assert.deepEqual(await page.locator('#paymentSummary strong').allTextContents(), ['2', '0', '2']);
    await page.evaluate(() => { manage = false; renderPayments(); });
    assert.equal(await page.getByRole('button', { name: 'Create Payment', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Payment Settings', exact: true }).count(), 0);
    await page.evaluate(() => viewPaymentDetail('amenity-payment'));
    assert.match(await page.locator('#modalBody').innerText(), /Manual Payment/);
    assert.match(await page.locator('#modalBody').innerText(), /HOA Administrator/);
    assert.equal(await page.getByRole('button', { name: 'Approve Payment', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: payment categories, composed filters, counts, pagination, review, rejection validation, duplicate guards, permissions and light/dark layouts at 320–1280px.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
