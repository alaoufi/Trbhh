'use strict';
// A fresh theme checkpoint references immutable media after the explicit
// three-product concurrent admin review. Never waive supplier changes generally.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto'),{isDeepStrictEqual}=require('node:util'),{spawnSync}=require('node:child_process');
const home=require('./home-media-reference.cjs'),selection=require('./selection-media-reference.cjs');
const {canonicalDirectory,readSmall,hashFile}=require('./merchant-media-reference.cjs');
const supplier=require('./supplier-preservation-proof.cjs'),media=require('./media-proof.cjs');
const {compare}=require('./public-home-supplier-forensics.cjs');
const BASE='/root/trbhh-release-backups',CHECKPOINT_ID='35626587686';
const BASELINE='1a2111ccd9a17c151a2f47cf793f3bddf4d0451f',CURRENT='6b9ad47c6ace6cc7a7c25fc0d04947a5eaece2fb';
const IDS=['6','9','10'],COLUMNS=['commerce_product_id','selling_price_minor','unit_cost_minor'];
const AUTH_CHECKS=['users.auth_session_version','auth_mfa.user_id','auth_mfa.secret','auth_mfa.recovery_hashes','auth_mfa.last_step','auth_mfa.version','auth_mfa.created_at','auth_security_limits.k','auth_security_limits.hits','auth_security_limits.expires_at','auth_security_limits_expiry_index'];
const hash=value=>createHash('sha256').update(value).digest('hex');
function check(value){if(!value)throw Error('national_media_reference_rejected');}
const json=(dir,name)=>JSON.parse(readSmall(path.join(dir,name)));
function directory(value,base,id){check(value===path.join(base,'audit-'+id));const owner=base===BASE?0:process.getuid?.();canonicalDirectory(base,owner);canonicalDirectory(value,owner);}
function childDirectory(child,base){const id=path.basename(child).replace(/^audit-/,'');check(/^\d+$/.test(id)&&!['35603864905','35607654850','35619790007',CHECKPOINT_ID].includes(id));directory(child,base,id);}
function validateReview(checkpoint){
  const notice=json(checkpoint,'POST_RELEASE_REVIEWED.json'),attestation=json(checkpoint,'supplier-admin-attestation.json'),audit=json(checkpoint,'supplier-admin-operation-review.json');
  check(notice.status==='verified-with-explicit-concurrent-admin-review'&&notice.commit===CURRENT&&notice.backupRun===Number(CHECKPOINT_ID)&&notice.verifiedTables===187&&notice.originalManifestsPreserved===true&&notice.runtimeAndAuthVerified===true&&notice.supplierPreservationReviewed===true);
  check(notice.purchasingEnabled===false&&notice.paymentsEnabled===false&&notice.publicCommerceEnabled===false);
  check(attestation.format==='trbhh-reviewed-concurrent-supplier-admin-v1'&&attestation.backupId===CHECKPOINT_ID&&attestation.baselineCommit===BASELINE&&attestation.targetCommit===CURRENT&&attestation.originalManifestsModified===false&&attestation.sqlWrites===false);
  check(isDeepStrictEqual(attestation.exactProductIds,IDS)&&isDeepStrictEqual([...attestation.exactChangedProtectedColumns].sort(),COLUMNS));
  check(audit.ok===true&&audit.sameActorAcrossProducts===true&&audit.publishedAutomatically===false&&audit.sourceRowsLost===false&&isDeepStrictEqual(audit.products.map(row=>row.productId),IDS));
  for(const row of audit.products){
    for(const key of ['adminActionMatches','matchingActorAndAuditTime','oldAndNewAmountsMatchPrivateEvidence','mappingMatches','commerceInvisibleAndDisabled','revisionAdvancedExactlyOnce'])check(row[key]===true);
    check(Date.parse(row.auditedAt)>=Date.parse(json(checkpoint,'before.json').observedAt)&&Date.parse(row.auditedAt)<=Date.parse('2026-09-21T16:44:46.999Z'));
  }
  const names=['before.json','supplier-before.json','supplier-after.json','forensic-supplier-baseline.json','forensic-supplier-current.json'];
  check(isDeepStrictEqual(Object.keys(attestation.evidenceHashes).sort(),[...names].sort())&&isDeepStrictEqual(audit.evidenceHashes,attestation.evidenceHashes));
  for(const name of names)check(hashFile(path.join(checkpoint,name))===attestation.evidenceHashes[name]);
  check(hashFile(path.join(checkpoint,'supplier-admin-operation-review.json'))===attestation.auditResultSha256&&hashFile(path.join(checkpoint,'supplier-after-reviewed-admin.json'))===attestation.reviewedSupplierSha256);
  const before=json(checkpoint,'supplier-before.json'),after=json(checkpoint,'supplier-after.json'),old=json(checkpoint,'forensic-supplier-baseline.json'),next=json(checkpoint,'forensic-supplier-current.json');
  const forensic=compare(old,next,before,after,supplier),changed=forensic.changes.filter(row=>row.protectedChangedColumns.length);
  check(isDeepStrictEqual(changed.map(row=>row.productId),IDS));
  const value=(snapshot,id,name)=>{const row=snapshot.rows.find(row=>row.id===id),raw=row.values[snapshot.columns.indexOf(name)];return raw===null?null:Buffer.from(raw,'hex').toString('utf8');};
  for(const row of changed){
    check(isDeepStrictEqual([...row.protectedChangedColumns].sort(),COLUMNS));
    check(value(old,row.productId,'commerce_product_id')===null&&/^\d+$/.test(value(next,row.productId,'commerce_product_id')));
    check(Number(value(next,row.productId,'revision'))===Number(value(old,row.productId,'revision'))+1);
    for(const field of ['active','visible','featured'])check(value(old,row.productId,field)==='0'&&value(next,row.productId,field)==='0');
  }
  const reviewed=json(checkpoint,'supplier-after-reviewed-admin.json'),expected=structuredClone(after);expected.tables.supplier_products=structuredClone(before.tables.supplier_products);check(isDeepStrictEqual(reviewed,expected));
  const result=supplier.verify(before,reviewed);check(isDeepStrictEqual(result,json(checkpoint,'supplier-reviewed-result.json')));supplier.verify(after,json(checkpoint,'supplier-final.json'));
  const verified=spawnSync(process.execPath,[path.join(__dirname,'database-proof.cjs'),'verify',path.join(checkpoint,'before.json'),path.join(checkpoint,'after.json')],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});check(!verified.error&&verified.status===0);
  const db=JSON.parse(verified.stdout);check(db.ok===true&&db.sameDatabase===true&&db.comparedTables===187&&db.failures.length===0&&isDeepStrictEqual(db,json(checkpoint,'database-result.json')));
  const auth=json(checkpoint,'auth-schema-result.json');check(auth.ok===true&&AUTH_CHECKS.every(key=>auth.checks?.[key]===true));
  return Object.fromEntries([...names,'POST_RELEASE_REVIEWED.json','supplier-admin-attestation.json','supplier-admin-operation-review.json','supplier-after-reviewed-admin.json','supplier-reviewed-result.json','supplier-final.json','after.json','database-result.json','auth-schema-result.json','runtime-result.txt'].map(name=>[name,hashFile(path.join(checkpoint,name))]));
}
function inspectCheckpoint(checkpoint,base=BASE){
  directory(checkpoint,base,CHECKPOINT_ID);const markers={};for(const [name,value] of [['VERIFIED',BASELINE],['commit.txt',BASELINE],['candidate.txt',CURRENT]]){const raw=readSmall(path.join(checkpoint,name));check(raw.toString().trim()===value);markers[name]=hash(raw);}
  home.verify(checkpoint,base);
  const sourceRaw=readSmall(path.join(checkpoint,'HOME_MEDIA_REFERENCE.json')),source=JSON.parse(sourceRaw);
  const beforeRaw=readSmall(path.join(checkpoint,'container-before.json')),afterRaw=readSmall(path.join(checkpoint,'container-after.json'));
  const before=selection.container(beforeRaw),after=selection.container(afterRaw);check(before.image===source.checkpointRuntimeImage&&after.image==='sha256:265075ccb75ed76251c7dd87eba071826aaf5443ccbe7e3be473ecd07689d903');selection.sameRuntime(before,after,false);
  const sums=readSmall(path.join(checkpoint,'SHA256SUMS')),archives={};for(const line of sums.toString().trimEnd().split('\n')){const match=/^([a-f0-9]{64})  (database\.sql\.gz|code\.tar\.gz|image\.tar\.gz|HOME_MEDIA_REFERENCE\.json|REUSED_MEDIA_SOURCE|(?:container|supplier|storage|legacy|full)-before\.json|(?:storage|legacy)\.path)$/.exec(line);check(match&&!Object.hasOwn(archives,match[2]));archives[match[2]]=match[1];check(hashFile(path.join(checkpoint,match[2]))===match[1]);}
  for(const name of ['database.sql.gz','code.tar.gz','image.tar.gz','HOME_MEDIA_REFERENCE.json','REUSED_MEDIA_SOURCE','container-before.json','supplier-before.json','full-before.json',...source.media.flatMap(item=>[item.label+'.path',item.label+'-before.json'])])check(Object.hasOwn(archives,name));
  const reviewedProofs=validateReview(checkpoint),mediaAfter={};for(const item of source.media){const old=json(checkpoint,item.label+'-before.json'),next=json(checkpoint,item.label+'-after.json');media.validateManifest(old);media.validateManifest(next);check(media.verify(old,next).ok&&media.verify(next,old).ok);check(isDeepStrictEqual(media.verify(old,next),json(checkpoint,item.label+'-result.json')));mediaAfter[item.label]=hashFile(path.join(checkpoint,item.label+'-after.json'));}
  return {format:'trbhh-national-media-reference-v1',checkpointId:CHECKPOINT_ID,checkpointPath:checkpoint,checkpointBaseline:BASELINE,checkpointDeployment:CURRENT,checkpointRuntimeImage:after.image,checkpointBeforeSha256:hash(beforeRaw),checkpointRuntimeSha256:hash(afterRaw),markers,checkpointSha256Sums:hash(sums),archives,reviewedProofs,mediaAfter,sourceSha256:hash(sourceRaw),source,media:source.media};
}
function prepare(checkpoint,child,base=BASE){
  childDirectory(child,base);const reference=inspectCheckpoint(checkpoint,base);check(!fs.existsSync(path.join(child,'NATIONAL_MEDIA_REFERENCE.json'))&&!fs.existsSync(path.join(child,'REUSED_MEDIA_SOURCE')));
  selection.sameRuntime(selection.container(readSmall(path.join(checkpoint,'container-after.json'))),selection.container(readSmall(path.join(child,'container-before.json'))));
  for(const item of reference.media)for(const suffix of ['.path','-before.json']){const raw=readSmall(path.join(checkpoint,item.label+suffix));check(hash(raw)===(suffix==='.path'?item.pathSha256:item.manifestSha256));fs.writeFileSync(path.join(child,item.label+suffix),raw,{flag:'wx',mode:0o600});}
  fs.writeFileSync(path.join(child,'NATIONAL_MEDIA_REFERENCE.json'),JSON.stringify(reference)+'\n',{flag:'wx',mode:0o600});fs.writeFileSync(path.join(child,'REUSED_MEDIA_SOURCE'),CHECKPOINT_ID+'\n',{flag:'wx',mode:0o600});return {ok:true,referencedMedia:reference.media.length};
}
function verify(child,base=BASE){childDirectory(child,base);check(readSmall(path.join(child,'REUSED_MEDIA_SOURCE')).toString().trim()===CHECKPOINT_ID);const saved=json(child,'NATIONAL_MEDIA_REFERENCE.json'),current=inspectCheckpoint(path.join(base,'audit-'+CHECKPOINT_ID),base);check(isDeepStrictEqual(saved,current));selection.sameRuntime(selection.container(readSmall(path.join(current.checkpointPath,'container-after.json'))),selection.container(readSmall(path.join(child,'container-before.json'))));for(const item of current.media){check(hashFile(path.join(child,item.label+'.path'))===item.pathSha256&&hashFile(path.join(child,item.label+'-before.json'))===item.manifestSha256);check(!fs.existsSync(path.join(child,item.label+'.tar.gz'))&&!fs.existsSync(path.join(child,item.label+'-extracted')));}return {ok:true,referencedMedia:current.media.length};}
if(require.main===module){try{const [mode,first,second,...extra]=process.argv.slice(2);check(extra.length===0);const result=mode==='prepare'&&first&&second?prepare(first,second):mode==='verify'&&first&&!second?verify(first):null;check(result);process.stdout.write(JSON.stringify(result)+'\n');}catch{process.stderr.write('National-day media checkpoint review failed; retain all backups. Private values withheld.\n');process.exitCode=1;}}
module.exports={prepare,verify,inspectCheckpoint,validateReview,CHECKPOINT_ID,BASELINE,CURRENT};
