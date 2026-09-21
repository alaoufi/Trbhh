'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const merchant=require('./merchant-media-reference.cjs');
const selection=require('./selection-media-reference.cjs');
const home=require('./home-media-reference.cjs');
const historical=require('./selection-operational-attestation.cjs');
const hash=value=>createHash('sha256').update(value).digest('hex');
function write(directory,name,value){fs.writeFileSync(path.join(directory,name),typeof value==='string'?value:JSON.stringify(value),{mode:0o600});}
function json(directory,name){return JSON.parse(fs.readFileSync(path.join(directory,name)));}
function sums(directory,names){write(directory,'SHA256SUMS',names.map(name=>hash(fs.readFileSync(path.join(directory,name)))+'  '+name+'\n').join(''));}
function digest(directory){return fs.readdirSync(directory).sort().map(name=>[name,hash(fs.readFileSync(path.join(directory,name)))]);}
function runtime(letter){return [{Image:'sha256:'+letter.repeat(64),Config:{Env:['DATABASE_URL=fixture-db','AUTH_SECRET=fixture-auth','STORAGE_DIR=/app/storage','LEGACY_LOCAL_DIR=/app/legacy','SALLA_CLIENT_ID=fixture-id','SALLA_CLIENT_SECRET=fixture-client','SALLA_WEBHOOK_SECRET=fixture-webhook','SUPPLIER_TOKEN_ENCRYPTION_KEY=fixture-encryption','SUPPLIER_RECONCILE_SECRET=fixture-reconcile','SUPPLIER_PUBLIC_ORIGIN=https://trbhh.sa','SUPPLIER_ALLOW_LIVE_ORDERS=false']},Mounts:[{Type:'volume',Name:'fixture-storage',Source:'/fixture/storage',Destination:'/app/storage',RW:true},{Type:'bind',Source:'/fixture/legacy',Destination:'/app/legacy',RW:false}]}];}
function supplierProof(){return {format:'trbhh-supplier-preservation-v1',flags:{disabled:true,sha256:'a'.repeat(64)},tables:Object.fromEntries(['supplier_integration_profiles','supplier_connections','supplier_products'].map(name=>[name,{count:0,columns:['id'],schemaHash:'b'.repeat(64),rowHashes:[]}]))};}
function databaseReview(checkpoint){
  const key='sub_remind_lastrun',pk=historical.fingerprint([key]);
  const evidence={key,backupId:home.CHECKPOINT_ID,baselineCommit:home.CHECKPOINT_BASELINE,targetCommit:home.CURRENT_COMMIT,beforeValue:'2026-09-21T14:33:18.811Z',afterValue:'2026-09-21T15:43:59.789Z'};
  const empty={count:0,primaryKeyColumns:['id'],protectedColumns:[],primaryKeys:[],rowFingerprints:{}};
  const settings=value=>({count:1,primaryKeyColumns:['k'],protectedColumns:['k','v'],primaryKeys:[pk],rowFingerprints:{[pk]:historical.fingerprint([['k',key],['v',value]])}});
  const tables={users:empty,ads:empty,site_settings:settings(evidence.beforeValue)};
  for(let n=0;n<184;n++)tables['fixture_'+n]=empty;
  const before={format:'trbhh-database-proof-v1',databaseIdentitySha256:'c'.repeat(64),observedAt:'2026-09-21T15:35:35.000Z',tables};
  const after={...before,observedAt:'2026-09-21T15:44:33.000Z',tables:{...tables,site_settings:settings(evidence.afterValue)}};
  const {reviewed,attestation}=historical.validate(before,after,evidence);
  for(const [name,value] of [['before.json',before],['after.json',after],['after-reviewed-sub-remind-lastrun.json',reviewed]])write(checkpoint,name,value);
  Object.assign(attestation,{rawBeforeSha256:hash(fs.readFileSync(path.join(checkpoint,'before.json'))),rawAfterSha256:hash(fs.readFileSync(path.join(checkpoint,'after.json'))),reviewedAfterSha256:hash(fs.readFileSync(path.join(checkpoint,'after-reviewed-sub-remind-lastrun.json')))});
  write(checkpoint,'sub-remind-lastrun-attestation.json',attestation);
  const proof=spawnSync(process.execPath,[path.join(__dirname,'database-proof.cjs'),'verify',path.join(checkpoint,'before.json'),path.join(checkpoint,'after-reviewed-sub-remind-lastrun.json')],{encoding:'utf8'});assert.equal(proof.status,0);write(checkpoint,'reviewed-database-result.json',proof.stdout);
  write(checkpoint,'POST_RELEASE_REVIEWED.json',{status:'verified-with-explicit-operational-review',commit:home.CURRENT_COMMIT,backupRun:Number(home.CHECKPOINT_ID),reviewedDatabaseResult:'reviewed-database-result.json',attestation:'sub-remind-lastrun-attestation.json',originalManifestsPreserved:true,verifiedTables:187,missingOrChangedMedia:0,runtimeAndAuthVerified:true,supplierPreservationVerified:true,purchasingEnabled:false,paymentsEnabled:false,publicCommerceEnabled:false});
}
function fixture(){
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'trbhh-home-chain-')));fs.chmodSync(base,0o700);
  const full=path.join(base,'audit-'+merchant.PARENT_ID),headers=path.join(base,'audit-'+selection.CHECKPOINT_ID),checkpoint=path.join(base,'audit-'+home.CHECKPOINT_ID),child=path.join(base,'audit-999999');
  for(const directory of [full,headers,checkpoint,child])fs.mkdirSync(directory,{mode:0o700});
  for(const [name,value] of Object.entries({VERIFIED:merchant.PARENT_COMMIT,'commit.txt':merchant.PARENT_COMMIT,DEPLOYMENT_VERIFIED:merchant.DEPLOYED_COMMIT,'container-after.json':runtime('a'),'database.sql.gz':'db','code.tar.gz':'code','image.tar.gz':'image','storage.tar.gz':'storage','legacy.tar.gz':'legacy'}))write(full,name,value);
  const media={format:'trbhh-media-proof-v1',capturedAt:'2026-09-21T00:00:00Z',entryCount:0,entries:[]};
  for(const label of ['storage','legacy']){write(full,label+'.path','/app/'+label+'\n');write(full,label+'-before.json',media);}
  sums(full,['database.sql.gz','code.tar.gz','image.tar.gz','storage.tar.gz','legacy.tar.gz']);
  write(headers,'container-before.json',runtime('a'));merchant.prepare(full,headers,base);
  for(const [name,value] of Object.entries({VERIFIED:selection.CHECKPOINT_BASELINE,'commit.txt':selection.CHECKPOINT_BASELINE,DEPLOYMENT_VERIFIED:selection.CURRENT_COMMIT,'candidate.txt':selection.CURRENT_COMMIT,'container-after.json':runtime('b'),'database.sql.gz':'db2','code.tar.gz':'code2','image.tar.gz':'image2','supplier-before.json':supplierProof(),'full-before.json':{fixture:true}}))write(headers,name,value);
  const common=['database.sql.gz','code.tar.gz','image.tar.gz','REUSED_MEDIA_SOURCE','container-before.json','supplier-before.json','full-before.json','storage.path','storage-before.json','legacy.path','legacy-before.json'];
  sums(headers,[...common,'PARENT_MEDIA_REFERENCE.json']);
  write(checkpoint,'container-before.json',runtime('b'));selection.prepare(headers,checkpoint,base);
  for(const [name,value] of Object.entries({VERIFIED:home.CHECKPOINT_BASELINE,'commit.txt':home.CHECKPOINT_BASELINE,'candidate.txt':home.CURRENT_COMMIT,'container-after.json':runtime('c'),'database.sql.gz':'db3','code.tar.gz':'code3','image.tar.gz':'image3','supplier-before.json':supplierProof(),'supplier-after.json':supplierProof(),'full-before.json':{fixture:true},'storage-after.json':media,'legacy-after.json':media}))write(checkpoint,name,value);
  sums(checkpoint,[...common,'SELECTION_MEDIA_REFERENCE.json']);databaseReview(checkpoint);write(child,'container-before.json',runtime('c'));
  return {base,full,headers,checkpoint,child,cleanup(){assert.equal(fs.realpathSync(base),base);assert.equal(path.dirname(base),fs.realpathSync(os.tmpdir()));assert(path.basename(base).startsWith('trbhh-home-chain-'));fs.rmSync(base,{recursive:true,force:true});}};
}
function use(run){const f=fixture();try{return run(f);}finally{f.cleanup();}}
function denied(f){assert.throws(()=>home.prepare(f.checkpoint,f.child,f.base));assert.deepEqual(fs.readdirSync(f.child),['container-before.json']);}
test('pins the exact deployment baseline and reviewed checkpoint',()=>{assert.equal(home.CURRENT_COMMIT,'1a2111ccd9a17c151a2f47cf793f3bddf4d0451f');assert.equal(home.CHECKPOINT_ID,'35619790007');});
test('references verified media without copying archives or modifying any ancestor',()=>use(f=>{
  const original=[digest(f.full),digest(f.headers),digest(f.checkpoint)];home.prepare(f.checkpoint,f.child,f.base);assert.equal(home.verify(f.child,f.base).ok,true);
  assert.deepEqual([digest(f.full),digest(f.headers),digest(f.checkpoint)],original);
  assert.deepEqual(fs.readdirSync(f.child).sort(),['HOME_MEDIA_REFERENCE.json','REUSED_MEDIA_SOURCE','container-before.json','legacy-before.json','legacy.path','storage-before.json','storage.path'].sort());
  const reference=fs.readFileSync(path.join(f.child,'HOME_MEDIA_REFERENCE.json'),'utf8');assert(!reference.includes('fixture-client'));assert(!reference.includes('fixture-db'));
}));
test('rejects false or missing historical review flags',()=>{for(const [key,value] of [['commit','0'.repeat(40)],['backupRun',2],['verifiedTables',186],['originalManifestsPreserved',false],['purchasingEnabled',true],['paymentsEnabled',true],['publicCommerceEnabled',true]])use(f=>{const row=json(f.checkpoint,'POST_RELEASE_REVIEWED.json');row[key]=value;write(f.checkpoint,'POST_RELEASE_REVIEWED.json',row);denied(f);});});
test('rejects changed raw or reviewed manifests, attestation and success result',()=>{for(const name of ['before.json','after.json','after-reviewed-sub-remind-lastrun.json','sub-remind-lastrun-attestation.json','reviewed-database-result.json'])use(f=>{write(f.checkpoint,name,{ok:true});denied(f);});});
test('rejects a rewritten attestation for an unrelated protected row change',()=>use(f=>{
  const after=json(f.checkpoint,'after.json');after.tables.users={count:0,primaryKeyColumns:['id'],protectedColumns:['balance'],primaryKeys:[],rowFingerprints:{}};write(f.checkpoint,'after.json',after);
  const attestation=json(f.checkpoint,'sub-remind-lastrun-attestation.json');attestation.rawAfterSha256=hash(fs.readFileSync(path.join(f.checkpoint,'after.json')));write(f.checkpoint,'sub-remind-lastrun-attestation.json',attestation);denied(f);
}));
test('rejects changed supplier data, media and retained archives',()=>{for(const [location,name] of [['checkpoint','supplier-after.json'],['checkpoint','storage-after.json'],['checkpoint','legacy-after.json'],['checkpoint','database.sql.gz'],['headers','image.tar.gz'],['full','legacy.tar.gz']])use(f=>{fs.appendFileSync(path.join(f[location],name),'corrupt');denied(f);});});
test('rejects current image, credentials, mounts or order gate drift',()=>{for(const edit of [c=>c.Image='sha256:'+'d'.repeat(64),c=>c.Config.Env.push('UNREVIEWED=true'),c=>c.Config.Env=c.Config.Env.map(v=>v==='SUPPLIER_ALLOW_LIVE_ORDERS=false'?'SUPPLIER_ALLOW_LIVE_ORDERS=true':v),c=>c.Mounts[0].Source='/wrong'])use(f=>{const current=json(f.child,'container-before.json');edit(current[0]);write(f.child,'container-before.json',current);denied(f);});});
test('pins historical review and source bytes against later changes',()=>{for(const name of ['POST_RELEASE_REVIEWED.json','sub-remind-lastrun-attestation.json','reviewed-database-result.json','container-after.json'])use(f=>{home.prepare(f.checkpoint,f.child,f.base);fs.appendFileSync(path.join(f.checkpoint,name),'\n');assert.throws(()=>home.verify(f.child,f.base));});});
test('rejects changed child reference or copied media and duplicate archives',()=>{for(const name of ['HOME_MEDIA_REFERENCE.json','REUSED_MEDIA_SOURCE','legacy-before.json','storage.path'])use(f=>{home.prepare(f.checkpoint,f.child,f.base);write(f.child,name,'invalid');assert.throws(()=>home.verify(f.child,f.base));});use(f=>{home.prepare(f.checkpoint,f.child,f.base);write(f.child,'storage.tar.gz','copy');assert.throws(()=>home.verify(f.child,f.base));});});
test('rejects ancestor aliases and never overwrites an existing checkpoint',()=>use(f=>{for(const directory of [f.full,f.headers,f.checkpoint])assert.throws(()=>home.prepare(f.checkpoint,directory,f.base));home.prepare(f.checkpoint,f.child,f.base);const saved=digest(f.child);assert.throws(()=>home.prepare(f.checkpoint,f.child,f.base));assert.deepEqual(digest(f.child),saved);}));
test('rejects hardlinked historical evidence',()=>use(f=>{fs.linkSync(path.join(f.checkpoint,'after.json'),path.join(f.base,'alias'));denied(f);}));
