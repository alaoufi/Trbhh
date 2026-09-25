'use strict';
// Media-only reference to the retained, verified full backup. Database, code,
// image and runtime configuration remain fresh in every finance checkpoint.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{isDeepStrictEqual}=require('node:util');
const {inspectParent}=require('./merchant-media-reference.cjs');
const {validateManifest,verify:verifyMedia}=require('./media-proof.cjs');
const BASE='/root/trbhh-release-backups',PARENT_ID='35603864905',SEAL_ID='35607654850',FINANCE_PARENT_ID='36082393573',FINANCE_PARENT_COMMIT='353ae4c023e1183452b38be3f6fe8b9284d047c8',FINANCE_PARENT_CANDIDATE='19e4c6f72c35f4adf2cb96600da094ef46788e2b',FORMAT='trbhh-finance-media-reference-v1';
const SELECTED_FORMAT='trbhh-finance-media-selection-v1',MIXED='fresh-storage-retained-legacy';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let parentCheckStage='not_applicable';
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
function inspectVerifiedFinanceBackup(parent,base){
  parentCheckStage='parent_directory';
  const expectedPath=path.join(base,'finance-'+FINANCE_PARENT_ID);check(parent===expectedPath);directory(base,base);directory(parent,base);
  parentCheckStage='parent_markers';
  for(const [name,value] of [['VERIFIED',FINANCE_PARENT_COMMIT],['commit.txt',FINANCE_PARENT_COMMIT],['candidate.txt',FINANCE_PARENT_CANDIDATE]])check(read(path.join(parent,name)).toString().trim()===value);
  check(!fs.existsSync(path.join(parent,'WATCHDOG_FIRED')));
  parentCheckStage='parent_checksum_manifest';
  const sumsRaw=read(path.join(parent,'SHA256SUMS')),sums=new Map();
  for(const line of sumsRaw.toString().trimEnd().split('\n')){
    const match=/^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$/.exec(line);check(match&&!['.','..'].includes(match[2])&&!sums.has(match[2]));
    sums.set(match[2],match[1]);
  }
  parentCheckStage='parent_required_files';
  const required=['code.tar.gz','database.sql.gz','image.tar.gz','storage.tar.gz','legacy.tar.gz','container-before.json','full-before.json','full-restored.json','commit.txt','candidate.txt','legacy.path','legacy-before.json','storage.path','storage-before.json'];
  for(const name of required)check(sums.has(name));
  parentCheckStage='parent_file_hashes';
  for(const [name,digest] of sums)check(hash(read(path.join(parent,name)))===digest);
  parentCheckStage='parent_restore_proof';
  const canonicalFull=raw=>{
    const value=JSON.parse(raw);check(value?.format==='trbhh-database-full-proof-v1'&&value.tables&&typeof value.tables==='object'&&!Array.isArray(value.tables));
    check(Object.hasOwn(value.tables,'users')&&Object.hasOwn(value.tables,'ads'));
    const tables={};for(const name of Object.keys(value.tables).sort()){
      const table=value.tables[name],validNames=list=>Array.isArray(list)&&new Set(list).size===list.length&&list.every(item=>typeof item==='string'&&/^[A-Za-z0-9_]+$/.test(item));
      check(table&&Number.isSafeInteger(table.count)&&table.count>=0&&typeof table.engine==='string'&&table.engine.length>0&&/^[a-f0-9]{64}$/.test(table.schemaSha256));
      check(validNames(table.columns)&&table.columns.length>0&&validNames(table.primaryKeyColumns)&&table.primaryKeyColumns.every(column=>table.columns.includes(column)));
      check(Array.isArray(table.rowHashes)&&table.rowHashes.length===table.count&&table.rowHashes.every(value=>/^[a-f0-9]{64}$/.test(value)));
      // Match the official restore proof: capture timestamps are irrelevant and
      // row-hash ordering is normalized before comparing table contents.
      tables[name]={count:table.count,engine:table.engine,columns:table.columns,primaryKeyColumns:table.primaryKeyColumns,schemaSha256:table.schemaSha256,rowHashes:[...table.rowHashes].sort()};
    }
    return tables;
  };
  const before=canonicalFull(read(path.join(parent,'full-before.json'))),restored=canonicalFull(read(path.join(parent,'full-restored.json')));check(isDeepStrictEqual(before,restored));
  parentCheckStage='parent_media_manifests';
  const media=[];
  for(const label of ['storage','legacy']){
    const mediaPath=read(path.join(parent,label+'.path')),manifest=read(path.join(parent,label+'-before.json'));
    check(mediaPath.toString().trim()==='/app/'+label);validateManifest(JSON.parse(manifest));
    media.push({label,archive:label+'.tar.gz',archiveSha256:sums.get(label+'.tar.gz'),pathSha256:hash(mediaPath),manifestSha256:hash(manifest)});
  }
  parentCheckStage='parent_complete';
  return {format:'trbhh-verified-finance-backup-media-v1',parentId:FINANCE_PARENT_ID,parentPath:parent,parentCommit:FINANCE_PARENT_COMMIT,parentCandidate:FINANCE_PARENT_CANDIDATE,checksumsSha256:hash(sumsRaw),media};
}
function inspect(parent,base=BASE){
  if(parent===path.join(base,'finance-'+FINANCE_PARENT_ID))return {format:FORMAT,parent:inspectVerifiedFinanceBackup(parent,base)};
  const current=inspectParent(parent,base);return {format:FORMAT,parent:current,historicalSeal:historicalSeal(current,base)};
}
function selection(reference,mode){
  check(['verified-parent',MIXED].includes(mode));
  const media=reference.parent.media.filter(item=>mode==='verified-parent'||item.label==='legacy');
  check(media.length>0&&(mode!=='verified-parent'||media.some(item=>item.label==='storage'))&&(mode!==MIXED||media.length===1&&media[0].label==='legacy'));
  return media;
}
function prepare(parent,child,base=BASE,mode='verified-parent'){
  childDirectory(child,base);const evidence=inspect(parent,base),media=selection(evidence,mode);
  check(read(path.join(child,'media-mode.txt')).toString().trim()===mode);
  // Preserve the full immutable parent evidence, but identify exactly which
  // roots are supplied by it. A mixed backup never copies the old storage proof.
  const reference={format:SELECTED_FORMAT,mode,retainedLabels:media.map(item=>item.label),evidence};
  const names=['FINANCE_MEDIA_REFERENCE.json',...media.flatMap(item=>[item.label+'.path',item.label+'-before.json'])];
  for(const name of names)check(!fs.existsSync(path.join(child,name)));
  for(const item of media){
    check(!fs.existsSync(path.join(child,item.label+'.tar.gz'))&&!fs.existsSync(path.join(child,item.label+'-extracted')));
    for(const suffix of ['.path','-before.json']){
      const data=read(path.join(parent,item.label+suffix));check(hash(data)===(suffix==='.path'?item.pathSha256:item.manifestSha256));
      fs.writeFileSync(path.join(child,item.label+suffix),data,{flag:'wx',mode:0o600});
    }
  }
  fs.writeFileSync(path.join(child,'FINANCE_MEDIA_REFERENCE.json'),JSON.stringify(reference)+'\n',{flag:'wx',mode:0o600});
  return {ok:true,referencedMedia:media.length};
}
function savedReference(child,base){
  childDirectory(child,base);
  const saved=JSON.parse(read(path.join(child,'FINANCE_MEDIA_REFERENCE.json')));
  const evidence=saved.format===FORMAT?saved:saved.evidence,mode=saved.format===FORMAT?'verified-parent':saved.mode;
  check(evidence?.format===FORMAT&&[''+PARENT_ID,''+FINANCE_PARENT_ID].includes(evidence.parent?.parentId)&&Array.isArray(evidence.parent.media)&&evidence.parent.media.length>=1&&evidence.parent.media.length<=2);
  const labels=evidence.parent.media.map(item=>item.label);check(labels.includes('storage')&&new Set(labels).size===labels.length&&labels.every(label=>['storage','legacy'].includes(label)));
  const media=selection(evidence,mode);
  if(saved.format!==FORMAT)check(saved.format===SELECTED_FORMAT&&isDeepStrictEqual(saved.retainedLabels,media.map(item=>item.label))&&isDeepStrictEqual(Object.keys(saved).sort(),['evidence','format','mode','retainedLabels']));
  check(read(path.join(child,'media-mode.txt')).toString().trim()===mode);
  for(const item of media){
    check(hash(read(path.join(child,item.label+'.path')))===item.pathSha256);
    const manifest=read(path.join(child,item.label+'-before.json'));check(hash(manifest)===item.manifestSha256);validateManifest(JSON.parse(manifest));
    check(!fs.existsSync(path.join(child,item.label+'.tar.gz'))&&!fs.existsSync(path.join(child,item.label+'-extracted')));
  }
  return {evidence,mode,media};
}
function verify(child,base=BASE){
  const saved=savedReference(child,base),current=inspect(saved.evidence.parent.parentPath,base);check(isDeepStrictEqual(saved.evidence,current));
  return {ok:true,referencedMedia:saved.media.length};
}
function verifyCurrent(child,base=BASE){
  // Inside the guarded pause, read only the already pinned small manifests.
  // Archive hashes are checked before the pause and again before sealing.
  const reference=savedReference(child,base);
  for(const item of reference.media){
    const before=JSON.parse(read(path.join(child,item.label+'-before.json'))),current=JSON.parse(read(path.join(child,item.label+'-current.json')));
    check(verifyMedia(before,current).ok&&verifyMedia(current,before).ok);
  }
  return {ok:true,referencedMedia:reference.media.length};
}
if(require.main===module){
  try{
    const [mode,first,second,...extra]=process.argv.slice(2);check(extra.length===0);
    let result;
    if(mode==='inspect'&&first&&!second){const reference=inspect(first);result={ok:true,parentId:reference.parent.parentId,referencedMedia:reference.parent.media.length,referenceSha256:hash(JSON.stringify(reference))};}
    else if(mode==='prepare'&&first&&second)result=prepare(first,second);
    else if(mode==='prepare-legacy'&&first&&second)result=prepare(first,second,BASE,MIXED);
    else if(mode==='verify'&&first&&!second)result=verify(first);
    else if(mode==='verify-current'&&first&&!second)result=verifyCurrent(first);
    else throw Error('arguments');
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch{
    const [mode,first]=process.argv.slice(2);
    if(mode==='inspect'&&first===path.join(BASE,'finance-'+FINANCE_PARENT_ID))process.stdout.write(JSON.stringify({ok:false,stage:parentCheckStage})+'\n');
    else process.stderr.write('Finance retained media verification failed; preserve all backups. Private details withheld.\n');
    process.exitCode=1;
  }
}
module.exports={inspect,prepare,verify,verifyCurrent,FINANCE_PARENT_ID};
