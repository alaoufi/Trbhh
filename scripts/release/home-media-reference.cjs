'use strict';
// UI-only release: fresh database/code/image, with immutable media referenced
// through the reviewed supplier-selection checkpoint. Retain all four backups.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {spawnSync}=require('node:child_process');
const selection=require('./selection-media-reference.cjs');
const {canonicalDirectory,hashFile,readSmall}=require('./merchant-media-reference.cjs');
const {validate:reviewTimestamp}=require('./selection-operational-attestation.cjs');
const media=require('./media-proof.cjs');
const suppliers=require('./supplier-preservation-proof.cjs');
const BASE='/root/trbhh-release-backups';
const CHECKPOINT_ID='35619790007';
const CHECKPOINT_BASELINE='415a8fe593522859f4cf85c2fa10e47a7d40109b';
const CURRENT_COMMIT='1a2111ccd9a17c151a2f47cf793f3bddf4d0451f';
const FORMAT='trbhh-home-media-reference-v1';
const hash=data=>createHash('sha256').update(data).digest('hex');
function check(ok){if(!ok)throw Error('home_media_reference_invalid');}
function json(directory,name){return JSON.parse(readSmall(path.join(directory,name)));}
function directory(value,base,id){
  check(value===path.join(base,'audit-'+id));
  const owner=base===BASE?0:process.getuid?.();
  canonicalDirectory(base,owner);canonicalDirectory(value,owner);
}
function childDirectory(child,base){
  const id=path.basename(child).replace(/^audit-/,'');
  check(/^\d+$/.test(id)&&!['35603864905',selection.CHECKPOINT_ID,CHECKPOINT_ID].includes(id));directory(child,base,id);
}
function review(checkpoint){
  const notice=json(checkpoint,'POST_RELEASE_REVIEWED.json');
  check(notice.status==='verified-with-explicit-operational-review'&&notice.commit===CURRENT_COMMIT&&notice.backupRun===Number(CHECKPOINT_ID));
  check(notice.reviewedDatabaseResult==='reviewed-database-result.json'&&notice.attestation==='sub-remind-lastrun-attestation.json');
  check(notice.originalManifestsPreserved===true&&notice.verifiedTables===187&&notice.missingOrChangedMedia===0&&notice.runtimeAndAuthVerified===true&&notice.supplierPreservationVerified===true);
  check(notice.purchasingEnabled===false&&notice.paymentsEnabled===false&&notice.publicCommerceEnabled===false);
  const proof=json(checkpoint,notice.attestation);
  check(proof.exactlyOneProtectedRowClassified===true&&proof.rawManifestsModified===false&&proof.sqlWrites===false);
  const before=readSmall(path.join(checkpoint,'before.json')),after=readSmall(path.join(checkpoint,'after.json'));
  const reviewed=readSmall(path.join(checkpoint,'after-reviewed-sub-remind-lastrun.json'));
  check(hash(before)===proof.rawBeforeSha256&&hash(after)===proof.rawAfterSha256&&hash(reviewed)===proof.reviewedAfterSha256);
  const result=reviewTimestamp(JSON.parse(before),JSON.parse(after),proof);
  check(isDeepStrictEqual(result.reviewed,JSON.parse(reviewed)));
  // Re-run the original verifier, rather than trusting a saved success marker.
  const verify=spawnSync(process.execPath,[path.join(__dirname,'database-proof.cjs'),'verify',path.join(checkpoint,'before.json'),path.join(checkpoint,'after-reviewed-sub-remind-lastrun.json')],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
  check(!verify.error&&verify.status===0);
  const actual=JSON.parse(verify.stdout),saved=json(checkpoint,notice.reviewedDatabaseResult);
  check(actual.ok===true&&actual.sameDatabase===true&&actual.comparedTables===187&&actual.failures.length===0&&isDeepStrictEqual(actual,saved));
  return Object.fromEntries(['POST_RELEASE_REVIEWED.json',notice.attestation,notice.reviewedDatabaseResult,'before.json','after.json','after-reviewed-sub-remind-lastrun.json'].map(name=>[name,hashFile(path.join(checkpoint,name))]));
}
function inspectCheckpoint(checkpoint,base=BASE){
  directory(checkpoint,base,CHECKPOINT_ID);
  const markers={};for(const [name,value] of [['VERIFIED',CHECKPOINT_BASELINE],['commit.txt',CHECKPOINT_BASELINE],['candidate.txt',CURRENT_COMMIT]]){
    const raw=readSmall(path.join(checkpoint,name));check(raw.toString().trim()===value);markers[name]=hash(raw);
  }
  selection.verify(checkpoint,base);
  const sourceRaw=readSmall(path.join(checkpoint,'SELECTION_MEDIA_REFERENCE.json')),source=JSON.parse(sourceRaw);
  const beforeRaw=readSmall(path.join(checkpoint,'container-before.json')),afterRaw=readSmall(path.join(checkpoint,'container-after.json'));
  const before=selection.container(beforeRaw),after=selection.container(afterRaw);
  check(before.image===source.checkpointRuntimeImage&&before.image!==after.image);selection.sameRuntime(before,after,false);
  const sums=readSmall(path.join(checkpoint,'SHA256SUMS')),archives={};
  for(const line of sums.toString().trimEnd().split('\n')){
    const match=/^([a-f0-9]{64})  (database\.sql\.gz|code\.tar\.gz|image\.tar\.gz|SELECTION_MEDIA_REFERENCE\.json|REUSED_MEDIA_SOURCE|(?:container|supplier|storage|legacy|full)-before\.json|(?:storage|legacy)\.path)$/.exec(line);
    check(match&&!Object.hasOwn(archives,match[2]));archives[match[2]]=match[1];check(hashFile(path.join(checkpoint,match[2]))===match[1]);
  }
  for(const name of ['database.sql.gz','code.tar.gz','image.tar.gz','SELECTION_MEDIA_REFERENCE.json','REUSED_MEDIA_SOURCE','container-before.json','supplier-before.json','full-before.json',...source.media.flatMap(item=>[item.label+'.path',item.label+'-before.json'])])check(Object.hasOwn(archives,name));
  const reviewedProofs=review(checkpoint);
  suppliers.verify(json(checkpoint,'supplier-before.json'),json(checkpoint,'supplier-after.json'));
  const afterMedia={};for(const item of source.media){
    const old=json(checkpoint,item.label+'-before.json'),next=json(checkpoint,item.label+'-after.json');
    media.validateManifest(old);media.validateManifest(next);
    check(media.verify(old,next).ok&&media.verify(next,old).ok);
    afterMedia[item.label]=hashFile(path.join(checkpoint,item.label+'-after.json'));
  }
  return {format:FORMAT,checkpointId:CHECKPOINT_ID,checkpointPath:checkpoint,checkpointBaseline:CHECKPOINT_BASELINE,checkpointDeployment:CURRENT_COMMIT,checkpointRuntimeImage:after.image,checkpointRuntimeSha256:hash(afterRaw),checkpointBeforeSha256:hash(beforeRaw),checkpointMarkers:markers,checkpointSha256Sums:hash(sums),checkpointArchives:archives,reviewedProofs,supplierAfterSha256:hashFile(path.join(checkpoint,'supplier-after.json')),afterMedia,sourceSha256:hash(sourceRaw),source,media:source.media};
}
function prepare(checkpoint,child,base=BASE){
  childDirectory(child,base);const reference=inspectCheckpoint(checkpoint,base);
  check(!fs.existsSync(path.join(child,'HOME_MEDIA_REFERENCE.json'))&&!fs.existsSync(path.join(child,'REUSED_MEDIA_SOURCE')));
  selection.sameRuntime(selection.container(readSmall(path.join(checkpoint,'container-after.json'))),selection.container(readSmall(path.join(child,'container-before.json'))));
  for(const item of reference.media)for(const suffix of ['.path','-before.json']){
    const name=item.label+suffix,raw=readSmall(path.join(checkpoint,name));check(hash(raw)===(suffix==='.path'?item.pathSha256:item.manifestSha256));
    fs.writeFileSync(path.join(child,name),raw,{flag:'wx',mode:0o600});
  }
  fs.writeFileSync(path.join(child,'HOME_MEDIA_REFERENCE.json'),JSON.stringify(reference)+'\n',{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(child,'REUSED_MEDIA_SOURCE'),CHECKPOINT_ID+'\n',{flag:'wx',mode:0o600});
  return {ok:true,referencedMedia:reference.media.length};
}
function verify(child,base=BASE){
  childDirectory(child,base);check(readSmall(path.join(child,'REUSED_MEDIA_SOURCE')).toString().trim()===CHECKPOINT_ID);
  const saved=json(child,'HOME_MEDIA_REFERENCE.json'),current=inspectCheckpoint(path.join(base,'audit-'+CHECKPOINT_ID),base);check(isDeepStrictEqual(saved,current));
  selection.sameRuntime(selection.container(readSmall(path.join(current.checkpointPath,'container-after.json'))),selection.container(readSmall(path.join(child,'container-before.json'))));
  for(const item of current.media){
    check(hashFile(path.join(child,item.label+'.path'))===item.pathSha256&&hashFile(path.join(child,item.label+'-before.json'))===item.manifestSha256);
    check(!fs.existsSync(path.join(child,item.label+'.tar.gz'))&&!fs.existsSync(path.join(child,item.label+'-extracted')));
  }
  return {ok:true,referencedMedia:current.media.length};
}
if(require.main===module){try{
  const [mode,first,second,...extra]=process.argv.slice(2);check(extra.length===0);
  const result=mode==='prepare'&&first&&second?prepare(first,second):mode==='verify'&&first&&!second?verify(first):null;check(result);process.stdout.write(JSON.stringify(result)+'\n');
}catch{process.stderr.write('Public-home media chain or explicit prior review failed; retain all ancestor backups. Private values withheld.\n');process.exitCode=1;}}
module.exports={prepare,verify,inspectCheckpoint,CHECKPOINT_ID,CHECKPOINT_BASELINE,CURRENT_COMMIT};
