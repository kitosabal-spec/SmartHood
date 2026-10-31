'use strict';

let disbursementRecords = [];
let disbursementCategories = [];
let disbursementPage = 1;
let disbursementPageSize = 10;
let disbursementBusy = false;
let disbursementLoadGeneration = 0;
const expenseMoney = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const expenseTotal = rows => rows.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0) / 100;
const canManageDisbursements = () => isAdmin() && userHasModulePermission('disbursements');

function expenseOptions(selected = '') {
  return disbursementCategories.map(category => `<option value="${escapeHtml(category)}" ${category === selected ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('');
}

function disbursementForm(record = {}, editing = false) {
  const prefix = editing ? 'expenseEdit' : 'expense';
  return `<form id="${prefix}Form" onsubmit="event.preventDefault(); saveDisbursement(${editing})">
    <div class="disbursement-fields">
      <div class="form-group"><label for="${prefix}Category">Expense Category</label><select class="form-control" id="${prefix}Category" required><option value="">Select category</option>${expenseOptions(record.expense_category)}</select></div>
      <div class="form-group"><label for="${prefix}Date">Transaction Date</label><input class="form-control" id="${prefix}Date" type="date" min="1000-01-01" max="9999-12-31" value="${escapeHtml(record.transaction_date || getLocalDateValue())}" required></div>
      <div class="form-group"><label for="${prefix}Amount">Amount (PHP)</label><input class="form-control" id="${prefix}Amount" type="number" min="0.01" max="9999999999.99" step="0.01" value="${escapeHtml(record.amount || '')}" placeholder="0.00" required></div>
    </div>
    <div class="disbursement-save">${editing ? '<button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>' : ''}<button id="${prefix}SaveButton" class="btn btn-primary" type="submit">${editing ? 'Save Changes' : 'Save Disbursement'}</button></div>
  </form>`;
}

async function renderDisbursements() {
  if (!userHasModulePermission('disbursements') || currentView !== 'disbursements') return;
  const generation = ++disbursementLoadGeneration;
  const actorId = currentUser.id;
  const area = document.getElementById('contentArea');
  disbursementRecords = [];
  area.innerHTML = '<div class="section-card section-card-body" role="status">Loading disbursements…</div>';
  try {
    const data = await api.request('/api/disbursements');
    if (generation !== disbursementLoadGeneration || currentView !== 'disbursements' || currentUser?.id !== actorId) return;
    disbursementRecords = data.records;
    disbursementCategories = data.categories;
    area.innerHTML = `<div class="disbursements-page">
      <div class="page-header"><div class="page-header-left"><h2>Disbursements</h2><p>Record and review San Alfonso Homes Village expenses.</p></div></div>
      ${canManageDisbursements() ? `<div class="section-card"><div class="section-card-header"><h3>Add New Disbursement</h3></div><div class="section-card-body" id="expenseCreateForm">${disbursementForm()}</div></div>` : ''}
      <div class="section-card"><div class="section-card-header expense-records-header"><h3>Disbursement Records</h3>
        <div class="expense-records-total" aria-live="polite" aria-atomic="true"><span>Total for matching records</span><strong id="expenseTotal"></strong></div>
      </div>
      <div class="section-card-body"><div class="filters-row expense-filters">
        <div class="search-box"><input id="expenseSearch" placeholder="Search category, date or amount…" aria-label="Search disbursements" oninput="filterDisbursements()"></div>
        <select class="filter-select" id="expenseFilterCategory" aria-label="Filter category" onchange="filterDisbursements()"><option value="">All Categories</option>${expenseOptions()}</select>
        <label>From <input class="filter-select" id="expenseFrom" type="date" onchange="filterDisbursements()"></label>
        <label>To <input class="filter-select" id="expenseTo" type="date" onchange="filterDisbursements()"></label>
        <button class="btn btn-secondary btn-sm" onclick="clearDisbursementFilters()">Clear</button>
      </div><p id="expenseFilterError" class="expense-filter-error" role="alert" hidden></p></div>
      <div class="table-wrapper"><table class="data-table"><thead><tr><th>Transaction Date</th><th>Expense Category</th><th>Amount (PHP)</th><th>Actions</th></tr></thead><tbody id="expenseRows"></tbody></table></div><div id="expensePagination"></div></div>
    </div>`;
    filterDisbursements();
  } catch (error) {
    if (currentView === 'disbursements' && currentUser?.id === actorId) area.innerHTML = `<div class="section-card section-card-body" role="alert">${escapeHtml(error.message)} <button class="btn btn-secondary" onclick="renderDisbursements()">Retry</button></div>`;
  }
}

function clearDisbursementFilters() {
  ['expenseSearch', 'expenseFilterCategory', 'expenseFrom', 'expenseTo'].forEach(id => { document.getElementById(id).value = ''; });
  filterDisbursements();
}
function filterDisbursements(reset = true) {
  if (!userHasModulePermission('disbursements')) return;
  if (reset) disbursementPage = 1;
  const value = id => document.getElementById(id)?.value || '';
  const query = value('expenseSearch').trim().toLowerCase();
  const from = value('expenseFrom'), to = value('expenseTo'), category = value('expenseFilterCategory');
  const invalidRange = from && to && from > to;
  const records = invalidRange ? [] : disbursementRecords.filter(r =>
    (!category || r.expense_category === category) && (!from || r.transaction_date >= from) && (!to || r.transaction_date <= to) &&
    `${r.expense_category} ${r.transaction_date} ${r.amount}`.toLowerCase().includes(query));
  disbursementPage = Math.min(disbursementPage, Math.max(1, Math.ceil(records.length / disbursementPageSize)));
  document.getElementById('expenseTotal').textContent = invalidRange ? '—' : expenseMoney(expenseTotal(records));
  const filterError = document.getElementById('expenseFilterError');
  filterError.hidden = !invalidRange;
  filterError.textContent = invalidRange ? 'From date must be on or before To date.' : '';
  document.getElementById('expenseRows').innerHTML = records.slice((disbursementPage - 1) * disbursementPageSize, disbursementPage * disbursementPageSize).map(r =>
    `<tr><td>${escapeHtml(r.transaction_date)}</td><td>${escapeHtml(r.expense_category)}</td><td>${expenseMoney(r.amount)}</td><td>${canManageDisbursements() ? `<div class="action-btns"><button class="btn btn-secondary btn-sm" onclick="editDisbursement('${r.id}')">Edit</button><button class="btn btn-danger btn-sm" onclick="voidDisbursement('${r.id}')">Void</button></div>` : 'View only'}</td></tr>`).join('') || '<tr><td colspan="4"><div class="no-results">No disbursements match these filters.</div></td></tr>';
  renderPaginationComponent({ containerId: 'expensePagination', currentPage: disbursementPage, pageSize: disbursementPageSize, totalItems: records.length,
    pageSizeOptions: [10, 20, 50], onPageChangeFn: 'changeDisbursementPage', onPageSizeChangeFn: 'changeDisbursementPageSize', itemLabel: 'disbursements' });
}
function changeDisbursementPage(page) { disbursementPage = page; filterDisbursements(false); }
function changeDisbursementPageSize(size) { disbursementPageSize = Number(size); filterDisbursements(); }

let editingDisbursementId = null;
function editDisbursement(id) {
  if (!canManageDisbursements() || disbursementBusy) return;
  const record = disbursementRecords.find(r => r.id === id);
  if (!record) return;
  editingDisbursementId = id;
  openModal('Edit Disbursement', disbursementForm(record, true), [], 'disbursement-modal');
}

async function saveDisbursement(editing = false) {
  if (!canManageDisbursements() || disbursementBusy) return;
  const prefix = editing ? 'expenseEdit' : 'expense';
  const form = document.getElementById(prefix + 'Form');
  if (!form.reportValidity()) return;
  const id = editing ? editingDisbursementId : null;
  const body = { expense_category: document.getElementById(prefix + 'Category').value, transaction_date: document.getElementById(prefix + 'Date').value, amount: document.getElementById(prefix + 'Amount').value };
  disbursementBusy = true;
  document.getElementById(prefix + 'SaveButton').disabled = true;
  try {
    await api.request('/api/disbursements' + (id ? '/' + encodeURIComponent(id) : ''), { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
    if (id) closeModal();
    showToast('success', 'Disbursement Saved', 'Expense recorded and included in financial reports.');
    await renderDisbursements();
  } catch (error) { showToast('error', 'Save Failed', error.message); }
  finally { disbursementBusy = false; const button = document.getElementById(prefix + 'SaveButton'); if (button) button.disabled = false; }
}

function voidDisbursement(id) {
  if (!canManageDisbursements() || disbursementBusy) return;
  const record = disbursementRecords.find(r => r.id === id);
  if (!record) return;
  openModal('Void Disbursement', `<p>Void ${escapeHtml(record.expense_category)} dated ${escapeHtml(record.transaction_date)} for <strong>${expenseMoney(record.amount)}</strong>?</p><p>It will be excluded from totals. The record and audit history will be retained.</p>`, [
    { label: 'Cancel', cls: 'btn-secondary', action: closeModal },
    { label: 'Void Disbursement', cls: 'btn-danger', action: async () => {
      if (disbursementBusy) return;
      disbursementBusy = true;
      try {
        await api.request(`/api/disbursements/${encodeURIComponent(id)}/void`, { method: 'POST' });
        closeModal(); showToast('success', 'Disbursement Voided', 'Financial totals have been updated.'); await renderDisbursements();
      } catch (error) { showToast('error', 'Void Failed', error.message); }
      finally { disbursementBusy = false; }
    } },
  ]);
}

function buildDisbursementReport(payload, range) {
  const records = filterByDateRange(payload.records.filter(r => !r.voided_at), r => r.transaction_date, range);
  const collections = filterByDateRange(payload.collections, r => r.date, range);
  const totalCollections = expenseTotal(collections), totalDisbursements = expenseTotal(records);
  const group = key => [...new Set(records.map(key))].sort().map(label => [label, expenseTotal(records.filter(r => key(r) === label))]);
  return { records, totalCollections, totalDisbursements, netCashMovement: Math.round((totalCollections - totalDisbursements) * 100) / 100,
    categories: group(r => r.expense_category), months: group(r => r.transaction_date.slice(0, 7)) };
}
async function fetchDisbursementReport(range) {
  const actorId = currentUser?.id;
  const payload = await api.request('/api/reports/disbursements');
  if (currentUser?.id !== actorId || !userHasModulePermission('reports')) throw new Error('Report access changed. Please reload.');
  return buildDisbursementReport(payload, range);
}

let expenseReportGeneration = 0;
let expenseHistory = [];
let expenseHistoryPage = 1;
let expenseHistoryPageSize = 10;
function getDisbursementReportHTML(data) {
  const max = Math.max(1, ...data.months.map(row => row[1]));
  return `<div class="report-summary-grid report-expense-cards">
    ${reportSummaryCard('Total Disbursements', expenseMoney(data.totalDisbursements), 'ico-wallet')}
    ${reportSummaryCard('Recorded Disbursements', data.records.length.toLocaleString(), 'ico-file')}
    </div>
    <div class="report-expense-analysis">
      <div class="section-card"><div class="section-card-header"><h3>Expenses by Category</h3></div>
        <div class="table-wrapper"><table class="data-table"><thead><tr><th>Expense Category</th><th>Amount (PHP)</th></tr></thead><tbody>
        ${data.categories.map(([category, amount]) => `<tr><td>${escapeHtml(category)}</td><td class="report-money">${expenseMoney(amount)}</td></tr>`).join('') || '<tr><td colspan="2"><div class="no-results">No recorded expenses in this reporting period.</div></td></tr>'}
        </tbody></table></div>
      </div>
      <div class="chart-card report-expense-monthly"><h4>Monthly Disbursements</h4>
        <div class="expense-chart">${data.months.map(([month, amount]) => `<div class="expense-chart-row"><span>${new Date(month + '-01T12:00:00').toLocaleDateString('en-PH', {month:'short',year:'numeric'})}</span><div class="expense-bar-track" aria-hidden="true"><div class="expense-bar" style="width:${amount / max * 100}%"></div></div><strong>${expenseMoney(amount)}</strong></div>`).join('') || '<p class="report-empty">No recorded expenses in this reporting period.</p>'}</div>
      </div>
    </div>
    <div class="section-card"><div class="section-card-header"><h3>Disbursement Transaction History</h3></div><div class="table-wrapper"><table class="data-table"><thead><tr><th>Transaction Date</th><th>Expense Category</th><th>Amount (PHP)</th></tr></thead><tbody id="expenseHistoryRows"></tbody></table></div><div id="expenseHistoryPagination"></div></div>`;
}

async function renderDisbursementReport(range) {
  const panel = document.getElementById('disbursementReportPanel');
  if (!panel) return;
  const snapshot = currentReportsData;
  const overview = document.getElementById('report-panel-overview');
  const generation = ++expenseReportGeneration;
  panel.innerHTML = '<p class="report-empty" role="status">Loading disbursements…</p>';
  try {
    const data = await fetchDisbursementReport(range);
    if (generation !== expenseReportGeneration || !panel.isConnected || snapshot !== currentReportsData) return;
    snapshot.expenses = data;
    if (overview?.isConnected) overview.innerHTML = getReportOverviewHTML(snapshot);
    panel.innerHTML = getDisbursementReportHTML(data);
    expenseHistory = data.records; expenseHistoryPage = 1; renderExpenseHistory();
  } catch (error) {
    if (generation === expenseReportGeneration && panel.isConnected && snapshot === currentReportsData) {
      snapshot.expenseError = true;
      if (overview?.isConnected) overview.innerHTML = getReportOverviewHTML(snapshot);
      panel.innerHTML = `<div class="section-card section-card-body" role="alert">Expense reports unavailable: ${escapeHtml(error.message)} <button class="btn btn-secondary" onclick="renderReports()">Retry</button></div>`;
    }
  }
}

function renderExpenseHistory() {
  if (!userHasModulePermission('reports')) return;
  document.getElementById('expenseHistoryRows').innerHTML = expenseHistory.slice((expenseHistoryPage - 1) * expenseHistoryPageSize, expenseHistoryPage * expenseHistoryPageSize).map(r => `<tr><td>${escapeHtml(r.transaction_date)}</td><td>${escapeHtml(r.expense_category)}</td><td>${expenseMoney(r.amount)}</td></tr>`).join('') || '<tr><td colspan="3">No disbursements in this reporting period.</td></tr>';
  renderPaginationComponent({ containerId: 'expenseHistoryPagination', currentPage: expenseHistoryPage, pageSize: expenseHistoryPageSize, onPageSizeChangeFn: 'changeExpenseHistoryPageSize', totalItems: expenseHistory.length, onPageChangeFn: 'changeExpenseHistoryPage', itemLabel: 'disbursements' });
}
function changeExpenseHistoryPageSize(size) { expenseHistoryPageSize = Number(size); expenseHistoryPage = 1; renderExpenseHistory(); }
function changeExpenseHistoryPage(page) { expenseHistoryPage = page; renderExpenseHistory(); }

async function exportDisbursementCSV(type) {
  if (!userHasModulePermission('reports')) return;
  try {
    const range = getDateRangeFilter(), period = getReportPeriod(range);
    const data = await fetchDisbursementReport(range);
    let headers, rows, moneyColumns;
    if (type === 'expenses-csv') {
      headers = ['Reporting Period', 'Record ID', 'Transaction Date', 'Expense Category', 'Amount (PHP)'];
      rows = data.records.map(r => [period.label, r.id, r.transaction_date, r.expense_category, Number(r.amount)]);
      rows.push([period.label, '', '', 'Total', data.totalDisbursements]); moneyColumns = [4];
    } else if (type === 'expense-summary-csv') {
      headers = ['Reporting Period', 'Expense Category', 'Amount (PHP)'];
      rows = [...data.categories, ['Total', data.totalDisbursements]].map(row => [period.label, ...row]); moneyColumns = [2];
    } else {
      headers = ['Reporting Period', 'Measure', 'Amount (PHP)'];
      rows = [['Total Collections', data.totalCollections], ['Total Disbursements', data.totalDisbursements], ['Net Cash Movement (not bank balance)', data.netCashMovement]].map(row => [period.label, ...row]); moneyColumns = [2];
    }
    downloadCSVFile(`SmartHood_${type}_${period.filename}.csv`, [csvRow(headers), ...rows.map(row => csvRow(row, moneyColumns))].join('\r\n') + '\r\n');
  } catch (error) { showToast('error', 'Download Failed', error.message); }
}
