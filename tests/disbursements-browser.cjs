'use strict';
// Dependency-free Chrome/Edge DevTools test against the isolated HTTP/SQL fixture.
// No application database, real account or production data is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { auditFixture } = require('./helpers/audit-fixture.cjs');
const root = path.resolve(__dirname, '..');
const cleanup = [];
const output = path.join(os.tmpdir(), 'smarthood-disbursement-browser');
fs.mkdirSync(output, { recursive: true });

(async () => {
  let browser, socket, server;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smarthood-expense-chrome-'));
  try {
    const fixture = await auditFixture({ after(fn) { cleanup.push(fn); } });
    fixture.pool.tables.payments.push({ id: 'collection', status: 'approved', amount: '5000.00', payment_date: '2026-10-31' });
    const main = fs.readFileSync(path.join(root, 'public/js/main.js'), 'utf8');
    server = http.createServer(async (req, res) => {
      if (req.url.startsWith('/api/')) {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const response = await fetch(fixture.base + req.url, { method: req.method, headers: { Cookie: fixture.cookie('admin-1'), 'Content-Type': 'application/json' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
        res.writeHead(response.status, { 'Content-Type': 'application/json' }); return res.end(await response.text());
      }
      if (req.url === '/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/public/css/style.css"><link rel="stylesheet" href="/public/css/dashboard.css"><link rel="stylesheet" href="/public/css/disbursements.css"><link rel="stylesheet" href="/public/css/reports.css"></head><body style="padding:24px"><div id="contentArea"></div><div id="toastContainer"></div><div id="modalOverlay" class="modal-overlay hidden"><div id="modal" class="modal"><h3 id="modalTitle"></h3><div id="modalBody"></div><div id="modalFooter"></div></div></div><script src="/main.js"></script><script src="/public/js/dashboard.js"></script><script src="/public/js/disbursements.js"></script><script src="/public/js/report-workbook.js"></script></body></html>`);
      }
      if (req.url === '/public/vendor/exceljs-4.4.0.min.js') { res.setHeader('Content-Type','text/javascript'); return fs.createReadStream(require.resolve('exceljs/dist/exceljs.min.js')).pipe(res); }
      if (req.url === '/main.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(main.slice(0, main.lastIndexOf("if (document.readyState === 'loading')"))); }
      const files = ['public/css/style.css', 'public/css/dashboard.css', 'public/css/disbursements.css', 'public/css/reports.css', 'public/js/dashboard.js', 'public/js/disbursements.js', 'public/js/report-workbook.js'];
      const file = req.url.slice(1);
      if (!files.includes(file)) { res.writeHead(404); return res.end(); }
      res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript'); fs.createReadStream(path.join(root, file)).pipe(res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const executable = process.env.REPORT_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true });
    const ws = await new Promise((resolve, reject) => {
      let text = ''; const timeout = setTimeout(() => reject(new Error('Browser startup timed out')), 15000);
      browser.on('error', reject); browser.stderr.on('data', chunk => { text += chunk; const match = text.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    });
    socket = new WebSocket(ws);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let nextId = 0; const pending = new Map();
    socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(message.error.message)) : resolve(message.result); } });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, sessionId })); });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` }, sessionId);
    for (let i = 0; i < 100 && !await evaluate("typeof renderDisbursements === 'function'"); i++) await new Promise(resolve => setTimeout(resolve, 50));
    const result = await evaluate(`(async () => {
      const check = (value, message) => { if (!value) throw new Error(message); };
      window.pendingPhotoFile=null; window.pendingPhotoPreviewUrl=null;
      currentUser = {id:'admin-1',role:'admin',status:'active',permissions:['*']}; currentView='disbursements';
      dbCache.payments=[{id:'collection',status:'approved',amount:'5000.00',payment_date:'2026-10-31'}];
      check(ADMIN_NAV[ADMIN_NAV.findIndex(item=>item.id==='payments')+1].id==='disbursements','Sidebar order');
      await renderDisbursements();
      const fields = [...document.querySelectorAll('#expenseForm input, #expenseForm select')];
      check(fields.length === 3, 'Only three visible fields');
      const rects = fields.map(e => e.getBoundingClientRect());
      check(Math.max(...rects.map(r=>r.y))-Math.min(...rects.map(r=>r.y)) < 2, 'Desktop fields share one row');
      check(Math.max(...rects.map(r=>r.width))-Math.min(...rects.map(r=>r.width)) < 2, 'Desktop fields have equal widths');
      document.getElementById('expenseCategory').value='Gasoline'; document.getElementById('expenseDate').value='2026-10-31'; document.getElementById('expenseAmount').value='1500.00';
      await saveDisbursement();
      check(disbursementRecords.length===1, 'Creation refreshes table');
      await renderDisbursements(); check(disbursementRecords.length===1, 'Fresh server read persists expense');
      const id=disbursementRecords[0].id;
      editDisbursement(id); check(document.querySelectorAll('#expenseForm').length===1, 'Edit keeps unique form IDs');
      closeModal(); check(document.getElementById('expenseForm'), 'Cancel preserves create form');
      editDisbursement(id); document.getElementById('expenseEditAmount').value='1600.25'; await saveDisbursement(true);
      check(disbursementRecords[0].amount==='1600.25', 'Edited amount persists');
      document.getElementById('expenseFilterCategory').value='Payroll'; filterDisbursements(); check(document.getElementById('expenseRows').textContent.includes('No disbursements'), 'Category filter');
      clearDisbursementFilters(); document.getElementById('expenseFrom').value='2026-11-01'; filterDisbursements(); check(document.getElementById('expenseRows').textContent.includes('No disbursements'), 'Date filter'); clearDisbursementFilters();
      document.getElementById('expenseSearch').value='gas'; filterDisbursements(); check(document.getElementById('expenseTotal').textContent.includes('1,600.25'), 'Search total'); clearDisbursementFilters();
      const report=await fetchDisbursementReport({start:null,end:null}); check(report.netCashMovement===3399.75,'Financial calculation');
      window.testDownloads=[]; downloadCSVFile=(name,csv)=>testDownloads.push({name,csv});
      await exportDisbursementCSV('expenses-csv'); await exportDisbursementCSV('expense-summary-csv'); await exportDisbursementCSV('financial-csv');
      check(testDownloads[0].csv.includes('1600.25') && testDownloads[2].csv.includes('3399.75'),'CSV amounts');
      return {id,downloads:testDownloads};
    })()`);
    const screenshot = async name => { const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId); fs.writeFileSync(path.join(output, name), Buffer.from(data, 'base64')); };
    await screenshot('desktop.png');
    await evaluate("document.documentElement.setAttribute('data-theme','dark')");
    await new Promise(resolve => setTimeout(resolve, 300)); await screenshot('dark.png');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
    assert.equal(await evaluate("document.getElementById('expenseDate').getBoundingClientRect().y > document.getElementById('expenseCategory').getBoundingClientRect().bottom"), true);
    await screenshot('mobile.png');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
    await evaluate(`(async()=>{
      const check=(v,m)=>{if(!v)throw new Error(m)};
      currentView='reports'; syncHomeownerBalances=()=>{}; normalizeComplaintStatus=s=>s==='Open'?'Reviewed':s;
      avatarHTML=()=>''; complaintCategoryBadge=s=>escapeHtml(s); complaintStatusBadge=s=>normalizeComplaintStatus(s);
      dbCache.homeowners=Array.from({length:12},(_,i)=>({id:'h'+i,name:'Homeowner '+i,block:'1',lot:String(i)}));
      dbCache.billings=Array.from({length:12},(_,i)=>({id:'b'+i,title:'Bill '+i,amount:100,assignedTo:['h'+i],createdAt:'2026-10-01'}));
      dbCache.complaints=[{id:'c',homeownerId:'h0',category:'Noise',status:'Open',dateFiled:'2026-10-25'}];
      window.reportFetchCount=0; const originalRequest=api.request.bind(api);
      api.request=(path,options)=>{ if(path==='/api/reports/disbursements') reportFetchCount++; return originalRequest(path,options); };
      renderReports();
      for(let i=0;i<100 && !document.getElementById('expenseHistoryRows');i++) await new Promise(r=>setTimeout(r,25));
      check(document.getElementById('report-panel-overview').textContent.includes('3,399.75'),'Overview financial integration');
      check(document.querySelectorAll('.report-tab-panel:not([hidden])').length===1 && !document.getElementById('report-panel-overview').hidden,'Overview default');
      check(document.querySelectorAll('#report-panel-overview .report-summary-item').length===5,'Five summary cards');
      check(!document.querySelector('#report-panel-overview table'),'Overview has no transaction tables');
      const data=currentReportsData, initialFetches=reportFetchCount;
      switchReportTab('collections');
      document.getElementById('hoBalanceSearch').value='Homeowner'; filterHOBalanceReport(); changeHOBalancePage(2); changeBillingCollectionPage(2);
      const balanceRows=document.getElementById('hoBalanceTableBody').innerHTML;
      for(const id of ['disbursements','community','overview','collections']) {
        switchReportTab(id);
        check(document.querySelectorAll('.report-tab-panel:not([hidden])').length===1,'Only active panel visible');
        check(currentReportsData===data,'Snapshot preserved');
      }
      check(reportFetchCount===initialFetches,'No tab-switch fetches');
      check(hoBalancePaginationState.page===2 && document.getElementById('hoBalanceTableBody').innerHTML===balanceRows,'Search and pagination preserved');
      check(document.getElementById('hoBalanceSearch').value==='Homeowner','Search retained');
      document.getElementById('report-tab-collections').focus();
      document.getElementById('report-tab-collections').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
      check(document.activeElement.id==='report-tab-disbursements' && activeReportTab==='disbursements','Keyboard tabs');
      switchReportTab('community'); check(document.getElementById('report-panel-community').textContent.includes('Reviewed (1)'),'Complaint normalization');
      reportsDateFilterState={preset:'date',date:'2026-11-20'}; renderReports(); await reportsFinancialRequest;
      check(activeReportTab==='community' && currentReportsData.complaints.length===0 && currentReportsData.expenses.totalDisbursements===0,'Shared period updates active tab');
      reportsDateFilterState={preset:'all',date:'',startDate:'',endDate:''}; renderReports(); await reportsFinancialRequest;
      const originalPrint=window.print; let printCount=0;
      window.print=()=>{printCount++;check(document.querySelectorAll('#billingCollectionTableBody tr').length===12,'Print full filtered billing dataset');};
      switchReportTab('collections'); changeBillingCollectionPage(2); await printReports();
      check(printCount===1 && billingCollectionPaginationState.page===2,'Print restores page'); window.print=originalPrint;
      window.reportExcelBlobs=[]; downloadReportFile=(name,blob)=>reportExcelBlobs.push({name,blob});
      loadReportWorkbookLogo=async()=>null;
      for(const id of ['overview','collections','disbursements','community']) {switchReportTab(id); await exportReportsExcel();}
      check(reportExcelBlobs.length===4,'Excel generated from every active tab');
      window.reportExcelArtifacts=await Promise.all(reportExcelBlobs.map(async item=>({name:item.name,base64:btoa(String.fromCharCode(...new Uint8Array(await item.blob.arrayBuffer())))})));
      switchReportTab('overview');
    })()`);
    const ExcelJS = require('exceljs');
    for (const artifact of await evaluate('reportExcelArtifacts')) {
      const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(artifact.base64, 'base64'));
      assert.equal(book.worksheets.length, 9);
      assert.equal(book.getWorksheet('Financial Summary').getCell('B10').value, 3399.75);
      assert.equal(book.getWorksheet('Disbursements').getCell('D8').value, 1600.25);
      assert.equal(book.getWorksheet('Financial Collections').getCell('A19').value, 'Bill 11');
    }
    await evaluate("document.getElementById('toastContainer').innerHTML=''; document.documentElement.setAttribute('data-theme','light'); window.scrollTo({top:0,behavior:'instant'})");
    await new Promise(resolve=>setTimeout(resolve,250));
    await screenshot('reports-overview-desktop.png');
    for (const tab of ['collections','disbursements','community']) {
      await evaluate(`switchReportTab('${tab}'); window.scrollTo({top:0,behavior:'instant'})`);
      await new Promise(resolve=>setTimeout(resolve,200)); await screenshot('reports-'+tab+'-desktop.png');
    }
    for (const width of [820,390]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390},sessionId);
      for (const tab of ['overview','collections','disbursements','community']) {
        await evaluate(`switchReportTab('${tab}'); window.scrollTo({top:0,behavior:'instant'})`);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"),true,tab+' overflows at '+width);
        await new Promise(resolve=>setTimeout(resolve,200)); await screenshot('reports-'+tab+'-'+width+'.png');
      }
    }
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
    await evaluate("document.documentElement.setAttribute('data-theme','dark'); switchReportTab('overview')");
    await new Promise(resolve=>setTimeout(resolve,250)); await screenshot('reports-overview-dark.png');
    await send('Emulation.setEmulatedMedia',{media:'print'},sessionId);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.report-tabs')).display"),'none');
    assert.equal(await evaluate("[...document.querySelectorAll('.report-tab-panel')].filter(e=>getComputedStyle(e).display!=='none').length"),1);
    await send('Emulation.setEmulatedMedia',{media:''},sessionId);
    await evaluate(`(async()=>{
      currentView='disbursements'; await renderDisbursements(); voidDisbursement(${JSON.stringify(result.id)});
      document.querySelector('#modalFooter .btn-danger').click();
      for(let i=0;i<100 && disbursementBusy;i++) await new Promise(r=>setTimeout(r,25));
      if(disbursementRecords.length) throw new Error('Void excludes record');
      const report=await fetchDisbursementReport({start:null,end:null}); if(report.netCashMovement!==5000) throw new Error('Void updates totals');
      currentUser={id:'viewer',role:'homeowner',status:'active',permissions:['disbursements']}; await renderDisbursements();
      if(document.getElementById('expenseCreateForm')) throw new Error('Read-only view exposes form');
    })()`);
    assert.equal(fixture.pool.tables.disbursements.length, 1);
    assert.equal(fixture.pool.tables.auditLog.length, 3);
    fixture.pool.tables.disbursements.push(...Array.from({ length: 12 }, (_, i) => ({ id: 'page-' + i, expense_category: 'Payroll', transaction_date: '2026-10-31', amount: '1.00' })));
    await evaluate(`(async()=>{
      const check=(v,m)=>{if(!v)throw new Error(m)};
      await renderDisbursements(); check(document.querySelectorAll('#expenseRows tr').length===10,'First page size');
      changeDisbursementPage(2); check(document.querySelectorAll('#expenseRows tr').length===2,'Second page size');
      changeDisbursementPageSize(20); check(document.querySelectorAll('#expenseRows tr').length===12,'Page-size selection');
      check(!document.querySelector('#expenseRows button'),'Viewer has no edit or void actions');
    })()`);
    fs.writeFileSync(path.join(output, 'csv-results.json'), JSON.stringify(result.downloads, null, 2));
    console.log('PASS: disbursement workflow; four report tabs; keyboard navigation; preserved dates/search/pagination; no tab-switch fetches; full filtered printing; real nine-sheet Excel generation from all tabs; CSV exports; permissions; desktop/tablet/mobile and dark-mode screenshots.');
    console.log('Screenshots: ' + output);
    await send('Browser.close');
  } finally {
    socket?.close(); browser?.kill();
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    for (const fn of cleanup.reverse()) await fn();
    // The browser profile is an isolated temporary directory; leave cleanup to the OS if Chrome still holds locks.
    if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('smarthood-expense-chrome-')) {
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
