'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const helper=()=>require('./finance-backup-diagnose.cjs');
test('private log summaries expose only enumerated stages and diagnostic codes',()=>{
  const report=helper().summarizeLogs('Finance backup failed at stage snapshot; no release verification was issued.\nFinance deployment failed at stage backup; rollbackHealthy=false. Database was not restored.\nmysql://private:secret@private-host/db\nError: unknown-secret-value','Error: compose_source\nERROR 1045 (28000): private-password\nENOSPC\n');
  assert.deepEqual(report.backupStages,['snapshot']);assert.deepEqual(report.deploymentStages,['backup']);assert(report.codes.includes('compose_source'));assert(report.codes.includes('mysql_1045'));assert(report.codes.includes('ENOSPC'));
  assert.doesNotMatch(JSON.stringify(report),/secret|private|mysql:\/\//);
});
test('fixed-run diagnostic reads app state and safe file presence without emitting configuration',()=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'finance-backup-diag-'))),backup=path.join(root,'trbhh-release-backups/finance-35934769547'),tools=path.join(root,'trbhh-release-tools/35934769547');
  fs.mkdirSync(backup,{recursive:true});fs.mkdirSync(tools,{recursive:true});fs.mkdirSync(path.join(root,'trbhh'));
  const image='sha256:'+'b'.repeat(64),sha='a'.repeat(40),id='c'.repeat(64),calls=[];
  try{
    fs.writeFileSync(path.join(backup,'commit.txt'),sha);fs.writeFileSync(path.join(backup,'image-id.txt'),image);fs.writeFileSync(path.join(backup,'operations.log'),'Error: compose_source\nDO_NOT_EXPOSE_PASSWORD');
    fs.writeFileSync(path.join(tools,'deploy.log'),'Finance backup failed at stage parent_media; no release verification was issued.');
    const container={Id:id,Image:image,Mounts:[],State:{Running:true,Paused:false,StartedAt:'2026-09-23T00:00:00Z'},Config:{Env:['AUTH_SECRET=DO_NOT_EXPOSE_PASSWORD'],Labels:{'com.docker.compose.project.config_files':'/secret/place/DO_NOT_EXPOSE_PASSWORD.yml'}}};
    fs.writeFileSync(path.join(backup,'container-before.json'),JSON.stringify([container]));
    fs.writeFileSync(path.join(backup,'baseline-compose.json'),JSON.stringify({services:{app:{environment:{AUTH_SECRET:'DO_NOT_EXPOSE_PASSWORD'},volumes:[]}}}));
    const source=path.join(root,'trbhh/docker-compose.yml');fs.writeFileSync(source,'DO_NOT_EXPOSE_PASSWORD');fs.writeFileSync(path.join(backup,'compose-source-0.yml'),'DO_NOT_EXPOSE_PASSWORD');
    fs.writeFileSync(path.join(backup,'compose-sources.json'),JSON.stringify({project:'trbhh',sourceFiles:[{source,saved:'compose-source-0.yml'}]}));
    const run=(command,args)=>{calls.push([command,args]);if(command==='git')return {status:0,stdout:sha};if(command==='df')return {status:0,stdout:'size used avail\n200000 100000 100000\n'};if(command==='systemctl')return {status:3,stdout:'inactive'};if(args[0]==='compose')return {status:0,stdout:id};if(args[0]==='inspect')return {status:0,stdout:JSON.stringify([container])};throw Error('unexpected_command');};
    const report=helper().collect({root,run});assert.equal(report.app.running,true);assert.equal(report.app.paused,false);assert.equal(report.app.imageMatchesBackup,true);assert.equal(report.backup.files.VERIFIED.exists,false);assert.equal(report.backup.files['WATCHDOG_FIRED'].exists,false);assert.equal(report.activeDeployment.exists,false);
    assert.equal(report.runId,'35934769547');assert.equal(report.app.environmentMatchesBackup,true);assert.equal(report.app.mountsMatchBackup,true);assert.equal(report.app.containerMatchesBackup,true);assert.equal(report.app.startedAtMatchesBackup,true);assert.deepEqual(report.runtimeConfig.environment.differences,[]);assert.equal(report.composeSources.sourceCount,1);assert.equal(report.composeSources.sources[0].bytesEqual,true);
    assert.doesNotMatch(JSON.stringify(report),/DO_NOT_EXPOSE|AUTH_SECRET|\/secret\/place/);assert.equal(report.liveSpace.availableBytes,'100000');assert(calls.every(([command])=>['git','docker','systemctl','df'].includes(command)));assert(!calls.some(([,args])=>args.some(a=>['stop','start','restart','unpause','up','down','exec','prune','rm'].includes(a))));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('runtime preflight differences reveal only key names and presence/empty/equality flags',()=>{
  const before={Config:{Env:['MATCH=hidden-match','CHANGED=hidden-old','EMPTY=','RUNTIME_ONLY=hidden-runtime']},Mounts:[{Type:'bind',Source:'/hidden/source',Destination:'/app/storage',RW:true}]};
  const config={services:{app:{environment:{MATCH:'hidden-match',CHANGED:'hidden-new',EMPTY:'',ADDED:'hidden-added',NULL_VALUE:null,'hidden-unsafe-key':'hidden-bad'},volumes:[{type:'bind',source:'/hidden/other',target:'/app/storage'}]}}};
  const result=helper().summarizeRuntimeConfig(before,config);
  assert.deepEqual(result.environment.differences.map(row=>row.key),['CHANGED','ADDED','NULL_VALUE']);assert.equal(result.environment.suppressedKeys,1);
  assert.equal(result.environment.differences[0].runtimePresent,true);assert.equal(result.environment.differences[0].equal,false);assert.equal(result.environment.differences[1].runtimePresent,false);assert.equal(result.environment.differences[2].composeString,false);assert.equal(result.mounts.equal,false);
  assert.doesNotMatch(JSON.stringify(result),/hidden|\/app\/|source|target/);
  const empty=helper().summarizeRuntimeConfig(before,{services:{app:{environment:{EMPTY:''},volumes:[]}}});assert.deepEqual(empty.environment.differences,[]);
  assert.equal(helper().summarizeRuntimeConfig(before,{services:{app:{}}}).code,'rollback_config');
});

test('compose error classification recognizes actual bounded exceptions rather than echoed code text',()=>{
  for(const code of ['rollback_compose','rollback_config','unapplied_environment_drift','unapplied_mount_drift']){
    assert.equal(helper().summarizeLogs('private source throw Error(\''+code+'\')','').composeFailureClass,null);
    assert.equal(helper().summarizeLogs('Error: '+code+'\nprivate-token','').composeFailureClass,code);
  }
  assert.equal(helper().summarizeLogs('AssertionError [ERR_ASSERTION]: unapplied_mount_drift\nprivate-source','').composeFailureClass,'unapplied_mount_drift');
});

test('single-key fallback redacts values and reports literal/escaping relationships only',()=>{
  const raw="ALRAJHI_TRANPORTAL_PASSWORD='PRIVATE_SENTINEL$token'\nOTHER_SECRET=NEVER_DISPLAY\n";
  const result=helper().selectedKeyProof(raw,raw,'PRIVATE_SENTINEL$token','PRIVATE_SENTINEL$$token','INHERITED_SENTINEL');
  assert.equal(result.occurrences,1);assert.equal(result.quoteClass,'single');assert.equal(result.containsDollar,true);assert.equal(result.containsBackslash,false);assert.equal(result.literalEqualsRuntime,true);assert.equal(result.literalDollarDoubledEqualsConfig,true);assert.equal(result.runtimeDollarDoubledEqualsConfig,true);assert.equal(result.inheritedPresent,true);assert.equal(result.inheritedEqualsRuntime,false);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_SENTINEL|token|NEVER_DISPLAY|INHERITED_SENTINEL|length|bytes/);
  const duplicate=helper().selectedKeyProof(raw+raw,raw,'a','b',undefined);assert.equal(duplicate.occurrences,2);assert.equal(duplicate.literalAvailable,false);assert.equal(duplicate.quoteClass,'ambiguous');
});

test('exact dollar-encoding diagnosis uses synthetic stdin config without reading any env file',()=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'finance-dollar-diag-'))),backup=path.join(root,'trbhh-release-backups/finance-35934769547'),prod=path.join(root,'trbhh');
  fs.mkdirSync(backup,{recursive:true});fs.mkdirSync(prod);const id='c'.repeat(64),sha='a'.repeat(40),image='sha256:'+'b'.repeat(64),calls=[];
  try{
    const before={Id:id,Image:image,State:{Running:true,Paused:false,StartedAt:'2026-09-23T00:00:00Z'},Mounts:[],Config:{Env:['ALRAJHI_TRANPORTAL_PASSWORD=PRIVATE_SENTINEL$token']}};
    fs.writeFileSync(path.join(backup,'container-before.json'),JSON.stringify([before]));fs.writeFileSync(path.join(backup,'baseline-compose.json'),JSON.stringify({services:{app:{environment:{ALRAJHI_TRANPORTAL_PASSWORD:'PRIVATE_SENTINEL$$token'},volumes:[]}}}));
    const run=(command,args,options)=>{
      calls.push([command,args]);if(command==='git')return {status:0,stdout:sha};if(command==='systemctl')return {status:3,stdout:'inactive'};if(command==='df')return {status:0,stdout:'size used avail\n200 100 100'};
      if(args[0]==='inspect')return {status:0,stdout:JSON.stringify([before])};if(args.includes('ps'))return {status:0,stdout:id};
      assert.deepEqual(args,['compose','--project-directory',prod,'--project-name','trbhh-diagnostic','--env-file','/dev/null','-f','-','config','--format','json']);assert.equal(options.env.TRBHH_DIAGNOSTIC_LITERAL,'diagnostic$dollar');assert(!Object.hasOwn(options.env,'ALRAJHI_TRANPORTAL_PASSWORD'));assert.equal(JSON.parse(options.input).services.probe.environment.PROBE,'${TRBHH_DIAGNOSTIC_LITERAL}');
      return {status:0,stdout:JSON.stringify({services:{probe:{environment:{PROBE:'diagnostic$$dollar',PLAIN:'diagnostic-plain'}}}})};
    };
    const report=helper().collect({root,run});assert.equal(report.singleKey.renderedDollarEncoding,true);assert.deepEqual(report.singleKey.syntheticConfig,{success:true,dollarsDoubled:true,plainUnchanged:true});assert.deepEqual(report.singleKey.isolatedConfig,{attempted:false,reason:'representation_match'});
    assert.equal(calls.filter(([,args])=>args.includes('config')).length,1);assert.doesNotMatch(JSON.stringify(report),/PRIVATE_SENTINEL|token|diagnostic\$|length/);assert(!fs.existsSync(path.join(prod,'.env')));assert(!fs.existsSync(path.join(backup,'environment.env')));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('media differences expose counts and byte totals only with both-direction semantics',()=>{
  const file=(name,bytes,digest)=>({path:name,kind:'file',bytes,sha256:digest.repeat(64)}),manifest=entries=>({format:'trbhh-media-proof-v1',entryCount:entries.length,entries});
  const before=manifest([file('secret-removed.jpg',3,'a'),file('secret-changed.jpg',4,'b'),{path:'private-link',kind:'symlink',target:'secret-target'}]);
  const current=manifest([file('secret-new.jpg',5,'c'),file('secret-changed.jpg',4,'d'),{path:'private-link',kind:'symlink',target:'other-secret'}]);
  const report=helper().summarizeMedia(before,current);assert.deepEqual(report.comparison,{compared:3,removed:1,changed:2,added:1,exact:false});assert.equal(report.current.fileBytes,9);assert.equal(report.current.capacityEntries,4);assert.doesNotMatch(JSON.stringify(report),/secret|private|jpg|sha256|target/);
  assert.equal(helper().summarizeMedia(before,before).comparison.exact,true);assert.equal(helper().summarizeMedia(before,null).current,null);
});
test('diagnostic workflow is explicit and leaves cache and deploy operations separate',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../../.github/workflows/finance-release.yml'),'utf8');assert.match(source,/options: \[inspect, diagnose-backup, cache-audit, cache-cleanup\]/);assert.match(source,/PHASE" == diagnose-backup/);assert.match(source,/finance-backup-diagnose.cjs/);
  assert.match(source,/finance-runtime-diagnose-20260924' && inputs.phase == 'diagnose-backup'/);
});
