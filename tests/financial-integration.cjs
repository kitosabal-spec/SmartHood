'use strict';
// Opt-in live check. Copies schema only into a uniquely named disposable database.
// Production records are never copied or written; email is stubbed by the fixture.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { fixture } = require('./helpers/auth-fixture.cjs');
const { DB_CONFIG } = require('../src/config/environment');

function cookie(userId) {
  const data = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + 3600000 })).toString('base64url');
  return `${data}.${crypto.createHmac('sha256', 'test-session-secret').update(data).digest('base64url')}`;
}
function proof(billingId, reference) {
  const form = new FormData();
  form.set('billingId', billingId); form.set('amount', '20'); form.set('refNum', reference);
  form.set('homeownerId', 'h2'); form.set('status', 'approved');
  form.set('receipt', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'receipt.png');
  return form;
}

test('live MySQL financial authorization and real browser officer views', { skip: process.env.FINANCIAL_INTEGRATION !== '1', timeout: 120000 }, async t => {
  const name = `smarthood_permission_test_${crypto.randomBytes(8).toString('hex')}`;
  assert.match(name, /^smarthood_permission_test_[a-f0-9]{16}$/);
  const control = await mysql.createConnection(DB_CONFIG);
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'smarthood-financial-'));
  let pool, browser, created = false;
  const cleanups = [];
  try {
    await control.query(`CREATE DATABASE ${mysql.escapeId(name)}`);
    created = true;
    const [schema] = await control.query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
    for (const row of schema) {
      const table = Object.values(row)[0];
      await control.query(`CREATE TABLE ${mysql.escapeId(name)}.${mysql.escapeId(table)} LIKE ${mysql.escapeId(DB_CONFIG.database)}.${mysql.escapeId(table)}`);
    }
    pool = mysql.createPool({ ...DB_CONFIG, database: name, connectionLimit: 5 });
    await pool.execute('INSERT INTO homeowners (id, name, lotArea) VALUES (?, ?, ?), (?, ?, ?)', ['h1','Resident One',100,'h2','Resident Two',100]);
    for (const [id,role,home,permissions] of [
      ['admin','admin',null,['*']], ['officer','hoa_officer',null,['billing','payments']],
      ['resident','homeowner','h1',['resident']], ['neither','hoa_officer',null,[]],
    ]) await pool.execute('INSERT INTO users (id, role, name, status, homeowner_id, permissions) VALUES (?, ?, ?, ?, ?, ?)', [id,role,id,'active',home,JSON.stringify(permissions)]);
    for (const [id,home] of [['b1','h1'],['b2','h2']]) {
      await pool.execute('INSERT INTO billings (id, title, amount, assignedTo, status, billing_type, dueDate) VALUES (?, ?, ?, ?, ?, ?, ?)', [id,'Community charge',100,JSON.stringify([home]),'active','Other Billing','2026-11-30']);
      await pool.execute('INSERT INTO payments (id, homeownerId, billingId, amount, status) VALUES (?, ?, ?, ?, ?)', [`p${id}`,home,id,5,'rejected']);
    }
    const f = await fixture({ after: cleanup => cleanups.push(cleanup) }, { pool, paths: { PRIVATE_RECEIPT_UPLOAD_DIR: uploads, PRIVATE_QRCODE_UPLOAD_DIR: uploads } });
    async function request(user, method, url, body) {
      const r = await fetch(f.base + url, { method, headers: { Cookie: `smarthood_session=${cookie(user)}`, ...(body instanceof FormData ? {} : {'Content-Type':'application/json'}) }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    }
    for (const [user,count] of [['admin',2],['officer',2],['resident',1],['neither',0]]) {
      for (const table of ['billings','payments']) {
        const r = await request(user,'GET',`/api/${table}`);
        assert.equal(r.status,count ? 200 : 403,`${user} GET ${table}`);
        if(count) assert.equal(r.body.length,count);
      }
      const data = await request(user,'GET','/api/data');
      assert.equal(data.status,200,JSON.stringify(data));
      assert.equal(data.body.billings.length,count); assert.equal(data.body.payments.length,count);
    }
    const writes = [
      ['POST','/api/billings/generate-monthly-dues',{month:'2026-12'}], ['POST','/api/payments/manual',{}],
      ['POST','/api/payments/pb1/approve',{}], ['POST','/api/payments/pb1/reject',{reason:'Reason'}],
      ['PUT','/api/payment-settings',{}], ['POST','/api/payment-settings/upload-qr',{}], ['DELETE','/api/payment-settings/qr'],
      ['PUT','/api/appSettings/duesRatePerSqm',{value:'1'}],
    ];
    for (const table of ['billings','payments','payment_settings']) writes.push(['POST',`/api/${table}`,{}], ['PUT',`/api/${table}`,[]], ['PUT',`/api/${table}/pb1`,{}], ['DELETE',`/api/${table}/pb1`]);
    for (const user of ['officer','resident','neither']) for (const [method,url,body] of writes) assert.equal((await request(user,method,url,body)).status,403,`${user} ${method} ${url}`);
    const [[auditCount]] = await pool.query('SELECT COUNT(*) AS count FROM auditLog');
    assert.equal(auditCount.count,0,'denied writes must not mutate the audit or financial records');
    for(const user of ['officer','neither']) assert.equal((await request(user,'POST','/api/payments/submit',proof('b1',user))).status,403);
    assert.equal((await request('resident','POST','/api/payments/submit',proof('b2','foreign'))).status,403);
    const submitted = await request('resident','POST','/api/payments/submit',proof('b1','owned'));
    assert.equal(submitted.status,201,JSON.stringify(submitted));
    const payment = submitted.body.payment;
    assert.equal(payment.homeownerId,'h1'); assert.equal(payment.status,'pending');
    assert.equal((await request('officer','POST',`/api/payments/${payment.id}/receipt`,proof('b1','replace'))).status,403);
    assert.equal((await request('resident','POST','/api/payments/pb2/receipt',proof('b1','foreign-replace'))).status,403);
    assert.equal((await request('resident','POST',`/api/payments/${payment.id}/receipt`,proof('b1','correct'))).status,200);
    for(const user of ['admin','officer','resident','neither']) {
      const ticket = Buffer.from(JSON.stringify({kind:'receipts',recordId:payment.id,userId:user,index:0,expires:Date.now()+60000})).toString('base64url');
      const signature = crypto.createHmac('sha256','test-file-secret').update(ticket).digest('base64url');
      const r = await fetch(`${f.base}/api/files/receipts/${payment.id}?access=${ticket}.${signature}`,{headers:{Cookie:`smarthood_session=${cookie(user)}`}});
      assert.equal(r.status,user === 'neither' ? 403 : 200); await r.arrayBuffer();
    }
    console.log('PASS: live MySQL reads, dedicated/generic write denial, ownership and receipt access');

    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
    browser = await chromium.launch({headless:true,...(process.env.REPORT_BROWSER_EXECUTABLE ? {executablePath:process.env.REPORT_BROWSER_EXECUTABLE} : {})});
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    await context.addCookies([{name:'smarthood_session',value:cookie('officer'),url:f.base}]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.request().url().startsWith(f.base) ? route.continue() : route.abort());
    await page.goto(f.base);
    await page.waitForFunction(()=>typeof currentUser !== 'undefined' && currentUser?.id === 'officer');
    await page.evaluate(()=>navigate('billing'));
    await page.locator('#billSearch').fill('Community');
    assert.equal(await page.locator('#billTableBody tr').count(),2);
    assert.equal(await page.locator('#contentArea [onclick*="openAddBilling"], #contentArea [onclick*="autoGenerate"], #contentArea [onclick*="confirmDeleteBilling"]').count(),0);
    await page.locator('#billTableBody button').first().click();
    assert.equal(await page.locator('#modalFooter button').count(),1);
    await page.locator('#modalFooter button').click();
    assert.equal(await page.locator('#billingPagination').isVisible(),true);
    await page.evaluate(()=>navigate('payments'));
    assert.equal(await page.locator('#contentArea [onclick*="openCreateManualPaymentModal"], #contentArea [onclick*="openPaymentSettingsModal"], #contentArea [onclick*="confirmApprovePayment"], #contentArea [onclick*="openRejectPaymentModal"]').count(),0);
    await page.locator('#payFilter').selectOption('pending');
    assert.equal(await page.locator('#payTableBody tr').count(),1);
    await page.locator('#payTableBody button').first().click();
    assert.equal(await page.locator('#modalFooter button').count(),1);
    assert.match(await page.locator('#modalBody').innerText(),/Pending/);
    assert.deepEqual(errors,[]);
    console.log('PASS: real browser with live API officer search, filters, pagination, details and absent management controls');

    assert.equal((await request('admin','POST',`/api/payments/${payment.id}/approve`,{})).status,200);
    const second = await request('resident','POST','/api/payments/submit',proof('b1','second'));
    assert.equal(second.status,201,JSON.stringify(second));
    assert.equal((await request('admin','POST',`/api/payments/${second.body.payment.id}/reject`,{reason:'Please correct proof'})).status,200);
    const manual = await request('admin','POST','/api/payments/manual',{homeownerId:'h1',billingId:'b1',amount:20,payment_method:'Cash',payment_date:'2026-10-23'});
    assert.equal(manual.status,201,JSON.stringify(manual));
    assert.equal((await request('admin','PUT','/api/payment-settings',{account_name:'Test HOA'})).status,200);
    assert.equal((await request('admin','POST','/api/billings/generate-monthly-dues',{month:'2026-12'})).status,200);
    assert.equal((await request('admin','PUT','/api/billings/b2',{description:'Updated test bill'})).status,200);
    assert.equal((await request('admin','PUT','/api/payments',[])).status,200);
    assert.equal((await request('admin','DELETE','/api/billings/b2')).status,200);
    console.log('PASS: live MySQL administrator approval, rejection, manual payments, settings, generation, CRUD and bulk replacement');
  } finally {
    if(browser) await browser.close();
    for(const cleanup of cleanups.reverse()) await cleanup();
    if(pool) await pool.end();
    if(created) await control.query(`DROP DATABASE ${mysql.escapeId(name)}`);
    await control.end();
    for(const file of fs.readdirSync(uploads)) fs.unlinkSync(path.join(uploads,file));
    fs.rmdirSync(uploads);
  }
});
