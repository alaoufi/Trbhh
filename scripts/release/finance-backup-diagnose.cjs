'use strict';
// Fixed failed run only. No live application command, file write or raw log
// output is permitted; diagnostics are reduced to enumerated codes and states.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const RUN='35934769547';
const BACKUP_STAGES=new Set(['preflight','capacity','parent_media','archives','snapshot','restore','seal','complete']);
const DEPLOY_STAGES=new Set(['preflight','identity','backup','runtime_preflight','checkout','build','cutover','preservation','finalize','rollback']);
const CODES=['compose_identity','compose_source','runtime_environment','runtime_network','rollback_compose','rollback_config','unapplied_environment_drift','unapplied_mount_drift','finance_media_reference_invalid','merchant_media_reference_invalid','backup_capacity_invalid','ENOENT','ENOSPC','EACCES','EROFS','ETIMEDOUT'];
function runtimeEnvironment(container){
  if(!Array.isArray(container?.Config?.Env))throw Error('diagnostic_environment');
  const entries=container.Config.Env.map(value=>{if(typeof value!=='string'||value.indexOf('=')<1)throw Error('diagnostic_environment');const i=value.indexOf('=');return [value.slice(0,i),value.slice(i+1)];});
  if(new Set(entries.map(([key])=>key)).size!==entries.length)throw Error('diagnostic_environment');
  return Object.fromEntries(entries);
}
function summarizeRuntimeConfig(before,config){
  const env=runtimeEnvironment(before),app=config?.services?.app;
  if(!app||!app.environment||typeof app.environment!=='object'||Array.isArray(app.environment))return {available:false,code:'rollback_config'};
  const differences=[];let suppressedKeys=0;
  for(const [key,value] of Object.entries(app.environment)){
    const present=Object.hasOwn(env,key),equal=typeof value==='string'&&present&&env[key]===value;
    if(equal)continue;
    if(!/^[A-Z][A-Z0-9_]{0,127}$/.test(key)){suppressedKeys++;continue;}
    differences.push({key,composePresent:true,runtimePresent:present,composeString:typeof value==='string',composeEmpty:value==='',runtimeEmpty:present&&env[key]==='',equal});
  }
  const expected=(app.volumes||[]).map(v=>({type:v.type,source:v.type==='volume'?config.volumes?.[v.source]?.name:v.source,destination:v.target,writable:!v.read_only}));
  const actual=(before.Mounts||[]).map(v=>({type:v.Type,source:v.Type==='volume'?v.Name:v.Source,destination:v.Destination,writable:v.RW}));
  const sorted=items=>items.sort((a,b)=>String(a.destination).localeCompare(String(b.destination)));
  return {available:true,environment:{comparedKeys:Object.keys(app.environment).length,differences,suppressedKeys},mounts:{expectedCount:expected.length,actualCount:actual.length,equal:require('node:util').isDeepStrictEqual(sorted(expected),sorted(actual))}};
}
function summarizeLogs(deploy,operations){
  const logs=deploy+'\n'+operations,backupStages=[],deploymentStages=[],codes=[];
  for(const match of logs.matchAll(/Finance backup failed at stage ([a-z_]+);/g))if(BACKUP_STAGES.has(match[1])&&!backupStages.includes(match[1]))backupStages.push(match[1]);
  for(const match of logs.matchAll(/Finance deployment failed at stage ([a-z_]+);/g))if(DEPLOY_STAGES.has(match[1])&&!deploymentStages.includes(match[1]))deploymentStages.push(match[1]);
  for(const code of CODES)if(new RegExp('\\b'+code+'\\b').test(logs))codes.push(code);
  for(const match of logs.matchAll(/ERROR (1045|1049|1064|1142|1146|1227|2002|2003|2013)\b/g)){const code='mysql_'+match[1];if(!codes.includes(code))codes.push(code);}
  for(const [pattern,code] of [[/No such container/i,'docker_container_missing'],[/invalid reference format/i,'docker_reference_invalid'],[/command not found/i,'command_unavailable'],[/Finance retained media verification failed/,'retained_media_rejected'],[/Database proof failed/,'database_proof_rejected'],[/Media proof failed/,'media_proof_rejected'],[/Live database dump failed/,'database_dump_failed']])if(pattern.test(logs))codes.push(code);
  const classified=/^(?:Error|TypeError|SyntaxError|AssertionError(?: \[ERR_ASSERTION\])?): (rollback_compose|rollback_config|unapplied_environment_drift|unapplied_mount_drift)\b/m.exec(logs);
  return {backupStages,deploymentStages,codes,composeFailureClass:classified?.[1]||null};
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
function collect({root='/root',run=spawnSync}={}){
  const prod=path.join(root,'trbhh'),backup=path.join(root,'trbhh-release-backups/finance-'+RUN),tools=path.join(root,'trbhh-release-tools/'+RUN);
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
  const names=['capacity.json','media-mode.txt','FINANCE_MEDIA_REFERENCE.json','container-before.json','compose-sources.json','baseline-compose.json','rollback-compose.json','rollback-project.txt','rollback-compose-files.txt','code.tar.gz','image.tar.gz','before.json','full-before.json','supplier-before.json','database.sql.gz','storage-current.json','legacy-current.json','full-current.json','restored.json','full-restored.json','SHA256SUMS','VERIFIED','WATCHDOG_FIRED','CUTOVER_READY','ROLLED_BACK','DEPLOYMENT_VERIFIED'];
  const files=Object.fromEntries(names.map(name=>[name,canonical(backup)?info(path.join(backup,name)):{exists:false}]));
  const timer=command('systemctl',['is-active','trbhh-finance-resume-'+RUN+'.timer']);
  const media={};
  for(const label of ['storage','legacy']){try{const before=JSON.parse(read(path.join(backup,label+'-before.json'),64*1024*1024)),current=read(path.join(backup,label+'-current.json'),64*1024*1024);media[label]=summarizeMedia(before,current?JSON.parse(current):null);}catch{media[label]={available:false};}}
  let capacityMeasurement=null,liveSpace=null;
  try{const raw=JSON.parse(read(path.join(backup,'capacity.json'))),keys=['databaseBytes','tableCount','mediaBytes','mediaEntries'];if(raw.format!=='trbhh-backup-capacity-v1'||!keys.every(k=>/^\d{1,24}$/.test(String(raw[k]))))throw Error('capacity');capacityMeasurement=Object.fromEntries(keys.map(k=>[k,String(raw[k])]));}catch{}
  const df=command('df',['-B1','--output=size,used,avail',root]).split(/\r?\n/).slice(1).join(' ').trim().split(/\s+/);
  if(df.length===3&&df.every(value=>/^\d{1,24}$/.test(value)))liveSpace={totalBytes:df[0],usedBytes:df[1],availableBytes:df[2]};
  const logSummary=summarizeLogs(read(path.join(tools,'deploy.log')),read(path.join(backup,'operations.log')));
  if(Object.values(media).some(value=>value.comparison&&!value.comparison.exact))logSummary.codes.push('media_manifest_mismatch');
  let runtimeConfig={available:false},composeSources={available:false};
  try{
    const before=JSON.parse(read(path.join(backup,'container-before.json')))[0],current=JSON.parse(command('docker',['inspect',id]))[0];
    const equal=require('node:util').isDeepStrictEqual;
    app.containerMatchesBackup=current.Id===before.Id;app.startedAtMatchesBackup=current.State?.StartedAt===before.State?.StartedAt;
    app.environmentMatchesBackup=equal(runtimeEnvironment(before),runtimeEnvironment(current));app.mountsMatchBackup=equal(before.Mounts,current.Mounts);
    runtimeConfig=summarizeRuntimeConfig(before,JSON.parse(read(path.join(backup,'baseline-compose.json'))));
  }catch{}
  try{
    const manifest=JSON.parse(read(path.join(backup,'compose-sources.json')));
    if(!Array.isArray(manifest.sourceFiles)||manifest.sourceFiles.length>20)throw Error('sources');
    const sources=manifest.sourceFiles.map(item=>{
      if(!/^compose-source-[0-9]+\.yml$/.test(item.saved)||typeof item.source!=='string')throw Error('sources');
      const sourceClass=item.source.startsWith(prod+path.sep)?'project':item.source.startsWith(path.join(root,'trbhh-release-backups')+path.sep)?'retained-backups':'other';
      const approved=sourceClass!=='other'&&fs.realpathSync(item.source)===item.source;
      const sourceInfo=approved?info(item.source):{exists:false},saved=info(path.join(backup,item.saved));
      return {sourceClass,sourceRegular:sourceInfo.regular===true,savedRegular:saved.regular===true,bytesEqual:approved&&sourceInfo.regular===true&&saved.regular===true&&sourceInfo.bytes===saved.bytes&&saved.bytes<=524288&&read(item.source)===read(path.join(backup,item.saved))};
    });
    composeSources={available:true,projectNameValid:typeof manifest.project==='string'&&/^[a-z0-9][a-z0-9_-]*$/.test(manifest.project),sourceCount:sources.length,sources};
  }catch{}
  return {runId:RUN,app,backup:{canonical:canonical(backup),files},activeDeployment:info(path.join(root,'trbhh-release-tools/ACTIVE_DEPLOYMENT')),resumeTimer:['active','inactive','failed','activating','deactivating'].includes(timer)?timer:'unknown',media,capacityMeasurement,liveSpace,runtimeConfig,composeSources,...logSummary};
}
if(require.main===module||(process.argv[1]==='-'&&module.id==='[stdin]')){
  try{if(process.argv.slice(2).length)throw Error('arguments');process.stdout.write(JSON.stringify(collect())+'\n');}catch{process.stderr.write('Finance backup diagnostic unavailable; private details withheld.\n');process.exitCode=1;}
}
module.exports={summarizeLogs,summarizeMedia,summarizeRuntimeConfig,collect};
