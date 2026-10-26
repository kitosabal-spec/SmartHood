const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

const root = path.join(__dirname, '..');
const elements = {};
const downloads = [];
const notices = [];
const audit = [];
function element() {
  return { value: '', innerHTML: '', style: {}, disabled: false, classList: { add() {}, remove() {} },
    addEventListener() {}, setAttribute() {}, removeAttribute() {}, remove() {}, click() {},
    appendChild(child) { child.parentNode = this; }, removeChild(child) { child.parentNode = null; } };
}
const context = vm.createContext({ console, Blob, Intl, Date, setTimeout: fn => { /* no background UI timers */ }, clearTimeout() {},
  history: {}, localStorage: { getItem() { return null; } },
  document: { readyState: 'loading', addEventListener() {}, getElementById: id => elements[id] ||= element(),
    createElement: element, body: element(), head: element() },
  URL: { createObjectURL(blob) { downloads.push(blob); return 'blob:test'; }, revokeObjectURL() {} },
  addEventListener() {}, normalizeComplaintStatus: status => status === 'Open' ? 'Reviewed' : status,
});
context.window = context;
vm.runInContext(fs.readFileSync(path.join(root, 'public/js/main.js'), 'utf8'), context);
// ExcelJS uses instanceof Array internally: evaluate the builder in its realm.
const workbookContext = new Function('REPORT_FINANCIAL_HEADERS', 'toMoneyNumber', 'normalizeComplaintStatus',
  fs.readFileSync(path.join(root, 'public/js/report-workbook.js'), 'utf8') + '\nreturn buildReportsWorkbook;');
context.buildReportsWorkbook = workbookContext(runHeaders(), context.toMoneyNumber, context.normalizeComplaintStatus);
function runHeaders() { return Array.from(vm.runInContext('REPORT_FINANCIAL_HEADERS', context)); }
context.showToast = (...args) => notices.push(args);
context.logAction = value => audit.push(value);
context.syncHomeownerBalances = () => {};
context.renderMonthlyBarChart = () => {};
context.renderDonut = () => {};
context.complaintCategoryBadge = value => value;
context.complaintStatusBadge = value => value;
context.renderBillingCollectionTable = () => {};
context.renderHOBalanceReportTable = () => {};

const run = code => vm.runInContext(code, context);
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
  run(`
    currentUser = { id: 'admin', role: 'admin', permissions: ['*'] };
    reportsDateFilterState = { preset: 'range', startDate: '2026-01-01', endDate: '2026-01-31' };
    dbCache.homeowners = [
      { id: '00001', name: '=1+1', block: '01', lot: '002', email: 'first@example.test' },
      { id: '00002', name: 'Santos, "Maria"', block: '02', lot: '010', username: 'maria' },
      { id: 'inactive', name: 'No activity' }
    ];
    dbCache.billings = [
      { id: '0001234567890123456789', title: 'January dues', amount: 100, assignedTo: ['00001', '00002'], createdAt: '2026-01-01' },
      { id: 'special', title: '=HYPERLINK("https://example.test")', amount: 50, assignedTo: ['00001'], createdAt: '2026-01-31' },
      { id: 'outside', title: 'Prior billing', amount: 20, assignedTo: ['00002'], createdAt: '2025-12-31' }
    ];
    dbCache.payments = [
      { homeownerId: '00001', billingId: '0001234567890123456789', status: 'approved', amount: 40, reviewedAt: '2026-01-05', payment_date: '2025-12-30' },
      { homeownerId: '00002', billingId: '0001234567890123456789', status: 'approved', amount: 100, reviewedAt: '2026-01-05' },
      { homeownerId: '00001', billingId: 'special', status: 'approved', amount: 80, reviewedAt: '2026-01-07' },
      { homeownerId: '00001', billingId: null, monthly_dues_month: '2027-02', status: 'approved', amount: 30, reviewedAt: '2026-01-10' },
      { homeownerId: '00001', billingId: null, monthly_dues_month: '2027-02', status: 'approved', amount: 10, reviewedAt: '2026-01-10' },
      { homeownerId: '00002', billingId: 'outside', status: 'approved', amount: 20, reviewedAt: '2026-01-11' },
      { homeownerId: '00002', billingId: null, status: 'approved', amount: 5, reviewedAt: '2026-01-12' },
      { homeownerId: '00001', billingId: 'special', status: 'pending', amount: 9, submittedAt: '2026-01-15' },
      { homeownerId: '00002', billingId: 'special', status: 'rejected', amount: 7, payment_date: '2026-01-31' },
      { homeownerId: '00001', billingId: 'special', status: 'approved', amount: 999, reviewedAt: '2026-02-01' }
    ];
    dbCache.complaints = ['Open', 'In Progress', 'Resolved', 'Rejected', 'Unknown'].map(status => ({ status, dateFiled: '2026-01-15' }));
    currentReportsData = null;
  `);
  elements.hoBalanceSearch = element();
  elements.hoBalanceStatusFilter = element();
}

async function main() {
  fixture();
  context.renderReports();
  const data = context.getReportExportData();
  assert.equal(data.totalDue, 250);
  assert.equal(data.totalPaid, 285);
  assert.equal(data.totalOutstanding, 0);
  assert.equal(data.reportUsers.length, 2);
  assert.equal(data.analysisYear, 2027, 'analysis year follows the page, including future advance dues');
  assert.equal(data.monthlyData[1].v, 40);
  assert.deepEqual(plain(data.financial.totals), ['Total', '', 290, 260, 60, 3, 1, '']);
  assert.equal(data.financial.rows[0][7], 'No due date');
  assert.equal(data.balanceRows[0][4], 30, 'per-homeowner overpayment offsets another billing per existing rule');
  assert.equal(data.balanceRows[1][4], 0);
  assert.equal(data.financial.rows[0][6], 1, 'partial payments remain not fully paid');
  assert.match(elements.contentArea.innerHTML, /Excel \(\.xlsx\)/);
  assert.match(elements.contentArea.innerHTML, /CSV \(\.csv\)/);
  assert.match(elements.contentArea.innerHTML, /Monthly Collections \(2027\)/);

  elements.hoBalanceSearch.value = 'EXAMPLE.TEST';
  elements.hoBalanceStatusFilter.value = 'due';
  assert.equal(context.getReportExportData().balanceRows.length, 1);
  elements.hoBalanceStatusFilter.value = 'clear';
  assert.equal(context.getReportExportData().balanceRows.length, 0);
  elements.hoBalanceSearch.value = '010';
  assert.equal(context.getReportExportData().balanceRows[0][0], 'Santos, "Maria"');
  elements.hoBalanceSearch.value = '';
  elements.hoBalanceStatusFilter.value = '';

  assert.equal(context.csvEscape('"a,b"\r\nc'), '"""a,b""\r\nc"');
  for (const text of ['=1+1', '+cmd', '-cmd', '@SUM(A1)', '  =1+1', '\ttext', '\rtext']) {
    assert.ok(context.csvEscape(text).includes("'"), 'formula-like text is neutralized');
  }
  assert.equal(context.csvRow(['negative', -12.5, 2], [1]), 'negative,-12.50,2');
  context.exportReportsFinancialCSV();
  const bytes = Buffer.from(await downloads.at(-1).arrayBuffer());
  assert.equal(bytes.subarray(0, 3).toString('hex'), 'efbbbf');
  const csv = bytes.subarray(3).toString('utf8');
  assert.ok(csv.includes("'0001234567890123456789"), 'CSV identifier text marker retains all digits');
  assert.ok(csv.includes('290.00,260.00,60.00,3,1,\r\n'));
  assert.ok(csv.includes('No due date'));
  const parsed = await new ExcelJS.Workbook().csv.read(require('node:stream').Readable.from([csv]));
  parsed.eachRow(row => assert.equal(row.values.length, row.getCell(1).value === 'Total' ? 8 : 9, 'eight columns; ExcelJS omits the trailing empty total cell'));
  assert.equal(parsed.rowCount, 5);
  assert.match(audit.at(-1), /CSV: SmartHood_Financial_Collections_2026-01-01_to_2026-01-31.csv/);
  assert.ok(notices.some(n => n[1] === 'Download Complete'));

  const workbook = context.buildReportsWorkbook(ExcelJS, { ...plain(data), generatedAt: new Date('2026-10-21T00:00:00Z') },
    'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public/images/SH Logo.png')).toString('base64'));
  const buffer = await workbook.xlsx.writeBuffer();
  const copy = new ExcelJS.Workbook();
  await copy.xlsx.load(buffer);
  assert.deepEqual(copy.worksheets.map(s => s.name), ['Summary', 'Financial Collections', 'Monthly Collections', 'Payment Status', 'Complaint Status', 'Homeowner Balances']);
  assert.equal(copy.getWorksheet('Financial Collections').getCell('B8').value, '0001234567890123456789');
  assert.equal(copy.getWorksheet('Financial Collections').getCell('H8').value, 'No due date');
  assert.equal(copy.getWorksheet('Homeowner Balances').getCell('A8').value, '=1+1');
  assert.equal(copy.getWorksheet('Homeowner Balances').getCell('C8').value, '01');
  assert.equal(copy.getWorksheet('Financial Collections').getCell('C8').type, ExcelJS.ValueType.Number);
  assert.match(copy.getWorksheet('Financial Collections').getCell('C8').numFmt, /₱.*0\.00/);
  assert.equal(copy.getWorksheet('Summary').getCell('B11').numFmt, '#,##0');
  assert.match(copy.getWorksheet('Summary').getCell('A5').value, /08:00:00 AM \(Asia\/Manila\)/);
  assert.deepEqual(copy.getWorksheet('Payment Status').getRow(8).values.slice(1), ['Approved', 7, 285]);
  assert.match(copy.getWorksheet('Complaint Status').getCell('A6').value, /1 are outside/);
  for (const sheet of copy.worksheets) {
    assert.equal(sheet.views[0].ySplit, 7);
    assert.equal(sheet.pageSetup.printTitlesRow, '7:7');
    assert.ok(sheet.autoFilter);
    assert.equal(sheet.getCell('A7').fill.fgColor.argb, 'FF177A80');
    assert.equal(sheet.getCell('A9').fill.fgColor.argb, 'FFF2FAFB');
    assert.match(sheet.headerFooter.oddFooter, /Page &P of &N/);
    sheet.eachRow(row => row.eachCell(cell => assert.notEqual(cell.type, ExcelJS.ValueType.Formula)));
  }
  const zip = await JSZip.loadAsync(buffer);
  assert.ok(zip.file('xl/media/image1.png'));
  assert.match(await zip.file('xl/worksheets/sheet2.xml').async('string'), /t="s"/);

  // Verify all records export beyond both page sizes without moving the UI.
  run(`dbCache.billings = Array.from({length: 23}, (_, i) => ({id: 'b'+i, title: 'Billing '+i, amount: 100, assignedTo: ['00001'], createdAt: '2026-01-01'}));
    currentReportsData = getReportsData(); billingCollectionPaginationState.page = 3; billingCollectionPaginationState.pageSize = 5;`);
  assert.equal(context.getReportExportData().financial.rows.length, 24); // includes advance month
  run(`dbCache.homeowners = Array.from({length: 27}, (_, i) => ({id: 'h'+i, name: 'Resident '+i}));
    dbCache.billings[0].assignedTo = dbCache.homeowners.map(h => h.id);
    currentReportsData = getReportsData(); hoBalancePaginationState.page = 2; hoBalancePaginationState.pageSize = 10;`);
  assert.equal(context.getReportExportData().balanceRows.length, 27);

  fixture();
  run(`reportsDateFilterState = { preset: 'date', date: '2024-01-01' };`);
  const empty = context.getReportExportData();
  assert.equal(empty.financial.rows.length, 0);
  assert.equal(empty.balanceRows.length, 0);
  const emptyBook = context.buildReportsWorkbook(ExcelJS, { ...plain(empty), generatedAt: empty.generatedAt });
  assert.match(emptyBook.getWorksheet('Financial Collections').getCell('A8').value, /No matching records/);
  await new ExcelJS.Workbook().xlsx.load(await emptyBook.xlsx.writeBuffer());
  context.exportReportsFinancialCSV();
  assert.match(notices.at(-1)[2], /No matching financial records/);

  const before = downloads.length;
  run(`currentUser = null;`);
  context.exportReportsFinancialCSV();
  await context.exportReportsExcel();
  assert.equal(downloads.length, before);
  assert.equal(notices.at(-1)[1], 'Access Denied');

  // Exercise the real asynchronous download handler, including failures and
  // permission revocation while serialization is running.
  fixture();
  context.ExcelJS = ExcelJS;
  context.loadReportWorkbookLogo = async () => null;
  const builder = context.buildReportsWorkbook;
  context.buildReportsWorkbook = (library, snapshot, logo) => builder(library,
    { ...plain(snapshot), generatedAt: snapshot.generatedAt }, logo);
  await context.exportReportsExcel();
  assert.equal(downloads.at(-1).type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.match(audit.at(-1), /XLSX: SmartHood_Reports_Analytics_2026-01-01_to_2026-01-31_Analysis_2027.xlsx/);
  await new ExcelJS.Workbook().xlsx.load(await downloads.at(-1).arrayBuffer());
  assert.equal(elements.reportsDownloadButton.disabled, false);
  const downloaded = downloads.length;
  context.console = { ...console, error() {} };
  context.buildReportsWorkbook = () => ({ xlsx: { writeBuffer: async () => { throw new Error('test write failure'); } } });
  await context.exportReportsExcel();
  assert.equal(downloads.length, downloaded);
  assert.match(notices.at(-1)[2], /test write failure/);
  assert.equal(elements.reportsDownloadButton.disabled, false);
  context.buildReportsWorkbook = () => ({ xlsx: { writeBuffer: async () => { run('currentUser = null'); return buffer; } } });
  await context.exportReportsExcel();
  assert.equal(downloads.length, downloaded);
  assert.match(notices.at(-1)[2], /no longer have access/);
  assert.equal(elements.reportsDownloadButton.disabled, false);

  const output = process.env.REPORT_TEST_OUTPUT || path.join(os.tmpdir(), 'smarthood-report-export-test');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'SmartHood_Reports_Analytics_Test.xlsx'), buffer);
  fs.writeFileSync(path.join(output, 'SmartHood_Financial_Collections_Test.csv'), bytes);
  fs.writeFileSync(path.join(output, 'report-fixture.json'), JSON.stringify(data));
  console.log(`PASS: calculations, page parity, filters, pagination, CSV safety, permissions, XLSX types/style/print round-trip. Synthetic samples: ${output}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
