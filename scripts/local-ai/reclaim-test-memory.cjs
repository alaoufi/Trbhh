/* Stop only obsolete, independently isolated final-gate clones; never remove data. */
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
function selectGroups(containers,networks,now=Date.now()){
 const production=containers.find(c=>c.Name==='/trbhh-app');
 if(!production?.State?.Running)throw Error('production_not_identified');
 const prodNetworks=new Set(Object.keys(production.NetworkSettings?.Networks||{}));
 const protectedMounts=new Set(containers.filter(c=>!/^\/trbhh-final-(app|redis|db)-\d+$/.test(c.Name||'')).flatMap(c=>(c.Mounts||[]).map(m=>m.Source)).filter(Boolean));
 const protectedHosts=new Set();
 for(const env of production.Config?.Env||[]){
  const at=env.indexOf('=');if(at<0)continue;
  const key=env.slice(0,at),value=env.slice(at+1);
  if(/URL|HOST|ADDR/.test(key)){
   try{protectedHosts.add(new URL(value).hostname.toLowerCase());}catch{if(value)protectedHosts.add(value.toLowerCase());}
  }
 }
 const groups=new Map();
 for(const c of containers){
  const match=/^\/trbhh-final-(app|redis|db)-([0-9]+)$/.exec(c.Name||'');
  if(!match)continue;
  const run=match[2];if(!groups.has(run))groups.set(run,[]);groups.get(run).push(c);
 }
 const selected=[];
 for(const [run,members]of groups){
  const name=`trbhh-final-${run}`,network=networks.find(n=>n.Name===name);
  if(!network?.Internal||network.Labels?.['trbhh.final-gate']!==run||prodNetworks.has(name))continue;
  const ids=new Set(members.map(c=>c.Id));
  if(Object.keys(network.Containers||{}).some(id=>!ids.has(id)))continue;
  if(members.some(c=>{
   const age=now-Date.parse(c.Created);
   const attached=Object.keys(c.NetworkSettings?.Networks||{});
   const aliases=[c.Name.slice(1),...(c.NetworkSettings?.Networks?.[name]?.Aliases||[]),c.NetworkSettings?.Networks?.[name]?.IPAddress].filter(Boolean);
   return c.Config?.Labels?.['trbhh.final-gate']!==run||!Number.isFinite(age)||age<86400000
    ||attached.length!==1||attached[0]!==name
    ||Object.values(c.NetworkSettings?.Ports||{}).some(bindings=>Array.isArray(bindings)&&bindings.length>0)
    ||Object.keys(c.HostConfig?.PortBindings||{}).length>0
    ||(c.Mounts||[]).some(m=>protectedMounts.has(m.Source))
    ||aliases.some(alias=>protectedHosts.has(alias.toLowerCase()));
  }))continue;
  selected.push(...members.filter(c=>c.State?.Running).sort((a,b)=>Number(b.Name.includes('-app-'))-Number(a.Name.includes('-app-'))));
 }
 return selected;
}
module.exports={selectGroups};
if(require.main===module){
 try{
  if(process.argv[2]!=='--apply')throw Error('explicit_apply_required');
  const docker=args=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:16*1024*1024});
  const ids=docker(['ps','-aq']).trim().split(/\s+/).filter(Boolean);
  const containers=ids.length?JSON.parse(docker(['inspect',...ids])):[];
  const names=[...new Set(containers.map(c=>/^\/trbhh-final-(?:app|redis|db)-(\d+)$/.exec(c.Name||'')?.[1]).filter(Boolean))].map(run=>`trbhh-final-${run}`);
  const networks=[];
  for(const name of names){try{networks.push(...JSON.parse(docker(['network','inspect',name])));}catch{/* Unknown groups are never stopped. */}}
  const selected=selectGroups(containers,networks);
  if(!selected.length){console.log('NO_VERIFIED_OBSOLETE_TEST_CONTAINERS');process.exit(0);}
  const dir=`/root/trbhh-release-tools/local-ai-memory-${Date.now()}`;fs.mkdirSync(dir,{mode:0o700,recursive:true});
  fs.writeFileSync(`${dir}/restart.json`,JSON.stringify([...selected].sort((a,b)=>Number(a.Name.includes('-app-'))-Number(b.Name.includes('-app-'))).map(c=>({id:c.Id,name:c.Name.slice(1)})),null,2),{mode:0o600});
  console.log(`RESTART_RECORD=${dir}/restart.json`);
  for(const original of selected){
   // Reinspect immediately before each reversible stop.
   const freshContainers=JSON.parse(docker(['inspect',...ids]));
   const run=original.Config.Labels['trbhh.final-gate'];
   const freshNetworks=JSON.parse(docker(['network','inspect',`trbhh-final-${run}`]));
   if(!selectGroups(freshContainers,freshNetworks).some(c=>c.Id===original.Id&&c.Name===original.Name))throw Error('container_changed');
   docker(['stop','--time','60',original.Id]);console.log(`STOPPED_TEST=${original.Name.slice(1)}`);
  }
  if(JSON.parse(docker(['inspect','trbhh-app']))[0]?.State?.Running!==true)throw Error('production_not_running');
  console.log('TEST_MEMORY_RECLAIM_COMPLETE');
 }catch{console.error('Memory reclaim halted. No containers or volumes were deleted; inspect saved restart record if present.');process.exitCode=1;}
}
