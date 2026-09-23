'use strict';
/** Capacity proof only: SELECT and filesystem metadata. No file writes, network
 * requests, cleanup or application imports. Measurements contain sizes/counts.
 * measure runs in the live app; check runs on the host before creating archives.
 */
const fs=require('node:fs');
const path=require('node:path');
const GiB=1024n*1024n*1024n;
const MiB=1024n*1024n;
function integer(value){
  const raw=typeof value==='bigint'?String(value):typeof value==='number'&&Number.isSafeInteger(value)?String(value):typeof value==='string'?value.trim():'';
  if(!/^\d{1,24}$/.test(raw))throw Error('backup_capacity_invalid');
  return BigInt(raw);
}
function maximum(a,b){return a>b?a:b;}
function mediaSize(root,filesystem=fs){
  const pending=[root];let bytes=0n,entries=0n;
  while(pending.length){
    const current=pending.pop(),stat=filesystem.lstatSync(current,{bigint:true});
    entries++;
    if(stat.isDirectory()){
      for(const name of filesystem.readdirSync(current))pending.push(path.join(current,name));
    }else if(stat.isFile()||stat.isSymbolicLink())bytes+=integer(stat.size);
    else throw Error('backup_capacity_unsupported_media');
  }
  return {bytes:String(bytes),entries:String(entries)};
}
async function measure(db,env=process.env,filesystem=fs){
  const rows=await db.$queryRawUnsafe("SELECT COALESCE(SUM(COALESCE(DATA_LENGTH,0)+COALESCE(INDEX_LENGTH,0)),0) AS bytes,COUNT(*) AS tables_count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'");
  if(rows.length!==1||integer(rows[0].tables_count)<2n)throw Error('backup_capacity_invalid_database');
  let mediaBytes=0n,mediaEntries=0n;const mediaRoots=[];
  for(const [label,root] of [['storage',env.STORAGE_DIR||'/app/storage'],['legacy',env.LEGACY_LOCAL_DIR||'']]){
    if(!root)continue;
    if(root!=='/app/'+label)throw Error('backup_capacity_unsupported_media');
    const size=mediaSize(root,filesystem);mediaBytes+=integer(size.bytes);mediaEntries+=integer(size.entries);
    mediaRoots.push({label,bytes:size.bytes,entries:size.entries});
  }
  // MySQL SUM(BIGINT) can be represented as Prisma Decimal. Parse its exact
  // integer string instead of converting through an imprecise JS Number.
  return {format:'trbhh-backup-capacity-v1',databaseBytes:String(integer(String(rows[0].bytes))),tableCount:String(integer(rows[0].tables_count)),mediaBytes:String(mediaBytes),mediaEntries:String(mediaEntries),mediaRoots};
}
function filesystemSpace(directory,filesystem=fs){
  if(typeof directory!=='string'||!path.isAbsolute(directory)||filesystem.lstatSync(directory).isSymbolicLink())throw Error('backup_capacity_invalid_path');
  const stat=filesystem.statSync(directory,{bigint:true}),space=filesystem.statfsSync(directory,{bigint:true});
  return {device:String(integer(stat.dev)),totalBytes:String(integer(space.blocks)*integer(space.bsize)),availableBytes:String(integer(space.bavail)*integer(space.bsize)),availableInodes:String(integer(space.ffree))};
}
function checkCapacity(measurement,imageValue,codeValue,backupSpace,dockerSpace,mediaMode='fresh'){
  if(measurement?.format!=='trbhh-backup-capacity-v1')throw Error('backup_capacity_invalid');
  if(!['fresh','verified-parent','fresh-storage-retained-legacy'].includes(mediaMode))throw Error('backup_capacity_invalid');
  const image=integer(imageValue),code=integer(codeValue),media=integer(measurement.mediaBytes),entries=integer(measurement.mediaEntries),tables=integer(measurement.tableCount);
  if(image===0n||code===0n||tables<2n)throw Error('backup_capacity_invalid');
  const database=maximum(integer(measurement.databaseBytes),64n*MiB);
  // Account for tar headers/padding for tiny files, compressed archives even if
  // effectively incompressible, extracted copies, SQL escaping, restore indexes,
  // and the new app image/build layers. Shared layers only reduce actual use.
  // A verified immutable parent supplies media in-place: only small manifests
  // are copied (covered by the fixed buffer), never archives/extracted files.
  let freshBytes=mediaMode==='fresh'?media:0n,freshEntries=mediaMode==='fresh'?entries:0n;
  if(mediaMode==='fresh-storage-retained-legacy'){
    const roots=measurement.mediaRoots;
    if(!Array.isArray(roots)||roots.length!==2||new Set(roots.map(root=>root.label)).size!==2||!roots.every(root=>['storage','legacy'].includes(root.label)&&integer(root.entries)>0n))throw Error('backup_capacity_invalid');
    if(roots.reduce((sum,root)=>sum+integer(root.bytes),0n)!==media||roots.reduce((sum,root)=>sum+integer(root.entries),0n)!==entries)throw Error('backup_capacity_invalid');
    const storage=roots.find(root=>root.label==='storage');freshBytes=integer(storage.bytes);freshEntries=integer(storage.entries);
  }
  const backupBytes=image*2n+code*2n+freshBytes*2n+freshEntries*4096n+database*3n+512n*MiB;
  const dockerBytes=image*3n+database*3n+GiB;
  const backupInodes=freshEntries+1000n,dockerInodes=tables*20n+100000n;
  const shared=String(backupSpace.device)===String(dockerSpace.device);
  const requested=[{label:shared?'backup_and_docker':'backup',space:backupSpace,bytes:shared?backupBytes+dockerBytes:backupBytes,inodes:shared?backupInodes+dockerInodes:backupInodes}];
  if(!shared)requested.push({label:'docker',space:dockerSpace,bytes:dockerBytes,inodes:dockerInodes});
  const filesystems=requested.map(({label,space,bytes,inodes})=>{
    const availableBytes=integer(space.availableBytes),availableInodes=integer(space.availableInodes);
    // Reserve follows this operation's already conservative peak allocation,
    // not historical filesystem capacity. Retain both a 5 GiB OS floor and 25%
    // workload contingency, in addition to all archive/restore/build multipliers.
    if(integer(space.totalBytes)<availableBytes)throw Error('backup_capacity_invalid');
    const reserveBytes=maximum(5n*GiB,(bytes+3n)/4n),reserveInodes=50000n;
    const requiredBytes=bytes+reserveBytes,requiredInodes=inodes+reserveInodes;
    return {label,availableBytes:String(availableBytes),plannedBytes:String(bytes),requiredBytes:String(requiredBytes),reserveBytes:String(reserveBytes),availableInodes:String(availableInodes),requiredInodes:String(requiredInodes),ok:availableBytes>=requiredBytes&&availableInodes>=requiredInodes};
  });
  return {format:'trbhh-backup-capacity-check-v1',ok:filesystems.every(space=>space.ok),sharedFilesystem:shared,filesystems};
}
async function main(){
  let db;
  try{
    const [mode,...args]=process.argv.slice(2);
    if(mode==='measure'&&args.length===0){
      db=new (require('@prisma/client').PrismaClient)({log:[]});
      process.stdout.write(JSON.stringify(await measure(db))+'\n');
    }else if(mode==='check'&&(args.length===5||args.length===6)){
      const result=checkCapacity(JSON.parse(args[0]),args[1],args[2],filesystemSpace(args[3]),filesystemSpace(args[4]),args[5]);
      process.stdout.write(JSON.stringify(result)+'\n');
      if(!result.ok){process.stderr.write('Backup capacity insufficient; no archive was created and the app was not paused.\n');process.exitCode=1;}
    }else throw Error('backup_capacity_arguments');
  }catch{process.stderr.write('Backup capacity could not be verified; sizes and credentials withheld.\n');process.exitCode=1;}
  finally{if(db)await db.$disconnect().catch(()=>{});}
}
module.exports={integer,mediaSize,measure,filesystemSpace,checkCapacity};
if(require.main===module||module.id==='[stdin]'&&process.argv[1]==='-')void main();
