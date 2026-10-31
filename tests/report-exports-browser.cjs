// Optional real-browser integration check. Run the unit test first with the
// same REPORT_TEST_OUTPUT. PLAYWRIGHT_MODULE may point to an existing install.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ExcelJS = require('exceljs');
const output = process.env.REPORT_TEST_OUTPUT || path.join(require('node:os').tmpdir(), 'smarthood-report-export-test');
const root = path.join(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(path.join(output, 'report-fixture.json')));
const main = fs.readFileSync(path.join(root, 'public/js/main.js'), 'utf8');
const bootstrapIndex = main.lastIndexOf("if (document.readyState === 'loading')");
assert.ok(bootstrapIndex > 0);
// Isolated synthetic page: no login, live API, or real financial records.
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!doctype html><html><head><link rel="stylesheet" href="/public/css/style.css"><link rel="stylesheet" href="/public/css/reports.css"></head><body><div id="contentArea"></div><div id="toastContainer"></div><script src="/public/js/report-workbook.js"></script><script src="/test-main.js"></script><script src="/public/js/dashboard.js"></script></body></html>');
  }
  if (pathname === '/test-main.js') {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    return res.end(main.slice(0, bootstrapIndex));
  }
  const files = {
    '/public/vendor/exceljs-4.4.0.min.js': require.resolve('exceljs/dist/exceljs.min.js'),
    '/public/js/report-workbook.js': path.join(root, 'public/js/report-workbook.js'),
    '/public/js/dashboard.js': path.join(root, 'public/js/dashboard.js'),
    '/public/css/reports.css': path.join(root, 'public/css/reports.css'),
    '/public/css/style.css': path.join(root, 'public/css/style.css'),
    '/public/images/SH%20Logo.png': path.join(root, 'public/images/SH Logo.png'),
  };
  if (!files[pathname]) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'image/png');
  fs.createReadStream(files[pathname]).pipe(res);
});

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, ...(process.env.REPORT_BROWSER_EXECUTABLE ? { executablePath: process.env.REPORT_BROWSER_EXECUTABLE } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(data => {
      currentUser = { role: 'admin', id: 'test-admin' };
      dbCache.homeowners = data.users;
      dbCache.billings = data.billings;
      dbCache.payments = data.payments;
      dbCache.complaints = data.complaints;
      reportsDateFilterState = { preset: 'range', startDate: '2026-01-01', endDate: '2026-01-31' };
      syncHomeownerBalances = () => {};
      window.testAudit = [];
      logAction = message => window.testAudit.push(message);
      window.normalizeComplaintStatus = status => status === 'Open' ? 'Reviewed' : status;
      window.complaintCategoryBadge = () => '';
      window.complaintStatusBadge = status => status;
      window.avatarHTML = () => '';
      renderReports();
    }, fixture);
    await page.getByRole('tab', {name:'Collections',exact:true}).click();
    await page.locator('#hoBalanceStatusFilter').selectOption('due');
    const excelDownload = page.waitForEvent('download');
    await page.locator('#reportsDownloadButton').click();
    const download = await excelDownload;
    assert.match(download.suggestedFilename(), /Reports_Analytics_2026-01-01_to_2026-01-31_Analysis_2027\.xlsx$/);
    const excelPath = path.join(output, 'browser-' + download.suggestedFilename());
    await download.saveAs(excelPath);
    const workbook = await new ExcelJS.Workbook().xlsx.readFile(excelPath);
    assert.equal(workbook.worksheets.length, 6);
    assert.equal(workbook.getWorksheet('Homeowner Balances').getCell('A8').value, '=1+1');
    assert.equal(workbook.getWorksheet('Homeowner Balances').getCell('E9').value, 30);
    assert.match(workbook.getWorksheet('Homeowner Balances').getCell('E9').numFmt, /₱/);
    assert.match(workbook.getWorksheet('Homeowner Balances').getCell('A6').value, /Status: With Balance/);
    assert.equal(workbook.getWorksheet('Summary').getImages().length, 1);
    assert.equal(await page.locator('#reportsDownloadButton').isEnabled(), true);
    await page.locator('#reportsExportFormat').selectOption('csv');
    const csvDownload = page.waitForEvent('download');
    await page.locator('#reportsDownloadButton').click();
    const csv = await csvDownload;
    const csvPath = path.join(output, 'browser-' + csv.suggestedFilename());
    await csv.saveAs(csvPath);
    assert.equal(fs.readFileSync(csvPath).subarray(0, 3).toString('hex'), 'efbbbf');
    assert.equal((await page.evaluate(() => testAudit)).length, 2);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, 'report-download-controls.png'), fullPage: true });
    console.log('PASS: browser-rendered controls, lazy local bundle, logo loading, XLSX/CSV download files, active balance filter, notifications and audit callbacks.');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
