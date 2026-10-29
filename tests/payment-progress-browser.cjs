'use strict';
// Isolated UI regression: actual modals, billing calculations, and CSS; API fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.REPORT_BROWSER_EXECUTABLE ? { executablePath: process.env.REPORT_BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const server = {
      billings: [{ id: 'bill-1', title: 'Monthly HOA Dues', amount: 100, assignedTo: ['home-1'], dueDate: '2026-10-31' }],
      payments: [], homeowners: [{ id: 'home-1', name: 'Test Resident', block: '1', lot: '2' }],
      users: [], payment_settings: [{ payment_method: 'gcash', is_active: 1, account_name: 'Test HOA', account_number: '09170000000' }],
    };
    let refreshFailure = false;
    await page.route('http://progress.test/**', route => {
      if (route.request().url().endsWith('/api/data')) return route.fulfill({ status: refreshFailure ? 503 : 200, contentType: 'application/json', body: JSON.stringify(server) });
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="contentArea"></div><div id="modalOverlay" class="modal-overlay hidden"><div id="modal" class="modal"><div class="modal-header"><h3 id="modalTitle"></h3></div><div id="modalBody" class="modal-body"></div><div id="modalFooter" class="modal-footer"></div></div></div></body></html>' });
    });
    async function boot() {
      await page.goto('http://progress.test/');
      await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'public/css/style.css'), 'utf8').replace(/^@import[^\r\n]*[\r\n]*/m, '') });
      await page.addStyleTag({ path: path.join(root, 'public/css/billing.css') });
      const main = fs.readFileSync(path.join(root, 'public/js/main.js'), 'utf8');
      await page.addScriptTag({ content: main.slice(main.indexOf('function openModal('), main.indexOf('function closeModalOutside(')) });
      await page.addScriptTag({ content: main.slice(main.indexOf('function getBillingPaymentSummary('), main.indexOf('function getBillingCollectionStatus(')) });
      await page.addScriptTag({ path: path.join(root, 'public/js/billing.js') });
      await page.evaluate(async () => {
        window.pendingPhotoFile = window.pendingPhotoPreviewUrl = null;
        window.homeownerId = 'home-1';
        window.getCurrentHomeownerId = () => homeownerId;
        window.canManagePayments = () => false;
        window.toMoneyNumber = value => Number(value || 0);
        window.getLocalDateValue = () => '2026-10-29';
        window.showLoading = window.hideLoading = () => {};
        window.toasts = [];
        window.showToast = (...args) => toasts.push(args);
        window.escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&#39;');
        window.api = { loadAll: async () => {
          const result = await fetch('/api/data');
          if (!result.ok) throw new Error('Refresh unavailable');
          window.cache = await result.json();
        }, submitPayment: async form => {
          window.submitCount = (window.submitCount || 0) + 1;
          await new Promise(resolve => setTimeout(resolve, 50));
          if (window.failSubmit) throw new Error('Invalid receipt');
          return { payment: { id: 'payment-1', billingId: 'bill-1', homeownerId: 'home-1',
            amount: Number(form.get('amount')), refNum: form.get('refNum'), payment_date: form.get('payment_date'), status: 'pending' } };
        } };
        window.db = { get: key => cache[key] || [], getOne: (key, id) => (cache[key] || []).find(row => row.id === id) };
        window.getHomeownerById = id => db.getOne('homeowners', id);
        window.navigate = () => renderHOHistory();
        await api.loadAll();
      });
    }
    const active = async label => assert.equal(await page.locator('.payment-progress [aria-current="step"] .payment-progress-label').textContent(), label);
    async function layout() {
      const result = await page.locator('.payment-progress').evaluate(el => {
        const items = [...el.children].map(item => ({ circle: item.querySelector('.payment-progress-circle').getBoundingClientRect().toJSON(), label: item.querySelector('.payment-progress-label').getBoundingClientRect().toJSON() }));
        const body = document.getElementById('modalBody');
        return { items, width: body.clientWidth, scroll: body.scrollWidth };
      });
      assert.ok(result.scroll <= result.width + 1, `modal overflow: ${JSON.stringify(result)}`);
      assert.equal(new Set(result.items.map(item => item.circle.y)).size, 1, 'circles aligned horizontally');
      result.items.slice(1).forEach((item, i) => assert.ok(item.label.x >= result.items[i].label.right - 1, 'labels do not overlap'));
    }
    await boot();
    await page.evaluate(() => openPayNowModal('bill-1'));
    await active('GCash Payment');
    assert.equal(await page.locator('.payment-progress button, .payment-progress a').count(), 0, 'steps cannot be clicked/skipped');
    for (const width of [1280, 524, 375, 320]) { await page.setViewportSize({ width, height: 900 }); await layout(); }
    await page.getByRole('button', { name: "I've Paid — Submit Payment" }).click();
    await active('Submit Proof');
    assert.equal(await page.locator('.payment-progress .is-complete').count(), 1);
    await page.getByRole('button', { name: 'Back to QR' }).click();
    await active('GCash Payment');
    await page.getByRole('button', { name: "I've Paid — Submit Payment" }).click();
    await page.getByRole('button', { name: 'Submit Payment Proof', exact: true }).click();
    await active('Submit Proof');
    assert.equal(await page.evaluate(() => toasts.at(-1)[1]), 'Reference Required');
    await page.locator('#sub_ref_num').fill('1002345678912');
    await page.locator('#sub_pay_amount').fill('101');
    await page.getByRole('button', { name: 'Submit Payment Proof', exact: true }).click();
    assert.equal(await page.evaluate(() => toasts.at(-1)[1]), 'Invalid Amount');
    await page.locator('#sub_pay_amount').fill('40');
    await page.evaluate(() => { selectedPaymentReceiptFile = new File(['test'], 'receipt.png', { type: 'image/png' }); window.failSubmit = true; });
    await page.getByRole('button', { name: 'Submit Payment Proof', exact: true }).click();
    await page.waitForFunction(() => toasts.at(-1)[1] === 'Submission Failed');
    await active('Submit Proof');
    await layout();
    await page.evaluate(() => { window.failSubmit = false; window.submitCount = 0; });
    server.payments.push({ id: 'payment-1', billingId: 'bill-1', homeownerId: 'home-1', amount: 40, refNum: '1002345678912', payment_date: '2026-10-29', status: 'pending' });
    refreshFailure = true;
    await page.evaluate(() => Promise.all([executeSubmitPaymentProof('bill-1'), executeSubmitPaymentProof('bill-1')]));
    await active('For Verification');
    assert.equal(await page.evaluate(() => submitCount), 1, 'double-click sends one request');
    assert.equal(await page.locator('.payment-progress .is-complete').count(), 2);
    assert.match(await page.locator('#modalBody').innerText(), /Your payment proof has been submitted and is awaiting verification by the HOA Administrator\./);
    assert.match(await page.locator('#modalBody').innerText(), /Pending Verification/);
    assert.equal(await page.evaluate(() => getBillingPaymentSummary(db.getOne('billings', 'bill-1'), 'home-1', db.get('payments')).remainingBalance), 100);
    await layout();
    refreshFailure = false;
    await page.evaluate(() => refreshResidentPaymentDetail(document.getElementById('residentPaymentDetail')));
    server.payments[0].status = 'approved';
    await page.evaluate(() => refreshResidentPaymentDetail(document.getElementById('residentPaymentDetail')));
    await active('Result');
    assert.equal(await page.locator('.payment-progress .is-complete').count(), 4);
    assert.match(await page.locator('.payment-progress-message').innerText(), /Approved.*remaining balance of ₱60\.00/s);
    await layout();
    await boot(); // Fresh JS context with only server records, as on refresh/login.
    await page.evaluate(() => { renderHOHistory(); openResidentPaymentDetail('payment-1'); });
    await active('Result');
    assert.match(await page.locator('.payment-progress-message').innerText(), /Approved/);
    server.payments.push({ id: 'payment-2', billingId: 'bill-1', homeownerId: 'home-1', amount: 60, refNum: 'SECOND-PAYMENT-REFERENCE', status: 'pending' });
    await page.evaluate(async () => { await api.loadAll(); renderHOHistory(); openResidentPaymentDetail('payment-2'); });
    await active('For Verification');
    server.payments[1].status = 'rejected';
    server.payments[1].rejection_reason = '<script>bad()</script> Receipt is blurry';
    await page.waitForFunction(() => document.querySelector('.payment-progress .is-rejected'), null, { timeout: 15000 });
    await active('Result');
    assert.equal(await page.locator('.payment-progress .is-rejected').count(), 1);
    assert.match(await page.locator('.rejection-reason-callout').innerText(), /Receipt is blurry/);
    assert.equal(await page.locator('.rejection-reason-callout script').count(), 0);
    for (const width of [320, 375, 524, 1280]) { await page.setViewportSize({ width, height: 900 }); await layout(); }
    await page.setViewportSize({ width: 375, height: 900 });
    if (process.env.PAYMENT_PROGRESS_SCREENSHOT) await page.screenshot({ path: process.env.PAYMENT_PROGRESS_SCREENSHOT });
    await page.getByRole('button', { name: 'Submit Another Proof' }).click();
    await active('GCash Payment');
    await page.getByRole('button', { name: "I've Paid — Submit Payment" }).click();
    assert.equal(await page.locator('#sub_pay_amount').inputValue(), '60.00');
    await page.evaluate(() => { closeModal(); renderHOHistory(); });
    assert.equal(await page.getByRole('button', { name: 'Details', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Details', exact: true }).last().click();
    assert.equal(await page.locator('.resident-payment-transaction .payment-progress').count(), 2);
    await page.locator('[data-transaction-id="payment-1"] summary').click();
    assert.match(await page.locator('[data-transaction-id="payment-1"] .payment-progress-message').innerText(), /Approved/);
    // A refresh started before close must not reopen the modal.
    await page.evaluate(async () => { const pending = refreshResidentPaymentDetail(document.getElementById('residentPaymentDetail')); closeModal(); await pending; });
    assert.equal(await page.locator('#modalOverlay').isVisible(), false);
    // Grouped history uses the same saved records and refresh loop, with an
    // independent progress indicator inside each expandable transaction.
    server.billings[0].amount = 1000;
    server.billings[0].title = 'Community improvements ' + 'LongBillingTitle'.repeat(9);
    const receipt = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
    server.payments = [
      { id: 'partial-3', billingId: 'bill-1', homeownerId: 'home-1', amount: 500, status: 'pending', submittedAt: '2026-10-03', refNum: 'LONGREFERENCE'.repeat(20), receipt },
      { id: 'partial-1', billingId: 'bill-1', homeownerId: 'home-1', amount: 300, status: 'approved', submittedAt: '2026-10-01', payment_date: '2026-09-30', payment_method: 'Cash', payment_source: 'manual_admin', remarks: 'Recorded at HOA office' },
      { id: 'partial-2', billingId: 'bill-1', homeownerId: 'home-1', amount: 200, status: 'approved', submittedAt: '2026-10-02' },
      { id: 'foreign', billingId: 'bill-1', homeownerId: 'home-2', amount: 1000, status: 'approved' },
    ];
    async function groupedHistory() {
      await page.evaluate(async () => { closeModal(); await api.loadAll(); renderHOHistory(); });
      await page.getByRole('button', { name: 'Details', exact: true }).first().click();
    }
    async function groupedLayout() {
      const geometry = await page.evaluate(() => {
        const body = document.getElementById('modalBody');
        return { width: body.clientWidth, scroll: body.scrollWidth, documentWidth: document.documentElement.clientWidth,
          documentScroll: document.documentElement.scrollWidth,
          progress: [...document.querySelectorAll('.resident-payment-transaction .payment-progress')].map(el => ({
            visible: getComputedStyle(el).display !== 'none', circles: [...el.querySelectorAll('.payment-progress-circle')].map(c => c.getBoundingClientRect().y),
            labels: [...el.querySelectorAll('.payment-progress-label')].map(c => c.getBoundingClientRect().toJSON()) })) };
      });
      assert.ok(geometry.scroll <= geometry.width + 1, 'grouped modal has no horizontal overflow');
      assert.ok(geometry.documentScroll <= geometry.documentWidth + 1, 'history has no page overflow');
      geometry.progress.forEach(p => {
        assert.ok(p.visible, 'progress is not collapsed');
        assert.equal(new Set(p.circles).size, 1, 'stage circles align');
        p.labels.slice(1).forEach((label, i) => assert.ok(label.x >= p.labels[i].right - 1, 'labels do not overlap'));
      });
    }
    await groupedHistory();
    assert.equal(await page.getByRole('button', { name: 'Details', exact: true }).count(), 1);
    assert.equal(await page.locator('.resident-payment-transaction').count(), 3);
    assert.equal(await page.locator('.resident-payment-transaction[open]').count(), 0, 'payments start collapsed');
    assert.equal(await page.locator('[data-transaction-id="partial-1"] .payment-progress').isVisible(), false);
    const firstToggle = page.locator('[data-transaction-id="partial-1"] summary');
    assert.match(await firstToggle.innerText(), /Payment 1[\s\S]*Sep 30, 2026[\s\S]*Approved[\s\S]*₱300.00/);
    await firstToggle.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-transaction-id="partial-1"] .payment-progress').isVisible(), true);
    await page.keyboard.press('Space');
    assert.equal(await page.locator('[data-transaction-id="partial-1"] .payment-progress').isVisible(), false);
    for (const toggle of await page.locator('.resident-payment-toggle').all()) await toggle.click();
    assert.deepEqual(await page.locator('.resident-payment-transaction').evaluateAll(els => els.map(el => el.dataset.transactionId)), ['partial-1', 'partial-2', 'partial-3']);
    assert.deepEqual(await page.locator('.resident-payment-transaction').evaluateAll(els => els.map(el => el.querySelectorAll('.is-complete').length)), [4, 4, 2]);
    assert.equal(await page.locator('progress').getAttribute('value'), '50');
    assert.match(await page.locator('.resident-billing-summary').innerText(), /Partially Paid[\s\S]*For Verification/);
    assert.match(await page.locator('[data-transaction-id="partial-1"]').innerText(), /Payment Recorded[\s\S]*Sep 30, 2026/);
    await page.getByRole('button', { name: 'View Receipt', exact: true }).click();
    assert.equal(await page.locator('#receiptLightbox img').getAttribute('src'), receipt);
    await page.locator('#receiptLightbox button').click();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const width of [320, 375, 524, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await groupedLayout();
        if (process.env.PAYMENT_HISTORY_SCREENSHOT && [375, 1280].includes(width)) {
          await page.evaluate(() => { document.getElementById('modalBody').scrollTop = 0; });
          await page.screenshot({ path: process.env.PAYMENT_HISTORY_SCREENSHOT.replace(/\.png$/, `-${theme}-${width}.png`) });
          if (width === 375) {
            await page.locator('[data-transaction-id="partial-2"] summary').scrollIntoViewIfNeeded();
            await page.screenshot({ path: process.env.PAYMENT_HISTORY_SCREENSHOT.replace(/\.png$/, `-${theme}-transaction.png`) });
          }
        }
      }
    }
    if (process.env.PAYMENT_HISTORY_SCREENSHOT) await page.screenshot({ path: process.env.PAYMENT_HISTORY_SCREENSHOT });
    await page.locator('[data-transaction-id="partial-2"] summary').click();
    await page.locator('[data-transaction-id="partial-3"] summary').focus();
    server.payments[0].status = 'approved';
    await page.evaluate(() => refreshResidentPaymentDetail(document.getElementById('residentPaymentDetail')));
    assert.deepEqual(await page.locator('.resident-payment-transaction').evaluateAll(els => els.map(el => el.open)), [true, false, true], 'refresh preserves independent dropdown states');
    assert.equal(await page.evaluate(() => document.activeElement.closest('[data-transaction-id]')?.dataset.transactionId), 'partial-3', 'refresh preserves toggle focus');
    assert.match(await page.locator('[data-transaction-id="partial-3"] summary').innerText(), /Approved/);
    assert.equal(await page.locator('progress').getAttribute('value'), '100');
    assert.equal(await page.locator('[data-transaction-id="partial-3"] .is-complete').count(), 4);
    assert.match(await page.locator('.resident-history-table').innerText(), /Fully Paid/);
    // Fresh page/session must restore all three saved approved transactions.
    await boot();
    await groupedHistory();
    assert.equal(await page.locator('.resident-payment-transaction[open]').count(), 0, 'fresh session starts collapsed');
    await page.locator('[data-transaction-id="partial-3"] summary').click();
    assert.equal(await page.locator('progress').getAttribute('value'), '100');
    assert.equal(await page.locator('.resident-payment-transaction .is-complete').count(), 12);
    // Exercise the rejection branch from a pending saved record.
    server.payments[0].status = 'pending';
    await page.evaluate(() => refreshResidentPaymentDetail(document.getElementById('residentPaymentDetail')));
    server.payments[0].status = 'rejected';
    server.payments[0].rejection_reason = '<script>bad()</script> Blurry receipt';
    await page.evaluate(() => refreshResidentPaymentDetail(document.getElementById('residentPaymentDetail')));
    assert.equal(await page.locator('progress').getAttribute('value'), '50');
    assert.equal(await page.locator('[data-transaction-id="partial-3"] .is-complete').count(), 3);
    assert.equal(await page.locator('[data-transaction-id="partial-3"] .is-rejected .payment-progress-label').textContent(), 'Rejected');
    assert.match(await page.locator('.rejection-reason-callout').innerText(), /Blurry receipt/);
    assert.equal(await page.locator('.rejection-reason-callout script').count(), 0);
    await page.getByRole('button', { name: 'Submit Another Proof' }).click();
    await active('GCash Payment');
    await page.getByRole('button', { name: "I've Paid — Submit Payment" }).click();
    assert.equal(await page.locator('#sub_pay_amount').inputValue(), '500.00');
    // New successful submission retains the rejected transaction in the group.
    server.payments.push({ id: 'partial-4', billingId: 'bill-1', homeownerId: 'home-1', amount: 500, status: 'approved', submittedAt: '2026-10-04' });
    await groupedHistory();
    assert.equal(await page.locator('.resident-payment-transaction').count(), 4);
    assert.equal(await page.locator('progress').getAttribute('value'), '100');
    assert.equal(await page.locator('.is-rejected.payment-progress-step').count(), 1);
    // Identical titles never merge different billings; missing billings stay visible.
    server.billings.push({ ...server.billings[0], id: 'bill-2' });
    server.payments.push({ id: 'separate', billingId: 'bill-2', homeownerId: 'home-1', amount: 1000, status: 'approved' },
      { id: 'legacy', billingId: 'missing', homeownerId: 'home-1', amount: 50, status: 'approved' });
    await groupedHistory();
    assert.equal(await page.getByRole('button', { name: 'Details', exact: true }).count(), 3);
    await page.evaluate(() => { closeModal(); openResidentPaymentDetail('legacy', true); });
    assert.equal(await page.locator('progress').count(), 0);
    assert.match(await page.locator('.resident-billing-summary').innerText(), /original billing amount is unavailable/);
    // Read-only history access still rejects a foreign transaction even if cached.
    await page.evaluate(() => { closeModal(); openResidentPaymentDetail('foreign', true); });
    assert.equal(await page.locator('#modalOverlay').isVisible(), false);
    assert.equal(await page.evaluate(() => toasts.at(-1)[1]), 'Access Denied');
    await groupedHistory();
    await page.evaluate(async () => {
      const refresh = refreshResidentPaymentDetail(document.getElementById('residentPaymentDetail'));
      window.homeownerId = 'home-2';
      closeModal();
      await refresh;
    });
    assert.equal(await page.locator('#modalOverlay').isVisible(), false, 'old account refresh cannot reopen details');
    await page.evaluate(() => { window.homeownerId = 'home-1'; });
    // An unlinked advance follows its saved ID when approval links it to a bill.
    const advanceFields = { homeownerId: 'home-1', monthly_dues_month: '2026-12', payment_type: 'monthly_dues', payment_source: 'resident_submission', amount: 1000 };
    server.payments.push({ ...advanceFields, id: 'advance-rejected', status: 'rejected', submittedAt: '2026-10-06' },
      { ...advanceFields, id: 'advance-pending', status: 'pending', submittedAt: '2026-10-07' });
    await page.evaluate(async () => { await api.loadAll(); openResidentPaymentDetail('advance-pending', true); });
    assert.equal(await page.locator('.resident-payment-transaction').count(), 2);
    assert.equal(await page.locator('progress').getAttribute('value'), '0');
    server.billings.push({ id: 'december', title: 'December dues', amount: 1000, monthly_dues_month: '2026-12' });
    Object.assign(server.payments.find(p => p.id === 'advance-pending'), { billingId: 'december', status: 'approved' });
    await page.evaluate(() => refreshResidentPaymentDetail(document.getElementById('residentPaymentDetail')));
    assert.equal(await page.locator('.resident-payment-transaction').count(), 1);
    assert.equal(await page.locator('progress').getAttribute('value'), '100');
    assert.equal(await page.evaluate(() => getResidentPaymentHistoryGroups().flatMap(g => g.payments).filter(p => p.id === 'advance-pending').length), 1);
    await page.evaluate(() => closeModal());
    // Pending advance payments also block new submissions before an upload starts.
    await page.evaluate(() => {
      cache.payments.push({ id: 'advance', homeownerId: 'home-1', monthly_dues_month: '2026-11', status: 'pending' });
      openPayNowModal({ month: '2026-11', amount: 100 });
    });
    assert.equal(await page.evaluate(() => toasts.at(-1)[1]), 'Payment Pending');
    assert.equal(await page.locator('#modalOverlay').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log('PASS: submission steps, failures, duplicate guard, independent grouped transaction progress, approved-only totals, approval/rejection refresh, resubmission, cash, receipts, legacy records, same-title billings, advance linking, fresh-session restoration, account isolation, modal guards, and light/dark layouts at 320/375/524/768/1280px.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
