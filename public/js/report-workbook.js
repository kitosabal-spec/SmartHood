'use strict';

// Presentation only. Report dates, filters, and financial rules live in main.js.
// ExcelJS string cells are explicitly typed as text; never turn input into a
// formula object (including text beginning with =, +, -, or @).
async function loadReportWorkbookLogo() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch('public/images/SH%20Logo.png', { signal: controller.signal });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return 'data:image/png;base64,' + btoa(binary);
  } catch (error) {
    // Branding text remains available when the optional logo cannot be fetched.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildReportsWorkbook(ExcelJS, data, logo = null) {
  const book = new ExcelJS.Workbook();
  book.creator = 'SmartHood';
  book.subject = 'San Alfonso Homes Homeowners Association — Reports & Analytics';
  book.title = `Reports & Analytics — ${data.period.label}`;
  book.created = data.generatedAt;
  book.modified = data.generatedAt;
  const colors = { dark: 'FF0A2E30', teal: 'FF177A80', pale: 'FFF2FAFB', border: 'FFD0E8EA', gold: 'FFFEF3C7', ink: 'FF0E2E30', white: 'FFFFFFFF' };
  const peso = '"₱"#,##0.00;[Red]("₱"#,##0.00);"₱"0.00';
  const generated = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(data.generatedAt) + ' (Asia/Manila)';
  const headerRow = 7;

  function tableRow(sheet, values, { header = false, total = false, currency = [], stripe = false } = {}) {
    const row = sheet.addRow(values.map(value => typeof value === 'number' ? value : String(value ?? '')));
    let lines = 1;
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      const value = values[column - 1];
      cell.font = { name: 'Calibri', size: 11, bold: header || total, color: { argb: header ? colors.white : colors.ink } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: header ? colors.teal : total ? colors.gold : stripe ? colors.pale : colors.white } };
      cell.border = { bottom: { style: 'hair', color: { argb: colors.border } } };
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: typeof value === 'number' ? 'right' : 'left' };
      cell.numFmt = typeof value === 'number' ? (currency.includes(column) ? peso : '#,##0') : '@';
      const width = Math.max(8, sheet.getColumn(column).width - 3);
      lines = Math.max(lines, ...String(value ?? '').split('\n').map(part => Math.ceil(part.length / width)));
    });
    row.height = Math.max(header ? 34 : 23, lines * 15 + 8);
    return row;
  }

  function mergedLine(sheet, text, { fill = colors.white, size = 10, bold = false, height = 23 } = {}) {
    const row = sheet.addRow([String(text)]);
    sheet.mergeCells(row.number, 1, row.number, sheet.columns.length);
    row.height = height;
    const cell = row.getCell(1);
    cell.numFmt = '@';
    cell.font = { name: 'Calibri', size, bold, color: { argb: fill === colors.dark ? colors.white : colors.ink } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    return row;
  }

  function sheetTable(name, headers, widths, rows, currency, note, totals = null) {
    const sheet = book.addWorksheet(name, {
      properties: { defaultRowHeight: 23, tabColor: { argb: colors.teal } },
      views: [{ state: 'frozen', ySplit: headerRow, activeCell: 'A8', showGridLines: false }],
      pageSetup: {
        paperSize: 9, orientation: widths.reduce((a, b) => a + b, 0) > 105 ? 'landscape' : 'portrait',
        fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.4, header: 0.15, footer: 0.2 },
        printTitlesRow: `${headerRow}:${headerRow}`,
      },
      headerFooter: { oddFooter: '&LSmartHood | San Alfonso Homes&C&A&RPage &P of &N' },
    });
    sheet.columns = widths.map(width => ({ width }));
    mergedLine(sheet, 'SmartHood', { fill: colors.dark, size: 20, bold: true, height: 31 });
    mergedLine(sheet, 'San Alfonso Homes Homeowners Association', { size: 11, bold: true });
    mergedLine(sheet, name === 'Summary' ? 'Reports & Analytics — Summary' : name === 'Monthly Collections' ? `${name} — ${data.analysisYear}` : name, { size: 15, bold: true, height: 28 });
    mergedLine(sheet, `Reporting period: ${data.period.label}`);
    mergedLine(sheet, `Generated: ${generated}`);
    const combinedWidth = widths.reduce((a, b) => a + b, 0);
    mergedLine(sheet, note, { fill: colors.pale, height: Math.max(30, Math.ceil(note.length / (combinedWidth - 10)) * 15 + 10) });
    tableRow(sheet, headers, { header: true });
    rows.forEach((row, i) => tableRow(sheet, row, { currency, stripe: i % 2 === 1 }));
    sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + rows.length, column: headers.length } };
    if (!rows.length) mergedLine(sheet, 'No matching records for the selected filters.', { height: 26 });
    if (totals) tableRow(sheet, totals, { currency, total: true });
    return sheet;
  }

  const summary = sheetTable('Summary', ['Measure', 'Value', 'Calculation / scope'], [39, 24, 76], [
    ['Total Billed (PHP)', data.totalDue, 'Selected billings × assigned homeowners; excludes unlinked advances.'],
    ['Total Collected (PHP)', data.totalPaid, 'All approved payments in the selected date period, regardless of billing linkage.'],
    ['Outstanding Balance (PHP)', data.totalOutstanding, 'Maximum of zero and Total Billed minus Total Collected (period-wide).'],
    ['Homeowners with Activity', data.reportUsers.length, 'Unique current homeowners assigned a selected billing or with a selected payment of any status.'],
  ], [2], 'These four measures use the same calculations as the Reports & Analytics page. Differences from the supporting schedules are explained below.');
  summary.getCell('B11').numFmt = '#,##0';
  if (logo) {
    const image = book.addImage({ base64: logo, extension: 'png' });
    summary.addImage(image, { tl: { col: 2.85, row: 0.05 }, ext: { width: 48, height: 48 }, editAs: 'absolute' });
  }

  mergedLine(summary, 'Reconciliation of existing report rules', { fill: colors.dark, bold: true, height: 26 });
  tableRow(summary, ['Comparison', 'Difference (PHP)', 'Reason / interpretation'], { header: true });
  const financial = data.financial;
  const balanceTotal = data.balanceRows.reduce((sum, row) => sum + row[4], 0);
  const monthlyTotal = data.monthlyData.reduce((sum, row) => sum + row.v, 0);
  [
    ['Financial billed − Summary billed', financial.totals[2] - data.totalDue, 'Financial Collections retains the old CSV convention: approved unlinked monthly dues count as both billed and collected.'],
    ['Summary collected − Financial collected', data.totalPaid - financial.totals[3], 'Approved payments linked to billings outside the selected period, or unlinked payments without a dues month, appear only in Summary.'],
    ['Financial outstanding − Summary outstanding', financial.totals[4] - data.totalOutstanding, 'Financial Collections clamps each billing to zero, then sums. Summary subtracts all approved payments before clamping once.'],
    ['Homeowner balances − Summary outstanding', balanceTotal - data.totalOutstanding, 'Balances clamp and round per homeowner and use only payments linked to selected billings; active search/status filters also apply.'],
    ['Summary collected − Monthly collections', data.totalPaid - monthlyTotal, 'Monthly Collections uses the page’s analysis year and dues-month-first allocation; other years or unallocatable dates are not in its twelve months.'],
  ].forEach((row, i) => tableRow(summary, row, { currency: [2], stripe: i % 2 === 1 }));
  mergedLine(summary, 'Scope and counting notes', { fill: colors.dark, bold: true, height: 26 });
  [
    'Date selection matches the page’s browser-local boundaries: billings use createdAt, then dueDate; payments use reviewedAt, payment_date, submittedAt, then createdAt; complaints use dateFiled, createdAt, then dateOfOccurrence. Only the generation timestamp is converted to Asia/Manila.',
    'Monthly allocation uses monthly_dues_month first, otherwise payment_date, reviewedAt, then submittedAt. The analysis year is the page’s derived year (' + data.analysisYear + '), not a different dashboard year selection. The selected date period is applied before allocation.',
    'Partial payments contribute their approved amount but remain not fully paid until the existing payment-summary helper marks the account paid. Billing-account totals count the same homeowner again for each billing or advance month; they are not unique homeowner counts.',
    `Homeowner Balances filters — Search: ${data.balanceFilters.search || '(none)'}; Status: ${data.balanceFilters.status === 'due' ? 'With Balance' : data.balanceFilters.status === 'clear' ? 'Clear' : 'All Statuses'}. These filters affect only that worksheet and its reconciliation difference.`,
    'This is the complete displayed report snapshot across pagination. Values use existing calculations with two-decimal currency display; no balancing adjustments are applied. Clearance describes the selected report period, not an independently certified all-time clearance.',
  ].forEach(note => mergedLine(summary, note, { height: Math.ceil(note.length / 125) * 15 + 10 }));

  sheetTable('Financial Collections', REPORT_FINANCIAL_HEADERS, [39, 22, 22, 22, 23, 20, 25, 20],
    financial.rows, [3, 4, 5],
    'Billing-account counts include repeat homeowners across billings. Not fully paid includes partial payments. Advance dues retain the existing CSV billed/collected treatment. See Summary for reconciliation.', financial.totals);

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  sheetTable('Monthly Collections', ['Month', 'Analysis Year', 'Total Collected (PHP)'], [30, 20, 40],
    data.monthlyData.map((month, i) => [months[i], data.analysisYear, month.v]), [3],
    'Approved payments within the selected period, allocated by dues month first, then payment/review/submission date, exactly as in the page chart.', ['Total', '', monthlyTotal]);

  const paymentRows = ['approved', 'pending', 'rejected'].map(status => {
    const payments = data[status];
    return [status[0].toUpperCase() + status.slice(1), payments.length, payments.reduce((sum, p) => sum + toMoneyNumber(p.amount), 0)];
  });
  sheetTable('Payment Status', ['Payment Status', 'Payment Count', 'Payment Amount (PHP)'], [30, 20, 40], paymentRows, [3],
    'Counts match the page legend. Pending and rejected amounts are shown for review only and are not collected revenue.',
    ['Total (displayed statuses)', paymentRows.reduce((sum, row) => sum + row[1], 0), paymentRows.reduce((sum, row) => sum + row[2], 0)]);

  const complaintRows = ['Reviewed', 'In Progress', 'Resolved', 'Rejected'].map(status => [status,
    data.complaints.filter(c => status === 'Reviewed' ? normalizeComplaintStatus(c.status) === status : c.status === status).length]);
  const displayedComplaints = complaintRows.reduce((sum, row) => sum + row[1], 0);
  sheetTable('Complaint Status', ['Complaint Status', 'Complaint Count'], [46, 44], complaintRows, [],
    `Counts match the four page legend statuses. The page donut center counts all ${data.complaints.length} filtered complaints; ${data.complaints.length - displayedComplaints} are outside these displayed statuses.`,
    ['Total (displayed statuses)', displayedComplaints]);

  sheetTable('Homeowner Balances', ['Homeowner Name', 'Homeowner ID', 'Block', 'Lot', 'Balance (PHP)', 'Clearance Status'], [34, 24, 20, 20, 23, 23], data.balanceRows, [5],
    `Search: ${data.balanceFilters.search || '(none)'} | Status: ${data.balanceFilters.status === 'due' ? 'With Balance' : data.balanceFilters.status === 'clear' ? 'Clear' : 'All Statuses'} | All ${data.balanceRows.length} matching homeowners. Balances and clearance use the selected period.`,
    ['Total', '', '', '', balanceTotal, '']);

  if (data.expenses) {
    const expenses = data.expenses;
    sheetTable('Disbursements', ['Record ID', 'Transaction Date', 'Expense Category', 'Amount (PHP)'], [42, 22, 46, 24],
      expenses.records.map(r => [r.id, r.transaction_date, r.expense_category, Number(r.amount)]), [4],
      'Active recorded expenses, filtered by transaction date. Voided records are excluded; audit history is retained.', ['', '', 'Total', expenses.totalDisbursements]);
    sheetTable('Expense Summary', ['Expense Category', 'Amount (PHP)'], [55, 30], expenses.categories, [2],
      'Expenses grouped by category within the selected reporting period.', ['Total', expenses.totalDisbursements]);
    sheetTable('Financial Summary', ['Measure', 'Amount (PHP)'], [55, 30], [
      ['Total Collections', expenses.totalCollections], ['Total Disbursements', expenses.totalDisbursements], ['Net Cash Movement', expenses.netCashMovement],
    ], [2], 'Approved collections less active expenses. Net cash movement is not the HOA bank balance. Opening balances and other cash adjustments are not included. Collection dates follow the existing review/payment/submission date precedence; expenses use transaction dates.');
  }

  book.worksheets.forEach(sheet => {
    const lastColumn = sheet.getColumn(sheet.columnCount).letter;
    sheet.pageSetup.printArea = `A1:${lastColumn}${sheet.rowCount}`;
  });
  return book;
}
