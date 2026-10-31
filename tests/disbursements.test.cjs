'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { auditFixture } = require('./helpers/audit-fixture.cjs');
const { validateDisbursement, EXPENSE_CATEGORIES } = require('../src/services/disbursementService');
const valid = (changes = {}) => ({ expense_category: 'Gasoline', transaction_date: '2026-10-31', amount: '1500.00', ...changes });

test('disbursement validation preserves categories, rejects malformed dates, money and metadata injection', () => {
  assert.equal(EXPENSE_CATEGORIES.length, 13);
  for (const expense_category of EXPENSE_CATEGORIES) assert.equal(validateDisbursement(valid({ expense_category })).expense_category, expense_category);
  for (const changes of [{ expense_category: 'Other' }, { transaction_date: '2026-02-30' }, { transaction_date: '999-01-01' },
    { amount: 0 }, { amount: -1 }, { amount: 'NaN' }, { amount: '1e3' }, { amount: true }, { amount: '1.001' }, { amount: '10000000000' },
    { created_by: 'forged' }, { voided_at: null }, { status: 'approved' }]) assert.throws(() => validateDisbursement(valid(changes)));
  assert.equal(validateDisbursement(valid({ transaction_date: '2024-02-29', amount: '0.01' })).amount, '0.01');
});

test('HTTP: create, refresh, edit and void preserve financial records and immutable audit trail', async t => {
  const f = await auditFixture(t);
  const initialBilling = structuredClone(f.pool.tables.billings), initialPayments = structuredClone(f.pool.tables.payments);
  const created = await f.request('POST', '/api/disbursements', valid());
  assert.equal(created.status, 201, JSON.stringify(created));
  const id = created.body.id;
  assert.equal(f.pool.tables.disbursements[0].created_by, 'admin-1');
  assert.equal((await f.request('GET', '/api/disbursements')).body.records[0].amount, '1500.00');
  assert.equal((await f.request('PUT', '/api/disbursements/' + id, valid({ amount: '2000.50', expense_category: 'Payroll' }))).status, 200);
  const report = await f.request('GET', '/api/reports/disbursements');
  assert.equal(report.body.records[0].amount, '2000.50');
  assert.equal((await f.request('POST', `/api/disbursements/${id}/void`)).status, 200);
  assert.equal((await f.request('GET', '/api/disbursements')).body.records.length, 0);
  assert.equal((await f.request('GET', '/api/reports/disbursements')).body.records.length, 0);
  assert.equal(f.pool.tables.disbursements.length, 1);
  assert.equal(f.pool.tables.disbursements[0].voided_by, 'admin-1');
  assert.equal((await f.request('PUT', '/api/disbursements/' + id, valid())).status, 409);
  assert.equal((await f.request('POST', `/api/disbursements/${id}/void`)).status, 409);
  assert.equal(f.pool.tables.auditLog.length, 3);
  assert.match(f.pool.tables.auditLog[1].action, /amount: 1500 -> 2000.5/);
  assert.match(f.pool.tables.auditLog[1].action, /Gasoline -> Payroll/);
  assert.match(f.pool.tables.auditLog[2].action, /voided disbursements/);
  assert.deepEqual(f.pool.tables.billings, initialBilling);
  assert.deepEqual(f.pool.tables.payments, initialPayments);
});

test('HTTP: permissions deny writes and generic/bulk bypasses, Reports gets only financial projection', async t => {
  const f = await auditFixture(t);
  f.pool.users.push({ id: 'viewer', role: 'homeowner', status: 'active', permissions: '["disbursements"]' },
    { id: 'reporter', role: 'homeowner', status: 'active', permissions: '["reports"]' });
  f.pool.tables.payments.push({ id: 'p1', status: 'approved', amount: '5000.00', payment_date: '2026-10-31', receipt: 'secret', homeownerId: 'private' }, { id: 'p2', status: 'pending', amount: '900.00' });
  const id = (await f.request('POST', '/api/disbursements', valid())).body.id;
  for (const user of ['viewer', 'reporter', 'resident-1', 'inactive-1', null]) {
    for (const [method, url, body] of [['POST', '/api/disbursements', valid()], ['PUT', `/api/disbursements/${id}`, valid()], ['POST', `/api/disbursements/${id}/void`]]) {
      const result = await f.request(method, url, body, user);
      assert.ok([401, 403].includes(result.status), JSON.stringify({ user, method, result }));
    }
  }
  assert.equal((await f.request('GET', '/api/disbursements', undefined, 'viewer')).status, 200);
  assert.equal((await f.request('GET', '/api/disbursements', undefined, 'reporter')).status, 403);
  assert.equal((await f.request('GET', '/api/disbursements', undefined, 'resident-1')).status, 403);
  assert.equal((await f.request('GET', '/api/reports/disbursements', undefined, 'viewer')).status, 403);
  const report = await f.request('GET', '/api/reports/disbursements', undefined, 'reporter');
  assert.equal(report.status, 200);
  assert.deepEqual(report.body.collections, [{ amount: '5000.00', date: '2026-10-31' }]);
  const assigned = await f.request('PUT', '/api/users/viewer', { permissions: ['disbursements', 'reports'] });
  assert.equal(assigned.status, 200, JSON.stringify(assigned));
  assert.ok(JSON.parse(f.pool.users.find(u => u.id === 'viewer').permissions).includes('disbursements'));
  assert.equal((await f.request('GET', '/api/reports/disbursements', undefined, 'viewer')).status, 200);
  for (const [method, url, body] of [['PUT', '/api/disbursements', []], ['DELETE', '/api/disbursements/' + id]]) {
    assert.ok((await f.request(method, url, body)).status >= 400);
  }
  assert.equal(f.pool.tables.disbursements.length, 1);
});

test('HTTP: audit failures roll back creation, editing and voiding', async t => {
  const f = await auditFixture(t);
  f.pool.failAudit = true;
  assert.equal((await f.request('POST', '/api/disbursements', valid())).status, 500);
  assert.equal(f.pool.tables.disbursements.length, 0);
  f.pool.failAudit = false;
  const id = (await f.request('POST', '/api/disbursements', valid())).body.id;
  f.pool.failAudit = true;
  assert.equal((await f.request('PUT', '/api/disbursements/' + id, valid({ amount: '1.00' }))).status, 500);
  assert.equal((await f.request('POST', `/api/disbursements/${id}/void`)).status, 500);
  assert.equal(f.pool.tables.disbursements[0].amount, '1500.00');
  assert.equal(f.pool.tables.disbursements[0].voided_at, undefined);
  assert.equal(f.pool.tables.auditLog.length, 1);
});

test('report calculations use transaction dates, exact cents, categories and year-month grouping', () => {
  const context = vm.createContext({ Intl, console });
  const main = fs.readFileSync(require.resolve('../public/js/main.js'), 'utf8');
  vm.runInContext(main.match(/function getReportDate\([^]*?\n\}/)[0] + '\n' + main.match(/function filterByDateRange\([^]*?\n\}/)[0], context);
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/disbursements.js'), 'utf8'), context);
  const result = vm.runInContext(`buildDisbursementReport({ records: [
    {expense_category:'Gasoline',transaction_date:'2026-10-01',amount:'0.10'},
    {expense_category:'Gasoline',transaction_date:'2026-10-31',amount:'0.20'},
    {expense_category:'Payroll',transaction_date:'2026-10-31',amount:'20.00',voided_at:'2026-11-01'},
    {expense_category:'Payroll',transaction_date:'2026-11-01',amount:'10.00'}
  ], collections:[{date:'2026-10-31',amount:'100.00'},{date:'2026-11-01',amount:'999.00'}]}, {start:new Date(2026,9,1),end:new Date(2026,9,31,23,59,59,999)})`, context);
  assert.equal(result.totalCollections, 100);
  assert.equal(result.totalDisbursements, .3);
  assert.equal(result.netCashMovement, 99.7);
  assert.deepEqual(JSON.parse(JSON.stringify(result.categories)), [['Gasoline', .3]]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.months)), [['2026-10', .3]]);
});

test('Excel exports round-trip expense worksheets, numeric totals and reporting period', async () => {
  const ExcelJS = require('exceljs');
  const build = new Function('REPORT_FINANCIAL_HEADERS', 'toMoneyNumber', 'normalizeComplaintStatus',
    fs.readFileSync(require.resolve('../public/js/report-workbook.js'), 'utf8') + '\nreturn buildReportsWorkbook;')([], Number, String);
  const data = { period: { label: '2026-10-01 to 2026-10-31' }, generatedAt: new Date(), analysisYear: 2026,
    totalDue: 100, totalPaid: 100, totalOutstanding: 0, reportUsers: [], balanceRows: [], monthlyData: [],
    financial: { rows: [], totals: ['Total', '', 100, 100, 0, 1, 0, ''] }, balanceFilters: {}, approved: [], pending: [], rejected: [], complaints: [],
    expenses: { records: [{ id: 'd1', expense_category: 'Gasoline', transaction_date: '2026-10-31', amount: '1500.25' }],
      categories: [['Gasoline', 1500.25]], totalCollections: 5000, totalDisbursements: 1500.25, netCashMovement: 3499.75 } };
  const book = build(ExcelJS, data);
  const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(await book.xlsx.writeBuffer());
  assert.equal(loaded.getWorksheet('Disbursements').getCell('D8').value, 1500.25);
  assert.equal(loaded.getWorksheet('Expense Summary').getCell('B9').value, 1500.25);
  assert.equal(loaded.getWorksheet('Financial Summary').getCell('B10').value, 3499.75);
  assert.match(loaded.getWorksheet('Financial Summary').getCell('A4').value, /2026-10-01 to 2026-10-31/);
  assert.match(loaded.getWorksheet('Financial Summary').getCell('A6').value, /not the HOA bank balance/);
  assert.ok(loaded.getWorksheet('Financial Collections'));
});
