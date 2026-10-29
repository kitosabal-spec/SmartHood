'use strict';
// Isolated browser test: real QR editor/canvas and modal, synthetic uploads only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.REPORT_BROWSER_EXECUTABLE ? { executablePath: process.env.REPORT_BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://qr.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="modalOverlay" class="modal-overlay hidden"><div id="modal" class="modal"><div class="modal-header"><h3 id="modalTitle"></h3></div><div id="modalBody" class="modal-body"></div><div id="modalFooter" class="modal-footer"></div></div></div></body></html>' }));
    await page.goto('http://qr.test/');
    await page.route('http://qr.test/uploaded-qr.png*', async route => {
      const bytes = await page.evaluate(() => uploads.at(-1).bytes);
      await route.fulfill({ contentType: 'image/png', body: Buffer.from(bytes) });
    });
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'public/css/style.css'), 'utf8').replace(/^@import[^\r\n]*[\r\n]*/m, '') });
    await page.addStyleTag({ path: path.join(root, 'public/css/billing.css') });
    const main = fs.readFileSync(path.join(root, 'public/js/main.js'), 'utf8');
    await page.addScriptTag({ content: main.slice(main.indexOf('function openModal('), main.indexOf('function closeModalOutside(')) });
    await page.addScriptTag({ path: path.join(root, 'public/js/billing.js') });
    await page.evaluate(() => {
      window.pendingPhotoFile = null;
      window.pendingPhotoPreviewUrl = null;
      window.canManagePayments = () => true;
      window.showLoading = window.hideLoading = () => {};
      window.toasts = [];
      window.showToast = (...args) => toasts.push(args);
      window.escapeHtml = text => String(text).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
      window.uploads = [];
      window.api = {
        getPaymentSettings: async () => ({ account_name: 'Test HOA', account_number: '09170000000', is_active: 1 }),
        uploadPaymentQr: async form => {
          if (window.failUpload) throw new Error('Test upload failure');
          const file = form.get('qr');
          uploads.push({ name: file.name, type: file.type, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) });
          return { qr_code_path: '/uploaded-qr.png' };
        },
      };
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 400, 800);
      ctx.fillStyle = 'black'; ctx.fillRect(40, 240, 320, 320);
      window.fixtureImage = canvas.toDataURL('image/png');
    });
    const image = Buffer.from((await page.evaluate(() => fixtureImage)).split(',')[1], 'base64');
    const selectFile = () => page.locator('#ps_qr_file_input').setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: image });
    await page.evaluate(() => openPaymentSettingsModal());
    await page.locator('#ps_account_name').fill('Unsaved account edit');
    await selectFile();
    await page.locator('#ps_qr_canvas').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => uploads.length), 0, 'selection must not upload');
    await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
    assert.equal(await page.evaluate(() => toasts.at(-1)[1]), 'Finish QR Adjustment');
    await page.locator('#ps_qr_zoom').fill('2');
    const canvas = page.locator('#ps_qr_canvas');
    await canvas.focus();
    await page.keyboard.press('ArrowDown');
    assert.ok(await page.evaluate(() => document.getElementById('ps_qr_section').qrCrop.y > 0));
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 30);
    await page.mouse.up();
    assert.ok(await page.evaluate(() => document.getElementById('ps_qr_section').qrCrop.y > 0.05));
    await page.getByRole('button', { name: 'Rotate 90°' }).click();
    assert.equal(await page.evaluate(() => document.getElementById('ps_qr_section').qrCrop.rotation), 90);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => { const { x, y, zoom, rotation } = document.getElementById('ps_qr_section').qrCrop; return { x, y, zoom, rotation }; }), { x: 0, y: 0, zoom: 1, rotation: 0 });
    await page.getByRole('button', { name: 'Cancel Crop' }).click();
    assert.equal(await page.evaluate(() => uploads.length), 0);
    assert.equal(await page.locator('#ps_account_name').inputValue(), 'Unsaved account edit');
    await selectFile();
    await page.locator('#ps_qr_canvas').waitFor({ state: 'visible' });
    await page.locator('#ps_qr_zoom').fill('2');
    await page.evaluate(() => { window.failUpload = true; });
    await page.getByRole('button', { name: 'Upload Cropped QR' }).click();
    await page.waitForFunction(() => toasts.at(-1)[1] === 'Upload Failed');
    assert.equal(await canvas.isVisible(), true, 'failed upload retains editable crop');
    await page.evaluate(() => { window.failUpload = false; });
    await page.getByRole('button', { name: 'Upload Cropped QR' }).click();
    await page.waitForFunction(() => uploads.length === 1);
    assert.equal(await page.locator('#ps_account_name').inputValue(), 'Unsaved account edit');
    const uploaded = await page.evaluate(async () => {
      const file = uploads[0];
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(file.bytes)], { type: file.type }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
      return { type: file.type, width: bitmap.width, height: bitmap.height,
        corner: Array.from(ctx.getImageData(0, 0, 1, 1).data), center: Array.from(ctx.getImageData(200, 200, 1, 1).data) };
    });
    assert.deepEqual(uploaded, { type: 'image/png', width: 400, height: 400, corner: [255, 255, 255, 255], center: [0, 0, 0, 255] });
    await page.waitForFunction(() => document.getElementById('ps_qr_preview_img').naturalWidth === 400);
    // Test an existing image using the same decode/edit path, including narrow layouts.
    await page.getByRole('button', { name: 'Adjust / Crop' }).click();
    await canvas.waitFor({ state: 'visible' });
    await page.setViewportSize({ width: 375, height: 900 });
    assert.ok(await canvas.evaluate(el => el.getBoundingClientRect().right <= window.innerWidth));
    await page.getByRole('button', { name: 'Upload Cropped QR' }).scrollIntoViewIfNeeded();
    if (process.env.QR_CROP_SCREENSHOT) await page.screenshot({ path: process.env.QR_CROP_SCREENSHOT, fullPage: true });
    await page.getByRole('button', { name: 'Cancel Crop' }).click();
    await page.locator('#ps_qr_file_input').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await page.waitForFunction(() => toasts.at(-1)[1] === 'Image Unavailable');
    assert.equal(await page.locator('#ps_qr_current').isVisible(), true);
    assert.equal(await page.evaluate(() => uploads.length), 1);
    assert.deepEqual(errors, []);
    console.log('PASS: QR crop preview, zoom, drag, keyboard, rotation, reset, cancel, retry, PNG pixels, existing image, mobile layout, invalid image and preserved form edits.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
