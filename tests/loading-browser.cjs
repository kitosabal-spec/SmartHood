'use strict';

// Real browser, synthetic APIs, temporary server; no real accounts or writes.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { fixture } = require('./helpers/auth-fixture.cjs');

(async () => {
  const cleanups = [];
  let browser;
  try {
    const f = await fixture({ after: cleanup => cleanups.push(cleanup) });
    browser = await chromium.launch({ headless: true,
      ...(process.env.REPORT_BROWSER_EXECUTABLE ? { executablePath: process.env.REPORT_BROWSER_EXECUTABLE } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(f.base) ? route.continue() : route.abort());
    let releasePublic, releaseData, releaseSession;
    const publicGate = new Promise(resolve => { releasePublic = resolve; });
    const dataGate = new Promise(resolve => { releaseData = resolve; });
    const sessionGate = new Promise(resolve => { releaseSession = resolve; });
    const user = { id: 'resident-1', homeowner_id: 'home-1', role: 'homeowner', permissions: ['resident'],
      status: 'active', name: 'Test Resident' };
    const data = Object.fromEntries(['billings', 'payments', 'complaints', 'amenityBookings', 'vehicleRegistrations',
      'announcements', 'announcement_comments', 'auditLog', 'notifications', 'board_of_directors', 'payment_settings', 'appSettings'].map(key => [key, []]));
    Object.assign(data, { users: [user], homeowners: [{ id: 'home-1', name: 'Test Resident', lotArea: 50, balance: 0 }],
      lostFound: [{ id: 'own-pending', homeownerId: 'home-1', status: 'Pending', itemName: 'Test item' }] });
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()).pathname;
      requests.push(url);
      if (url === '/api/session') { await sessionGate; return route.fulfill({ json: { authenticated: false } }); }
      if (url === '/api/public-data') { await publicGate; return route.fulfill({ json: {
        announcements: [], lostFound: [], board_of_directors: [], board_current_term: '2026 - 2028',
      } }); }
      if (url === '/api/login') return route.fulfill({ json: user });
      if (url === '/api/logout') return route.fulfill({ json: { ok: true } });
      if (url === '/api/data') { await dataGate; return route.fulfill({ json: data }); }
      if (url === '/api/notifications') return route.fulfill({ json: [] });
      if (url === '/api/announcements/comment-counts' || url === '/api/announcements/reactions') return route.fulfill({ json: {} });
      errors.push(`Unexpected API request: ${url}`);
      return route.fulfill({ status: 500, json: { error: 'Unexpected test API' } });
    });
    await page.goto(f.base, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#appShell').isVisible(), false, 'protected UI hidden while auth unresolved');
    releaseSession();
    await page.waitForFunction(() => !document.documentElement.classList.contains('auth-pending'));
    assert.equal(await page.locator('#landingPage').isVisible(), true, 'public content available while public-data is pending');
    assert.equal(await page.locator('#appShell').isVisible(), false);
    await page.evaluate(() => openLoginModal());
    assert.equal(await page.locator('#loginModal').isVisible(), true, 'login works before public-data');
    await page.locator('#loginUser').fill('resident@example.test');
    await page.locator('#loginPass').fill('fictional-password');
    const login = page.evaluate(() => handleLogin());
    await page.waitForFunction(() => currentUser?.id === 'resident-1');
    assert.equal(await page.locator('#appShell').isVisible(), false, 'protected UI waits for complete data');
    releaseData();
    await login;
    assert.equal(await page.locator('#appShell').isVisible(), true);
    releasePublic();
    await page.waitForFunction(() => publicDataRequest === null);
    assert.equal(await page.evaluate(() => db.get('lostFound')[0]?.id), 'own-pending', 'late public response did not erase own pending records');
    await page.evaluate(() => performLogout());
    assert.equal(await page.locator('#appShell').isVisible(), false);
    assert.equal(await page.locator('#contentArea').textContent(), '');
    assert.equal(await page.evaluate(() => db.get('users').length + db.get('payments').length + db.get('notifications').length), 0);
    assert.equal(await page.evaluate(() => db.get('lostFound').length), 0);
    assert.equal(requests.filter(url => url === '/api/board').length, 0, 'loaded empty board must not refetch');
    await page.evaluate(() => closeLoginModal());

    // Compare actual browser rendering against retained PNG originals. No
    // resizing or restyling: screenshots should be pixel-identical.
    const hero = page.locator('img[alt="San Alfonso Homes entrance sign surrounded by greenery"]');
    const logo = page.locator('.pub-nav-logo-img');
    for (const [element, original] of [[hero, 'IMG Sat.png'], [logo, 'SH Logo.png']]) {
      await element.evaluate(async img => { await img.decode(); });
      const optimized = await element.screenshot();
      await element.evaluate(async (img, original) => { img.src = '/public/images/' + encodeURIComponent(original); await img.decode(); }, original);
      assert.deepEqual(await element.screenshot(), optimized, `${original}: browser-rendered appearance unchanged`);
    }
    if (process.env.PERFORMANCE_SCREENSHOT) await page.screenshot({ path: path.resolve(process.env.PERFORMANCE_SCREENSHOT), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: delayed startup/auth/data, login before public data, stale response isolation, logout cleanup, empty-board request count, hero/logo screenshot equality.');
  } finally {
    await browser?.close();
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
