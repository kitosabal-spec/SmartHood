'use strict';

// Run with PLAYWRIGHT_MODULE / REPORT_BROWSER_EXECUTABLE when using a bundled browser.
// All API data is synthetic; no live database records or accounts are changed.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { fixture } = require('./helpers/auth-fixture.cjs');

(async () => {
  const cleanups = [];
  let browser;
  try {
    const site = await fixture({ after: cleanup => cleanups.push(cleanup) });
    browser = await chromium.launch({ headless: true,
      ...(process.env.REPORT_BROWSER_EXECUTABLE ? { executablePath: process.env.REPORT_BROWSER_EXECUTABLE } : {}) });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const records = Array.from({ length: 10 }, (_, i) => ({
      id: `post-${i}`, title: `Announcement ${i}`, itemName: `Report ${i}`,
      content: 'Community update details.', description: 'Please contact the community office.',
      category: 'General', reportType: i % 2 ? 'Found' : 'Lost', itemType: 'Keys',
      location: 'Community park', contactName: 'Test Contact', contactNumber: '0000000000',
      status: 'Approved', is_pinned: i === 0, eventDate: '2026-10-29',
      created_at: `2026-10-29T0${i}:00:00Z`, createdAt: `2026-10-29T0${i}:00:00Z`,
      images: ['/public/images/SH Logo.png'], image: '/public/images/SH Logo.png',
    }));
    records[0].content = 'A long community announcement with details for every homeowner.\n'.repeat(35) + '<b>Final details</b>';
    records[8].content = 'Long text without media. '.repeat(150);
    records[8].images = [];
    records[8].image = '';
    let publicData = { announcements: records, lostFound: [...records,
      { itemName: 'Hidden pending', status: 'Pending', createdAt: '2026-10-30T00:00:00Z' },
      { itemName: 'Hidden rejected', status: 'Rejected', createdAt: '2026-10-30T00:00:00Z' }],
      board_of_directors: [], board_current_term: '2026 - 2028' };
    await page.route('**/*', route => route.request().url().startsWith(site.base) ? route.continue() : route.abort());
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url()).pathname;
      if (url === '/api/session') return route.fulfill({ json: { authenticated: false } });
      if (url === '/api/public-data') return route.fulfill({ json: publicData });
      if (url === '/api/announcements/comment-counts' || url === '/api/announcements/reactions') return route.fulfill({ json: {} });
      errors.push(`Unexpected API: ${url}`);
      return route.fulfill({ status: 500, json: { error: 'Unexpected API' } });
    });
    const expected = [0, 9, 8, 7, 6, 5];
    const expectedReports = [9, 8, 7, 6, 5, 4];
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(site.base, { waitUntil: 'networkidle' });
      assert.deepEqual(errors, [], 'page startup');
      await page.waitForSelector('#pubAnnGrid .pub-ann-card');
      assert.deepEqual(await page.locator('#pubAnnGrid .pub-ann-card-title').allTextContents(), expected.map(i => `Announcement ${i}`));
      assert.deepEqual(await page.locator('#pubLostFoundGrid h3').allTextContents(), expectedReports.map(i => `Report ${i}`));
      const cards = page.locator('#pubAnnGrid .pub-ann-card');
      await page.waitForFunction(() => !document.querySelector('#pubAnnGrid .pub-ann-see-more').hidden);
      assert.deepEqual(await cards.evaluateAll(items => items.map(card => card.offsetHeight)), [400, 400, 400, 400, 400, 400]);
      assert.equal(await cards.nth(0).getByRole('button', { name: 'See more' }).isVisible(), true);
      assert.equal(await cards.nth(1).getByRole('button', { name: 'See more' }).isVisible(), false);
      assert.equal(await cards.nth(2).getByRole('button', { name: 'See more' }).isVisible(), true);
      assert.equal(await page.locator('#modalOverlay').isVisible(), false);
      assert.ok(await cards.nth(0).locator('.pub-ann-card-body').evaluate(body => body.scrollHeight > body.clientHeight));
      await cards.nth(0).getByRole('button', { name: 'See more' }).click();
      assert.equal(await page.locator('#modalOverlay').isVisible(), true);
      assert.equal(await page.locator('.pub-ann-detail-text').textContent(), records[0].content);
      assert.equal(await page.locator('.pub-ann-detail-text b').count(), 0, 'announcement text is escaped');
      await page.locator('#modalFooter').getByRole('button', { name: 'Close', exact: true }).click();
      assert.equal(await page.locator('#modalOverlay').isVisible(), false);
      assert.equal(await cards.nth(0).evaluate(card => card.offsetHeight), 400);
      for (const id of ['pubAnnGrid', 'pubLostFoundGrid']) {
        const layout = await page.locator(`#${id}`).evaluate(grid => ({
          columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          fits: [...grid.children].every(card => {
            const r = card.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth && card.scrollWidth <= card.clientWidth;
          }),
        }));
        assert.ok(layout.fits, `${id}: cards fit at ${width}px`);
        if (width <= 768) assert.equal(layout.columns, 2);
        else assert.ok(layout.columns >= 2, `${id}: responsive grid at ${width}px`);
      }
      for (const id of ['announcements', 'lostfound']) {
        if (process.env.LANDING_SCREENSHOT_DIR) await page.locator(`#${id}`).screenshot({
          path: path.join(process.env.LANDING_SCREENSHOT_DIR, `${id}-${width}.png`),
        });
      }
      await page.getByRole('button', { name: 'View All in Portal' }).click();
      assert.equal(await page.locator('#loginModal').isVisible(), true);
      await page.evaluate(() => closeLoginModal());
      for (const type of ['Lost', 'Found']) {
        await page.getByRole('button', { name: `Report ${type} Item`, exact: true }).click();
        assert.equal(await page.locator('#lf_reportType').inputValue(), type);
        assert.equal(await page.locator('#modalTitle').textContent(), `Report ${type} Item`);
        await page.evaluate(() => closeModal());
      }
    }
    const fresh = { ...records[9], id: 'new', title: 'New announcement', itemName: 'New approved report',
      created_at: '2026-10-29T09:00:01Z', createdAt: '2026-10-29T09:00:01Z' };
    publicData = { ...publicData, announcements: [...records, fresh], lostFound: [...records, fresh] };
    await page.reload({ waitUntil: 'networkidle' });
    assert.deepEqual(await page.locator('#pubAnnGrid .pub-ann-card-title').allTextContents(), ['Announcement 0', 'New announcement', ...[9, 8, 7, 6].map(i => `Announcement ${i}`)]);
    assert.deepEqual(await page.locator('#pubLostFoundGrid h3').allTextContents(), ['New approved report', ...[9, 8, 7, 6, 5].map(i => `Report ${i}`)]);
    await page.evaluate(() => renderHOAnnouncements());
    assert.equal(await page.locator('#hoAnnouncementsList .community-post-card').count(), 11);
    assert.equal(await page.locator('#hoAnnouncementsList .community-post-card').first().getAttribute('id'), 'announcement-card-post-0');
    await page.evaluate(() => renderHOCommunityBoard(document.getElementById('contentArea')));
    assert.equal(await page.locator('#hoLfGrid .pub-lostfound-card').count(), 11);
    assert.deepEqual(errors, []);
    console.log('PASS: fixed card heights, overflow-only See more, full text dialog, desktop/tablet/mobile grids, latest six, approval filtering, refresh, login/report buttons, full portal lists and portal pin ordering.');
  } finally {
    await browser?.close();
    for (const cleanup of cleanups.reverse()) await cleanup();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
