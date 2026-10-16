const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const text=fs.readFileSync('scripts/release/manual-semantic-search-deploy.sh','utf8');
const at=fragment=>{const offset=text.indexOf(fragment);assert.ok(offset>=0,'missing guard: '+fragment);return offset;};

test('pinned automatic refresh discovers eligible products after an empty index and removes newly ineligible products',async()=>{
 const candidate=text.match(/candidate=([a-f0-9]{40})/)[1];
 const load=(file,globals={})=>{
  const result=spawnSync('git',['show',candidate+':'+file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const unit={exports:{},id:'unit'};new Function('module','require','globalThis',result.stdout)(unit,require,globals);return unit.exports;
 };
 const core=load('scripts/local-ai/semantic-core.cjs'),select=load('scripts/local-ai/public-product-select.cjs');
 const {buildIndex}=load('scripts/local-ai/build-product-index.cjs',{__trbhhSemanticCore:core,__trbhhPublicProductSelect:select});
 assert.match(select,/cp.approved=1 AND cp.visible=1 AND cp.enabled=1/);assert.match(select,/cp.stock_available>cp.stock_reserved/);
 let eligible=[],calls=0;
 const query=async(sql,after)=>{assert.equal(sql,select+' AND cp.id>? ORDER BY cp.id LIMIT ?');return after==='0'?eligible:[];};
 const embed=async texts=>{calls++;return texts.map(()=>Array(768).fill(.1));};
 const empty=await buildIndex({query,embed});assert.equal(empty.docs.length,0);assert.equal(calls,0);
 eligible=[{id:1n,title:'Approved available product'}];
 const populated=await buildIndex({query,embed,prior:core.validateIndex(empty)});assert.equal(populated.docs.length,1);assert.equal(calls,1);
 const reused=await buildIndex({query,embed,prior:core.validateIndex(populated)});assert.equal(calls,1);assert.deepEqual(reused.docs,populated.docs);
 eligible=[];const withdrawn=await buildIndex({query,embed,prior:core.validateIndex(populated)});assert.equal(withdrawn.docs.length,0);
 const timer=spawnSync('git',['show',candidate+':scripts/local-ai/install-search-refresh.sh'],{encoding:'utf8'});assert.equal(timer.status,0);
 assert.match(timer.stdout,/OnUnitInactiveSec=15min/);assert.match(timer.stdout,/node - --refresh/);assert.match(timer.stdout,/trbhh-semantic-index.lock/);
});
test('worker is pinned, isolated and serialized before provisioning or cutover',()=>{
 assert.match(text,/candidate=(?:CANDIDATE_PENDING|[a-f0-9]{40})\n/);
 assert.match(text,/baseline=35ac47b1c0b8768a65a14ca8388e2f4febc53c99/);
 assert.match(text,/branch=codex\/admin-navigation-complete-20261014/);
 for(const guard of ['CANDIDATE_NOT_PINNED','semantic-search-deploy-$run_id','trbhh-finance-deploy.lock','ACTIVE_DEPLOYMENT','trbhh-local-ai-update.lock','trbhh-semantic-index.lock'])at(guard);
 assert.ok(at('flock -n 7')<at('up -d --no-deps --pull never embedding'));
 assert.ok(at('git merge-base --is-ancestor')<at('EXISTING_QWEN_RUNTIME_REQUIRED'));
 assert.doesNotMatch(text,/install-runtime\.sh" --provision-only/);
 assert.match(text,/available_kib >= 12\*1024\*1024/);assert.match(text,/free_kib >= 16\*1024\*1024/);
 assert.match(text,/git diff --quiet "\$baseline" "\$candidate" -- Dockerfile docker-compose.yml/);
});

test('visitor deployment never loads, promotes, verifies or schedules the unrelated Qwen model',()=>{
 for(const guard of ['EXISTING_QWEN_RUNTIME_REQUIRED','{{.State.Running}}','{{.Image}}','4000000000','10737418240','QWEN=UNVERIFIED'])at(guard);
 assert.doesNotMatch(text,/run-model\.sh|update-model\.sh|install-runtime\.sh|trbhh-local-ai-update\.timer|trbhh-local-ai-update\.service/);
 assert.ok(at('exec 8>/run/lock/trbhh-local-ai-update.lock')<at('https://registry.ollama.ai/v2/library/embeddinggemma/manifests/300m'));
 const snippet=[...text.matchAll(/<<'NODE'(?:[^\n]*)\n([\s\S]*?)\nNODE/g)].map(x=>x[1]).find(x=>x.includes("j.models.some(x=>x.name==='trbhh-local:active')"));assert.ok(snippet);
 const run=(models,status=200)=>spawnSync(process.execPath,['-'],{input:`globalThis.fetch=async(url,options)=>{require('node:assert/strict').equal(url,'http://ollama:11434/api/tags');require('node:assert/strict').equal(options.redirect,'error');return Response.json({models:${JSON.stringify(models)}},{status:${status}});};\n`+snippet,encoding:'utf8',timeout:3000});
 assert.equal(run([{name:'trbhh-local:active'}]).status,0);assert.equal(run([{name:'qwen3.5:9b'}]).status,2);assert.equal(run(null).status,1);assert.equal(run([],500).status,1);
});
test('dedicated model copy verifies ownership, immutable manifest and every blob hash',()=>{
 at('--max-filesize 65536');at('https://registry.ollama.ai/v2/library/embeddinggemma/manifests/300m');
 assert.doesNotMatch(text,/docker cp "trbhh-ollama:\$model_dir\/\$manifest"/);
 at('docker cp "$target/manifest.json" "trbhh-embedding:$model_dir/$manifest"');
 assert.ok(at('com.docker.compose.project"}}\' trbhh-embedding')<at('up -d --no-deps --pull never embedding'));
 for(const limit of ['2000000000','2147483648','size<=800*1024*1024','bytes.length<=65536','layers.length<=32'])at(limit);
 assert.ok(at("assert.equal(crypto.createHash('sha256')")<at('docker cp "trbhh-ollama:$blob" -'));
 at('docker exec trbhh-ollama sha256sum "$blob"');at('docker exec trbhh-embedding sha256sum "$blob"');
 assert.doesNotMatch(text,/ollama\s+(?:pull|rm|cp)|docker\s+(?:volume\s+rm|system\s+prune)|(?:DELETE|UPDATE|INSERT)\s+(?:FROM|INTO|site_settings)/i);
});
test('strict dedicated preflight and validated empty or populated index precede app build and preserve runtime rollback',()=>{
 assert.ok(at('__trbhhEmbeddingProbe="dedicated"')<at('result.correct===40'));
 assert.ok(at('result.correct===40')<at('node - --initial'));
 assert.ok(at("index.ready===(index.count>0)")<at('docker build --build-arg'));
 at("index.count===0?'EMPTY':'POPULATED'");
 assert.doesNotMatch(text,/throw Error\('empty_index'\)/);
 assert.ok(at('docker build --build-arg')<at('git switch --detach "$candidate"'));
 for(const guard of ['runtimeMatches(config,before)','verify-runtime.cjs" "$target/before.json" "$target/after.json"','rollback.json','git switch --detach "$baseline"','sha256sum .env','capacity_status=UNVERIFIED'])at(guard);
});

test('real pinned registry manifest allows only its four local blobs; rewritten anchors and altered bytes fail closed',()=>{
 const os=require('node:os'),path=require('node:path');
 const source=[...text.matchAll(/<<'NODE'(?:[^\n]*)\n([\s\S]*?)\nNODE/g)].map(x=>x[1]).find(x=>x.includes("layers=[m.config,...m.layers]"));
 assert.ok(source);
 const fixture=fs.readFileSync('scripts/release/fixtures/embeddinggemma-300m.manifest.json');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trbhh-manifest-')),input=path.join(dir,'input.json'),output=path.join(dir,'blobs.txt');
 const run=bytes=>{fs.writeFileSync(input,bytes);return spawnSync(process.execPath,['-',input,output],{input:source,encoding:'utf8'});};
 try{
  const valid=run(fixture);assert.equal(valid.status,0,valid.stderr);
  const blobs=fs.readFileSync(output,'utf8').trim().split('\n');
  assert.equal(blobs.length,4);assert.ok(blobs.includes('0800cbac9c2064dde519420e75e512a83cb360de3ad5df176185dc69652fc515'));
  fs.unlinkSync(output);
  for(const invalid of [Buffer.concat([fixture,Buffer.from('\n')]),Buffer.from('{"digest":"sha256:85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1"}'),Buffer.alloc(65537)]){
   assert.notEqual(run(invalid).status,0);assert.equal(fs.existsSync(output),false);
  }
 }finally{for(const file of [input,output])if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
});
test('postcutover validates index/model and explicitly preserves closed store; timers restore exact prior state',()=>{
 at('await c.verifyModel();const index=await c.readIndex()');
 at('data-search-mode="semantic"');at('HTTP_STATUS=STORE_CLOSED');at("db.site_settings.findMany({where:{k:'commerce_enabled'}");
 at('HTTP_STATUS=EMPTY_INDEX');at('INDEX_STATE=$index_state');at('EMPTY_INDEX; HTTP capacity cannot be verified without eligible products');
 for(const guard of ['timer_snapshot_ready == 1 && $timers_touched == 1','restore_timers','install-search-refresh.sh" "$target/ai"'])at(guard);
 assert.doesNotMatch(text,/site_settings\.(?:update|upsert|create)|\$executeRaw/);
});

test('index completion accepts a genuine zero count and rejects inconsistent or missing readiness',()=>{
 const os=require('node:os'),path=require('node:path');
 const snippet=[...text.matchAll(/<<'NODE'(?:[^\n]*)\n([\s\S]*?)\nNODE/g)].map(x=>x[1]).find(x=>x.includes("index.ready===(index.count>0)"));assert.ok(snippet);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trbhh-empty-index-')),file=path.join(dir,'index.log');
 const value={event:'SEMANTIC_INDEX_COMPLETE',model:'embeddinggemma:300m',digest:'85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1',count:0,ready:false,builtAt:new Date().toISOString()};
 const run=entry=>{fs.writeFileSync(file,JSON.stringify(entry)+'\n');return spawnSync(process.execPath,['-',file],{input:snippet,encoding:'utf8'});};
 try{
  assert.match(run(value).stdout,/INDEX_STATE=EMPTY/);assert.equal(run(value).status,0);
  const populated=run({...value,count:1,ready:true});assert.equal(populated.status,0);assert.match(populated.stdout,/INDEX_STATE=POPULATED/);
  for(const invalid of [{...value,ready:true},{...value,count:-1},{...value,count:10001},{...value,digest:'changed'},{...value,event:'SEMANTIC_INDEX_FAILED'}])assert.notEqual(run(invalid).status,0);
 }finally{fs.unlinkSync(file);fs.rmdirSync(dir);}
});

test('live HTTP check distinguishes a valid empty catalog from failed populated semantic search',()=>{
 const snippet=[...text.matchAll(/<<'NODE'(?:[^\n]*)\n([\s\S]*?)\nNODE/g)].map(x=>x[1]).find(x=>x.includes("HTTP_STATUS=EMPTY_INDEX"));assert.ok(snippet);
 const run=(state,mode)=>{
  const html='<main data-search-scope="trbhh-products" data-search-mode="'+mode+'"></main>';
  const prelude='globalThis.fetch=async(url,options)=>{require("node:assert/strict").equal(options.redirect,"error");return new Response('+JSON.stringify(html)+');};\n';
  return spawnSync(process.execPath,['-',state],{input:prelude+snippet,encoding:'utf8',timeout:3000});
 };
 const empty=run('EMPTY','literal');assert.equal(empty.status,0,empty.stderr);assert.match(empty.stdout,/HTTP_STATUS=EMPTY_INDEX/);
 const populated=run('POPULATED','semantic');assert.equal(populated.status,0,populated.stderr);assert.match(populated.stdout,/HTTP_STATUS=SEMANTIC/);
 assert.notEqual(run('POPULATED','literal').status,0);assert.notEqual(run('EMPTY','semantic').status,0);
});
test('rollback health requires the old image and exact baseline response within bounded checks',()=>{
 for(const guard of ['rollback_deadline=$((SECONDS+120))','SECONDS+18 <= rollback_deadline','timeout 5s docker compose ps -q app','timeout 5s docker inspect','== "$old_image"','timeout 6s docker exec "$restored"','j.commit===process.argv[1]','"$baseline"; then','rollback_healthy=1; break'])at(guard);
 assert.match(text,/if \[\[ \$rollback_healthy == 1 \]\]; then echo ROLLBACK_HEALTHY=true; else echo 'ROLLBACK_HEALTHY=false/);
 assert.equal((text.match(/echo ROLLBACK_HEALTHY=true/g)||[]).length,1);
});
test('timer snapshots cover only fixed units and runner and precede partial installer mutations',()=>{
 const allowed=['/etc/systemd/system/trbhh-semantic-index-refresh.service','/etc/systemd/system/trbhh-semantic-index-refresh.timer','/usr/local/libexec/trbhh-semantic-index-refresh'];
 const paths=text.match(/timer_paths=\(([\s\S]*?)\n\)/)[1].trim().split(/\s+/);assert.deepEqual(paths,allowed);
 for(const guard of ['[[ ! -L /etc/systemd/system && ! -L /usr/local/libexec ]]','[[ ! -L $path ]]','cp -p -- "$path" "$target/timer-before/$i"','state != activating','timer_enabled[$i]=$(systemctl is-enabled','timer_active[$i]=1','timer_snapshot_ready=1','timers_touched=1'])at(guard);
 assert.ok(at('\nsnapshot_timers\n')<at('\nsearch_timer_installed=1\n'));
 for(const guard of ['cp -p -- "$target/timer-before/$i" "$path"','[[ -f $path ]] && rm -f -- "$path"','systemctl daemon-reload || failed=1','enabled-runtime) systemctl enable --runtime','systemctl start "$unit"','cmp -s "$target/timer-before/$i"','TIMER_STATE_RESTORED=false'])at(guard);
 assert.doesNotMatch(text,/rm\s+-[rf]{2}|rm\s+-r/);
});
test('embedded Node checks parse and deployment shell has valid syntax',()=>{
 const snippets=[...text.matchAll(/<<'NODE'(?:[^\n]*)\n([\s\S]*?)\nNODE/g)];assert.ok(snippets.length>=6);
 for(const [,source] of snippets){const check=spawnSync(process.execPath,['--check'],{input:source,encoding:'utf8'});assert.equal(check.status,0,check.stderr);}
 const shell=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
 const result=spawnSync(shell,['-n','scripts/release/manual-semantic-search-deploy.sh'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});

test('HTTP capacity reports actual bounded candidate bursts or unverified closed-store state',()=>{
 at('capacity-check.cjs" | docker exec -i "$running" timeout --signal=TERM --kill-after=10s 300s node - "$candidate" --http-only');
 at("x.event==='CAPACITY_HTTP_COMPLETE'");at('report.runningCommit,process.argv[3]');
 for(const field of ['publicHttpObservedConcurrency','publicHttpIntelligentConcurrency','publicHttpSemanticConcurrency'])at(field);
 at('CAPACITY_UNVERIFIED — STORE_CLOSED');at('CAPACITY=$capacity_status');
 assert.ok(at('capacity_status=MEASURED')<at('search_timer_installed=1'));
 assert.doesNotMatch(text,/SEMANTIC=40|OBSERVED=40/);
});

test('capacity report accepts mixed semantic/literal evidence and rejects wrong release or impossible counts',()=>{
 const os=require('node:os'),path=require('node:path');
 const snippet=[...text.matchAll(/<<'NODE'(?:[^\n]*)\n([\s\S]*?)\nNODE/g)].map(x=>x[1]).find(x=>x.includes("x.event==='CAPACITY_HTTP_COMPLETE'"));
 assert.ok(snippet);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trbhh-capacity-report-')),log=path.join(dir,'capacity.log'),commit='a'.repeat(40);
 try{
  const report={event:'CAPACITY_HTTP_COMPLETE',runningCommit:commit,publicHttpObservedConcurrency:5,publicHttpIntelligentConcurrency:1,publicHttpSemanticConcurrency:1,distinctRequests:40,distinctSemantic:20,distinctErrors:0,distinctP95Ms:3100,distinctCacheState:'unverified'};
  const run=value=>{fs.writeFileSync(log,JSON.stringify(value)+'\n');return spawnSync(process.execPath,['-',log,commit],{input:snippet,encoding:'utf8'});};
  const valid=run(report);assert.equal(valid.status,0,valid.stderr);assert.match(valid.stdout,/OBSERVED=5 INTELLIGENT=1 SEMANTIC=1/);
  assert.notEqual(run({...report,runningCommit:'b'.repeat(40)}).status,0);
  assert.notEqual(run({...report,publicHttpSemanticConcurrency:6}).status,0);
  assert.notEqual(run({...report,publicHttpObservedConcurrency:41}).status,0);
  assert.notEqual(run({...report,distinctSemantic:41}).status,0);
  assert.notEqual(run({...report,distinctCacheState:'cold'}).status,0);
  assert.equal(run({...report,distinctRequests:0,distinctSemantic:0,distinctP95Ms:null}).status,0);
 }finally{fs.unlinkSync(log);fs.rmdirSync(dir);}
});
