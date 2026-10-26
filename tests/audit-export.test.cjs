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
    timestamp: i === 24 ? 'unparseable legacy' : new Date(Date.parse('2026-10-22T06:30:00Z') + i * 60000).toISOString() }));
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
  assert.equal(s.autoFilter, 'A8:G33');
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
  assert.equal(c.getFilteredAuditLogs(c.records, filters)[0].id, '00023');
  assert.equal(c.getFilteredAuditLogs(c.records, filters).at(-1).id, '00024');
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
  assert.equal(snapshot.rows.find(row => row.id === '0000').action, '=HYPERLINK("test")');
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
  assert.equal(snapshot.rows[0].id, '00023');
  assert.equal(snapshot.rows.at(-1).id, '00024');
  assert.equal(snapshot.filters.search, '[REDACTED]');
});

test('Excel cell limits cause an explicit error instead of truncating audit values', () => {
  assert.throws(() => build(ExcelJS, { generatedAt: new Date(), filters: { mode: 'all', search: '' },
    rows: [{ id: '1', action: 'x'.repeat(32768) }] }), /cell limit/);
});

test('chronology uses event time across random migration IDs, offsets and legacy dates without mutating records', () => {
  const { c } = fixture();
  const rows = [
    { id: 'z-migration', timestamp: '2026-10-23T01:53:12.108Z' },
    { id: 'a-payment', timestamp: '2026-10-24T13:31:29+08:00' },
    { id: 'b-booking', timestamp: '2026-10-24T05:32:39Z' },
    { id: 'bad', timestamp: 'unknown' },
    { id: 'old', timestamp: '1/1/2020, 1:00 PM' },
    { id: 'tie', timestamp: '2026-10-24T05:32:39Z' },
  ];
  const original = JSON.stringify(rows);
  const expected = ['tie', 'b-booking', 'a-payment', 'z-migration', 'old', 'bad'];
  assert.deepEqual(Array.from(c.sortAuditLogs(rows), row => row.id), expected);
  assert.deepEqual(Array.from(c.sortAuditLogs([...rows].reverse()), row => row.id), expected);
  assert.equal(JSON.stringify(rows), original);
});

test('event-time actor names survive account rename/removal and match search and export', async () => {
  const { c, run } = fixture();
  c.records = [{ id: 'one', adminId: 'known', actor_name: 'Original Actor', action: 'Saved', timestamp: '2026-10-24T05:32:39Z' }];
  assert.equal(c.getAuditPerformerName('known', c.records[0]), 'Original Actor');
  assert.equal(c.getAuditPerformerName('system:migration'), 'Database migration');
  assert.equal(c.getFilteredAuditLogs(c.records, { mode: 'all', search: 'Original Actor' }).length, 1);
  run('dbCache.users = [];');
  let snapshot;
  c.buildAuditLogWorkbook = (lib, data) => { snapshot = data; return build(lib, data); };
  await c.exportAuditLogExcel();
  assert.equal(snapshot.rows[0].performer, 'Original Actor');
});

test('readable events omit technical evidence from the screen while retaining escaped references and timestamps', () => {
  const { c, elements } = fixture();
  c.renderPaginationComponent = () => {};
  const row = { id: 'one', adminId: 'known', actor_name: '<img src=x onerror=alert(1)>',
    action_type: 'created', entity_type: 'amenityBookings', entity_id: '<record>',
    action: 'homeowner (known) created amenityBookings (one): purpose: (empty) -> [redacted] <script>alert(1)</script>',
    timestamp: '2026-10-24T05:32:39.391Z' };
  c.renderAuditLogRows([row], true);
  const html = elements.logTableBody.innerHTML;
  assert.match(html, /Created amenity booking/);
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /\[redacted\]|\(empty\)|&lt;script&gt;/);
  assert.match(html, /Record ID: &lt;record&gt;/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<script>|<img|Record: <record>/);
  assert.match(html, /title="2026-10-24T05:32:39.391Z"/);
  assert.doesNotMatch(c.formatAuditDisplayTimestamp(row.timestamp), /T05:32/);
  assert.equal(c.formatAuditDisplayTimestamp('unknown'), 'unknown');
  assert.equal(c.getAuditEventTitle({ action: 'admin (u1) approved lostFound (l1)' }), 'Approved lost and found report');
  assert.equal(c.getAuditEventTitle({ adminId: 'system:migration', action_type: 'reconciled orphan link' }), 'Reconciled a legacy payment billing link');
  assert.equal(c.getAuditEventTitle({ action: 'Historical custom message' }), 'Historical custom message');
});

test('the legacy booking in the screenshot becomes useful details without rewriting its stored evidence', () => {
  const { c } = fixture();
  const record = { id: 'log1', adminId: 'resident', action: 'homeowner (resident) created amenityBookings (booking1): homeownerId: (empty) -> [redacted]; amenity: (empty) -> [redacted]; bookingDate: (empty) -> 2026-10-31; startTime: (empty) -> [redacted]; endTime: (empty) -> [redacted]; purpose: (empty) -> (empty); status: (empty) -> Pending; adminRemarks: (empty) -> (empty); reviewedAt: (empty) -> (empty)' };
  const before = JSON.stringify(record);
  assert.deepEqual(Array.from(c.getAuditEventDetails(record)), ['Booking date: Oct 31, 2026', 'Status: Pending']);
  assert.equal(c.getAuditEventParts(record).recordId, 'booking1');
  assert.equal(JSON.stringify(record), before);
  assert.doesNotMatch(c.getAuditExportDescription(record), /redacted|empty|homeownerId|amenityBookings|->/);
});

test('meaningful updates, private-only changes, payment outcomes and structured summaries stay accurate', () => {
  const { c } = fixture();
  const event = (operation, summary, entity = 'payments') => ({ action_type: operation, entity_type: entity, new_values: JSON.stringify({ summary }) });
  assert.deepEqual(Array.from(c.getAuditEventDetails(event('updated', 'amount: 300 -> 350; status: pending -> approved; remarks: [redacted] -> [redacted]'))),
    ['Amount: ₱300.00 → ₱350.00', 'Status: Pending → Approved', 'Private notes recorded or updated.']);
  assert.deepEqual(Array.from(c.getAuditEventDetails(event('updated', 'name: [redacted] -> [redacted]; contact: [redacted] -> [redacted]', 'homeowners'))), ['Private details changed.']);
  assert.deepEqual(Array.from(c.getAuditEventDetails(event('manually recorded and approved', 'amount: 150; billing: bill-1; billing status: partially_paid'))),
    ['Amount: ₱150.00', 'Billing reference: bill-1', 'Billing status: Partially paid']);
  assert.deepEqual(Array.from(c.getAuditEventDetails(event('approved', 'amount: 150; billing: (advance dues)'))), ['Amount: ₱150.00', 'Billing reference: Advance dues']);
  assert.deepEqual(Array.from(c.getAuditEventDetails(event('created', 'amenity: (empty) -> Clubhouse; startTime: (empty) -> 00:15; endTime: (empty) -> 13:30', 'amenityBookings'))),
    ['Amenity: Clubhouse', 'Start time: 12:15 AM', 'End time: 1:30 PM']);
  assert.deepEqual(Array.from(c.getAuditEventDetails(event('created', 'bookingDate: (empty) -> 2026-02-30; startTime: (empty) -> 29:99; amount: (empty) -> Infinity; purpose: (empty) -> SECRET'))), []);
  assert.equal(c.getAuditEventTitle({ action: 'hoa_officer (officer) updated complaints (case1): status: Reviewed -> Resolved' }), 'Updated complaint');
  assert.equal(c.getAuditEventTitle(event('created account', '', 'users')), 'Created account');
});

test('Excel export matches readable screen details and preserves record references as literal text', async () => {
  const { c } = fixture();
  c.records = [{ id: 'log1', adminId: 'resident', actor_name: 'Test Resident', entity_id: '=reference',
    action: 'homeowner (resident) created amenityBookings (booking1): bookingDate: (empty) -> 2026-10-31; status: (empty) -> Pending; purpose: (empty) -> [redacted]', timestamp: '2026-10-24T05:32:39Z' }];
  let snapshot;
  c.buildAuditLogWorkbook = (lib, data) => { snapshot = data; return build(lib, data); };
  await c.exportAuditLogExcel();
  assert.equal(snapshot.rows[0].action, 'Created amenity booking\nBooking date: Oct 31, 2026\nStatus: Pending');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await build(ExcelJS, snapshot).xlsx.writeBuffer());
  assert.equal(book.getWorksheet('Audit Log').getCell('G9').value, '=reference');
  assert.equal(book.getWorksheet('Audit Log').getCell('G9').type, ExcelJS.ValueType.String);
  assert.doesNotMatch(book.getWorksheet('Audit Log').getCell('C9').value, /redacted|empty|->/);
  assert.equal(c.getFilteredAuditLogs(c.records, { mode: 'all', search: 'Oct 31, 2026' }).length, 1);
});

test('audit load failure clears cached history and stale content; session changes cannot render a late response', async () => {
  const { c, run, elements } = fixture();
  run("currentView = 'auditlog'; dbCache.auditLog = [{ id: 'stale' }]; api.request = async () => { throw Error('403'); };");
  elements.contentArea = { innerHTML: 'Old audit data' };
  await c.renderAuditLog();
  assert.match(elements.contentArea.innerHTML, /could not be loaded/);
  assert.equal(run('dbCache.auditLog.length'), 0);
  run("api.request = async () => { currentUser = null; return [{ id: 'secret' }]; };");
  await c.renderAuditLog();
  assert.doesNotMatch(elements.contentArea.innerHTML, /secret/);
  assert.equal(run('dbCache.auditLog.length'), 0);
});

test('date picker defaults use the same local calendar as filters, including near midnight', () => {
  const { c } = fixture();
  assert.equal(c.auditLocalDateValue(new Date(2026, 9, 24, 0, 15)), '2026-10-24');
  assert.equal(c.auditLocalDateValue(new Date(2026, 9, 24, 23, 55)), '2026-10-24');
});

test('an older successful audit request cannot replace a newer permission failure', async () => {
  const { c, run, elements } = fixture();
  run("currentView = 'auditlog'; dbCache.auditLog = [];");
  let release;
  c.pendingAudit = new Promise(resolve => { release = resolve; });
  run('api.request = () => pendingAudit;');
  const firstLoad = c.renderAuditLog();
  run("api.request = async () => { throw Error('403 revoked'); };");
  await c.renderAuditLog();
  release([{ id: 'late-secret' }]);
  await firstLoad;
  assert.equal(run('dbCache.auditLog.length'), 0);
  assert.match(elements.contentArea.innerHTML, /could not be loaded/);
});
