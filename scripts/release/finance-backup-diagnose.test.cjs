'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const helper=()=>require('./finance-backup-diagnose.cjs');
test('private log summaries expose only enumerated stages and diagnostic codes',()=>{
  const report=helper().summarizeLogs('Finance backup failed at stage snapshot; no release verification was issued.\nFinance deployment failed at stage backup; rollbackHealthy=false. Database was not restored.\nmysql://private:secret@private-host/db\nError: unknown-secret-value','Error: compose_source\nERROR 1045 (28000): private-password\nENOSPC\n');
  assert.deepEqual(report.backupStages,['snapshot']);assert.deepEqual(report.deploymentStages,['backup']);assert(report.codes.includes('compose_source'));assert(report.codes.includes('mysql_1045'));assert(report.codes.includes('ENOSPC'));
  assert.doesNotMatch(JSON.stringify(report),/secret|private|mysql:\/\//);
});
test('fixed-run diagnostic reads app state and safe file presence without emitting configuration',()=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'finance-backup-diag-'))),backup=path.join(root,'trbhh-release-backups/finance-35932588551'),tools=path.join(root,'trbhh-release-tools/35932588551');
  fs.mkdirSync(backup,{recursive:true});fs.mkdirSync(tools,{recursive:true});fs.mkdirSync(path.join(root,'trbhh'));
  const image='sha256:'+'b'.repeat(64),sha='a'.repeat(40),id='c'.repeat(64),calls=[];
  try{
    fs.writeFileSync(path.join(backup,'commit.txt'),sha);fs.writeFileSync(path.join(backup,'image-id.txt'),image);fs.writeFileSync(path.join(backup,'operations.log'),'Error: compose_source\nDO_NOT_EXPOSE_PASSWORD');
    fs.writeFileSync(path.join(tools,'deploy.log'),'Finance backup failed at stage parent_media; no release verification was issued.');
    const container={Id:id,Image:image,State:{Running:true,Paused:false,StartedAt:'2026-09-23T00:00:00Z'},Config:{Env:['AUTH_SECRET=DO_NOT_EXPOSE_PASSWORD'],Labels:{'com.docker.compose.project.config_files':'/secret/place/DO_NOT_EXPOSE_PASSWORD.yml'}}};
    const run=(command,args)=>{calls.push([command,args]);if(command==='git')return {status:0,stdout:sha};if(command==='df')return {status:0,stdout:'size used avail\n200000 100000 100000\n'};if(command==='systemctl')return {status:3,stdout:'inactive'};if(args[0]==='compose')return {status:0,stdout:id};if(args[0]==='inspect')return {status:0,stdout:JSON.stringify([container])};throw Error('unexpected_command');};
    const report=helper().collect({root,run});assert.equal(report.app.running,true);assert.equal(report.app.paused,false);assert.equal(report.app.imageMatchesBackup,true);assert.equal(report.backup.files.VERIFIED.exists,false);assert.equal(report.backup.files['WATCHDOG_FIRED'].exists,false);assert.equal(report.activeDeployment.exists,false);
    assert.doesNotMatch(JSON.stringify(report),/DO_NOT_EXPOSE|AUTH_SECRET|\/secret\/place/);assert.equal(report.liveSpace.availableBytes,'100000');assert(calls.every(([command])=>['git','docker','systemctl','df'].includes(command)));assert(!calls.some(([,args])=>args.some(a=>['stop','start','restart','unpause','up','down','exec','prune','rm'].includes(a))));
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
});
