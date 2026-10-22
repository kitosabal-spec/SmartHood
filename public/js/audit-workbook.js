'use strict';

function auditExportTime(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function buildAuditLogWorkbook(ExcelJS, data) {
  const book = new ExcelJS.Workbook();
  book.creator = 'SmartHood';
  book.title = 'Audit Log Report';
  book.created = data.generatedAt;
  const colors = { dark: 'FF0A2E30', teal: 'FF177A80', pale: 'FFF2FAFB', border: 'FFD0E8EA', ink: 'FF0E2E30', white: 'FFFFFFFF' };
  const sheet = book.addWorksheet('Audit Log', {
    views: [{ state: 'frozen', ySplit: 8, activeCell: 'A9', showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      printTitlesRow: '8:8', margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.4, header: 0.15, footer: 0.2 } },
    headerFooter: { oddFooter: '&LSmartHood | Audit Log&RPage &P of &N' },
  });
  sheet.columns = [7, 25, 80, 27, 25, 32].map(width => ({ width }));
  function style(row, fill, bold = false) {
    let lines = 1;
    row.eachCell((cell, column) => {
      if (typeof cell.value === 'string' && cell.value.length > 32767) {
        throw new Error('An audit value exceeds Excel’s 32,767-character cell limit. Export cancelled to avoid truncation.');
      }
      cell.font = { name: 'Calibri', size: 11, bold, color: { argb: bold ? colors.white : colors.ink } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'hair', color: { argb: colors.border } } };
      cell.numFmt = typeof cell.value === 'number' ? '0' : '@';
      lines = Math.max(lines, String(cell.value ?? '').split(/\r?\n/).reduce((n, part) => n + Math.max(1, Math.ceil(part.length / (sheet.getColumn(column).width - 3))), 0));
    });
    row.height = Math.min(409, Math.max(26, lines * 16 + 10));
  }
  function heading(text, prominent = false) {
    const row = sheet.addRow([String(text)]);
    style(row, prominent ? colors.dark : colors.pale, prominent);
    sheet.mergeCells(row.number, 1, row.number, 6);
    row.height = Math.max(24, Math.ceil(text.length / 175) * 16 + 8);
    if (prominent) { row.getCell(1).font.size = 20; row.height = 32; }
  }
  const filters = data.filters;
  const modes = { all: 'All Logs', today: 'Today', week: 'This Week (Monday–Sunday)', month: 'This Month', date: 'Choose Date', range: 'Date Range' };
  heading('SmartHood', true);
  heading('San Alfonso Homes Homeowners Association');
  heading('Audit Log Report', true);
  heading(`Generated: ${auditExportTime(data.generatedAt)} Asia/Manila`);
  heading(`Date filter: ${modes[filters.mode] || filters.mode}${filters.mode === 'date' ? ` | Date: ${filters.date || 'Not selected'}` : filters.mode === 'range' ? ` | Range: ${filters.startDate || 'Open start'} to ${filters.endDate || 'Open end'}` : ''} | Calendar: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  heading(`Search keyword: ${filters.search || '(none)'}`);
  heading(`Total exported records: ${data.rows.length}`);
  style(sheet.addRow(['No.', 'Audit Log ID', 'Action / Event', 'Performed By', 'Actor Account ID', 'Date & Time (Asia/Manila)']), colors.teal, true);
  data.rows.forEach((item, index) => {
    // Plain strings, never formula or hyperlink objects, including IDs and actions.
    const row = sheet.addRow([index + 1, item.id, item.action, item.performer, item.adminId, item.timestamp].map((value, col) => col ? String(value ?? '') : value));
    style(row, index % 2 ? colors.pale : colors.white);
  });
  sheet.autoFilter = { from: 'A8', to: `F${8 + data.rows.length}` };
  sheet.pageSetup.printArea = `A1:F${8 + data.rows.length}`;
  return book;
}
