'use strict';
// Optional real-browser check, using the actual application assets and isolated
// API fixtures. No application database or financial records are accessed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = pathname === '/' ? path.join(root, 'index.html') : path.resolve(root, '.' + pathname);
  if ((!file.startsWith(path.join(root, 'public') + path.sep) && file !== path.join(root, 'index.html')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.statusCode = 404; return res.end();
  }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8');
  fs.createReadStream(file).pipe(res);
});

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, ...(process.env.REPORT_BROWSER_EXECUTABLE ? { executablePath: process.env.REPORT_BROWSER_EXECUTABLE } : {}) });
    // A non-Philippine browser timezone catches accidental host-local boundaries.
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, timezoneId: 'America/Los_Angeles' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const tables = Object.fromEntries(['users', 'homeowners', 'billings', 'payments', 'complaints', 'amenityBookings', 'vehicleRegistrations', 'lostFound', 'announcements', 'announcement_comments', 'auditLog', 'notifications', 'board_of_directors', 'payment_settings', 'appSettings'].map(key => [key, []]));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (route.request().method() !== 'GET') {
        errors.push('Unexpected database write: ' + url.pathname);
        return route.fulfill({ status: 405, json: {} });
      }
      const body = url.pathname === '/api/session' ? { authenticated: false }
        : ['/api/data', '/api/public-data'].includes(url.pathname) ? tables : [];
      return route.fulfill({ json: body });
    });
    await page.goto(base);
    await page.waitForFunction(() => !document.documentElement.classList.contains('auth-pending'));
    await page.evaluate(tables => {
      currentUser = { id: 'test-admin', name: 'Administrator', role: 'admin', permissions: ['*'] };
      currentRole = 'admin';
      dbCache = structuredClone(tables);
      dbCache.homeowners = [{ id: 'h1', name: 'Homeowner', balance: 750 }];
      dbCache.billings = [{ id: 'b1', title: 'October dues', amount: 1000, createdAt: '2026-10-01', assignedTo: ['h1'] }];
      dbCache.payments = [
        { id: 'p1', homeownerId: 'h1', billingId: 'b1', amount: 250, status: 'approved', payment_date: '2026-10-01', submittedAt: '2026-09-30T16:00:00Z', monthly_dues_month: '2027-01' },
        { id: 'p2', homeownerId: 'h1', amount: 100, status: 'pending', submittedAt: '2026-10-31T15:59:59.999Z' },
        { id: 'p3', homeownerId: 'h1', amount: 100, status: 'rejected', submittedAt: '2026-10-31T16:00:00Z' }
      ];
      dbCache.complaints = [{ id: 'c1', homeownerId: 'h1', category: 'Maintenance', description: 'Test maintenance request', status: 'Reviewed', dateFiled: '2026-10-31' }];
      document.getElementById('landingPage').classList.add('hidden');
      document.getElementById('appShell').classList.remove('hidden');
      buildSidebar();
      navigate('dashboard');
    }, tables);
    const cards = () => page.locator('.admin-stat-grid .stat-value').allTextContents();
    assert.deepEqual(await cards(), ['1', '₱250', '₱1,000', '₱750', '1', '1']);
    assert.equal(await page.locator('#adminDashboardCustomDates').isVisible(), false);
    assert.equal(await page.locator('#adminDashboardPeriod').isVisible(), false);
    await page.locator('#adminDashboardFilterButton').click();
    assert.equal(await page.locator('#adminDashboardPeriod').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#adminDashboardPeriod').isVisible(), false);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#adminDashboardPeriod').isVisible(), true);
    await page.locator('.page-header-left h2').click();
    assert.equal(await page.locator('#adminDashboardPeriod').isVisible(), false);
    await page.locator('#adminDashboardFilterButton').click();
    await page.locator('#adminDashboardPeriod').selectOption('custom');
    await page.locator('#adminDashboardFrom').fill('2026-11-01');
    await page.locator('#adminDashboardTo').fill('2026-10-01');
    await page.locator('#adminDashboardApply').click();
    assert.match(await page.locator('#adminDashboardPeriodError').innerText(), /valid From and To/);
    await page.locator('#adminDashboardFrom').fill('2026-10-01');
    await page.locator('#adminDashboardTo').fill('2026-10-31');
    await page.locator('#adminDashboardApply').click();
    assert.equal(await page.locator('#donutChart .donut-value').innerText(), '2');
    assert.equal(await page.locator('#adminDashboardPeriod').isVisible(), false);
    assert.equal(await page.locator('#recentPaymentsTable tr').count(), 2);
    await page.locator('#revenueYearDisplay').click();
    await page.locator('.chart-year-option[data-year="2027"]').click();
    assert.equal(await page.locator('#revenueYearText').innerText(), '2027');
    assert.equal(await page.locator('#barChart [data-month="Jan"]').getAttribute('data-value'), '250');
    await page.locator('#revenuePrevYearBtn').click();
    assert.equal(await page.locator('#revenueYearText').innerText(), '2026');
    await page.locator('#revenueNextYearBtn').click();
    await page.evaluate(() => { navigate('homeowners'); navigate('dashboard'); });
    assert.equal(await page.locator('#adminDashboardPeriod').inputValue(), 'custom');
    assert.equal(await page.locator('#adminDashboardFrom').inputValue(), '2026-10-01');
    assert.equal(await page.locator('#revenueYearText').innerText(), '2027');
    await page.locator('#adminDashboardFilterButton').click();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1100 });
        const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(dimensions.scroll <= dimensions.width, `${theme} ${width}px: horizontal overflow ${dimensions.scroll}`);
        assert.equal(await page.locator('#adminDashboardApply').isVisible(), true);
        assert.equal(await page.locator('.admin-stat-grid .stat-card').count(), 6);
        assert.equal(await page.locator('#recentPaymentsTable td[data-label]').count(), 6);
        if (process.env.DASHBOARD_SCREENSHOT_DIR && [1440, 390].includes(width)) {
          fs.mkdirSync(process.env.DASHBOARD_SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.DASHBOARD_SCREENSHOT_DIR, `dashboard-${theme}-${width}.png`), fullPage: true });
        }
      }
    }
    await page.locator('#adminDashboardFrom').fill('2040-01-01');
    await page.locator('#adminDashboardTo').fill('2040-01-31');
    await page.locator('#adminDashboardApply').click();
    assert.deepEqual(await cards(), ['1', '₱0', '₱0', '₱750', '0', '0']);
    assert.match(await page.locator('#recentPaymentsTable').innerText(), /No payments/);
    await page.locator('#adminDashboardFilterButton').click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.equal(await page.locator('#adminDashboardPeriod').inputValue(), 'all');
    assert.equal(await page.locator('#donutChart .donut-value').innerText(), '3');
    assert.equal(await page.locator('#revenueYearText').innerText(), '2027');
    await page.evaluate(() => {
      currentUser = { id: 'resident', homeowner_id: 'h1', role: 'homeowner', permissions: ['resident'] };
      currentRole = 'homeowner';
      navigate('ho-dashboard');
    });
    assert.equal(await page.locator('#adminDashboardPeriod').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: dashboard controls, validation, navigation, independent revenue year, read-only behavior, homeowner isolation, and 10 light/dark responsive layouts.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
