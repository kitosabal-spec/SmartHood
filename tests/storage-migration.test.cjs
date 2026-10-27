'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrateUploads, migrationKey, transformField, legacyReference, createMigrationRepository } = require('../src/services/storageMigrationService');
const { createStorageService, isObjectKey } = require('../src/services/storageService');

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'smarthood-r2-migration-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const paths = { PRIVATE_UPLOAD_DIR:path.join(root,'private'),PUBLIC_UPLOAD_DIR:path.join(root,'public','uploads'),PUBLIC_DIR:path.join(root,'public') };
  fs.mkdirSync(path.join(paths.PRIVATE_UPLOAD_DIR,'receipts'),{recursive:true});
  const filename = path.join(paths.PRIVATE_UPLOAD_DIR,'receipts','legacy.png');
  const bytes = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  fs.writeFileSync(filename,bytes);
  const reference = 'private:receipts/legacy.png';
  const state = { reference, mappings:new Map(), transactions:0, fail:false, rollbacks:0 };
  const repository = {
    async entries() { return isObjectKey(state.reference) ? [] : [{ reference:state.reference,kind:'receipts',targets:[] }]; },
    async transaction(work) {
      state.transactions++;
      const snapshot = {reference:state.reference,mappings:new Map(state.mappings)};
      try {
        await work({ mapping:async ref => state.mappings.get(ref),save:async entry => state.mappings.set(entry.reference,entry.key),
          replace:async (_,key) => { state.reference=key; if(state.fail) throw new Error('private name SQL'); } });
      } catch(error) { state.rollbacks++; state.reference=snapshot.reference; state.mappings=snapshot.mappings; throw error; }
    },
  };
  const calls=[], objects=new Map();
  const client = { async send(command) {
    const type=command.constructor.name, input=command.input; calls.push({type,input});
    if(type==='PutObjectCommand') objects.set(input.Key,input);
    const stored=objects.get(input.Key);
    if(type==='HeadObjectCommand') return { ContentLength:stored.Body.length,Metadata:stored.Metadata };
    if(type==='GetObjectCommand') return { Body:{transformToByteArray:async () => stored.Body} };
    return {};
  } };
  const storage=createStorageService({env:{STORAGE_DRIVER:'r2',R2_ACCOUNT_ID:'test',R2_ACCESS_KEY_ID:'test',R2_SECRET_ACCESS_KEY:'test',R2_BUCKET:'test',R2_ENDPOINT:'https://test.r2.cloudflarestorage.com'},client});
  return { paths,filename,bytes,reference,state,repository,storage,calls,objects,client };
}

test('migration is a read-only dry-run by default and requires explicit execution confirmation',async t => {
  const f=setup(t),reports=[];
  const summary=await migrateUploads({...f,report:item=>reports.push(item)});
  assert.equal(summary.planned,1); assert.equal(f.calls.length,0); assert.equal(f.state.transactions,0);
  assert.equal(f.state.reference,f.reference); assert.equal(fs.existsSync(f.filename),true);
  assert.ok(isObjectKey(reports[0].key,'receipts'));
  assert.equal(JSON.stringify(reports).includes('legacy.png'),false);
  await assert.rejects(migrateUploads({...f,execute:true}),/confirmation|confirm/);
});

test('real migration verifies downloaded bytes, updates transactionally, retains local originals, and reruns without work',async t => {
  const f=setup(t);
  const result=await migrateUploads({...f,execute:true,confirmed:true});
  assert.equal(result.migrated,1); assert.ok(isObjectKey(f.state.reference,'receipts'));
  assert.deepEqual(f.calls.map(c=>c.type),['PutObjectCommand','HeadObjectCommand','GetObjectCommand']);
  assert.deepEqual(fs.readFileSync(f.filename),f.bytes);
  const again=await migrateUploads({...f,execute:true,confirmed:true});
  assert.equal(again.migrated,0); assert.equal(f.calls.length,3);
  // An old reference restored from a partial import reuses the verified mapping.
  const key=f.state.reference; f.state.reference=f.reference;
  const reused=await migrateUploads({...f,execute:true,confirmed:true});
  assert.equal(reused.reused,1); assert.equal(f.state.reference,key);
  assert.equal(f.calls.filter(c=>c.type==='PutObjectCommand').length,1);
});

test('failed DB transactions retain references and files; retries reuse the same opaque key',async t => {
  const f=setup(t),reports=[];
  f.state.fail=true;
  const result=await migrateUploads({...f,execute:true,confirmed:true,report:item=>reports.push(item)});
  assert.equal(result.failed,1); assert.equal(f.state.reference,f.reference); assert.equal(f.state.mappings.size,0);
  assert.equal(f.state.rollbacks,1); assert.equal(fs.existsSync(f.filename),true);
  assert.equal(reports[0].stage,'update-references'); assert.equal(JSON.stringify(reports).includes('private name'),false);
  const key=f.calls[0].input.Key;
  f.state.fail=false;
  assert.equal((await migrateUploads({...f,execute:true,confirmed:true})).migrated,1);
  assert.equal(f.state.reference,key); assert.equal(f.objects.size,1);
  assert.equal(f.calls.some(c=>c.type==='DeleteObjectCommand'),false);
});

test('verification failure and missing files never update references or delete local files',async t => {
  const f=setup(t),original=f.client.send;
  f.client.send=async command=>command.constructor.name==='GetObjectCommand' ? {Body:{transformToByteArray:async()=>Buffer.from('corrupt')}} : original(command);
  assert.equal((await migrateUploads({...f,execute:true,confirmed:true})).failed,1);
  assert.equal(f.state.reference,f.reference); assert.equal(f.state.mappings.size,0);
  assert.equal(fs.existsSync(f.filename),true);
  f.state.reference='private:receipts/missing.png';
  assert.equal((await migrateUploads(f)).failed,1);
});

test('JSON migration changes only media references and supports every prefix, preserving original metadata',() => {
  const old='private:complaints/old.jpg',key=migrationKey(old,'complaints');
  const input=JSON.stringify([{url:old,media_url:old,storage_key:old,originalname:'original.jpg',size:20,caption:old}]);
  const output=JSON.parse(transformField(input,'attachments',value=>value===old?key:value));
  assert.equal(output[0].url,key); assert.equal(output[0].originalname,'original.jpg'); assert.equal(output[0].caption,old);
  for(const [kind,ref] of [['profile-photos','/uploads/profile/a.webp'],['payment-qrcodes','/uploads/qrcodes/a.png'],['resident-documents','private:resident-documents/a.pdf'],['announcements','/uploads/announcements/a.mp4'],['board','/uploads/board/a.jpg'],['lostfound','/uploads/lostfound/a.webm']]) {
    assert.ok(legacyReference(ref,kind)); assert.ok(isObjectKey(migrationKey(ref,kind),kind));
  }
  assert.equal(legacyReference('private:receipts/../secret.png','receipts'),null);
  assert.throws(()=>migrationKey('private:receipts/script.exe','receipts'));
});

test('migration SQL repository locks and rereads records without overwriting concurrent edits',async () => {
  const old='private:receipts/a.png',key=migrationKey(old,'receipts'),queries=[];
  let current=old;
  const connection={async beginTransaction(){queries.push('begin');},async commit(){queries.push('commit');},async rollback(){queries.push('rollback');},release(){},
    async execute(sql,values){queries.push(sql);
      if(sql.startsWith('SELECT receipt')||sql.startsWith('SELECT `receipt`'))return [[{receipt:current}]];
      if(sql.startsWith('UPDATE')){current=values[0];return [{affectedRows:1}];}
      if(sql.startsWith('SELECT object_key'))return [[]];
      return [{affectedRows:1}];
    }};
  const repository=createMigrationRepository({getConnection:async()=>connection,async execute(sql){
    if(sql.includes('information_schema'))return [[{table_name:'payments',column_name:'id'},{table_name:'payments',column_name:'receipt'}]];
    return [[{id:'p1',receipt:old}]];
  }});
  const [entry]=await repository.entries();
  current='private:receipts/concurrent.png';
  await repository.transaction(tx=>tx.replace(entry,key));
  assert.equal(current,'private:receipts/concurrent.png');
  current=old;
  await repository.transaction(tx=>tx.replace(entry,key));
  assert.equal(current,key); assert.ok(queries.some(q=>q.includes('FOR UPDATE')));
  assert.equal(queries.at(-1),'commit');
});
