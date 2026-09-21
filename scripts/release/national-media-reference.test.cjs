'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {validateReview,CHECKPOINT_ID,BASELINE,CURRENT}=require('./national-media-reference.cjs');
const supplier=require('./supplier-preservation-proof.cjs');
const hash=data=>createHash('sha256').update(data).digest('hex'),hex=value=>value===null?null:Buffer.from(String(value)).toString('hex').toUpperCase();
function write(dir,name,value){fs.writeFileSync(path.join(dir,name),typeof value==='string'?value:JSON.stringify(value),{mode:0o600});}
function json(dir,name){return JSON.parse(fs.readFileSync(path.join(dir,name)));}
function fixture(){
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'trbhh-national-review-')));
  const columns=['id','unit_cost_minor','selling_price_minor','commerce_product_id','revision','active','visible','featured','sku','last_sync_at'];
  const definitions=columns.map(c=>({c,type:'varchar(99)',nullable:'YES',def:null}));
  const rows=Array.from({length:20},(_,i)=>({id:String(i+1),values:[String(i+1),null,null,null,'0','0','0','0','private-sku-'+i,'before'].map(hex)}));
  const old={format:'trbhh-private-supplier-forensics-v1',definitions,columns,rows},next=structuredClone(old);
  for(const id of ['6','9','10']){const row=next.rows.find(row=>row.id===id);for(const [name,value] of [['unit_cost_minor','500'],['selling_price_minor','900'],['commerce_product_id',String(Number(id)+100)],['revision','1']])row.values[columns.indexOf(name)]=hex(value);}
  const project=snapshot=>supplier.projectTable('supplier_products',definitions,snapshot.rows.map(row=>Object.fromEntries(columns.filter(c=>!supplier.TABLES.supplier_products.includes(c)).map((c,i)=>['c'+i,row.values[columns.indexOf(c)]]))));
  const empty={count:0,columns:['id'],schemaHash:'a'.repeat(64),rowHashes:[]};
  const before={format:'trbhh-supplier-preservation-v1',flags:{disabled:true,sha256:'c'.repeat(64)},tables:{supplier_products:project(old),supplier_connections:empty,supplier_integration_profiles:empty}};
  const after=structuredClone(before);after.tables.supplier_products=project(next);
  const table={count:0,primaryKeyColumns:['id'],primaryKeys:[],protectedColumns:[],rowFingerprints:{}};
  const tables={users:table,ads:table};for(let i=0;i<185;i++)tables['fixture_'+i]=table;
  const database={format:'trbhh-database-proof-v1',databaseIdentitySha256:'d'.repeat(64),observedAt:'2026-09-21T16:36:50.000Z',tables};
  for(const [name,value] of Object.entries({'before.json':database,'after.json':database,'supplier-before.json':before,'supplier-after.json':after,'supplier-final.json':after,'supplier-after-reviewed-admin.json':before,'supplier-reviewed-result.json':supplier.verify(before,structuredClone(before)),'forensic-supplier-baseline.json':old,'forensic-supplier-current.json':next,'auth-schema-result.json':{ok:true,checks:Object.fromEntries(['users.auth_session_version','auth_mfa.user_id','auth_mfa.secret','auth_mfa.recovery_hashes','auth_mfa.last_step','auth_mfa.version','auth_mfa.created_at','auth_security_limits.k','auth_security_limits.hits','auth_security_limits.expires_at','auth_security_limits_expiry_index'].map(key=>[key,true]))},'runtime-result.txt':'preserved'}))write(dir,name,value);
  const result=spawnSync(process.execPath,[path.join(__dirname,'database-proof.cjs'),'verify',path.join(dir,'before.json'),path.join(dir,'after.json')],{encoding:'utf8'});assert.equal(result.status,0);write(dir,'database-result.json',result.stdout);
  const names=['before.json','supplier-before.json','supplier-after.json','forensic-supplier-baseline.json','forensic-supplier-current.json'];
  const evidenceHashes=Object.fromEntries(names.map(name=>[name,hash(fs.readFileSync(path.join(dir,name)))]));
  write(dir,'supplier-admin-operation-review.json',{ok:true,sameActorAcrossProducts:true,publishedAutomatically:false,sourceRowsLost:false,evidenceHashes,products:['6','9','10'].map(productId=>({productId,auditedAt:'2026-09-21T16:42:27.584Z',adminActionMatches:true,matchingActorAndAuditTime:true,oldAndNewAmountsMatchPrivateEvidence:true,mappingMatches:true,commerceInvisibleAndDisabled:true,revisionAdvancedExactlyOnce:true}))});
  write(dir,'supplier-admin-attestation.json',{format:'trbhh-reviewed-concurrent-supplier-admin-v1',backupId:CHECKPOINT_ID,baselineCommit:BASELINE,targetCommit:CURRENT,originalManifestsModified:false,sqlWrites:false,exactProductIds:['6','9','10'],exactChangedProtectedColumns:['commerce_product_id','unit_cost_minor','selling_price_minor'],evidenceHashes,auditResultSha256:hash(fs.readFileSync(path.join(dir,'supplier-admin-operation-review.json'))),reviewedSupplierSha256:hash(fs.readFileSync(path.join(dir,'supplier-after-reviewed-admin.json')))});
  write(dir,'POST_RELEASE_REVIEWED.json',{status:'verified-with-explicit-concurrent-admin-review',commit:CURRENT,backupRun:Number(CHECKPOINT_ID),verifiedTables:187,originalManifestsPreserved:true,runtimeAndAuthVerified:true,supplierPreservationReviewed:true,purchasingEnabled:false,paymentsEnabled:false,publicCommerceEnabled:false});
  return {dir,cleanup(){assert.equal(fs.realpathSync(dir),dir);assert.equal(path.dirname(dir),fs.realpathSync(os.tmpdir()));assert(path.basename(dir).startsWith('trbhh-national-review-'));fs.rmSync(dir,{recursive:true,force:true});}};
}
function use(run){const f=fixture();try{return run(f);}finally{f.cleanup();}}
function rehashAudit(dir){const proof=json(dir,'supplier-admin-attestation.json');proof.auditResultSha256=hash(fs.readFileSync(path.join(dir,'supplier-admin-operation-review.json')));write(dir,'supplier-admin-attestation.json',proof);}
function rebindChangedSource(dir,edit){
  const current=json(dir,'forensic-supplier-current.json');edit(current);write(dir,'forensic-supplier-current.json',current);
  const rows=current.rows.map(row=>Object.fromEntries(current.columns.filter(c=>!supplier.TABLES.supplier_products.includes(c)).map((c,i)=>['c'+i,row.values[current.columns.indexOf(c)]])));
  const after=json(dir,'supplier-after.json');after.tables.supplier_products=supplier.projectTable('supplier_products',current.definitions,rows);write(dir,'supplier-after.json',after);write(dir,'supplier-final.json',after);
  const proof=json(dir,'supplier-admin-attestation.json'),audit=json(dir,'supplier-admin-operation-review.json');
  for(const name of ['forensic-supplier-current.json','supplier-after.json'])proof.evidenceHashes[name]=hash(fs.readFileSync(path.join(dir,name)));
  audit.evidenceHashes=proof.evidenceHashes;write(dir,'supplier-admin-operation-review.json',audit);proof.auditResultSha256=hash(fs.readFileSync(path.join(dir,'supplier-admin-operation-review.json')));write(dir,'supplier-admin-attestation.json',proof);
}
test('validates exact historical review while retaining private raw manifests',()=>use(({dir})=>{const before=fs.readFileSync(path.join(dir,'supplier-after.json'));const hashes=validateReview(dir);assert.equal(Object.keys(hashes).length,15);assert.deepEqual(fs.readFileSync(path.join(dir,'supplier-after.json')),before);assert(!JSON.stringify(hashes).includes('private-sku'));}));
test('rejects wrong deployment, enabled commerce or missing review marker',()=>{for(const [key,value] of [['commit','0'.repeat(40)],['originalManifestsPreserved',false],['purchasingEnabled',true],['paymentsEnabled',true],['publicCommerceEnabled',true]])use(({dir})=>{const notice=json(dir,'POST_RELEASE_REVIEWED.json');notice[key]=value;write(dir,'POST_RELEASE_REVIEWED.json',notice);assert.throws(()=>validateReview(dir));});});
test('rejects changed original evidence, supplier final, reviewed copy or DB result',()=>{for(const name of ['supplier-before.json','supplier-after.json','forensic-supplier-current.json','supplier-final.json','supplier-after-reviewed-admin.json','database-result.json'])use(({dir})=>{write(dir,name,{ok:true});assert.throws(()=>validateReview(dir));});});
test('rejects false audit predicates even if attestation digest is rewritten',()=>{for(const key of ['adminActionMatches','matchingActorAndAuditTime','oldAndNewAmountsMatchPrivateEvidence','mappingMatches','commerceInvisibleAndDisabled','revisionAdvancedExactlyOnce'])use(({dir})=>{const audit=json(dir,'supplier-admin-operation-review.json');audit.products[0][key]=false;write(dir,'supplier-admin-operation-review.json',audit);rehashAudit(dir);assert.throws(()=>validateReview(dir));});});
test('rejects any expansion of reviewed products, columns or baseline',()=>{for(const change of [p=>p.exactProductIds.push('11'),p=>p.exactChangedProtectedColumns.push('visible'),p=>p.baselineCommit=CURRENT])use(({dir})=>{const proof=json(dir,'supplier-admin-attestation.json');change(proof);write(dir,'supplier-admin-attestation.json',proof);assert.throws(()=>validateReview(dir));});});
test('rejects absent auth checks and hardlinked evidence',()=>{use(({dir})=>{write(dir,'auth-schema-result.json',{ok:true,checks:{fixture:false}});assert.throws(()=>validateReview(dir));});use(({dir})=>{fs.linkSync(path.join(dir,'supplier-after.json'),path.join(dir,'alias'));assert.throws(()=>validateReview(dir));});});
test('rejects a fourth product or an extra protected field despite rewritten source proofs',()=>{
  for(const [id,column,value] of [['11','unit_cost_minor','400'],['6','visible','1']])use(({dir})=>{rebindChangedSource(dir,current=>{current.rows.find(row=>row.id===id).values[current.columns.indexOf(column)]=hex(value);});assert.throws(()=>validateReview(dir));});
});
test('rejects missing or added source records despite rewritten source proofs',()=>{
  use(({dir})=>{rebindChangedSource(dir,current=>current.rows.pop());assert.throws(()=>validateReview(dir));});
  use(({dir})=>{rebindChangedSource(dir,current=>{const row=structuredClone(current.rows[0]);row.id='99';row.values[0]=hex('99');current.rows.push(row);});assert.throws(()=>validateReview(dir));});
});
