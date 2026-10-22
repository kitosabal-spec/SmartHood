const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ExcelJS = require('exceljs');
const read = name => fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8');
const build = new Function(read('audit-workbook.js') + '\nreturn buildAuditLogWorkbook;')();

function fixture() {
  const elements = {};
  const downloads = [];
  const notices = [];
  const element = () => ({ value: '', innerHTML: 'Export Excel', style: {}, disabled: false,
    setAttribute() {}, removeAttribute() {}, remove() {}, click() { downloads.push(this.download); } });
  const c = vm.createContext({ console, Date, Intl, Blob, history: {}, setTimeout() {}, clearTimeout() {},
    localStorage: { getItem() { return null; } },
    document: { readyState: 'loading', addEventListener() {}, getElementById: id => elements[id] ||= element(),
      createElement: element, body: { appendChild() {} } },
    URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} }, addEventListener() {} });
  c.window = c;
  vm.runInContext(read('main.js') + '\n' + read('audit-workbook.js'), c);
  const run = code => vm.runInContext(code, c);
  run("currentUser = { id: 'admin', role: 'admin' }; dbCache.users = [{ id: 'known', name: '=Named actor' }]");
  c.showToast = (...args) => notices.push(args);
  c.buildAuditLogWorkbook = build;
  c.loadReportsExcelLibrary = async () => ExcelJS;
  c.records = Array.from({ length: 25 }, (_, i) => ({ id: `000${i}`, adminId: i ? 'deleted-account' : 'known',
    action: i ? 'Saved [REDACTED] ' + 'long action '.repeat(30) : '=HYPERLINK("test")',
    timestamp: i === 24 ? 'unparseable legacy' : '2026-10-22T06:30:00Z' }));
  run("api.request = async () => records;");
  return { c, run, elements, downloads, notices };
}

test('audit workbook round trip preserves every row, literal text, fallback and presentation', async () => {
  const { c } = fixture();
  const data = { generatedAt: new Date('2026-10-22T06:30:00Z'), filters: { mode: 'all', search: '=filter' },
    rows: c.records.map(item => ({ ...item, performer: c.getAuditPerformerName(item.adminId), timestamp: c.formatAuditExportTimestamp(item.timestamp) })) };
  const book = build(ExcelJS, data);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await book.xlsx.writeBuffer());
  const s = reopened.getWorksheet('Audit Log');
  assert.equal(reopened.worksheets.length, 1);
  assert.equal(s.rowCount, 33);
  assert.equal(s.getCell('B9').value, '0000');
  assert.equal(s.getCell('B9').numFmt, '@');
  assert.equal(s.getCell('C9').value, '=HYPERLINK("test")');
  assert.equal(s.getCell('C9').type, ExcelJS.ValueType.String);
  assert.equal(s.getCell('D9').value, '=Named actor');
  assert.equal(s.getCell('D10').value, 'deleted-account');
  assert.equal(s.getCell('F9').value, '2026-10-22 14:30:00 Asia/Manila');
  assert.equal(s.getCell('F33').value, 'unparseable legacy');
  assert.equal(s.getCell('C10').value, data.rows[1].action);
  assert.ok(s.getRow(10).height > 26);
  assert.equal(s.getCell('C10').alignment.wrapText, true);
  assert.equal(s.getCell('C8').fill.fgColor.argb, 'FF177A80');
  assert.equal(s.getCell('C10').fill.fgColor.argb, 'FFF2FAFB');
  assert.equal(s.getCell('C9').font.name, 'Calibri');
  assert.equal(s.views[0].ySplit, 8);
  assert.equal(s.views[0].showGridLines, false);
  assert.equal(s.autoFilter, 'A8:F33');
  assert.equal(s.pageSetup.orientation, 'landscape');
  assert.equal(s.pageSetup.fitToHeight, 0);
  assert.equal(s.pageSetup.printTitlesRow, '8:8');
  assert.equal(c.getAuditPerformerName(null), 'System');
  assert.match(c.formatAuditExportTimestamp('10/22/2026, 2:30 PM'), /Asia\/Manila$/);
});

test('shared filtering covers search, dates and all pagination pages', () => {
  const { c, run } = fixture();
  const filters = { mode: 'all', search: '' };
  run('auditLogPaginationState = { page: 3, pageSize: 10 };');
  assert.equal(c.getFilteredAuditLogs(c.records, filters).length, 25);
  assert.equal(c.getFilteredAuditLogs(c.records, filters)[0].id, '00024');
  assert.equal(c.getFilteredAuditLogs(c.records, { ...filters, search: '=Named' }).length, 1);
  assert.equal(c.getFilteredAuditLogs(c.records, { ...filters, search: 'missing' }).length, 0);
  const local = new Date('2026-10-22T06:30:00Z');
  const date = `${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}`;
  for (const mode of ['date', 'range', 'today', 'week', 'month']) {
    assert.equal(c.getFilteredAuditLogs(c.records, { ...filters, mode, date, startDate: date, endDate: date }, local).length, 24);
  }
});

test('export snapshots filters and records, blocks duplicates and restores button', async () => {
  const { c, elements, downloads } = fixture();
  let release;
  c.loadReportsExcelLibrary = () => new Promise(resolve => { release = resolve; });
  let snapshot;
  c.buildAuditLogWorkbook = (lib, data) => { snapshot = data; return build(lib, data); };
  const pending = c.exportAuditLogExcel();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.auditLogExportButton.disabled, true);
  elements.logSearch.value = 'missing';
  c.records[0].action = 'changed during generation';
  await c.exportAuditLogExcel();
  release(ExcelJS);
  await pending;
  assert.equal(snapshot.rows.length, 25);
  assert.equal(snapshot.filters.search, '');
  assert.equal(snapshot.rows[24].action, '=HYPERLINK("test")');
  assert.equal(downloads.length, 1);
  assert.match(downloads[0], /^SmartHood_Audit_Log_\d{4}-\d{2}-\d{2}_\d{6}\.xlsx$/);
  assert.equal(elements.auditLogExportButton.disabled, false);
  assert.equal(elements.auditLogExportButton.innerHTML, 'Export Excel');
});

test('empty results, denied or expired sessions, revoked permissions and generation errors never download', async () => {
  for (const failure of ['empty', '401', '403', 'revoked', 'library', 'buffer', 'session']) {
    const { c, run, downloads, notices, elements } = fixture();
    if (failure === 'empty') c.records = [];
    if (['401', '403'].includes(failure)) run(`api.request = async () => { throw new Error('${failure}'); };`);
    if (failure === 'revoked') run("let calls = 0; api.request = async () => { if (++calls === 2) throw new Error('403 revoked'); return records; };");
    if (failure === 'library') c.loadReportsExcelLibrary = async () => { throw new Error('Library failed'); };
    if (failure === 'buffer') c.buildAuditLogWorkbook = () => ({ xlsx: { writeBuffer: async () => { throw new Error('Write failed'); } } });
    if (failure === 'session') c.loadReportsExcelLibrary = async () => { run('currentUser = null'); return ExcelJS; };
    await c.exportAuditLogExcel();
    assert.equal(downloads.length, 0, failure);
    assert.equal(elements.auditLogExportButton.disabled, false, failure);
    assert.equal(notices.at(-1)[0], failure === 'empty' ? 'info' : 'error', failure);
  }
});

test('filtered export uses fresh API records in table order, never cached data', async () => {
  const { c, run, downloads } = fixture();
  run("document.getElementById('logSearch').value = '[REDACTED]'; dbCache.auditLog = [{ id: 'stale', action: 'stale' }];");
  let snapshot;
  c.buildAuditLogWorkbook = (lib, data) => { snapshot = data; return build(lib, data); };
  await c.exportAuditLogExcel();
  assert.equal(downloads.length, 1);
  assert.equal(snapshot.rows.length, 24);
  assert.equal(snapshot.rows[0].id, '00024');
  assert.equal(snapshot.rows.at(-1).id, '0001');
  assert.equal(snapshot.filters.search, '[REDACTED]');
});

test('Excel cell limits cause an explicit error instead of truncating audit values', () => {
  assert.throws(() => build(ExcelJS, { generatedAt: new Date(), filters: { mode: 'all', search: '' },
    rows: [{ id: '1', action: 'x'.repeat(32768) }] }), /cell limit/);
});
