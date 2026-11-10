'use strict';
// Real browser controls and application CSS with isolated records; no production API.
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
    const dashboard = fs.readFileSync(path.join(root, 'public/js/dashboard.js'), 'utf8');
    await page.addScriptTag({ content: main.slice(main.indexOf('function openModal('), main.indexOf('function closeModalOutside(')) });
    await page.addScriptTag({ content: main.slice(main.indexOf('function getBillingPaymentSummary('), main.indexOf('function getBillingCollectionStatus(')) });
    await page.addScriptTag({ content: dashboard.slice(dashboard.indexOf('function applyResponsiveTableLabels('), dashboard.indexOf('function renderHODashboard(')) });
    await page.addScriptTag({ path: path.join(root, 'public/js/billing.js') });
    await page.evaluate(() => {
      window.pendingPhotoFile = window.pendingPhotoPreviewUrl = null;
      window.getCurrentHomeownerId = () => 'h1';
      window.canManagePayments = window.canManageBilling = () => false;
      window.toMoneyNumber = value => Number(value || 0);
      window.DEFAULT_DUES_RATE_PER_SQM = 2.29;
      window.showLoading = window.hideLoading = () => {};
      window.showToast = (...args) => { window.lastToast = args; };
      window.api = { loadAll: async () => {} };
      window.navigate = route => { window.lastRoute = route; };
      window.cache = {
        homeowners: [{ id: 'h1', name: 'Alex Example', lotArea: 100 }], users: [],
        payment_settings: [{ payment_method: 'gcash', is_active: 1, account_name: 'Test HOA', account_number: '09170000000' }],
        billings: [
          { id: 'paid', title: 'Vehicle Sticker', amount: 200, billing_category: 'vehicle_fees' },
          { id: 'dues', title: 'Dues', billing_type: 'Monthly Association Dues', monthly_dues_month: '2026-11', amount: 229 },
          { id: 'vehicle', title: 'Vehicle registration — E951BB', vehicle_registration_id: 'v1', amount: 200 },
          { id: 'amenity', title: 'Basketball Court reservation — November 18, 2026', amenity_booking_id: 'a1', amount: 200 },
          ...Array.from({ length: 12 }, (_, i) => ({ id: `other-${i}`, title: `Community maintenance — Phase ${i}`, amount: 500, dueDate: i === 0 ? '2000-01-01' : null })),
          { id: 'foreign', title: 'Private foreign billing', amount: 999, assignedTo: ['h2'] },
        ].map(b => ({ status: 'active', assignedTo: ['h1'], description: 'A complete description for this billing. '.repeat(8), ...b })),
        payments: [
          { id: 'p1', billingId: 'paid', homeownerId: 'h1', amount: 200, status: 'approved' },
          { id: 'p2', billingId: 'amenity', homeownerId: 'h1', amount: 200, status: 'pending' },
          { id: 'p3', billingId: 'other-0', homeownerId: 'h1', amount: 100, status: 'approved' },
        ],
      };
      window.db = { get: key => cache[key] || [], getOne: (key, id) => (cache[key] || []).find(row => row.id === id) };
      window.getHomeownerById = id => db.getOne('homeowners', id);
      window.beforeRecords = JSON.stringify(cache);
      renderHOBilling();
    });
    assert.deepEqual(await page.locator('.billing-summary-card strong').allTextContents(), ['₱6,529.00', '15', '1']);
    assert.equal(await page.locator('#hoBillTableBody tr').count(), 10);
    assert.equal(await page.getByRole('button', { name: 'Pay Dues in Advance', exact: true }).count(), 1);
    assert.equal(await page.getByText('Private foreign billing').count(), 0);
    await page.getByRole('button', { name: 'Pay Dues in Advance', exact: true }).click();
    assert.equal(await page.evaluate(() => lastRoute), 'ho-pay-now');
    await page.getByRole('button', { name: /^Vehicle Fees/ }).click();
    assert.equal(await page.locator('#hoBillTableBody tr').count(), 2);
    assert.match(await page.locator('#hoBillTableBody tr').first().innerText(), /E951BB/);
    await page.getByRole('button', { name: 'Pay Now', exact: true }).click();
    assert.match(await page.locator('#modalBody').innerText(), /GCash/);
    await page.getByRole('button', { name: "I've Paid — Submit Payment" }).click();
    assert.equal(await page.locator('#sub_pay_amount').inputValue(), '200.00');
    await page.evaluate(() => closeModal());
    await page.getByRole('button', { name: 'Receipt', exact: true }).click();
    assert.match(await page.locator('#modalBody').innerText(), /Payment Transactions/);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: /^Amenity Fees/ }).click();
    assert.equal(await page.getByRole('button', { name: 'Pay Now', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'View Details', exact: true }).click();
    assert.match(await page.locator('#modalBody').innerText(), /balance updates after approval/);
    assert.equal(await page.locator('.resident-bill-full-description').textContent(), 'A complete description for this billing. '.repeat(8));
    await page.getByRole('button', { name: 'Payment History', exact: true }).click();
    assert.match(await page.locator('#modalBody').innerText(), /For Verification/);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByLabel('Search my bills').fill('Phase 0');
    await page.getByLabel('My bill status', { exact: true }).selectOption('partially_paid');
    assert.equal(await page.locator('#hoBillTableBody tr').count(), 1);
    assert.match(await page.locator('#hoBillTableBody').innerText(), /₱400.00/);
    await page.getByRole('button', { name: 'Pay Now', exact: true }).click();
    await page.getByRole('button', { name: "I've Paid — Submit Payment" }).click();
    assert.equal(await page.locator('#sub_pay_amount').inputValue(), '400.00');
    await page.evaluate(() => closeModal());
    await page.getByLabel('My bill status', { exact: true }).selectOption('paid');
    assert.match(await page.locator('#hoBillTableBody').innerText(), /No bills match/);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByTitle('Next Page', { exact: true }).click();
    assert.equal(await page.locator('#hoBillTableBody tr').count(), 6);
    assert.match(await page.locator('#hoBillTableBody tr').last().innerText(), /Vehicle Sticker/);
    await page.getByRole('button', { name: /^Monthly Association Dues/ }).click();
    assert.equal(await page.locator('#hoBillTableBody tr').count(), 1);
    assert.match(await page.locator('#hoBillTableBody').innerText(), /No due date/);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
      for (const width of [1280, 768, 375, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const layout = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth,
          cards: [...document.querySelectorAll('.billing-summary-card')].map(el => el.getBoundingClientRect().y) }));
        assert.ok(layout.scroll <= layout.viewport + 1, `${theme} ${width}px overflow: ${JSON.stringify(layout)}`);
        assert.equal(new Set(layout.cards).size, 1);
        await page.screenshot({ path: path.join(output, `resident-billing-${theme}-${width}.png`), fullPage: true });
      }
    }
    assert.equal(await page.evaluate(() => JSON.stringify(cache) === beforeRecords), true, 'viewing and filtering never write financial data');
    await page.evaluate(async () => {
      openResidentPaymentDetail('p2', true);
      cache.payments.find(p => p.id === 'p2').status = 'approved';
      await refreshResidentPaymentDetail(document.getElementById('residentPaymentDetail'));
      closeModal();
    });
    assert.deepEqual(await page.locator('.billing-summary-card strong').allTextContents(), ['₱6,329.00', '14', '2']);
    await page.getByRole('button', { name: /^Amenity Fees/ }).click();
    assert.equal(await page.getByRole('button', { name: 'Receipt', exact: true }).count(), 1);
    assert.deepEqual(errors, []);
    console.log('PASS: resident categories, search/status/pagination, ownership, details, receipts, existing GCash entry, partial balances, advance link, and responsive light/dark layouts.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
