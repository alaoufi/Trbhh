'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const file=path.join(__dirname,'finance-cache.sh'),read=()=>fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash',sha='a'.repeat(40);
test('cache operations reject ambiguous arguments before any external command',()=>{
  assert(fs.existsSync(file));assert.equal(spawnSync(bash,['-n',file],{encoding:'utf8'}).status,0);
  for(const args of [[],['cache-audit','1'],['cleanup','1',sha],['cache-cleanup','0',sha],['cache-audit','../1',sha],['cache-cleanup','1',sha.toUpperCase()],['cache-cleanup','1',sha,'extra']]){
    const r=spawnSync(bash,[file,...args],{encoding:'utf8',env:{...process.env,PATH:'/no-external-commands'}});assert.equal(r.status,2,r.stderr);assert.equal(r.stdout,'');assert.match(r.stderr,/Finance cache arguments rejected/);
  }
});
test('runtime proof rejects a changed image, environment, mount, restart, paused app or wrong baseline',()=>{
  const match=read().match(/(\/\/ CACHE_RUNTIME_BEGIN\n[\s\S]*?\/\/ CACHE_RUNTIME_END)/);assert(match);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'finance-cache-runtime-'));
  const original={Id:'c'.repeat(64),Image:'sha256:'+'b'.repeat(64),Config:{Env:['SUPPLIER_ALLOW_LIVE_ORDERS=false','AUTH_SECRET=private-sentinel'],Labels:{'com.docker.compose.service':'app','com.docker.compose.project.working_dir':'/root/trbhh'}},Mounts:[{Source:'/media',Destination:'/app/legacy',RW:false}],State:{Running:true,Paused:false,StartedAt:'2026-09-23T00:00:00Z'}};
  const run=(value,baseline=sha,reference='')=>{const input=path.join(dir,'container.json');fs.writeFileSync(input,JSON.stringify([value]));return spawnSync(process.execPath,['-',input,baseline,sha,reference],{input:match[1],encoding:'utf8'});};
  try{
    const first=run(original);assert.equal(first.status,0,first.stderr);assert.doesNotMatch(first.stdout,/private-sentinel|AUTH_SECRET|\/media/);
    const before=path.join(dir,'before.json');fs.writeFileSync(before,first.stdout);assert.equal(run(original,sha,before).status,0);
    for(const alter of [v=>v.Image='sha256:'+'d'.repeat(64),v=>v.Config.Env[1]='AUTH_SECRET=changed',v=>v.Mounts[0].Source='/changed',v=>v.State.StartedAt='later',v=>v.State.Paused=true,v=>v.State.Running=false]){const copy=structuredClone(original);alter(copy);assert.notEqual(run(copy,sha,before).status,0);}
    assert.notEqual(run(original,'f'.repeat(40),before).status,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('all complete Node heredocs parse, including the actual embedded markers',()=>{
  const {Script}=require('node:vm'),blocks=[...read().matchAll(/<<'NODE'(?: \|\| return 1)?\n([\s\S]*?)\nNODE/g)];
  assert.equal(blocks.length,3);for(const block of blocks)assert.doesNotThrow(()=>new Script(block[1]));
});
test('inventory publishes numeric totals and fingerprints without leaking raw cache descriptions',()=>{
  const match=read().match(/(\/\/ CACHE_INVENTORY_BEGIN\n[\s\S]*?\/\/ CACHE_INVENTORY_END)/);assert(match);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'finance-cache-inventory-'));
  try{
    fs.writeFileSync(path.join(dir,'before-df.txt'),'1B-blocks Used Avail\n200000 150000 50000\n200000 150000 50000\n');
    const rows=['Images','Containers','Local Volumes','Build Cache'].map(Type=>({Type,TotalCount:5,Active:2,Size:'12.5GB',Reclaimable:'6GB (48%)',privateDescription:'never-print-sentinel'}));
    fs.writeFileSync(path.join(dir,'before-docker.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n'));
    fs.writeFileSync(path.join(dir,'before-docker-verbose.txt'),'Build cache private context never-print-sentinel');
    const run=()=>spawnSync(process.execPath,['-',dir,'before'],{input:match[1],encoding:'utf8'});
    const result=run();assert.equal(result.status,0,result.stderr);assert.doesNotMatch(result.stdout,/never-print|private|Build cache/);
    const report=JSON.parse(result.stdout);assert.equal(report.filesystems[0].freeBytes,50000);assert.equal(report.docker[3].type,'buildCache');assert.equal(report.docker[3].reclaimableBytes,6000000000);assert.equal(report.docker[0].sizeBytes,12500000000);assert.match(report.inventorySha256,/^[a-f0-9]{64}$/);
    rows[3].Size='unrecognized';fs.writeFileSync(path.join(dir,'before-docker.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n'));assert.notEqual(run().status,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('audit invokes no cleanup and explicit cleanup calls only the isolated builder-cache operation',()=>{
  const match=read().match(/# CACHE_ACTION_BEGIN\n([\s\S]*?)# CACHE_ACTION_END/);assert(match);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'finance-cache-action-'));
  try{
    for(const mode of ['cache-audit','cache-cleanup']){
      const result=spawnSync(bash,['-c',`set -euo pipefail\nexec 3>&1\nmode=$1; private=$2\ntimeout(){ printf '%s\\n' "$*" >&3; }\n${match[1]}`,'test',mode,dir.replaceAll('\\','/')],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
      assert.equal(result.stdout,mode==='cache-audit'?'':'600s docker builder prune --all --force\n');
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('failed cache cleanup still checks live state and never reports success',()=>{
  const match=read().match(/# CACHE_FINISH_BEGIN\n([\s\S]*?)# CACHE_FINISH_END/);assert(match);
  for(const proofFails of [false,true]){
    const r=spawnSync(bash,['-c',`exec 3>&1 4>&2\narmed=1; stage=builder_cache; mode=cache-cleanup; run_id=123\nverify_unchanged(){ echo runtime_checked >&3; return ${proofFails?1:0}; }\ncollect_inventory(){ echo inventory_checked >&3; }\npublish_report(){ echo SHOULD_NOT_REPORT >&3; }\n${match[1]}\ntrap finish EXIT\nexit 17`],{encoding:'utf8'});
    assert.notEqual(r.status,0);assert.match(r.stdout,/runtime_checked/);assert.match(r.stdout,/inventory_checked/);assert.doesNotMatch(r.stdout,/SHOULD_NOT_REPORT|CACHE_OPERATION_VERIFIED/);assert.match(r.stderr,/Finance cache operation failed/);
  }
});
test('cleanup is explicit, bounded to builder cache and isolated from deploy',()=>{
  const source=read();assert.match(source,/exec 9> \/run\/lock\/trbhh-finance-deploy.lock/);assert.match(source,/ACTIVE_DEPLOYMENT/);
  assert.match(source,/if \[\[ "\$mode" == cache-cleanup \]\]; then[\s\S]*?timeout 600s docker builder prune --all --force >/);
  assert.doesNotMatch(source,/docker (?:system|image|container|volume|network) prune|docker (?:rm|rmi)|\brm\s|compose (?:up|down|restart|stop)|git (?:reset|switch|checkout)|finance-backup.sh/);
  const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/finance-release.yml'),'utf8');assert.match(workflow,/options: \[inspect, diagnose-backup, cache-audit, cache-cleanup\]/);assert.match(workflow,/group: vps-deploy/);assert.match(workflow,/baseline_sha/);assert.match(workflow,/finance-cache.test.cjs/);
});
