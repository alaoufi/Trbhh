'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,writeFileSync,rmSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {TABLES,projectTable,disabledFlags,snapshot,verify}=require('./supplier-preservation-proof.cjs');
const hex=value=>Buffer.from(String(value)).toString('hex').toUpperCase();
function proof(){
  const tables={};
  for(const name of Object.keys(TABLES))tables[name]=projectTable(name,[{c:'id',type:'bigint',nullable:'NO',def:null},{c:'value',type:'text',nullable:'NO',def:null}],[{c0:hex(1),c1:hex('private')}]);
  return {format:'trbhh-supplier-preservation-v1',tables,flags:disabledFlags([{k:'commerce_purchasing_enabled',v:'0'}])};
}
test('preserves protected data, multiplicity/schema and disabled flags',()=>{
  assert.equal(verify(proof(),proof()).ok,true);
  for(const field of ['rowHashes','count','schemaHash']){
    const changed=proof();if(field==='rowHashes')changed.tables.supplier_connections.rowHashes=['f'.repeat(64)];else if(field==='count')changed.tables.supplier_connections.count=0;else changed.tables.supplier_connections.schemaHash='f'.repeat(64);
    assert.throws(()=>verify(proof(),changed),/^Error: supplier_preservation_failed$/);
  }
  const changed=proof();changed.flags=disabledFlags([]);assert.throws(()=>verify(proof(),changed),/supplier_preservation_failed/);
});
test('disabled purchasing/payment/public gates reject enabled, duplicate and malformed settings',()=>{
  for(const key of ['commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled'])for(const value of ['1','true','yes','unexpected'])assert.throws(()=>disabledFlags([{k:key,v:value}]),/supplier_preservation_failed/);
  assert.throws(()=>disabledFlags([{k:'commerce_enabled',v:'0'},{k:'commerce_enabled',v:'0'}]),/supplier_preservation_failed/);
  assert.equal(disabledFlags([]).disabled,true);
});
test('only enumerated operational columns are omitted; token, price, stock and visibility remain protected',()=>{
  const schema=['id','encrypted_tokens','quantity','visible','last_sync_at','revision'].map(c=>({c,type:'text',nullable:'YES',def:null}));
  const result=projectTable('supplier_products',schema,[{c0:hex(1),c1:hex('token'),c2:hex(9),c3:hex(0)}]);
  assert.deepEqual(result.columns,['id','encrypted_tokens','quantity','visible']);
  assert.equal(JSON.stringify(result).includes('token'),true); // Column name, not its private value.
  assert.equal(JSON.stringify(result).includes(hex('token')),false);
});
test('snapshot uses a consistent read-only transaction and static target tables',async()=>{
  const tx={$queryRawUnsafe:async sql=>{
    assert.match(sql,/^SELECT /);assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|ALTER|CREATE)\b/);
    if(sql.includes('information_schema'))return Object.keys(TABLES).map(t=>({t,c:'id',type:'bigint',nullable:'NO',def:null}));
    if(sql.includes('site_settings'))return [];
    return [{c0:hex(1)}];
  }};
  const report=await snapshot({$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,'RepeatableRead');return fn(tx);}});
  assert.equal(verify(report,report).ok,true);
});
test('merchant OAuth runtime profile requires exact Salla key preservation and disabled live orders without printing secrets',()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'trbhh-supplier-proof-'));
  try{
    const before={Config:{Env:['DATABASE_URL=private-db','AUTH_SECRET=private-auth','STORAGE_DIR=/app/storage','LEGACY_LOCAL_DIR=/app/legacy','SALLA_CLIENT_ID=private-client','SALLA_CLIENT_SECRET=private-secret','SALLA_WEBHOOK_SECRET=private-webhook','SUPPLIER_TOKEN_ENCRYPTION_KEY=private-key','SUPPLIER_RECONCILE_SECRET=private-reconcile','SUPPLIER_PUBLIC_ORIGIN=https://trbhh.sa','SUPPLIER_ALLOW_LIVE_ORDERS=false']},Mounts:[]};
    const beforePath=path.join(directory,'before.json'),afterPath=path.join(directory,'after.json');
    writeFileSync(beforePath,JSON.stringify([before]));
    for(const profile of ['merchant_oauth','merchant_headers']){
      const run=container=>{writeFileSync(afterPath,JSON.stringify([container]));return spawnSync(process.execPath,[path.join(__dirname,'verify-runtime.cjs'),beforePath,afterPath,profile],{encoding:'utf8'});};
      assert.equal(run(before).status,0);
      for(const edit of [line=>line.replace('SALLA_CLIENT_SECRET=private-secret','SALLA_CLIENT_SECRET=secret-changed'),line=>line.replace('SUPPLIER_ALLOW_LIVE_ORDERS=false','SUPPLIER_ALLOW_LIVE_ORDERS=true')]){
        const result=run({...before,Config:{Env:before.Config.Env.map(edit)}});assert.equal(result.status,1);assert.doesNotMatch(result.stdout+result.stderr,/private-secret|secret-changed/);
      }
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('merchant OAuth safeguard is separately pinned and proves suppliers before deployment verification marker',()=>{
  const source=readFileSync(path.join(__dirname,'safeguards.sh'),'utf8');
  assert.match(source,/elif \[\[ "\$release_profile" == merchant_oauth \]\]; then\s+\[\[ "\$current_commit" == 07d2e9ead8e0b28824102d5c8a31b097e01f9459/);
  assert(source.indexOf('"$backup/supplier-after.json"')<source.indexOf('> "$backup/DEPLOYMENT_VERIFIED"'));
  assert(source.includes('docker exec -i "$reader" node - snapshot < "$tools_dir/supplier-preservation-proof.cjs"'));
  assert(source.includes('021c5fe43f9a6361f7a0df66bf35e92f38e0cf06'));
});
