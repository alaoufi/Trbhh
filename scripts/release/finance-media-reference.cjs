'use strict';
// Media-only reference to the retained, verified full backup. Database, code,
// image and runtime configuration remain fresh in every finance checkpoint.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{isDeepStrictEqual}=require('node:util');
const {inspectParent}=require('./merchant-media-reference.cjs');
const {validateManifest,verify:verifyMedia}=require('./media-proof.cjs');
const BASE='/root/trbhh-release-backups',PARENT_ID='35603864905',SEAL_ID='35607654850',FORMAT='trbhh-finance-media-reference-v1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function check(value){if(!value)throw Error('finance_media_reference_invalid');}
function directory(value,base){
  const info=fs.lstatSync(value);check(info.isDirectory()&&!info.isSymbolicLink()&&fs.realpathSync(value)===value);
  if(process.platform!=='win32')check(info.uid===(base===BASE?0:process.getuid())&&(info.mode&0o777)===0o700);
}
function childDirectory(child,base){check(path.dirname(child)===base&&/^finance-[1-9][0-9]{0,19}$/.test(path.basename(child)));directory(base,base);directory(child,base);}
function read(file){
  const before=fs.lstatSync(file,{bigint:true});check(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=64n*1024n*1024n);
  const same=s=>s.dev===before.dev&&s.ino===before.ino&&s.size===before.size&&s.mtimeNs===before.mtimeNs&&s.ctimeNs===before.ctimeNs;
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try{check(same(fs.fstatSync(fd,{bigint:true})));const bytes=fs.readFileSync(fd);check(same(fs.fstatSync(fd,{bigint:true}))&&same(fs.lstatSync(file,{bigint:true})));return bytes;}finally{fs.closeSync(fd);}
}
function historicalSeal(parent,base){
  const checkpoint=path.join(base,'audit-'+SEAL_ID);directory(checkpoint,base);
  const markers={};
  for(const [name,value] of [['VERIFIED','5f8dbc01c38bf431a9ae099a581b80536097b346'],['commit.txt','5f8dbc01c38bf431a9ae099a581b80536097b346'],['candidate.txt','415a8fe593522859f4cf85c2fa10e47a7d40109b'],['DEPLOYMENT_VERIFIED','415a8fe593522859f4cf85c2fa10e47a7d40109b'],['REUSED_MEDIA_SOURCE',PARENT_ID]]){
    const bytes=read(path.join(checkpoint,name));check(bytes.toString().trim()===value);markers[name]=hash(bytes);
  }
  const raw=read(path.join(checkpoint,'PARENT_MEDIA_REFERENCE.json'));check(isDeepStrictEqual(JSON.parse(raw),parent));
  const sumsRaw=read(path.join(checkpoint,'SHA256SUMS')),sums=new Map();
  for(const line of sumsRaw.toString().trimEnd().split('\n')){const match=/^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$/.exec(line);check(match&&!['.','..'].includes(match[2])&&!sums.has(match[2]));sums.set(match[2],match[1]);}
  const expected={'PARENT_MEDIA_REFERENCE.json':hash(raw),'REUSED_MEDIA_SOURCE':markers.REUSED_MEDIA_SOURCE};
  for(const item of parent.media){expected[item.label+'.path']=item.pathSha256;expected[item.label+'-before.json']=item.manifestSha256;}
  for(const [name,digest] of Object.entries(expected))check(sums.get(name)===digest&&hash(read(path.join(checkpoint,name)))===digest);
  return {checkpointId:SEAL_ID,markers,referenceSha256:hash(raw),checksumsSha256:hash(sumsRaw)};
}
function inspect(parent,base=BASE){const current=inspectParent(parent,base);return {format:FORMAT,parent:current,historicalSeal:historicalSeal(current,base)};}
function prepare(parent,child,base=BASE){
  childDirectory(child,base);const reference=inspect(parent,base);
  const names=['FINANCE_MEDIA_REFERENCE.json',...reference.parent.media.flatMap(item=>[item.label+'.path',item.label+'-before.json'])];
  for(const name of names)check(!fs.existsSync(path.join(child,name)));
  for(const item of reference.parent.media){
    check(!fs.existsSync(path.join(child,item.label+'.tar.gz'))&&!fs.existsSync(path.join(child,item.label+'-extracted')));
    for(const suffix of ['.path','-before.json']){
      const data=read(path.join(parent,item.label+suffix));check(hash(data)===(suffix==='.path'?item.pathSha256:item.manifestSha256));
      fs.writeFileSync(path.join(child,item.label+suffix),data,{flag:'wx',mode:0o600});
    }
  }
  fs.writeFileSync(path.join(child,'FINANCE_MEDIA_REFERENCE.json'),JSON.stringify(reference)+'\n',{flag:'wx',mode:0o600});
  return {ok:true,referencedMedia:reference.parent.media.length};
}
function savedReference(child,base){
  childDirectory(child,base);
  const saved=JSON.parse(read(path.join(child,'FINANCE_MEDIA_REFERENCE.json')));
  check(saved.format===FORMAT&&saved.parent?.parentId===PARENT_ID&&Array.isArray(saved.parent.media)&&saved.parent.media.length>=1&&saved.parent.media.length<=2);
  const labels=saved.parent.media.map(item=>item.label);check(labels.includes('storage')&&new Set(labels).size===labels.length&&labels.every(label=>['storage','legacy'].includes(label)));
  for(const item of saved.parent.media){
    check(hash(read(path.join(child,item.label+'.path')))===item.pathSha256);
    const manifest=read(path.join(child,item.label+'-before.json'));check(hash(manifest)===item.manifestSha256);validateManifest(JSON.parse(manifest));
    check(!fs.existsSync(path.join(child,item.label+'.tar.gz'))&&!fs.existsSync(path.join(child,item.label+'-extracted')));
  }
  return saved;
}
function verify(child,base=BASE){
  const saved=savedReference(child,base),current=inspect(path.join(base,'audit-'+PARENT_ID),base);check(isDeepStrictEqual(saved,current));
  return {ok:true,referencedMedia:current.parent.media.length};
}
function verifyCurrent(child,base=BASE){
  // Inside the guarded pause, read only the already pinned small manifests.
  // Archive hashes are checked before the pause and again before sealing.
  const reference=savedReference(child,base);
  for(const item of reference.parent.media){
    const before=JSON.parse(read(path.join(child,item.label+'-before.json'))),current=JSON.parse(read(path.join(child,item.label+'-current.json')));
    check(verifyMedia(before,current).ok&&verifyMedia(current,before).ok);
  }
  return {ok:true,referencedMedia:reference.parent.media.length};
}
if(require.main===module){
  try{
    const [mode,first,second,...extra]=process.argv.slice(2);check(extra.length===0);
    let result;
    if(mode==='inspect'&&first&&!second){const reference=inspect(first);result={ok:true,parentId:PARENT_ID,referencedMedia:reference.parent.media.length,referenceSha256:hash(JSON.stringify(reference))};}
    else if(mode==='prepare'&&first&&second)result=prepare(first,second);
    else if(mode==='verify'&&first&&!second)result=verify(first);
    else if(mode==='verify-current'&&first&&!second)result=verifyCurrent(first);
    else throw Error('arguments');
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch{process.stderr.write('Finance retained media verification failed; preserve all backups. Private details withheld.\n');process.exitCode=1;}
}
module.exports={inspect,prepare,verify,verifyCurrent};
