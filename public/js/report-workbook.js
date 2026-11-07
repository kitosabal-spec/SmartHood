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

  function sheetTable(name, headers, widths, rows, currency, totals = null) {
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
    sheet.addRow([]).height = 10;
    tableRow(sheet, headers, { header: true });
    rows.forEach((row, i) => tableRow(sheet, row, { currency, stripe: i % 2 === 1 }));
    sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + rows.length, column: headers.length } };
    if (!rows.length) mergedLine(sheet, 'No matching records for the selected filters.', { height: 26 });
    if (totals) tableRow(sheet, totals, { currency, total: true });
    return sheet;
  }

  const summary = sheetTable('Summary', ['Measure', 'Amount'], [39, 24], [
    ['Total Billed (PHP)', data.totalDue],
    ['Total Collected (PHP)', data.totalPaid],
    ['Outstanding Balance (PHP)', data.totalOutstanding],
    ['Homeowners with Activity', data.reportUsers.length],
  ], [2]);
  summary.getCell('B11').numFmt = '#,##0';
  if (logo) {
    const image = book.addImage({ base64: logo, extension: 'png' });
    summary.addImage(image, { tl: { col: 1.6, row: 0.05 }, ext: { width: 48, height: 48 }, editAs: 'absolute' });
  }

  const financial = data.financial;
  const balanceTotal = data.balanceRows.reduce((sum, row) => sum + row[4], 0);
  const monthlyTotal = data.monthlyData.reduce((sum, row) => sum + row.v, 0);

  sheetTable('Financial Collections', REPORT_FINANCIAL_HEADERS, [39, 22, 22, 22, 23, 20, 25, 20],
    financial.rows, [3, 4, 5], financial.totals);

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  sheetTable('Monthly Collections', ['Month', 'Analysis Year', 'Total Collected (PHP)'], [30, 20, 40],
    data.monthlyData.map((month, i) => [months[i], data.analysisYear, month.v]), [3],
    ['Total', '', monthlyTotal]);

  const paymentRows = ['approved', 'pending', 'rejected'].map(status => {
    const payments = data[status];
    return [status[0].toUpperCase() + status.slice(1), payments.length, payments.reduce((sum, p) => sum + toMoneyNumber(p.amount), 0)];
  });
  sheetTable('Payment Status', ['Payment Status', 'Payment Count', 'Payment Amount (PHP)'], [30, 20, 40], paymentRows, [3],
    ['Total (displayed statuses)', paymentRows.reduce((sum, row) => sum + row[1], 0), paymentRows.reduce((sum, row) => sum + row[2], 0)]);

  sheetTable('Homeowner Balances', ['Homeowner Name', 'Homeowner ID', 'Block', 'Lot', 'Balance (PHP)', 'Clearance Status'], [34, 24, 20, 20, 23, 23], data.balanceRows, [5],
    ['Total', '', '', '', balanceTotal, '']);

  if (data.expenses) {
    const expenses = data.expenses;
    sheetTable('Disbursements', ['Record ID', 'Transaction Date', 'Expense Category', 'Amount (PHP)'], [42, 22, 46, 24],
      expenses.records.map(r => [r.id, r.transaction_date, r.expense_category, Number(r.amount)]), [4],
      ['', '', 'Total', expenses.totalDisbursements]);
    sheetTable('Expense Summary', ['Expense Category', 'Amount (PHP)'], [55, 30], expenses.categories, [2],
      ['Total', expenses.totalDisbursements]);
    sheetTable('Financial Summary', ['Measure', 'Amount (PHP)'], [55, 30], [
      ['Total Collections', expenses.totalCollections], ['Total Disbursements', expenses.totalDisbursements], ['Net Cash Movement', expenses.netCashMovement],
    ], [2]);
  }

  book.worksheets.forEach(sheet => {
    const lastColumn = sheet.getColumn(sheet.columnCount).letter;
    sheet.pageSetup.printArea = `A1:${lastColumn}${sheet.rowCount}`;
  });
  return book;
}
