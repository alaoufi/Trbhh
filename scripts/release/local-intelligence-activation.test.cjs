const {test}=require('node:test'),assert=require('node:assert/strict');
const {activate,assertResources,verifyQuality}=require('./local-intelligence-activation.cjs');
const {spawnSync}=require('node:child_process'),fs=require('node:fs');
function deployed(file,globals={}){const result=spawnSync('git',['show','46d7d108ff1511c3f991eff645050152481e7adb:scripts/local-ai/'+file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const unit={exports:{},id:'unit'};new Function('module','require','globalThis',result.stdout)(unit,require,globals);return unit.exports;}
const protocol=deployed('protocol.cjs'),smoke=deployed('update-model.cjs',{__trbhhLocalProtocol:protocol}).smoke,poolFactory=deployed('inference-pool.cjs').createInferencePool;
const answers={
 'غطاء Samsung S24':{queries:['Samsung S24 case']},
 'أبغى دريل بدون سلك 18V':{queries:['18V cordless drill']},
 'شي يرتب لي أدوات المطبخ':{queries:['Kitchen utensil storage organizer']},
 'جزمة للمشي ضد الموية مقاس 42':{queries:['Waterproof walking shoes size 42']},
 'Cotton shirt':{translation:'قميص قطني'},
 'Stainless steel bottle 750ml, not insulated':{translation:'قارورة فولاذية 750 مل غير معزولة'},
 'شنطة ظهر للسفر مقاومة للماء':{queries:['Waterproof travel backpack']},
 'حامل لابتوب قابل لتعديل الارتفاع':{queries:['Adjustable laptop stand']},
 'USB-C cable, 2 m. Charger not included.':{translation:'كابل USB-C بطول 2 متر. الشاحن غير مشمول.'},
 'Set of 3 glass storage jars, 500 ml each. Not suitable for hot liquids.':{translation:'مجموعة من 3 برطمانات زجاجية للتخزين، سعة كل منها 500 مل. غير مناسبة للسوائل الساخنة.'}
};
function modelCall(override={}){let calls=0;return {get calls(){return calls;},call:async(path,body)=>{assert.equal(path,'chat');assert.equal(body.model,'qwen3.5:9b');assert.equal(body.options.num_thread,4);assert.equal(body.keep_alive,'24h');if(!body.messages.length)return {done:true};calls++;const text=JSON.parse(body.messages.at(-1).content.split('Input data: ')[1]).text;return {done:true,done_reason:'stop',message:{content:JSON.stringify(override[text]||answers[text])}};}};}
function fixture(fail=false){
 const state={source:'a'.repeat(64),active:'b'.repeat(64),rollback:null},calls=[];
 const call=async(path,body)=>{calls.push({path,body});if(path==='tags')return {models:[{name:'qwen3.5:9b',digest:state.source,size:7e9},...(state.active?[{name:'trbhh-local:active',digest:state.active}]:[])]};
 if(path==='copy'){state[body.destination.endsWith('rollback')?'rollback':'active']=body.source.endsWith('rollback')?state.rollback:body.source.endsWith('active')?state.active:state.source;return;}
 if(path==='delete'){state.active=null;return;}
 throw Error('unexpected_call');};
 const verify=async model=>{if(fail&&model==='trbhh-local:active')throw Error('quality_rejected');return [{passed:true}];};
 return {state,calls,call,verify};
}
test('only verified existing weights are promoted; no downloads or database operations',async()=>{
 const f=fixture();const result=await activate(f.call,f.verify);assert.equal(result.status,'LOCAL_INTELLIGENCE_READY');assert.equal(f.state.active,f.state.source);assert.equal(f.state.rollback,'b'.repeat(64));assert.deepEqual(f.calls.map(x=>x.path),['tags','tags','copy','copy','tags']);
});
test('failed post-promotion quality restores exact previous alias',async()=>{
 const f=fixture(true);await assert.rejects(activate(f.call,f.verify),/quality_rejected/);assert.equal(f.state.active,'b'.repeat(64));
});
test('failed preflight has zero alias mutations and final health failure also rolls back',async()=>{
 const f=fixture();await assert.rejects(activate(f.call,async()=>{throw Error('slow');}),/slow/);assert.equal(f.calls.some(x=>x.path==='copy'),false);
 const g=fixture();await assert.rejects(activate(g.call,g.verify,async()=>{throw Error('health');}),/health/);assert.equal(g.state.active,'b'.repeat(64));
});
test('first activation failure removes only its own alias and confirms absence',async()=>{
 const f=fixture(true);f.state.active=null;await assert.rejects(activate(f.call,f.verify),/quality_rejected/);assert.equal(f.state.active,null);assert.equal(f.calls.find(x=>x.path==='delete').body.model,'trbhh-local:active');
});
test('model drift and low resources fail closed',async()=>{
 const f=fixture();await assert.rejects(activate(f.call,async()=>{f.state.source='c'.repeat(64);return [];}),/model_changed/);assert.equal(f.calls.some(x=>x.path==='copy'),false);
 assert.throws(()=>assertResources(5*1024**3,1,0),/resource/);assert.throws(()=>assertResources(8*1024**3,9,0),/resource/);assert.throws(()=>assertResources(8*1024**3,1,600*1024**2),/resource/);assertResources(8*1024**3,1,0);
});
test('ten actual protocol cases and forty shared requests use one extra execution',async()=>{
 const f=modelCall();const proof=await verifyQuality(f.call,'qwen3.5:9b',protocol,smoke,poolFactory);assert.equal(proof.length,10);assert.equal(f.calls,11);
});
test('missing negation, wrong accessory and lost voltage are quality failures',async()=>{
 for(const override of [
  {'غطاء Samsung S24':{queries:['Samsung S24 smartphone']}},
  {'أبغى دريل بدون سلك 18V':{queries:['cordless drill']}},
  {'USB-C cable, 2 m. Charger not included.':{translation:'كابل USB-C بطول 2 متر مع الشاحن'}},
  {'USB-C cable, 2 m. Charger not included.':{translation:'كابل USB-C، طوله 2 متر. لا يشمل الشحان.'}}
 ]){const f=modelCall(override);await assert.rejects(verifyQuality(f.call,'qwen3.5:9b',protocol,smoke,poolFactory),/smoke_failed|quality_or_latency_rejected/);}
});
test('proofreading candidate adds general spelling guidance without changing search or accepting the observed typo',()=>{
 const revised=require('./translation-proofread.cjs')(protocol);
 assert.equal(revised.searchTask,protocol.searchTask);assert.equal(revised.request,protocol.request);assert.equal(revised.validateIntentQueries,protocol.validateIntentQueries);
 assert.equal(revised.translationTask('ar'),protocol.translationTask('ar')+' Proofread spelling and grammar silently before returning.');
 assert.doesNotMatch(revised.translationTask('ar'),/charger|USB|شاحن|الشحان/i);
 const shell=fs.readFileSync('scripts/release/manual-local-intelligence.sh','utf8'),code=fs.readFileSync('scripts/release/local-intelligence-activation.cjs','utf8');
 assert.ok(shell.includes('mode == --translation-probe && $name == __trbhhLocalProtocol'));assert.ok(shell.includes('node_mode=--probe-only'));
 const branch=code.slice(code.indexOf("if(process.argv.includes('--probe-only'))"),code.indexOf('const result=await activate(call,model=>'));
 assert.ok(branch.includes('activated:false'));assert.ok(branch.includes('return;'));assert.doesNotMatch(branch,/await activate|copy|delete/);
});
test('a correct answer outside the production latency budget is still rejected',async()=>{
 const old=Date.now;let clock=0;Date.now=()=>{clock+=12000;return clock;};
 try{const f=modelCall();await assert.rejects(verifyQuality(f.call,'qwen3.5:9b',protocol,async()=>[],poolFactory),/quality_or_latency_rejected/);}finally{Date.now=old;}
});
test('manual runner pins deployed assets, preserves runtime and forbids broader operations',()=>{
 const source=fs.readFileSync('scripts/release/manual-local-intelligence.sh','utf8');
 for(const guard of ['release=46d7d108ff1511c3f991eff645050152481e7adb','flock -n 8','flock -n 9','flock -n 7','4000000000','10737418240','verify-runtime.cjs','sha256sum .env','--kill-after=20s 300s'])assert.ok(source.includes(guard),guard);
 assert.doesNotMatch(source,/docker (?:compose|restart|pull|run)|git (?:switch|checkout|reset)|systemctl (?:enable|disable)|UPDATE |INSERT |DELETE FROM/i);
 const code=fs.readFileSync('scripts/release/local-intelligence-activation.cjs','utf8');assert.doesNotMatch(code,/\$executeRaw|\.site_settings\.(?:update|upsert)|path==='pull'/);
 const shell=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';const result=spawnSync(shell,['-n'],{input:source.replace(/\r\n/g,'\n'),encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
