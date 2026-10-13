'use strict';
// Allowlisted failed runs only. No live application command, file write or raw log
// output is permitted; diagnostics are reduced to enumerated codes and states.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const RUN='35932588551';
const BACKUP_STAGES=new Set(['preflight','capacity','parent_media','archives','snapshot','restore','seal','complete']);
const DEPLOY_STAGES=new Set(['preflight','identity','backup','runtime_preflight','checkout','build','cutover','preservation','finalize','rollback']);
const CODES=['compose_identity','compose_source','runtime_environment','runtime_network','finance_media_reference_invalid','merchant_media_reference_invalid','backup_capacity_invalid','ENOENT','ENOSPC','EACCES','EROFS','ETIMEDOUT'];
function summarizeLogs(deploy,operations){
  const logs=deploy+'\n'+operations,backupStages=[],deploymentStages=[],codes=[];
  for(const match of logs.matchAll(/Finance backup failed at stage ([a-z_]+)(?: substep [a-z_]+)?;/g))if(BACKUP_STAGES.has(match[1])&&!backupStages.includes(match[1]))backupStages.push(match[1]);
  for(const match of logs.matchAll(/Finance deployment failed at stage ([a-z_]+)(?: substep [a-z_]+)?;/g))if(DEPLOY_STAGES.has(match[1])&&!deploymentStages.includes(match[1]))deploymentStages.push(match[1]);
  for(const code of CODES)if(new RegExp('\\b'+code+'\\b').test(logs))codes.push(code);
  for(const match of logs.matchAll(/ERROR (1045|1049|1064|1142|1146|1227|2002|2003|2013)\b/g)){const code='mysql_'+match[1];if(!codes.includes(code))codes.push(code);}
  for(const [pattern,code] of [[/Cannot stat|can't stat/i,'tar_source_stat_failed'],[/Cannot hard link|Cannot hardlink|can't create hardlink/i,'tar_hardlink_failed'],[/Cannot open|can't open/i,'tar_open_failed'],[/Cannot mkdir|can't create directory|can't make directory/i,'tar_directory_failed'],[/Cannot utime|can't restore times/i,'tar_time_restore_failed'],[/Read-only file system/i,'archive_read_only'],[/File exists/i,'archive_path_collision'],[/Permission denied/i,'archive_permission_denied'],[/No such file or directory/i,'archive_target_missing'],[/can't create symlink|Cannot symlink/i,'archive_symlink_error'],[/file changed as we read it/i,'tar_source_changed'],[/file removed before we read it/i,'tar_source_removed'],[/Unexpected EOF in archive|This does not look like a tar archive/i,'tar_archive_invalid'],[/exiting with failure status due to previous errors/i,'tar_prior_error'],[/Killed|Terminated/i,'process_terminated'],[/invalid compressed data|crc error|length error/i,'gzip_invalid_data'],[/unexpected end of file/i,'gzip_truncated'],[/No space left on device/i,'ENOSPC'],[/No such container/i,'docker_container_missing'],[/invalid reference format/i,'docker_reference_invalid'],[/command not found/i,'command_unavailable'],[/Finance retained media verification failed/,'retained_media_rejected'],[/Database proof failed/,'database_proof_rejected'],[/Media proof failed/,'media_proof_rejected'],[/Live database dump failed/,'database_dump_failed']])if(pattern.test(logs))codes.push(code);
  return {backupStages,deploymentStages,codes};
}
function summarizeMedia(before,current){
  function manifest(value){
    if(value?.format!=='trbhh-media-proof-v1'||!Array.isArray(value.entries)||value.entryCount!==value.entries.length)throw Error('media_manifest');
    const entries=new Map();let fileBytes=0,symlinkBytes=0;
    for(const item of value.entries){
      if(typeof item.path!=='string'||!item.path||entries.has(item.path)||!['file','symlink','directory'].includes(item.kind))throw Error('media_manifest');
      if(item.kind==='file'){if(!Number.isSafeInteger(item.bytes)||item.bytes<0||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('media_manifest');fileBytes+=item.bytes;}
      if(item.kind==='symlink'){if(typeof item.target!=='string'||!item.target)throw Error('media_manifest');symlinkBytes+=Buffer.byteLength(item.target);}
      entries.set(item.path,item);
    }
    if(!Number.isSafeInteger(fileBytes+symlinkBytes))throw Error('media_size');
    return {entries,summary:{entryCount:value.entryCount,capacityEntries:value.entryCount+1,fileBytes,symlinkBytes,totalBytes:fileBytes+symlinkBytes}};
  }
  const a=manifest(before),b=current?manifest(current):null;
  if(!b)return {before:a.summary,current:null};
  let removed=0,changed=0,added=0;
  for(const [key,old] of a.entries){const next=b.entries.get(key);if(!next)removed++;else if(old.kind!==next.kind||(old.kind==='file'&&(old.bytes!==next.bytes||old.sha256!==next.sha256))||(old.kind==='symlink'&&old.target!==next.target))changed++;}
  for(const key of b.entries.keys())if(!a.entries.has(key))added++;
  return {before:a.summary,current:b.summary,comparison:{compared:a.entries.size,removed,changed,added,exact:removed===0&&changed===0&&added===0}};
}
function inspectArchive(file,run=spawnSync){
  try{
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||fs.realpathSync(file)!==file||fs.realpathSync(path.dirname(file))!==path.dirname(file))return {available:false};
    const code=`import sys,tarfile,posixpath,json,resource
resource.setrlimit(resource.RLIMIT_AS,(384*1024*1024,384*1024*1024))
resource.setrlimit(resource.RLIMIT_CPU,(90,90))
r=dict(members=0,directories=0,symlinks=0,hardlinks=0,duplicates=0,unsafePaths=0,symlinkDescendants=0,missingHardlinkTargets=0)
seen=set();links=set()
with tarfile.open(sys.argv[1],mode='r|gz') as archive:
 for item in archive:
  r['members']+=1
  if r['members']>200000: raise ValueError('member_limit')
  p=posixpath.normpath(item.name)
  if p in seen:r['duplicates']+=1
  if p.startswith('/') or p=='..' or p.startswith('../'):r['unsafePaths']+=1
  parts=p.split('/')
  if any('/'.join(parts[:i]) in links for i in range(1,len(parts))):r['symlinkDescendants']+=1
  if item.isdir():r['directories']+=1
  if item.issym():r['symlinks']+=1;links.add(p)
  if item.islnk():
   r['hardlinks']+=1
   if posixpath.normpath(item.linkname) not in seen:r['missingHardlinkTargets']+=1
  seen.add(p)
print(json.dumps(r))`;
    const result=run('python3',['-c',code,file],{encoding:'utf8',timeout:120000,maxBuffer:65536});
    if(result.error||result.status!==0)return {available:false};
    const data=JSON.parse(result.stdout),keys=['members','directories','symlinks','hardlinks','duplicates','unsafePaths','symlinkDescendants','missingHardlinkTargets'];
    if(!keys.every(key=>Number.isSafeInteger(data[key])&&data[key]>=0&&data[key]<=200000))return {available:false};
    return {available:true,...Object.fromEntries(keys.map(key=>[key,data[key]]))};
  }catch{return {available:false};}
}
function collect({root='/root',run=spawnSync,runId=RUN}={}){
  if(!['35932588551','38392214806','38435790758'].includes(runId))throw Error('diagnostic_run');
  const prod=path.join(root,'trbhh'),backup=path.join(root,'trbhh-release-backups/finance-'+runId),tools=path.join(root,'trbhh-release-tools/'+runId);
  const canonical=value=>{try{return fs.realpathSync(value)===value&&fs.lstatSync(value).isDirectory()&&!fs.lstatSync(value).isSymbolicLink();}catch{return false;}};
  if(!canonical(root)||!canonical(prod))throw Error('diagnostic_root');
  function info(file){try{const s=fs.lstatSync(file);return {exists:true,regular:s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,bytes:s.size};}catch{return {exists:false};}}
  function read(file,limit=524288){
    if(!canonical(path.dirname(file)))return '';
    const s=info(file);if(!s.regular)return '';
    const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    try{const length=Math.min(s.bytes,limit),buffer=Buffer.alloc(length);fs.readSync(fd,buffer,0,length,Math.max(0,s.bytes-length));return buffer.toString('utf8');}finally{fs.closeSync(fd);}
  }
  const command=(name,args)=>{const result=run(name,args,{cwd:prod,encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024});return result&&!result.error&&typeof result.stdout==='string'?result.stdout.trim():'';};
  const head=command('git',['rev-parse','HEAD']),id=command('docker',['compose','ps','-aq','app']);
  const app={checkout:/^[a-f0-9]{40}$/.test(head)?head:null,containerId:/^[a-f0-9]{12,64}$/.test(id)?id:null};
  if(app.containerId){
    try{const c=JSON.parse(command('docker',['inspect',id]))[0];app.image=/^sha256:[a-f0-9]{64}$/.test(c.Image)?c.Image:null;app.running=c.State?.Running===true;app.paused=c.State?.Paused===true;app.imageMatchesBackup=app.image!==null&&app.image===read(path.join(backup,'image-id.txt'),128).trim();
      const sources=(c.Config?.Labels?.['com.docker.compose.project.config_files']||'').split(',').filter(Boolean);
      app.composeSourceClasses=sources.map(value=>value.startsWith(prod+'/')?'project':value.startsWith(path.join(root,'trbhh-release-backups')+'/')?'retained-backups':value.startsWith(path.join(root,'trbhh-release-tools')+'/')?'release-tools':'other');
    }catch{app.inspectAvailable=false;}
  }
  const names=['capacity.json','media-mode.txt','FINANCE_MEDIA_REFERENCE.json','container-before.json','compose-sources.json','code.tar.gz','image.tar.gz','storage.tar.gz','legacy.tar.gz','storage-before.json','legacy-before.json','storage-extracted','legacy-extracted','operations.log','before.json','full-before.json','supplier-before.json','database.sql.gz','storage-current.json','legacy-current.json','full-current.json','restored.json','full-restored.json','SHA256SUMS','VERIFIED','WATCHDOG_FIRED','CUTOVER_READY','ROLLED_BACK','DEPLOYMENT_VERIFIED'];
  const files=Object.fromEntries(names.map(name=>[name,canonical(backup)?info(path.join(backup,name)):{exists:false}]));
  const timer=command('systemctl',['is-active','trbhh-finance-resume-'+runId+'.timer']);
  const media={};
  for(const label of ['storage','legacy']){try{const before=JSON.parse(read(path.join(backup,label+'-before.json'),64*1024*1024)),current=read(path.join(backup,label+'-current.json'),64*1024*1024);media[label]=summarizeMedia(before,current?JSON.parse(current):null);}catch{media[label]={available:false};}}
  let capacityMeasurement=null,liveSpace=null;
  try{const raw=JSON.parse(read(path.join(backup,'capacity.json'))),keys=['databaseBytes','tableCount','mediaBytes','mediaEntries'];if(raw.format!=='trbhh-backup-capacity-v1'||!keys.every(k=>/^\d{1,24}$/.test(String(raw[k]))))throw Error('capacity');capacityMeasurement=Object.fromEntries(keys.map(k=>[k,String(raw[k])]));}catch{}
  const df=command('df',['-B1','--output=size,used,avail',root]).split(/\r?\n/).slice(1).join(' ').trim().split(/\s+/);
  if(df.length===3&&df.every(value=>/^\d{1,24}$/.test(value)))liveSpace={totalBytes:df[0],usedBytes:df[1],availableBytes:df[2]};
  const logSummary=summarizeLogs(read(path.join(tools,'deploy.log')),read(path.join(backup,'operations.log')));
  if(Object.values(media).some(value=>value.comparison&&!value.comparison.exact))logSummary.codes.push('media_manifest_mismatch');
  const archiveMetadata=runId==='38392214806'&&files['legacy.tar.gz'].regular?inspectArchive(path.join(backup,'legacy.tar.gz'),run):null;
  return {runId,archiveMetadata,app,backup:{canonical:canonical(backup),files},activeDeployment:info(path.join(root,'trbhh-release-tools/ACTIVE_DEPLOYMENT')),resumeTimer:['active','inactive','failed','activating','deactivating'].includes(timer)?timer:'unknown',media,capacityMeasurement,liveSpace,...logSummary};
}
if(require.main===module||(process.argv[1]==='-'&&module.id==='[stdin]')){
  try{if(process.argv.slice(2).length>1)throw Error('arguments');process.stdout.write(JSON.stringify(collect({runId:process.argv[2]||RUN}))+'\n');}catch{process.stderr.write('Finance backup diagnostic unavailable; private details withheld.\n');process.exitCode=1;}
}
module.exports={summarizeLogs,summarizeMedia,inspectArchive,collect};
