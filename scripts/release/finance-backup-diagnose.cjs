'use strict';
// Fixed failed run only. No live application command, file write or raw log
// output is permitted; diagnostics are reduced to enumerated codes and states.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const RUN='35932588551';
const BACKUP_STAGES=new Set(['preflight','capacity','parent_media','archives','snapshot','restore','seal','complete']);
const DEPLOY_STAGES=new Set(['preflight','identity','backup','runtime_preflight','checkout','build','cutover','preservation','finalize','rollback']);
const CODES=['compose_identity','compose_source','runtime_environment','runtime_network','finance_media_reference_invalid','merchant_media_reference_invalid','backup_capacity_invalid','ENOENT','ENOSPC','EACCES','EROFS','ETIMEDOUT'];
function summarizeLogs(deploy,operations){
  const logs=deploy+'\n'+operations,backupStages=[],deploymentStages=[],codes=[];
  for(const match of logs.matchAll(/Finance backup failed at stage ([a-z_]+);/g))if(BACKUP_STAGES.has(match[1])&&!backupStages.includes(match[1]))backupStages.push(match[1]);
  for(const match of logs.matchAll(/Finance deployment failed at stage ([a-z_]+);/g))if(DEPLOY_STAGES.has(match[1])&&!deploymentStages.includes(match[1]))deploymentStages.push(match[1]);
  for(const code of CODES)if(new RegExp('\\b'+code+'\\b').test(logs))codes.push(code);
  for(const match of logs.matchAll(/ERROR (1045|1049|1064|1142|1146|1227|2002|2003|2013)\b/g)){const code='mysql_'+match[1];if(!codes.includes(code))codes.push(code);}
  for(const [pattern,code] of [[/No such container/i,'docker_container_missing'],[/invalid reference format/i,'docker_reference_invalid'],[/command not found/i,'command_unavailable'],[/Finance retained media verification failed/,'retained_media_rejected'],[/Database proof failed/,'database_proof_rejected'],[/Media proof failed/,'media_proof_rejected'],[/Live database dump failed/,'database_dump_failed']])if(pattern.test(logs))codes.push(code);
  return {backupStages,deploymentStages,codes};
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
  const names=['capacity.json','media-mode.txt','FINANCE_MEDIA_REFERENCE.json','container-before.json','compose-sources.json','code.tar.gz','image.tar.gz','before.json','full-before.json','supplier-before.json','database.sql.gz','storage-current.json','legacy-current.json','full-current.json','restored.json','full-restored.json','SHA256SUMS','VERIFIED','WATCHDOG_FIRED','CUTOVER_READY','ROLLED_BACK','DEPLOYMENT_VERIFIED'];
  const files=Object.fromEntries(names.map(name=>[name,canonical(backup)?info(path.join(backup,name)):{exists:false}]));
  const timer=command('systemctl',['is-active','trbhh-finance-resume-'+RUN+'.timer']);
  return {runId:RUN,app,backup:{canonical:canonical(backup),files},activeDeployment:info(path.join(root,'trbhh-release-tools/ACTIVE_DEPLOYMENT')),resumeTimer:['active','inactive','failed','activating','deactivating'].includes(timer)?timer:'unknown',...summarizeLogs(read(path.join(tools,'deploy.log')),read(path.join(backup,'operations.log')))};
}
if(require.main===module||(process.argv[1]==='-'&&module.id==='[stdin]')){
  try{if(process.argv.slice(2).length)throw Error('arguments');process.stdout.write(JSON.stringify(collect())+'\n');}catch{process.stderr.write('Finance backup diagnostic unavailable; private details withheld.\n');process.exitCode=1;}
}
module.exports={summarizeLogs,collect};
