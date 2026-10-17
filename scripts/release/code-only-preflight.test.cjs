const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {mountsMatch}=require('./code-only-compose.cjs');
const before={Config:{Env:['CJ_API_KEY=account-A','SUPPLIER_TOKEN_ENCRYPTION_KEY=key-A']},Mounts:[{Type:'volume',Name:'project_storage',Source:'/var/lib/docker/volumes/project_storage/_data',Destination:'/app/storage',RW:true},{Type:'bind',Source:'/root/media',Destination:'/app/legacy',RW:false}]};
function config(){return {services:{app:{volumes:[{type:'volume',source:'storage',target:'/app/storage',volume:{}},{type:'bind',source:'/root/media',target:'/app/legacy',read_only:true,bind:{create_host_path:true}}]}},volumes:{storage:{name:'project_storage'}}};}
test('matches resolved Compose named volumes and bind mounts against active inspect',()=>assert.equal(mountsMatch(config(),before),true));
test('rejects source, destination, permissions, missing, extra and unresolved mounts',()=>{
 for(const mutate of [c=>c.volumes.storage.name='other_storage',c=>c.services.app.volumes[1].source='/root/other',c=>c.services.app.volumes[0].target='/other',c=>c.services.app.volumes[1].read_only=false,c=>c.services.app.volumes.pop(),c=>c.services.app.volumes.push({type:'bind',source:'/extra',target:'/extra'}),c=>delete c.volumes.storage.name]){const c=config();mutate(c);assert.equal(mountsMatch(c,before),false);}
});
function run(after,mode,original=before){let exit=0;const messages=[];try{vm.runInNewContext(fs.readFileSync(__dirname+'/verify-runtime.cjs','utf8'),{require:name=>name==='node:fs'?{readFileSync:p=>JSON.stringify([p==='before'?original:after])}:require(name),process:{argv:['node','script','before','after',mode],exit:n=>{exit=n;throw Error('exit')}},console:{error:v=>messages.push(v),info:v=>messages.push(v)}});}catch(e){if(e.message!=='exit')throw e;}return {exit,messages:messages.join('\n')};}
test('rejects credential or arbitrary environment drift without printing values',()=>{for(const value of ['CJ_API_KEY=private-changed-account','SUPPLIER_TOKEN_ENCRYPTION_KEY=private-changed-key','NEW_PAYMENT_GATE=true']){const after=structuredClone(before),key=value.split('=')[0];after.Config.Env=after.Config.Env.filter(v=>!v.startsWith(key+'=')).concat(value);const result=run(after);assert.equal(result.exit,1);assert.doesNotMatch(result.messages,/private-changed/);}});
test('preserves exact unchanged environment',()=>assert.equal(run(before).exit,0));
test('retains explicit Salla provisioning exception while blocking unrelated changes and existing key rotation',()=>{
 const provisioned=structuredClone(before);provisioned.Config.Env.push(...Object.entries({SALLA_CLIENT_ID:'client',SALLA_CLIENT_SECRET:'secret',SALLA_WEBHOOK_SECRET:'webhook',SUPPLIER_RECONCILE_SECRET:'reconcile',SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa',SUPPLIER_ALLOW_LIVE_ORDERS:'false'}).map(([k,v])=>k+'='+v));
 assert.equal(run(provisioned,'salla').exit,0);
 const unrelated=structuredClone(provisioned);unrelated.Config.Env.push('NEW_PAYMENT_GATE=true');assert.equal(run(unrelated,'salla').exit,1);
 const rotated=structuredClone(provisioned);rotated.Config.Env=rotated.Config.Env.map(v=>v.startsWith('SUPPLIER_TOKEN_ENCRYPTION_KEY=')?'SUPPLIER_TOKEN_ENCRYPTION_KEY=rotated':v);assert.equal(run(rotated,'salla').exit,1);
});
test('manual deployment checks both resolved configurations before switching the active checkout',()=>{
 const source=fs.readFileSync(__dirname+'/manual-arabic-app-deploy.sh','utf8');
 assert.match(source,/for\(const file of \[process\.argv\[3\],process\.argv\[5\]\]\)/);
 assert.match(source,/runtimeMatches\(config,before\)&&mountsMatch\(config,before\)/);
 assert.ok(source.indexOf('mountsMatch(config,before)')<source.indexOf('switched=1'));
 assert.ok(source.includes('"$target/resolved-rollback.json"'));
});
