'use strict';
// Extend the verified full-backup -> headers-checkpoint chain without copying
// media. This child owns fresh DB/code/image archives; retain all three backups.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const parent=require('./merchant-media-reference.cjs');
const {canonicalDirectory,hashFile,readSmall}=parent;
const BASE='/root/trbhh-release-backups';
const CHECKPOINT_ID='35607654850';
const CHECKPOINT_BASELINE='5f8dbc01c38bf431a9ae099a581b80536097b346';
const CURRENT_COMMIT='415a8fe593522859f4cf85c2fa10e47a7d40109b';
const FORMAT='trbhh-selection-media-reference-v1';
const hash=data=>createHash('sha256').update(data).digest('hex');
function check(ok){if(!ok)throw Error('selection_media_reference_invalid');}
function directory(value,base,id){
  check(value===path.join(base,'audit-'+id));
  const owner=base===BASE?0:process.getuid?.();
  canonicalDirectory(base,owner);canonicalDirectory(value,owner);
}
function childDirectory(child,base){
  const id=path.basename(child).replace(/^audit-/,'');
  check(/^\d+$/.test(id)&&![parent.PARENT_ID,CHECKPOINT_ID].includes(id));directory(child,base,id);
}
function container(raw){
  const rows=JSON.parse(raw);check(Array.isArray(rows)&&rows.length===1);
  const c=rows[0];check(/^sha256:[a-f0-9]{64}$/.test(c.Image)&&Array.isArray(c.Config?.Env)&&Array.isArray(c.Mounts));
  const env={};for(const item of c.Config.Env){check(typeof item==='string'&&!/[\r\n]/.test(item));const at=item.indexOf('=');check(at>0);const name=item.slice(0,at);check(!Object.hasOwn(env,name));Object.defineProperty(env,name,{value:item.slice(at+1),enumerable:true});}
  for(const key of ['DATABASE_URL','AUTH_SECRET','STORAGE_DIR','SALLA_CLIENT_ID','SALLA_CLIENT_SECRET','SALLA_WEBHOOK_SECRET','SUPPLIER_TOKEN_ENCRYPTION_KEY','SUPPLIER_RECONCILE_SECRET','SUPPLIER_PUBLIC_ORIGIN','SUPPLIER_ALLOW_LIVE_ORDERS'])check(typeof env[key]==='string'&&env[key].length>0);
  check(env.SUPPLIER_PUBLIC_ORIGIN==='https://trbhh.sa'&&env.SUPPLIER_ALLOW_LIVE_ORDERS==='false');
  const mounts=c.Mounts.map(({Type,Name,Source,Destination,RW})=>({Type,Name,Source,Destination,RW})).sort((a,b)=>String(a.Destination).localeCompare(String(b.Destination)));
  check(mounts.length>0&&new Set(mounts.map(m=>m.Destination)).size===mounts.length);
  return {image:c.Image,env,mounts};
}
function sameRuntime(first,last,image=true){check((!image||first.image===last.image)&&isDeepStrictEqual(first.env,last.env)&&isDeepStrictEqual(first.mounts,last.mounts));}
function checkpointSums(raw,checkpoint,media){
  const sums={};
  for(const line of raw.toString().trimEnd().split('\n')){
    const match=/^([a-f0-9]{64})  (database\.sql\.gz|code\.tar\.gz|image\.tar\.gz|PARENT_MEDIA_REFERENCE\.json|REUSED_MEDIA_SOURCE|(?:container|supplier|storage|legacy|full)-before\.json|(?:storage|legacy)\.path)$/.exec(line);
    check(match&&!Object.hasOwn(sums,match[2]));sums[match[2]]=match[1];check(hashFile(path.join(checkpoint,match[2]))===match[1]);
  }
  for(const name of ['database.sql.gz','code.tar.gz','image.tar.gz','PARENT_MEDIA_REFERENCE.json','REUSED_MEDIA_SOURCE','container-before.json','supplier-before.json','full-before.json',...media.flatMap(item=>[item.label+'.path',item.label+'-before.json'])])check(Object.hasOwn(sums,name));
  return sums;
}
function inspectCheckpoint(checkpoint,base=BASE){
  directory(checkpoint,base,CHECKPOINT_ID);
  const markers={};for(const [name,value] of [['VERIFIED',CHECKPOINT_BASELINE],['commit.txt',CHECKPOINT_BASELINE],['DEPLOYMENT_VERIFIED',CURRENT_COMMIT],['candidate.txt',CURRENT_COMMIT]]){
    const data=readSmall(path.join(checkpoint,name));check(data.toString().trim()===value);markers[name]=hash(data);
  }
  // The existing verifier hashes every full-parent archive and checks that this
  // checkpoint's media manifests still match that immutable full backup.
  parent.verify(checkpoint,base);
  const parentData=readSmall(path.join(checkpoint,'PARENT_MEDIA_REFERENCE.json')),reference=JSON.parse(parentData);
  const beforeData=readSmall(path.join(checkpoint,'container-before.json')),afterData=readSmall(path.join(checkpoint,'container-after.json'));
  const before=container(beforeData),after=container(afterData);
  check(before.image===reference.parentRuntimeImage&&after.image!==before.image);sameRuntime(before,after,false);
  const sums=readSmall(path.join(checkpoint,'SHA256SUMS'));
  const archives=checkpointSums(sums,checkpoint,reference.media);
  return {format:FORMAT,checkpointId:CHECKPOINT_ID,checkpointPath:checkpoint,checkpointBaseline:CHECKPOINT_BASELINE,checkpointDeployment:CURRENT_COMMIT,checkpointRuntimeImage:after.image,checkpointRuntimeSha256:hash(afterData),checkpointBeforeSha256:hash(beforeData),checkpointMarkers:markers,checkpointSha256Sums:hash(sums),checkpointArchives:archives,parentReferenceSha256:hash(parentData),parentReference:reference,media:reference.media};
}
function prepare(checkpoint,child,base=BASE){
  childDirectory(child,base);const reference=inspectCheckpoint(checkpoint,base);
  check(!fs.existsSync(path.join(child,'SELECTION_MEDIA_REFERENCE.json'))&&!fs.existsSync(path.join(child,'REUSED_MEDIA_SOURCE')));
  sameRuntime(container(readSmall(path.join(checkpoint,'container-after.json'))),container(readSmall(path.join(child,'container-before.json'))));
  for(const item of reference.media)for(const suffix of ['.path','-before.json']){
    const name=item.label+suffix,data=readSmall(path.join(checkpoint,name));check(hash(data)===(suffix==='.path'?item.pathSha256:item.manifestSha256));
    fs.writeFileSync(path.join(child,name),data,{flag:'wx',mode:0o600});
  }
  fs.writeFileSync(path.join(child,'SELECTION_MEDIA_REFERENCE.json'),JSON.stringify(reference)+'\n',{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(child,'REUSED_MEDIA_SOURCE'),CHECKPOINT_ID+'\n',{flag:'wx',mode:0o600});
  return {ok:true,referencedMedia:reference.media.length};
}
function verify(child,base=BASE){
  childDirectory(child,base);check(readSmall(path.join(child,'REUSED_MEDIA_SOURCE')).toString().trim()===CHECKPOINT_ID);
  const saved=JSON.parse(readSmall(path.join(child,'SELECTION_MEDIA_REFERENCE.json'))),current=inspectCheckpoint(path.join(base,'audit-'+CHECKPOINT_ID),base);
  check(isDeepStrictEqual(saved,current));
  sameRuntime(container(readSmall(path.join(current.checkpointPath,'container-after.json'))),container(readSmall(path.join(child,'container-before.json'))));
  for(const item of current.media){
    check(hashFile(path.join(child,item.label+'.path'))===item.pathSha256&&hashFile(path.join(child,item.label+'-before.json'))===item.manifestSha256);
    check(!fs.existsSync(path.join(child,item.label+'.tar.gz'))&&!fs.existsSync(path.join(child,item.label+'-extracted')));
  }
  return {ok:true,referencedMedia:current.media.length};
}
if(require.main===module){
  try{
    const [mode,first,second,...extra]=process.argv.slice(2);check(extra.length===0);
    const result=mode==='prepare'&&first&&second?prepare(first,second):mode==='verify'&&first&&!second?verify(first):null;check(result);process.stdout.write(JSON.stringify(result)+'\n');
  }catch{process.stderr.write('Verified supplier-selection media chain failed; retain full parent and both checkpoints. Private values withheld.\n');process.exitCode=1;}
}
module.exports={prepare,verify,inspectCheckpoint,CHECKPOINT_ID,CHECKPOINT_BASELINE,CURRENT_COMMIT,container,sameRuntime};
