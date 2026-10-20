const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const deploy=fs.readFileSync('scripts/release/manual-arabic-app-deploy.sh','utf8'),timer=fs.readFileSync('scripts/release/install-cj-arabic-worker-timer.sh','utf8');
test('code only deploy requires candidate, pins live baseline, and preserves runtime and store state',()=>{
 for(const guard of ['candidate=${2:-}','CANDIDATE_REQUIRED','baseline=eae014e9e9fdce06396a0aabf93d8f86a9b163a7','trbhh-finance-deploy.lock','ACTIVE_DEPLOYMENT','runtimeMatches(config,before)','verify-runtime.cjs','ROLLBACK_RUNTIME_VERIFIED','SHOP_PRODUCT_FINGERPRINT_AND_FLAGS_PRESERVED','sha256sum .env'])assert.ok(deploy.includes(guard),guard);
 assert.ok(deploy.includes('SELECT * FROM commerce_products WHERE id>? ORDER BY id LIMIT 100'));assert.ok(deploy.includes('productSha256'));assert.ok(deploy.includes('cj_storefront_public'));assert.ok(deploy.includes('commerce_gateway_enabled'));assert.ok(deploy.includes('verified_direct_sale_enabled'));assert.ok(deploy.includes('commerce_enabled'));
 assert.doesNotMatch(deploy,/ollama|embedding|\$executeRaw|site_settings\.(update|upsert)|docker\s+(volume\s+rm|system\s+prune)/);
 assert.ok(deploy.includes('--no-build --pull never --no-deps --force-recreate app'));
 assert.ok(deploy.includes('"$target/manual-arabic-app-deploy.sh" --run "$candidate" "$target" "$reference"'));
});
test('timer preserves old units and performs one private authenticated job without printing credentials',()=>{
 for(const guard of ['cp -p -- "$path" "$backup/$i"','PREVIOUS_CONFIGURATION_RESTORED','OnUnitInactiveSec=60s','Type=oneshot','flock -n 9 || exit 0','58s nice -n 15 node -','AbortSignal.timeout(55000)','process.env.SUPPLIER_RECONCILE_SECRET','http://127.0.0.1:3000/api/internal/cj/translate','completed>1'])assert.ok(timer.includes(guard),guard);
 assert.doesNotMatch(timer,/console\.(log|error)\([^\n]*(?:secret|headers)|curl|wget|site_settings\.(update|upsert)|\$executeRaw|ollama\s+pull/);
 assert.ok(timer.includes('FLAGS_UNCHANGED=1'));
});
test('new deployment scripts and embedded Node parse before any manual SSH execution',()=>{
 const shell=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
 for(const [path,text] of [['scripts/release/manual-arabic-app-deploy.sh',deploy],['scripts/release/install-cj-arabic-worker-timer.sh',timer]]){
  const result=spawnSync(shell,['-n',path],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  for(const [,source] of text.matchAll(/<<'NODE'(?:[^\n]*)\n([\s\S]*?)\nNODE/g)){const check=spawnSync(process.execPath,['--check'],{input:source,encoding:'utf8'});assert.equal(check.status,0,check.stderr);}
 }
});
test('timer runner sends only one authenticated POST and reports bounded safe output',()=>{
 const snippet=[...timer.matchAll(/<<'NODE'(?:[^\n]*)\n([\s\S]*?)\nNODE/g)][0][1];
 const prelude=`const assert=require('node:assert/strict');process.env.SUPPLIER_RECONCILE_SECRET='private-test-secret-'.repeat(3);let calls=0;globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'http://127.0.0.1:3000/api/internal/cj/translate');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.headers.authorization,'Bearer '+process.env.SUPPLIER_RECONCILE_SECRET);return Response.json({ok:true,worker:{completed:1,status:'completed'}});};process.on('exit',()=>assert.equal(calls,1));\n`;
 const result=spawnSync(process.execPath,['-'],{input:prelude+snippet,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.ok(result.stdout.includes('CJ_ARABIC_WORKER_TICK'));assert.ok(!result.stdout.includes('private-test-secret'));
 const invalid=spawnSync(process.execPath,['-'],{input:prelude.replace('completed:1','completed:2')+snippet,encoding:'utf8'});assert.notEqual(invalid.status,0);assert.ok(!invalid.stderr.includes('private-test-secret'));
});

test('product snapshot hashes full rows and detects same-count content changes without disclosing contents',()=>{
 const snippet=[...deploy.matchAll(/<<'NODE'(?:[^\n]*)\n([\s\S]*?)\nNODE/g)].map(x=>x[1]).find(x=>x.includes('SHOP_STATE_READ_FAILED'));
 assert.ok(snippet);
 function snapshot(title){
  const prelude=`const Module=require('node:module'),original=Module._load;Module._load=function(name,...args){if(name==='@prisma/client')return {PrismaClient:class{async $queryRawUnsafe(sql,after){if(sql.includes('site_settings'))return [{k:'cj_storefront_public',v:'0'}];return after===0n?[{id:1n,title:`+JSON.stringify(title)+`,stock_available:10,price_minor:3500,created_at:new Date('2026-01-01T00:00:00Z')}]:[];}async $disconnect(){}}};return original.call(this,name,...args);};\n`;
  const result=spawnSync(process.execPath,['-'],{input:prelude+snippet,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.ok(!result.stdout.includes(title));return JSON.parse(result.stdout);
 }
 const before=snapshot('private original product title'),same=snapshot('private original product title'),changed=snapshot('private changed product title');
 assert.deepEqual(before,same);assert.equal(before.products,changed.products);assert.notEqual(before.productSha256,changed.productSha256);assert.match(before.productSha256,/^[a-f0-9]{64}$/);
});
