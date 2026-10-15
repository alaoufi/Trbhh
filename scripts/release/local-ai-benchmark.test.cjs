const test=require('node:test'),assert=require('node:assert/strict');
const {compare,api,measure,verifyPurpose}=require('./local-ai-benchmark.cjs');
test('purpose probe preserves the acceptance gate and translation, logs rejected answers and unloads without downloading',async()=>{
 const calls=[],logs=[];
 const search={model:'qwen3.5:9b',format:{properties:{queries:{}}},messages:[{role:'user',content:'Task: search\nInput data: {"text":"example"}'}]};
 const translation={...search,format:{properties:{translation:{}}}};
 const result=await verifyPurpose(async(path,body)=>{calls.push({path,body});return path==='tags'?{models:[{name:'qwen3.5:9b'}]}:{done:true,message:{content:'{"queries":["wrong"]}'}};},async(call,model)=>{
  assert.equal(model,'qwen3.5:9b');await call('chat',search);await call('chat',translation);throw Error('local_ai_smoke_failed');
 },value=>logs.push(value));
 assert.equal(result.accepted,false);assert.equal(result.activated,false);
 assert.match(calls[1].body.messages[0].content,/fulfills the described function/);
 assert.deepEqual(calls[2].body,translation);assert.equal(search.messages[0].content.includes('fulfills'),false);
 assert.equal(calls.at(-1).body.keep_alive,0);assert.ok(calls.every(c=>['tags','chat'].includes(c.path)));
 assert.equal(logs.filter(line=>line.includes('BENCHMARK_PURPOSE_ANSWER')).length,2);
});
function fixture(){const calls=[];return {calls,call:async(path,body)=>{calls.push({path,body});if(path==='pull')return {status:'success'};if(path==='tags')return {models:[{name:'qwen3.5:4b',digest:'small'},{name:'qwen3.5:9b',digest:'large'}]};}};}
test('tests the smallest candidate first and stops without downloading the larger one on success',async()=>{
 const f=fixture(),models=[];const result=await compare(f.call,async(_call,model)=>{models.push(model);return [{elapsedMs:1000}];},()=>{});
 assert.equal(result.status,'LOCAL_AI_CANDIDATE_PASSED');assert.equal(result.model,'qwen3.5:4b');assert.deepEqual(models,['qwen3.5:4b']);
 assert.equal(f.calls.filter(c=>c.path==='pull').length,1);
});
test('does not weaken the gate and tests the larger model only after rejection',async()=>{
 const f=fixture(),models=[];const result=await compare(f.call,async(_call,model)=>{models.push(model);if(model.endsWith('4b'))throw Error('local_ai_smoke_failed');return [{elapsedMs:2000}];},()=>{});
 assert.equal(result.model,'qwen3.5:9b');assert.deepEqual(models,['qwen3.5:4b','qwen3.5:9b']);
 assert.ok(f.calls.every(c=>['pull','tags'].includes(c.path)||c.path==='chat'&&c.body.keep_alive===0));
});
test('reports both failures without promoting, deleting or enabling a model',async()=>{
 const f=fixture();const result=await compare(f.call,async()=>{throw Error('local_ai_too_slow');},()=>{});
 assert.equal(result.status,'LOCAL_AI_NO_ACCEPTED_CANDIDATE');assert.equal(result.rejected.length,2);
 assert.ok(f.calls.every(c=>['pull','tags'].includes(c.path)||c.path==='chat'&&c.body.keep_alive===0));
});
test('rejects a missing digest or incomplete download before running inference',async()=>{
 let ran=0;const result=await compare(async path=>path==='pull'?{status:'success'}:{models:[]},async()=>{ran++;},()=>{});
 assert.equal(ran,0);assert.equal(result.status,'LOCAL_AI_NO_ACCEPTED_CANDIDATE');
});
test('blocks alias mutations and unknown models before any network request',async()=>{
 await assert.rejects(api('copy',{source:'qwen3.5:4b',destination:'trbhh-local:active'}),/benchmark_mutation_blocked/);
 await assert.rejects(api('chat',{model:'unknown',messages:[]}),/benchmark_mutation_blocked/);
});
test('runs the streamed benchmark and reports success without activation',()=>{
 const fs=require('node:fs'),cp=require('node:child_process');
 const script=fs.readFileSync('scripts/release/local-ai-benchmark.cjs','utf8');
 const prelude=`globalThis.__trbhhLocalGate=async()=>[{elapsedMs:1000}];globalThis.fetch=async(url)=>new Response(JSON.stringify(String(url).endsWith('/pull')?{status:'success'}:{models:[{name:'qwen3.5:4b',digest:'small'}]}));\n`;
 const result=cp.spawnSync(process.execPath,['-'],{input:prelude+script,encoding:'utf8',timeout:5000});
 assert.equal(result.status,0);const last=JSON.parse(result.stdout.trim().split('\n').at(-1));assert.equal(last.status,'LOCAL_AI_CANDIDATE_PASSED');assert.equal(last.activated,false);
});
test('refuses to benchmark over an existing active alias',async()=>{
 let pulls=0;await assert.rejects(compare(async path=>{if(path==='pull')pulls++;return {models:[{name:'trbhh-local:active',digest:'active'}]};},async()=>[],()=>{}),/benchmark_existing_active_model_requires_review/);assert.equal(pulls,0);
});
test('the launcher pins the existing gate, keeps resource ceilings and has no cutover commands',()=>{
 const text=require('node:fs').readFileSync('scripts/release/manual-local-ai-benchmark.sh','utf8');
 assert.match(text,/candidate=a5a3dedb66345d0b6e52bbe7355d22bb2958d553/);
 assert.match(text,/10737418240/);assert.match(text,/4000000000/);
 assert.doesNotMatch(text,/git (?:switch|checkout|reset)|compose.*\b(?:up|down)\b|docker (?:rm|stop|restart|volume|system)|systemctl/);
});
test('measures all installed 9B cases without downloading, activating or stopping at a slow answer',async t=>{
 let clock=0;t.mock.method(Date,'now',()=>clock);
 const f=fixture();const result=await measure(async(path,body)=>{if(path==='chat'){if(body.messages.length)clock+=13000;return {done:true,message:{content:JSON.stringify({queries:['measured result']})},eval_duration:13000000000};}return f.call(path,body);},{request:(model,text,task)=>({model,messages:[{role:'user',content:text}],task}),searchTask:'search',searchFormat:{},translationTask:()=> 'translate',translationFormat:{}},()=>{});
 assert.equal(result.status,'LOCAL_AI_MEASUREMENT_COMPLETE');assert.equal(result.proof.length,6);assert.equal(result.activated,false);
 assert.ok(f.calls.every(c=>c.path==='tags'));
 assert.equal(result.proof[0].evalMs,13000);
 assert.equal(result.accepted,false);assert.ok(result.proof.every(item=>item.withinBudget===false));
});
test('measurement refuses a missing 9B model rather than downloading it',async()=>{
 let gateCalls=0;await assert.rejects(measure(async path=>{assert.equal(path,'tags');return {models:[]};},{request:()=>{gateCalls++;}},()=>{}),/benchmark_installed_model_missing/);assert.equal(gateCalls,0);
});
