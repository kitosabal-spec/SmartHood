'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { auditFixture } = require('./helpers/audit-fixture.cjs');
async function setup(t) {
  const f = await auditFixture(t);
  f.pool.users.find(u => u.id === 'resident-1').permissions = '["resident"]';
  f.pool.users.push({ id: 'officer', role: 'hoa_officer', status: 'active', permissions: '["billing","payments"]' },
    { id: 'resident-officer', role: 'homeowner', homeowner_id: 'home-1', status: 'active', permissions: '["resident","billing","payments"]' },
    { id: 'neither', role: 'hoa_officer', homeowner_id: 'home-1', status: 'active', permissions: '[]' });
  f.pool.tables.billings.push(...['home-1','home-2'].map((id,i) => ({ id: `b${i}`, title: 'Bill', amount: 100, status: 'active', assignedTo: JSON.stringify([id]) })));
  f.pool.tables.payments.push(...['home-1','home-2'].map((id,i) => ({ id: `p${i}`, homeownerId: id, billingId: `b${i}`, amount: 10, status: 'rejected' })));
  return f;
}
function proof(billingId = 'b0') {
  const form = new FormData();
  form.set('billingId', billingId); form.set('amount', '50'); form.set('refNum', 'proof-reference');
  form.set('homeownerId', 'home-2'); form.set('status', 'approved');
  form.set('receipt', new Blob([Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])], { type: 'image/png' }), 'proof.png');
  return form;
}
test('financial module permissions preserve reads but deny every management route, including existing officers and resident accounts', async t => {
  const f = await setup(t);
  const writes = [
    ['POST','/api/billings/generate-monthly-dues',{ month:'2026-11' }],
    ['POST','/api/payments/manual',{}], ['POST','/api/payments/p0/approve',{}], ['POST','/api/payments/p0/reject',{reason:'test'}],
    ['PUT','/api/payment-settings',{}], ['POST','/api/payment-settings/upload-qr',{}], ['DELETE','/api/payment-settings/qr'],
    ['PUT','/api/appSettings/duesRatePerSqm',{value:'1'}], ['PUT','/api/appSettings',[]],
  ];
  for(const table of ['billings','payments','payment_settings']) writes.push(['POST',`/api/${table}`,{}], ['PUT',`/api/${table}`,[]], ['PUT',`/api/${table}/p0`,{}], ['DELETE',`/api/${table}/p0`]);
  const before = structuredClone(f.pool.tables);
  for(const user of ['officer','resident-officer','resident-1','neither','inactive-1']) for(const [method,url,body] of writes) {
    assert.equal((await f.request(method,url,body,user)).status,403,`${user} ${method} ${url}`);
  }
  assert.deepEqual(f.pool.tables,before);
  for(const [user,count] of [['admin-1',2],['officer',2],['resident-officer',2],['resident-1',1],['neither',0]]) {
    for(const table of ['billings','payments']) {
      const r = await f.request('GET',`/api/${table}`,undefined,user);
      assert.equal(r.status,count ? 200 : 403, JSON.stringify({ user, table, response: r, errors: f.errors }));
      if(count) assert.equal(r.body.length,count);
    }
    const data = await f.request('GET','/api/data',undefined,user);
    assert.equal(data.status,200,JSON.stringify(data));
    assert.equal(data.body.billings.length,count); assert.equal(data.body.payments.length,count);
  }
  assert.equal((await f.request('GET','/api/payment-settings',undefined,'officer')).status,200);
  assert.equal(f.pool.tables.payment_settings.length,0,'reading defaults must not write settings');
  const officer = f.pool.users.find(u => u.id === 'officer');
  for (const [permission,allowed,denied] of [['billing','billings','payments'],['payments','payments','billings']]) {
    officer.permissions = JSON.stringify([permission]);
    assert.equal((await f.request('GET',`/api/${allowed}`,undefined,'officer')).status,200);
    assert.equal((await f.request('GET',`/api/${denied}`,undefined,'officer')).status,403);
    const data = await f.request('GET','/api/data',undefined,'officer');
    assert.equal(data.body[allowed].length,2); assert.equal(data.body[denied].length,0);
  }
});
test('resident submission and receipt correction remain ownership scoped; officers cannot replace receipts', async t => {
  const f = await setup(t);
  for(const user of ['officer','neither','inactive-1']) {
    assert.equal((await f.request('POST','/api/payments/submit',proof(),user)).status,403);
    assert.equal((await f.request('POST','/api/payments/p0/receipt',proof(),user)).status,403);
  }
  assert.equal((await f.request('POST','/api/payments/submit',proof('b1'),'resident-1')).status,403);
  assert.equal((await f.request('POST','/api/payments/p1/receipt',proof(),'resident-1')).status,403);
  const result = await f.request('POST','/api/payments/submit',proof(),'resident-1');
  assert.equal(result.status,201,JSON.stringify(result));
  assert.equal(result.body.payment.homeownerId,'home-1'); assert.equal(result.body.payment.status,'pending');
  assert.equal((await f.request('POST',`/api/payments/${result.body.payment.id}/receipt`,proof(),'resident-1')).status,200);
  for(const [user,id,status] of [['resident-1',result.body.payment.id,200],['officer',result.body.payment.id,200],['admin-1',result.body.payment.id,200],['neither',result.body.payment.id,403],['resident-1','p1',403]]) {
    // Sign tickets as the server does, including stale tickets for users whose permission was removed.
    const crypto = require('node:crypto');
    const data = Buffer.from(JSON.stringify({userId:user,expiresAt:Date.now()+60000})).toString('base64url');
    const sig = crypto.createHmac('sha256','test-session-secret').update(data).digest('base64url');
    const ticket = Buffer.from(JSON.stringify({kind:'receipts',recordId:id,userId:user,index:0,expires:Date.now()+60000})).toString('base64url');
    const signature = crypto.createHmac('sha256','test-file-secret').update(ticket).digest('base64url');
    const r = await fetch(`${f.base}/api/files/receipts/${id}?access=${ticket}.${signature}`, {headers:{Cookie:`smarthood_session=${data}.${sig}`}});
    assert.equal(r.status,status,`${user} receipt ${id}`); await r.arrayBuffer();
  }
});
test('administrator retains generic management and dedicated financial actions', async t => {
  const f = await setup(t);
  for(const table of ['payments','payment_settings']) {
    assert.equal((await f.request('PUT',`/api/${table}`, [{id:'record',status:'pending'}])).status,200);
    assert.equal((await f.request('PUT',`/api/${table}/record`,{status:'rejected'})).status,200);
    assert.equal((await f.request('DELETE',`/api/${table}/record`)).status,200);
  }
  assert.equal((await f.request('PUT','/api/payment-settings',{account_name:'HOA'})).status,200);
  assert.equal((await f.request('POST','/api/payments/manual',{homeownerId:'home-1',billingId:'b0',amount:20,payment_method:'Cash',payment_date:'2026-10-22'})).status,201);
});

test('frontend helpers and rendered officer pages expose reads and detail modals without management controls', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const main = fs.readFileSync(require('node:path').join(__dirname,'../public/js/main.js'),'utf8');
  const helpers = ['userHasModulePermission','isAdmin','canManageBilling','canManagePayments','canViewBillingStatus','canViewPayments']
    .map(name => main.match(new RegExp(name === 'userHasModulePermission' ? `function ${name}\\([^]*?\\n\\}` : `function ${name}[^\\n]+`))[0]).join('\n');
  const elements = {};
  const bill = {id:'b',title:'Bill',amount:100,assignedTo:['h'],dueDate:'2026-11-01',status:'active'};
  const payment = {id:'p',homeownerId:'h',billingId:'b',amount:50,status:'pending'};
  const tables = {billings:[bill],payments:[payment],homeowners:[{id:'h',name:'Resident'}],users:[]};
  const context = {
    currentUser:{role:'hoa_officer',status:'active',permissions:['billing','payments']}, ADMIN_ONLY_MODULES:['users','settings'],
    document:{getElementById:id => elements[id] ||= {innerHTML:'',value:'',addEventListener(){},classList:{add(){},remove(){}},style:{}}},
    db:{get:key=>tables[key] || [],getOne:(key,id)=>(tables[key] || []).find(r=>r.id===id)},
    getHomeowners:()=>tables.homeowners, getHomeownerById:()=>tables.homeowners[0],getHomeownerRecords:()=>tables.homeowners,
    getBillingCollectionStatus:()=>"unpaid", badgeHtml:String, getBillingPaymentSummary:()=>({originalAmount:100,totalPaid:0,remainingBalance:100,status:"unpaid"}), escapeHtml:String,formatDate:String,formatDateTime:String,getLocalDateValue:()=> '2026-10-22',
    showToast(){},closeModal(){},openModal:(title,html,buttons)=>{context.modal={title,html,buttons};},
    renderPagination(){},console,
  };
  vm.createContext(context);
  vm.runInContext(helpers+'\n'+fs.readFileSync(require('node:path').join(__dirname,'../public/js/billing.js'),'utf8'),context);
  for(const [role,permissions,view,manage] of [['admin',[],true,true],['hoa_officer',['billing','payments'],true,false],['homeowner',['resident'],false,false],['hoa_officer',[],false,false]]) {
    context.currentUser={role,status:'active',permissions};
    assert.equal(context.canViewBillingStatus(),view); assert.equal(context.canViewPayments(),view);
    assert.equal(context.canManageBilling(),manage); assert.equal(context.canManagePayments(),manage);
  }
  context.currentUser={role:'hoa_officer',status:'active',permissions:['billing','payments']};
  context.renderBilling();
  assert.match(elements.contentArea.innerHTML,/billSearch/); assert.match(elements.contentArea.innerHTML,/billingPagination/);
  assert.doesNotMatch(elements.contentArea.innerHTML,/onclick="(?:openAddBilling|autoGenerate)/);
  assert.doesNotMatch(elements.billTableBody.innerHTML,/confirmDeleteBilling/);
  context.renderPayments();
  assert.match(elements.contentArea.innerHTML,/paySearch/); assert.match(elements.contentArea.innerHTML,/payFilter/);
  assert.doesNotMatch(elements.contentArea.innerHTML,/openCreateManualPaymentModal|openPaymentSettingsModal/);
  assert.doesNotMatch(elements.payTableBody.innerHTML,/confirmApprovePayment|openRejectPaymentModal/);
  context.viewPaymentDetail('p'); assert.deepEqual(Array.from(context.modal.buttons,b=>b.label),['Close']);
  context.viewBillingDetail('b'); assert.equal(context.modal.title,'Bill');
  assert.match(main,/desc: 'View billing records'/); assert.match(main,/desc: 'View payment records'/);
});
