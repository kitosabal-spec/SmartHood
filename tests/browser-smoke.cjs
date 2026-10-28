'use strict';
// Optional browser check: real page/scripts, synthetic API data, no live writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { fixture } = require('./helpers/auth-fixture.cjs');
const root = path.resolve(__dirname, '..');
const cleanups = [];

(async () => {
  let browser;
  try {
    const f = await fixture({ after: cleanup => cleanups.push(cleanup) });
    // Expose only the three isolated FAQ test files in this test server.
    for (const name of ['faq-browser.html', 'faq-browser-checks.js']) {
      f.app.get('/tests/' + name, (req, res) => res.sendFile(path.join(__dirname, name)));
    }
    f.app.get('/index.html', (req, res) => res.sendFile(path.join(root, 'index.html')));
    browser = await chromium.launch({ headless: true,
      ...(process.env.REPORT_BROWSER_EXECUTABLE ? { executablePath: process.env.REPORT_BROWSER_EXECUTABLE } : {}) });
    const errors = [];
    const failedAssets = [];
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().startsWith(f.base) && response.status() >= 400) failedAssets.push(`${response.status()} ${response.url()}`);
    });
    // Avoid external fonts/maps; the smoke test must work without third parties.
    await page.route('**/*', route => route.request().url().startsWith(f.base) ? route.continue() : route.abort());
    const resident = { id: 'account-1', homeowner_id: 'home-1', role: 'homeowner', status: 'active', name: 'Test Resident', email: 'resident@example.test', permissions: ['resident'] };
    const admin = { id: 'admin-1', role: 'admin', status: 'active', name: 'Test Admin', permissions: ['*'] };
    const tables = Object.fromEntries(['billings', 'payments', 'complaints', 'amenityBookings', 'vehicleRegistrations', 'lostFound', 'announcements', 'announcement_comments', 'auditLog', 'notifications', 'board_of_directors', 'payment_settings'].map(name => [name, []]));
    Object.assign(tables, {
      users: [admin, resident],
      homeowners: [{ id: 'home-1', name: 'Test Resident', block: '1', lot: '2', lotArea: 50, balance: 0 }],
      appSettings: [{ id: 'duesRatePerSqm', value: '5.725' }],
      auditLog: [
        { id: 'z-migration', adminId: 'system:migration', actor_name: 'Database migration',
          action_type: 'reconciled orphan link', entity_type: 'payments', entity_id: 'legacy-payment',
          action: 'system migration reconciled orphan billing link for payments (legacy-payment): preserved as an unapplied advance credit; original identifier retained internally',
          timestamp: '2026-10-23T01:53:12.108Z' },
        ...Array.from({ length: 12 }, (_, i) => ({ id: `event-${i}`, adminId: 'admin-1', actor_name: 'Original Administrator',
          action_type: 'created', entity_type: 'billings', entity_id: `bill-${i}`,
          action: `admin (admin-1) created billings (bill-${i}): amount: (empty) -> 300; title: (empty) -> [redacted]`,
          timestamp: new Date(Date.parse('2026-10-24T01:00:00Z') + i * 60000).toISOString() })),
        { id: 'a-latest', adminId: 'deleted-account', actor_name: 'Former Resident', action_type: 'created',
          entity_type: 'amenityBookings', entity_id: 'booking-1',
          action: 'homeowner (deleted-account) created amenityBookings (booking-1): bookingDate: (empty) -> 2026-10-31; status: (empty) -> Pending; purpose: (empty) -> [redacted] <script>alert(1)</script>; reviewedAt: (empty) -> (empty)',
          timestamp: '2026-10-24T05:32:39.391Z' },
      ],
    });
    await page.route('**/api/**', async route => {
      if (route.request().method() !== 'GET') {
        errors.push(`Unexpected write: ${route.request().url()}`);
        return route.fulfill({ status: 405, json: { error: 'Read-only smoke test' } });
      }
      const url = new URL(route.request().url()).pathname;
      let body;
      if (url === '/api/session') body = { authenticated: false };
      else if (['/api/public-data', '/api/data'].includes(url)) body = tables;
      else if (url === '/api/announcements/comment-counts') body = {};
      else if (url === '/api/announcements/reactions') body = {};
      else if (url === '/api/board') body = tables.board_of_directors;
      else if (url === '/api/amenity-availability') body = { bookings: [], unavailable: { weeklyDays: [], dateRules: [] } };
      else if (url === '/api/payment-settings') body = { payment_method: 'gcash', account_name: 'Test HOA', account_number: '09170000000', is_active: true };
      else if (Object.hasOwn(tables, url.slice(5))) body = tables[url.slice(5)];
      else {
        errors.push(`Unhandled smoke-test API: ${url}`);
        return route.fulfill({ status: 500, json: { error: 'Missing test fixture' } });
      }
      await route.fulfill({ json: body });
    });
    await page.goto(f.base);
    await page.waitForFunction(() => !document.documentElement.classList.contains('auth-pending'));
    assert.equal(await page.locator('#landingPage').isVisible(), true);
    assert.equal(await page.locator('a.pub-contact-link[href*="facebook.com"]').count(), 1);
    await page.locator('#publicFAQButton').click();
    assert.equal(await page.locator('#publicFAQModal').evaluate(el => el.open), true);
    await page.keyboard.press('Escape');
    console.log('PASS: landing page, Facebook contact and FAQ dialog');

    let views = 0;
    for (const user of [admin, resident]) {
      await page.evaluate(({ user, tables }) => {
        currentUser = user;
        currentRole = user.role;
        dbCache = structuredClone(tables);
        document.getElementById('landingPage').classList.add('hidden');
        document.getElementById('appShell').classList.remove('hidden');
      }, { user, tables });
      const navigation = await page.evaluate(() => currentUser.role === 'admin'
        ? [...ADMIN_NAV.map(item => item.id), 'settings']
        : [...HOMEOWNER_NAV.map(item => item.id)]);
      for (const view of [...new Set(navigation)]) {
        await page.evaluate(view => navigate(view), view);
        await page.waitForFunction(() => document.getElementById('contentArea').textContent.trim().length > 0);
        const content = await page.locator('#contentArea').innerText();
        assert.ok(!content.includes('Access Denied'), `${user.role}: ${view} should be accessible`);
        assert.ok(!/\b(?:undefined|NaN)\b/.test(content), `${view}: invalid values in UI`);
        views++;
      }
      const viewBeforeFAQ = await page.evaluate(() => currentView);
      await page.locator('#sidebarFAQ').click();
      assert.equal(await page.locator('#portalFAQModal').evaluate(el => el.open), true);
      assert.equal(await page.evaluate(() => currentView), viewBeforeFAQ);
      assert.ok((await page.locator('#portalFAQ .faq-question').count()) >= 25);
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failedAssets, []);
    console.log(`PASS: ${views} administrator/resident views render without JavaScript errors or missing local assets`);
    await page.evaluate(() => navigate('billing'));
    assert.match(await page.locator('#contentArea').innerText(), /Access Denied/);
    await page.evaluate(() => {
      currentUser = { id: 'admin-1', role: 'admin', status: 'active', name: '<b>Admin</b>', email: '\" onfocus=alert(1)', username: '<i>admin</i>' };
      currentRole = 'admin';
      navigate('settings');
    });
    assert.equal(await page.locator('#s_name').inputValue(), '<b>Admin</b>');
    assert.equal(await page.locator('#s_email').getAttribute('onfocus'), null);
    assert.equal(await page.locator('.profile-info b, .profile-info i').count(), 0);
    await page.getByRole('button', { name: 'Open Billing', exact: true }).click();
    assert.equal(await page.evaluate(() => currentView), 'billing');
    console.log('PASS: resident permission denial, escaped profile fields and Settings billing action');

    await page.setViewportSize({ width: 1256, height: 871 });
    await page.evaluate(() => navigate('auditlog'));
    await page.locator('#auditLogTable').waitFor();
    assert.equal(await page.locator('#logTableBody tr').count(), 10);
    assert.match(await page.locator('#logTableBody tr').first().innerText(), /Created amenity booking/);
    assert.match(await page.locator('#logTableBody tr').first().innerText(), /Former Resident/);
    assert.equal(await page.locator('#logTableBody script').count(), 0);
    assert.doesNotMatch(await page.locator('#logTableBody .log-time').first().innerText(), /T05:32/);
    await page.locator('#logTableBody summary').first().click();
    assert.match(await page.locator('#logTableBody details[open]').innerText(), /Record ID: booking-1/);
    assert.match(await page.locator('#logTableBody tr').first().innerText(), /Booking date: Oct 31, 2026/);
    assert.match(await page.locator('#logTableBody tr').first().innerText(), /Status: Pending/);
    assert.doesNotMatch(await page.locator('#logTableBody').innerText(), /\[redacted\]|\(empty\)|<script>|amenityBookings/);
    await page.locator('#logTableBody summary').first().click();
    await page.locator('#logSearch').fill('Database migration');
    assert.equal(await page.locator('#logTableBody tr').count(), 1);
    assert.match(await page.locator('#logTableBody').innerText(), /Reconciled a legacy payment billing link/);
    await page.locator('#auditLogResetBtn').click();
    await page.evaluate(() => changeAuditLogPage(2));
    assert.equal(await page.locator('#logTableBody tr').count(), 4);
    assert.match(await page.locator('#logTableBody tr').last().innerText(), /Database migration/);
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#auditLogExportButton').click();
    const download = await downloadEvent;
    const auditOutput = process.env.AUDIT_TEST_OUTPUT || path.join(require('node:os').tmpdir(), 'smarthood-audit-browser');
    fs.mkdirSync(auditOutput, { recursive: true });
    const excelPath = path.join(auditOutput, download.suggestedFilename());
    await download.saveAs(excelPath);
    const workbook = await new (require('exceljs').Workbook)().xlsx.readFile(excelPath);
    const sheet = workbook.getWorksheet('Audit Log');
    assert.equal(sheet.rowCount, 22, 'export includes all 14 records despite being on page 2');
    assert.equal(sheet.getCell('B9').value, 'a-latest');
    assert.equal(sheet.getCell('D9').value, 'Former Resident');
    assert.equal(sheet.getCell('B22').value, 'z-migration');
    assert.equal(sheet.getCell('C9').value, 'Created amenity booking\nBooking date: Oct 31, 2026\nStatus: Pending');
    assert.equal(sheet.getCell('G9').value, 'booking-1');
    assert.doesNotMatch(sheet.getCell('C9').value, /\[redacted\]|\(empty\)|->/);
    await page.locator('#logSearch').fill('Oct 31, 2026');
    assert.equal(await page.locator('#logTableBody tr').count(), 1);
    await page.locator('#auditLogResetBtn').click();
    await page.evaluate(() => changeAuditLogPage(1));
    await page.mouse.move(1200, 70);
    await page.waitForFunction(() => document.querySelectorAll('#toastContainer .toast').length === 0);
    await page.screenshot({ path: path.join(auditOutput, 'audit-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.locator('#auditLogTable').isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile overflow stays inside the table wrapper');
    assert.ok(await page.locator('#logTableBody .audit-event-title').first().evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth;
    }), 'mobile event text must be within the viewport, not clipped outside its card');
    await page.screenshot({ path: path.join(auditOutput, 'audit-mobile.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 1256, height: 871 });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.mouse.move(1200, 70);
    await page.screenshot({ path: path.join(auditOutput, 'audit-dark.png'), fullPage: true, animations: 'disabled' });
    assert.deepEqual(errors, []);
    console.log('PASS: audit chronology, readable details and reference IDs, actor snapshots, search, pagination, XLSX download, desktop and mobile layout');

    await page.goto(f.base + '/tests/faq-browser.html');
    await page.waitForFunction(() => document.getElementById('results')?.textContent.split('\n').length === 8, { timeout: 30000 });
    const results = await page.locator('#results').innerText();
    assert.ok(!results.includes('FAIL'), results);
    console.log(results);
    assert.deepEqual(errors, []);
    const output = path.join(root, 'logs', 'verification');
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'faq-browser-checks.png'), fullPage: true });
  } finally {
    if (browser) await browser.close();
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
