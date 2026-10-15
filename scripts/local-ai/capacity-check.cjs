/* Manual read-only probe: local HTTP + installed model; no CJ, purchases, model pulls or activation. */
const {readFileSync}=require('node:fs');
const {loadavg}=require('node:os');
function summary(items,elapsed){
 const times=items.map(item=>item.ms).sort((a,b)=>a-b),percentile=p=>times[Math.max(0,Math.ceil(times.length*p)-1)]||0;
 return {requests:items.length,success:items.filter(item=>item.ok).length,errors:items.filter(item=>!item.ok).length,
  intelligent:items.filter(item=>item.ok&&item.mode==='intent').length,literal:items.filter(item=>item.ok&&item.mode==='literal').length,unknown:items.filter(item=>item.ok&&item.mode==='unknown').length,
  p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:times.at(-1)||0,requestsPerSecond:Math.round(items.length/Math.max(.001,elapsed/1000)*100)/100};
}
async function burst(size,worker,signal){
 if(!Number.isInteger(size)||size<1||size>40)throw Error('unsafe_fanout');signal.throwIfAborted();
 return Promise.all(Array.from({length:size},async(_,index)=>{signal.throwIfAborted();return worker(index);}));
}
async function readSmall(response,limit=4194304){
 if(!response.body)throw Error('missing_response');
 const reader=response.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit)throw Error('response_too_large');text+=decoder.decode(part.value,{stream:true});}return text+decoder.decode();}
 finally{await reader.cancel().catch(()=>{});}
}
function assertResources({available,load,appGrowth}){
 if(available<6*1024**3)throw Error('safety_stop_low_memory');
 if(load>12)throw Error('safety_stop_host_load');
 if(appGrowth>512*1024**2)throw Error('safety_stop_app_memory_growth');
}
const cgroupMemory=()=>Number(readFileSync('/sys/fs/cgroup/memory.current','utf8').trim());
async function releaseExploratory(model,fetcher=fetch){
 if(model!=='qwen3.5:9b')return true;
 try{const response=await fetcher('http://ollama:11434/api/chat',{method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages:[],stream:false,keep_alive:0})});return response.ok;}
 catch{return false;}
}
async function run(){
 const protocol=globalThis.__trbhhCapacityProtocol,poolFactory=globalThis.__trbhhCapacityPool;
 if(!protocol||!poolFactory)throw Error('capacity_shared_code_missing');
 const controller=new AbortController(),started=Date.now(),memoryStart=cgroupMemory();
 const timer=setTimeout(()=>controller.abort(Error('safety_stop_time_budget')),240000);
 let monitor,checking=false,modelBusy=false,model,modelCalls=0,minAvailable=Infinity,maxLoad=0,maxAppGrowth=0,maxHealthMs=0;
 const log=value=>console.log(JSON.stringify(value));
 const signal=ms=>AbortSignal.any([controller.signal,AbortSignal.timeout(ms)]);
 async function guard(){
  controller.signal.throwIfAborted();
  const info=readFileSync('/proc/meminfo','utf8'),available=Number(info.match(/^MemAvailable:\s+(\d+)/m)?.[1]||0)*1024,load=loadavg()[0],appGrowth=cgroupMemory()-memoryStart;
  minAvailable=Math.min(minAvailable,available);maxLoad=Math.max(maxLoad,load);maxAppGrowth=Math.max(maxAppGrowth,appGrowth);assertResources({available,load,appGrowth});
  const start=Date.now(),response=await fetch('http://127.0.0.1:3000/api/version',{redirect:'error',signal:signal(2000),cache:'no-store'});
  if(!response.ok)throw Error('safety_stop_health');const version=JSON.parse(await readSmall(response,4096));
  maxHealthMs=Math.max(maxHealthMs,Date.now()-start);if(!/^[a-f0-9]{40}$/.test(version.commit))throw Error('unverified_running_version');return version.commit;
 }
 async function chat(body,ms=12000){
  // Preload may be slow, but no other inference is ever sent concurrently by this tool.
  controller.signal.throwIfAborted();if(modelBusy)throw Error('unsafe_parallel_model_execution');modelBusy=true;modelCalls++;
  try{const response=await fetch('http://ollama:11434/api/chat',{method:'POST',redirect:'error',signal:signal(ms),headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(!response.ok)throw Error('model_http_'+response.status);return JSON.parse(await readSmall(response,65536));
  }finally{modelBusy=false;}
 }
 async function httpWorker(index){
  const start=Date.now(),queries=['هاتف','أدوات مطبخ','سيارة','عقار'];
  try{const response=await fetch('http://127.0.0.1:3000/search?q='+encodeURIComponent(queries[index%queries.length]),{redirect:'error',signal:signal(12000),cache:'no-store'});
   const text=await readSmall(response),mode=text.match(/data-search-mode="(intent|literal|idle)"/)?.[1]||'unknown';
   return {ms:Date.now()-start,ok:response.ok&&text.includes('</html>')&&text.includes('النتائج:'),mode};
  }catch(error){return {ms:Date.now()-start,ok:false,mode:'unknown',error:String(error.message).slice(0,100)};}
 }
 const http=[],modelStages=[];let publicQuality=true;
 try{
  const runningCommit=await guard();log({event:'CAPACITY_BEGIN',runningCommit,candidateCommit:process.argv[2],scope:'public HTTP is running release; model pool and public prompt are staged candidate',maxFanout:40,maxDurationSeconds:240});
  monitor=setInterval(()=>{if(checking)return;checking=true;guard().catch(error=>controller.abort(error)).finally(()=>{checking=false;});},2000);
  // Warm only four fixed synthetic searches. No account cookie, write endpoint or supplier API is used.
  for(let i=0;i<4;i++){const warm=await httpWorker(i);if(!warm.ok)throw Error('safety_stop_public_warmup');}
  for(const size of [1,5,10,20,40]){
   await guard();const begin=Date.now(),items=await burst(size,httpWorker,controller.signal),result={event:'PUBLIC_HTTP_STAGE',workload:'four warmed synthetic phrases',concurrency:size,...summary(items,Date.now()-begin)};http.push(result);log(result);
   const limit=result.intelligent===size?10000:2500;
   if(result.errors||result.p95Ms>limit){log({event:'PUBLIC_HTTP_STOP',reason:'error_or_latency_budget',nextStagesSkipped:true});break;}
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  await guard();
  const tagsResponse=await fetch('http://ollama:11434/api/tags',{redirect:'error',signal:signal(3000)});
  if(!tagsResponse.ok)throw Error('model_inventory_unavailable');const tags=JSON.parse(await readSmall(tagsResponse,65536));
  model=tags.models?.some(item=>item.name==='trbhh-local:active')?'trbhh-local:active':tags.models?.some(item=>item.name==='qwen3.5:9b')?'qwen3.5:9b':null;
  if(!model)throw Error('installed_model_missing_no_download_attempted');
  const applicationModelReady=model==='trbhh-local:active';
  log({event:'MODEL_SCOPE',model,applicationModelReady,scope:applicationModelReady?'active application alias':'exploratory installed model only; application activation unverified'});
  const preparation=protocol.request(model,'','',{});delete preparation.format;preparation.messages=[];
  console.log('MODEL_PRELOAD — existing model only; health and resource guards remain active.');
  if((await chat(preparation,120000)).done!==true)throw Error('model_preload_incomplete');
  const fixtures=[['أبغى كفر Samsung S24',value=>/Samsung/i.test(value)&&/S24/i.test(value)&&/غطاء|حافظ|جراب|كفر/.test(value)],['شي يرتب لي أدوات المطبخ',value=>/مطبخ/.test(value)&&/منظم|تنظيم|رف|حامل/.test(value)],['أبغى دريل بدون سلك 18V',value=>/دريل|مثقاب/.test(value)&&/لاسلك|لا سلك|بدون سلك/.test(value)&&/18\s*V/i.test(value)],['جزمة للمشي ضد الموية مقاس 42',value=>/حذاء|أحذية|حذ[اأء]|جزمة/.test(value)&&/مشي/.test(value)&&/ماء|مياه/.test(value)&&/42/.test(value)]];
  for(const [text,check] of fixtures){
   await guard();const begin=Date.now();let answer,ok=false;
   try{const response=await chat(protocol.request(model,text,protocol.publicSearchTask,protocol.publicSearchFormat),8500);answer=protocol.validateIntentQueries(text,JSON.parse(response.message?.content||'{}'),true);
    ok=response.done===true&&response.done_reason!=='length'&&Array.isArray(answer)&&answer.length===1&&typeof answer[0]==='string'&&answer[0].length<=100&&check(answer[0]);
   }catch(error){answer=String(error.message).slice(0,100);}
   publicQuality=publicQuality&&ok;log({event:'PUBLIC_INTENT_QUALITY',input:text,answer,ms:Date.now()-begin,passed:ok});
  }
  const pool=poolFactory(),phrase='شي يرتب لي أدوات المطبخ';
  async function semantic(text){
   const begin=Date.now(),body=protocol.request(model,text,protocol.searchTask,protocol.searchFormat);
   const result=await pool.run(JSON.stringify(body),async()=>{
    const answer=await chat(body,11500);if(answer.done!==true||answer.done_reason==='length')return null;
    const queries=protocol.validateIntentQueries(text,JSON.parse(answer.message?.content||'{}'));return queries.length?{queries}:null;
   },12000);
   return {ms:Date.now()-begin,ok:true,mode:result?'intent':'literal'};
  }
  for(const kind of ['identical_cold','identical_cached','distinct_cold']){
   await guard();const begin=Date.now(),before=modelCalls,items=await burst(40,index=>semantic(kind==='distinct_cold'?`منظم أدوات مطبخ ${index+1}`:phrase),controller.signal);
   const result={event:'STAGED_MODEL_POOL',scenario:kind,concurrency:40,...summary(items,Date.now()-begin),modelExecutions:modelCalls-before,pool:pool.stats()};modelStages.push(result);log(result);
  }
  const repeated=modelStages.find(item=>item.scenario==='identical_cold'),cached=modelStages.find(item=>item.scenario==='identical_cached');
  const verifiedHttp=http.filter(item=>item.success===item.concurrency&&item.p95Ms<=(item.intelligent===item.concurrency?10000:2500));
  log({event:'CAPACITY_COMPLETE',model,applicationModelReady,publicQualityPassed:publicQuality,candidateSharedBurstPassed:repeated?.intelligent===40&&repeated.modelExecutions===1&&cached?.intelligent===40&&cached.modelExecutions===0,
   publicHttpObservedConcurrency:Math.max(0,...verifiedHttp.map(item=>item.concurrency)),publicHttpIntelligentConcurrency:Math.max(0,...verifiedHttp.filter(item=>item.intelligent===item.concurrency).map(item=>item.concurrency)),
   minHostAvailableGiB:Math.round(minAvailable/1024**3*100)/100,maxHostLoad:maxLoad,maxAppGrowthMiB:Math.round(maxAppGrowth/1024**2),maxHealthMs,elapsedSeconds:Math.round((Date.now()-started)/1000),deployed:false,scope:'short local burst, not sustained capacity or public-network latency'});
 }finally{clearTimeout(timer);clearInterval(monitor);controller.abort();if(!await releaseExploratory(model))console.error('CAPACITY_CLEANUP_WARN — exploratory model memory release unconfirmed.');}
}
module.exports={summary,burst,readSmall,assertResources,releaseExploratory,run};
if(module.id==='[stdin]')run().catch(error=>{console.error(JSON.stringify({event:'CAPACITY_STOPPED',reason:String(error.message).slice(0,200),deployed:false}));process.exitCode=1;});
