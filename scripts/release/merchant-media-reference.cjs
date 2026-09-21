'use strict';
// Retain the full verified parent backup at its fixed private path. A child
// checkpoint owns fresh DB/code/image archives and only references parent media.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {validateManifest}=require('./media-proof.cjs');
const PARENT_ID='35603864905';
const PARENT_COMMIT='07d2e9ead8e0b28824102d5c8a31b097e01f9459';
const DEPLOYED_COMMIT='5f8dbc01c38bf431a9ae099a581b80536097b346';
const BASE='/root/trbhh-release-backups';
const FORMAT='trbhh-merchant-media-reference-v1';
function check(ok){if(!ok)throw Error('merchant_media_reference_invalid');}
function canonicalDirectory(directory,owner=0){
  const info=fs.lstatSync(directory);
  check(info.isDirectory()&&!info.isSymbolicLink()&&fs.realpathSync(directory)===directory);
  if(process.platform!=='win32')check(info.uid===owner&&(info.mode&0o777)===0o700);
}
function regular(file){
  const info=fs.lstatSync(file,{bigint:true});
  check(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1n);
  return info;
}
function same(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;}
function hashFile(file){
  const initial=regular(file),fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try{
    check(same(initial,fs.fstatSync(fd,{bigint:true})));
    const hash=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);let bytes=0n;
    for(;;){const count=fs.readSync(fd,buffer,0,buffer.length,null);if(!count)break;hash.update(buffer.subarray(0,count));bytes+=BigInt(count);}
    check(bytes===initial.size&&same(initial,fs.fstatSync(fd,{bigint:true}))&&same(initial,regular(file)));
    return hash.digest('hex');
  }finally{fs.closeSync(fd);}
}
function readSmall(file){
  const info=regular(file);check(info.size<=64n*1024n*1024n);
  const contents=fs.readFileSync(file);check(same(info,regular(file)));return contents;
}
function parseSums(raw){
  const entries=new Map();
  for(const line of raw.trimEnd().split('\n')){
    const match=/^([a-f0-9]{64})  (database\.sql\.gz|code\.tar\.gz|image\.tar\.gz|storage\.tar\.gz|legacy\.tar\.gz)$/.exec(line);
    check(match&&!entries.has(match[2]));entries.set(match[2],match[1]);
  }
  for(const name of ['database.sql.gz','code.tar.gz','image.tar.gz','storage.tar.gz'])check(entries.has(name));
  return entries;
}
function inspectParent(parent,base=BASE){
  check(parent===path.join(base,'audit-'+PARENT_ID));
  const owner=base===BASE?0:process.getuid?.();
  canonicalDirectory(base,owner);canonicalDirectory(parent,owner);
  for(const [name,value] of [['VERIFIED',PARENT_COMMIT],['commit.txt',PARENT_COMMIT],['DEPLOYMENT_VERIFIED',DEPLOYED_COMMIT]])check(readSmall(path.join(parent,name)).toString().trim()===value);
  const runtime=readSmall(path.join(parent,'container-after.json')),image=JSON.parse(runtime)[0]?.Image;
  check(typeof image==='string'&&/^sha256:[a-f0-9]{64}$/.test(image));
  const sums=readSmall(path.join(parent,'SHA256SUMS')),archives=parseSums(sums.toString()),media=[];
  for(const [name,expected] of archives)check(hashFile(path.join(parent,name))===expected);
  for(const label of ['storage','legacy']){
    const hasArchive=archives.has(label+'.tar.gz'),pathFile=path.join(parent,label+'.path'),manifest=path.join(parent,label+'-before.json');
    check(hasArchive===fs.existsSync(pathFile)&&hasArchive===fs.existsSync(manifest));
    if(!hasArchive)continue;
    const mediaPath=readSmall(pathFile),data=readSmall(manifest);
    check(mediaPath.toString().trim()==='/app/'+label);validateManifest(JSON.parse(data));
    media.push({label,archive:label+'.tar.gz',archiveSha256:archives.get(label+'.tar.gz'),pathSha256:createHash('sha256').update(mediaPath).digest('hex'),manifestSha256:createHash('sha256').update(data).digest('hex')});
  }
  return {format:FORMAT,parentId:PARENT_ID,parentPath:parent,parentCommit:PARENT_COMMIT,parentDeployment:DEPLOYED_COMMIT,parentRuntimeImage:image,parentRuntimeSha256:createHash('sha256').update(runtime).digest('hex'),parentSha256Sums:createHash('sha256').update(sums).digest('hex'),archives:Object.fromEntries(archives),media};
}
function childDirectory(child,base){
  check(path.dirname(child)===base&&/^audit-\d+$/.test(path.basename(child))&&path.basename(child)!=='audit-'+PARENT_ID);canonicalDirectory(child,base===BASE?0:process.getuid?.());
}
function prepare(parent,child,base=BASE){
  childDirectory(child,base);const reference=inspectParent(parent,base);
  check(!fs.existsSync(path.join(child,'PARENT_MEDIA_REFERENCE.json')));
  check(JSON.parse(readSmall(path.join(child,'container-before.json')))[0]?.Image===reference.parentRuntimeImage);
  for(const item of reference.media){
    for(const suffix of ['.path','-before.json']){
      const name=item.label+suffix,data=readSmall(path.join(parent,name));
      check(createHash('sha256').update(data).digest('hex')===(suffix==='.path'?item.pathSha256:item.manifestSha256));
      fs.writeFileSync(path.join(child,name),data,{flag:'wx',mode:0o600});
    }
  }
  fs.writeFileSync(path.join(child,'PARENT_MEDIA_REFERENCE.json'),JSON.stringify(reference)+'\n',{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(child,'REUSED_MEDIA_SOURCE'),PARENT_ID+'\n',{flag:'wx',mode:0o600});
  return {ok:true,referencedMedia:reference.media.length};
}
function verify(child,base=BASE){
  childDirectory(child,base);
  check(readSmall(path.join(child,'REUSED_MEDIA_SOURCE')).toString().trim()===PARENT_ID);
  const saved=JSON.parse(readSmall(path.join(child,'PARENT_MEDIA_REFERENCE.json'))),current=inspectParent(path.join(base,'audit-'+PARENT_ID),base);
  check(JSON.stringify(saved)===JSON.stringify(current));
  for(const item of current.media){
    check(hashFile(path.join(child,item.label+'.path'))===item.pathSha256);
    check(hashFile(path.join(child,item.label+'-before.json'))===item.manifestSha256);
    check(!fs.existsSync(path.join(child,item.label+'.tar.gz'))&&!fs.existsSync(path.join(child,item.label+'-extracted')));
  }
  return {ok:true,referencedMedia:current.media.length};
}
if(require.main===module){
  try{
    const [mode,first,second,...extra]=process.argv.slice(2);check(extra.length===0);
    const result=mode==='prepare'&&first&&second?prepare(first,second):mode==='verify'&&first&&!second?verify(first):null;check(result);
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch{process.stderr.write('Verified parent media reference failed; preserve both backups and stop. Private details withheld.\n');process.exitCode=1;}
}
module.exports={parseSums,inspectParent,prepare,verify,PARENT_ID,PARENT_COMMIT,DEPLOYED_COMMIT};
