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
      window.manage = true;
      window.canManageBilling = () => manage;
      window.toMoneyNumber = value => Number(value || 0);
      window.getLocalMonthValue = () => '2026-11';
      window.DEFAULT_DUES_RATE_PER_SQM = 2.29;
      window.syncHomeownerBalances = async () => {};
      window.showLoading = window.hideLoading = window.logAction = () => {};
      window.showToast = (...args) => { window.lastToast = args; };
      window.api = { loadAll: async () => {} };
      window.cache = {
        homeowners: [{ id: 'h1', name: 'Alex Example', lotArea: 100 }, { id: 'h2', name: 'Robin Example', lotArea: 100 }],
        users: [{ id: 'u1', role: 'homeowner', permissions: ['resident'], homeowner_id: 'h1' }],
        billings: [
          { id: 'dues', title: 'Monthly dues', billing_type: 'Monthly Association Dues', monthly_dues_month: '2026-11', amount: 229, assignedTo: ['h1', 'h2'] },
          { id: 'vehicle', title: 'Vehicle registration — E951BB', vehicle_registration_id: 'v1', amount: 200, assignedTo: ['h1'] },
          { id: 'amenity', title: 'Basketball Court reservation — November 18, 2026', amenity_booking_id: 'a1', amount: 200, assignedTo: ['h2'] },
          ...Array.from({ length: 12 }, (_, i) => ({ id: `other-${i}`, title: i === 0 ? 'Gate repair contribution' : `Community maintenance — Phase ${i}`, amount: 500, assignedTo: ['h1'], dueDate: i === 0 ? '2000-01-01' : null })),
        ].map(b => ({ status: 'active', createdAt: '2026-11-01', ...b })),
        payments: [
          { id: 'p1', billingId: 'vehicle', homeownerId: 'h1', amount: 200, status: 'approved' },
          { id: 'p2', billingId: 'amenity', homeownerId: 'h2', amount: 200, status: 'pending' },
          { id: 'p3', billingId: 'other-0', homeownerId: 'h1', amount: 100, status: 'approved' },
        ],
      };
      window.db = { get: key => cache[key] || [], getOne: (key, id) => (cache[key] || []).find(row => row.id === id),
        newId: () => 'new-manual', save: async (key, item) => { cache[key].push(item); window.savedBill = item; },
        delete: async () => { window.archiveCalls = (window.archiveCalls || 0) + 1; } };
      window.getHomeowners = () => cache.homeowners;
      window.getHomeownerById = id => cache.homeowners.find(h => h.id === id);
      renderBilling();
    });
    assert.deepEqual(await page.locator('.billing-summary-card strong').allTextContents(), ['15', '14', '1']);
    assert.equal(await page.locator('#billTableBody tr').count(), 10);
    assert.equal(await page.getByRole('button', { name: 'Auto-Generate Dues' }).isVisible(), false);
    await page.getByRole('button', { name: /^Vehicle Fees/ }).click();
    assert.match(await page.locator('#billTableBody').innerText(), /Alex Example/);
    await page.getByLabel('Billing status', { exact: true }).selectOption('paid');
    assert.equal(await page.locator('#billTableBody tr').count(), 1);
    await page.getByLabel('Search billings').fill('E951BB');
    await page.getByLabel('Billing date', { exact: true }).selectOption('date');
    await page.locator('#billDate').fill('2026-11-01');
    assert.match(await page.locator('#billTableBody').innerText(), /E951BB/);
    await page.getByRole('button', { name: /^Amenity Fees/ }).click();
    assert.match(await page.locator('#billTableBody').innerText(), /No billings found/);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.match(await page.locator('#billTableBody').innerText(), /Pending Verification/);
    await page.getByRole('button', { name: /^Other Charges/ }).click();
    await page.getByTitle('Next Page', { exact: true }).click();
    assert.equal(await page.locator('#billTableBody tr').count(), 2);
    await page.getByRole('button', { name: /^Monthly Association Dues/ }).click();
    assert.equal(await page.getByRole('button', { name: 'Auto-Generate Dues' }).isVisible(), true);
    assert.match(await page.locator('#billTableBody').innerText(), /2 homeowners/);
    await page.getByRole('button', { name: /^View Billing:/ }).click();
    assert.match(await page.locator('#modalBody').innerText(), /Alex Example/);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: /^More actions/ }).click();
    await page.getByRole('button', { name: 'Archive Billing', exact: true }).click();
    assert.match(await page.locator('#modalBody').innerText(), /payment history are retained/);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.evaluate(() => window.archiveCalls || 0), 0);
    await page.getByRole('button', { name: 'Create Billing', exact: true }).click();
    await page.locator('#bf_billing_type').selectOption('Other Billing');
    await page.getByLabel('Category *').selectOption('vehicle_fees');
    await page.locator('#bf_title').fill('Replacement vehicle sticker');
    await page.locator('#bf_amount').fill('150');
    await page.locator('#bf_no_due').check();
    await page.locator('.ho-cb').first().check();
    await page.locator('#modalFooter').getByRole('button', { name: 'Create Billing', exact: true }).click();
    assert.equal(await page.evaluate(() => savedBill.billing_category), 'vehicle_fees');
    assert.equal(await page.evaluate(() => savedBill.billing_type), 'Other Billing');
    assert.equal(await page.evaluate(() => savedBill.amount), 150);
    await page.getByRole('button', { name: /^All Billings/ }).click();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
      for (const width of [1280, 768, 375, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const layout = await page.evaluate(() => ({
          viewport: innerWidth, scroll: document.documentElement.scrollWidth,
          cards: [...document.querySelectorAll('.billing-summary-card')].map(el => el.getBoundingClientRect().y),
        }));
        assert.ok(layout.scroll <= layout.viewport + 1, `${theme} ${width}px overflows: ${JSON.stringify(layout)}`);
        assert.equal(new Set(layout.cards).size, 1, 'summary cards stay on one row');
        if ([1280, 375].includes(width)) await page.screenshot({ path: path.join(output, `billing-${theme}-${width}.png`), fullPage: true });
      }
    }
    await page.evaluate(() => { manage = false; renderBilling(); });
    assert.equal(await page.getByRole('button', { name: 'Create Billing', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /^More actions/ }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: category/search/date/status filters, pagination, manual creation, archive cancellation, permissions, light/dark desktop/mobile layouts.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
