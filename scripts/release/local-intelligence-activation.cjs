const SOURCE='qwen3.5:9b',ACTIVE='trbhh-local:active',ROLLBACK='trbhh-local:rollback';
const RELEASE='46d7d108ff1511c3f991eff645050152481e7adb';
const log=value=>console.log(JSON.stringify(value));
function assertResources(available,load,growth){if(!Number.isFinite(available)||available<6*1024**3||!Number.isFinite(load)||load>8||!Number.isFinite(growth)||growth>512*1024**2)throw Error('intelligence_resource_stop');}
async function activate(call,verify,guard=async()=>{}){
 const tags=await call('tags'),candidate=tags.models?.find(x=>x.name===SOURCE),old=tags.models?.find(x=>x.name===ACTIVE);
 if(!candidate||! /^[a-f0-9]{64}$/.test(candidate.digest)||!Number.isFinite(candidate.size)||candidate.size<=0||candidate.size>8*1024**3)throw Error('installed_model_missing_or_oversized');
 const proof=await verify(old?.digest===candidate.digest?ACTIVE:SOURCE);
 await guard();const current=await call('tags');
 if(current.models?.find(x=>x.name===SOURCE)?.digest!==candidate.digest||current.models?.find(x=>x.name===ACTIVE)?.digest!==old?.digest)throw Error('model_changed');
 if(old?.digest===candidate.digest)return {status:'LOCAL_INTELLIGENCE_READY',model:SOURCE,digest:candidate.digest,changed:false,proof};
 if(old)await call('copy',{source:ACTIVE,destination:ROLLBACK});
 try{
  await call('copy',{source:SOURCE,destination:ACTIVE});
  if((await call('tags')).models?.find(x=>x.name===ACTIVE)?.digest!==candidate.digest)throw Error('promotion_unverified');
  const activeProof=await verify(ACTIVE);await guard();
  return {status:'LOCAL_INTELLIGENCE_READY',model:SOURCE,digest:candidate.digest,changed:true,proof:activeProof};
 }catch(error){
  try{if(old)await call('copy',{source:ROLLBACK,destination:ACTIVE});else await call('delete',{model:ACTIVE});
   if((await call('tags')).models?.find(x=>x.name===ACTIVE)?.digest!==old?.digest)throw Error('rollback_digest');
  }catch{throw Error('MODEL_ROLLBACK_UNVERIFIED');}throw error;
 }
}
async function readJson(response,max=65536){
 if(!response.ok||!response.body)throw Error('local_http_'+response.status);const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,text='';
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>max)throw Error('response_limit');text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{await reader.cancel().catch(()=>{});}
}
async function verifyQuality(call,model,protocol,smoke,poolFactory){
 const proof=await smoke(call,model);
 const extras=[
  ['search','شنطة ظهر للسفر مقاومة للماء',v=>/backpack/i.test(v)&&/travel/i.test(v)&&/waterproof|water.resistant/i.test(v)],
  ['search','حامل لابتوب قابل لتعديل الارتفاع',v=>/laptop/i.test(v)&&/stand/i.test(v)&&/adjustable|height/i.test(v)],
  ['translation','USB-C cable, 2 m. Charger not included.',v=>/USB-C/i.test(v)&&/[2٢]/.test(v)&&/كابل|سلك/.test(v)&&/(?:لا\s*(?:يشمل|يتضمن)|غير\s*(?:مشمول|مرفق|متضمن)|بدون)\s*(?:ال)?شاحن|الشاحن\s*(?:غير\s*(?:مشمول|مرفق)|ليس\s*(?:مشمول|مرفق))/.test(v)],
  ['translation','Set of 3 glass storage jars, 500 ml each. Not suitable for hot liquids.',v=>/[3٣]/.test(v)&&/500|٥٠٠/.test(v)&&/زجاج/.test(v)&&/(?:غير\s*(?:مناسب|صالح|مخصص)|لا\s*(?:تصلح|يصلح|تناسب|يناسب|تستخدم|يستخدم))/.test(v)&&/ساخن|حار/.test(v)]
 ];
 for(const [kind,text,check] of extras){
  const search=kind==='search',started=Date.now(),result=await call('chat',protocol.request(model,text,search?protocol.searchTask:protocol.translationTask('ar'),search?protocol.searchFormat:protocol.translationFormat));
  const elapsedMs=Date.now()-started,value=JSON.parse(result.message?.content||'{}'),answer=search?value.queries?.[0]:value.translation;
  const passed=result.done===true&&result.done_reason!=='length'&&typeof answer==='string'&&check(answer)&&(!search||protocol.validateIntentQueries(text,value).length===1)&&elapsedMs<=(search?11500:8500);
  log({event:'LOCAL_INTELLIGENCE_QUALITY',kind,input:text,answer,elapsedMs,passed});if(!passed)throw Error('quality_or_latency_rejected');proof.push({input:text,elapsedMs,result:answer,passed});
 }
 // Real inference through the exact deployed bounded pool; identical requests share work.
 const pool=poolFactory(),text='شي يرتب لي أدوات المطبخ',begin=Date.now();let executions=0;
 const results=await Promise.all(Array.from({length:40},()=>pool.run('activation-shared-probe',async()=>{
  executions++;const result=await call('chat',protocol.request(model,text,protocol.searchTask,protocol.searchFormat));
  if(result.done!==true||result.done_reason==='length')return null;const value=JSON.parse(result.message?.content||'{}');return protocol.validateIntentQueries(text,value).length===1?value:null;
 },12000)));
 const passed=results.every(Boolean)&&executions===1;log({event:'LOCAL_INTELLIGENCE_SHARED',requests:40,modelExecutions:executions,elapsedMs:Date.now()-begin,passed,scope:'identical request sharing only; distinct-query capacity unverified'});if(!passed)throw Error('shared_probe_rejected');
 return proof;
}
async function main(){
 const protocol=globalThis.__trbhhLocalProtocol,updater=globalThis.__trbhhLocalUpdater,pool=globalThis.__trbhhInferencePool;
 if(!protocol||!updater||!pool)throw Error('deployed_assets_required');
 if(process.env.LOCAL_AI_URL&&process.env.LOCAL_AI_URL!=='http://ollama:11434')throw Error('unexpected_local_endpoint');
 const fs=require('node:fs'),os=require('node:os'),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),240000);
 const memory=()=>Number(fs.readFileSync('/sys/fs/cgroup/memory.current','utf8')),baseline=memory();let checking=false,monitor;
 async function guard(){controller.signal.throwIfAborted();const available=Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1]||0)*1024;assertResources(available,os.loadavg()[0],memory()-baseline);
  const value=await readJson(await fetch('http://127.0.0.1:3000/api/version',{redirect:'error',signal:AbortSignal.timeout(2000)}));if(value.commit!==RELEASE)throw Error('running_release_changed');}
 async function call(path,body){
  if(!['tags','chat','copy','delete'].includes(path))throw Error('operation_blocked');
  if(path==='chat'&&![SOURCE,ACTIVE].includes(body?.model))throw Error('model_blocked');
  if(path==='copy'&&!((body?.source===ACTIVE&&body.destination===ROLLBACK)||(body?.source===SOURCE&&body.destination===ACTIVE)||(body?.source===ROLLBACK&&body.destination===ACTIVE)))throw Error('copy_blocked');
  if(path==='delete'&&body?.model!==ACTIVE)throw Error('delete_blocked');
  const preload=path==='chat'&&body.messages?.length===0,begin=Date.now();
  if(path==='chat'){await guard();console.log(preload?'LOCAL_INTELLIGENCE_PRELOAD — existing weights, at most 90 seconds.':'LOCAL_INTELLIGENCE_CASE — testing actual local inference.');}
  const timeout=path==='chat'?(preload?90000:15000):10000;
  const response=await fetch('http://ollama:11434/api/'+path,{method:path==='delete'?'DELETE':body?'POST':'GET',redirect:'error',signal:path==='chat'?AbortSignal.any([controller.signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout),headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(path==='copy'||path==='delete'){if(!response.ok)throw Error('model_alias_operation_failed');await response.body?.cancel();return null;}
  const result=await readJson(response);
  if(path==='chat'&&!preload){
   const data=JSON.parse(body.messages.at(-1).content.split('Input data: ')[1]||'{}'),value=JSON.parse(result.message?.content||'{}');
   log({event:'LOCAL_INTELLIGENCE_SAMPLE',input:data.text,answer:value,elapsedMs:Date.now()-begin,promptMs:Math.round((result.prompt_eval_duration||0)/1e6),generationMs:Math.round((result.eval_duration||0)/1e6),outputTokens:result.eval_count,done:result.done});
   if(body.format?.properties?.queries&&!protocol.validateIntentQueries(data.text,value).length)throw Error('runtime_search_validation_rejected');
  }return result;
 }
 const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
 try{
  await guard();const rows=await db.$queryRawUnsafe("SELECT v FROM site_settings WHERE k='local_ai_enabled' LIMIT 1");if((rows[0]?.v??'1')!=='1')throw Error('local_ai_disabled_setting_preserved');
  monitor=setInterval(()=>{if(checking)return;checking=true;guard().catch(()=>controller.abort()).finally(()=>{checking=false;});},2000);
  const result=await activate(call,model=>verifyQuality(call,model,protocol,updater.smoke,pool.createInferencePool),guard);log({...result,release:RELEASE,localOnly:true,downloads:0,databaseWrites:0,storeChanged:false});
 }finally{clearTimeout(timer);clearInterval(monitor);controller.abort();await db.$disconnect();}
}
module.exports={activate,assertResources,verifyQuality};
if(module.id==='[stdin]')main().catch(error=>{log({status:'LOCAL_INTELLIGENCE_NOT_ACTIVATED',reason:String(error.message).slice(0,150)});process.exitCode=1;});
