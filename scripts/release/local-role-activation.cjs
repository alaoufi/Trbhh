const SOURCE='qwen3.5:9b';
function roleNames(role){if(!['search','translation'].includes(role))throw Error('invalid_role');return {active:`trbhh-local:${role}`,rollback:`trbhh-local:${role}-rollback`};}
function assertResources(available,load,growth){if(!Number.isFinite(available)||available<6*1024**3||!Number.isFinite(load)||load>8||!Number.isFinite(growth)||growth>512*1024**2)throw Error('role_resource_stop');}
function installedCandidate(tags){const candidate=tags?.models?.find(x=>x.name===SOURCE);if(!candidate||!/^[a-f0-9]{64}$/.test(candidate.digest)||!Number.isFinite(candidate.size)||candidate.size<=0||candidate.size>8*1024**3)throw Error('installed_model_missing_or_oversized');return candidate;}
async function assertLocalAiEnabled(db){const rows=await db.$queryRawUnsafe("SELECT v FROM site_settings WHERE k='local_ai_enabled' LIMIT 1");if((rows[0]?.v??'1')!=='1')throw Error('local_ai_disabled_setting_preserved');}
async function activateRole(role,call,verify,guard=async()=>{}){
 const {active,rollback}=roleNames(role),tags=await call('tags'),candidate=installedCandidate(tags),old=tags.models?.find(x=>x.name===active);
 const proof=await verify(old?.digest===candidate.digest?active:SOURCE);await guard();const fresh=await call('tags');
 if(fresh.models?.find(x=>x.name===SOURCE)?.digest!==candidate.digest||fresh.models?.find(x=>x.name===active)?.digest!==old?.digest)throw Error('model_changed');
 if(old?.digest===candidate.digest)return {role,changed:false,digest:candidate.digest,proof};
 if(old){await call('copy',{source:active,destination:rollback});if((await call('tags')).models?.find(x=>x.name===rollback)?.digest!==old.digest)throw Error('rollback_backup_unverified');}
 try{await call('copy',{source:SOURCE,destination:active});if((await call('tags')).models?.find(x=>x.name===active)?.digest!==candidate.digest)throw Error('promotion_unverified');const activeProof=await verify(active);await guard();return {role,changed:true,digest:candidate.digest,proof:activeProof};}
 catch(error){try{if(old)await call('copy',{source:rollback,destination:active});else await call('delete',{model:active});if((await call('tags')).models?.find(x=>x.name===active)?.digest!==old?.digest)throw Error('rollback_digest');}catch{throw Error('ROLE_ROLLBACK_UNVERIFIED');}throw error;}
}
const searchCases=[
 ['غطاء Samsung S24',v=>/Samsung/i.test(v)&&/S24/i.test(v)&&/case|cover/i.test(v)],
 ['أبغى دريل بدون سلك 18V',v=>/drill/i.test(v)&&/cordless|wireless/i.test(v)&&/18\s*V/i.test(v)],
 ['شي يرتب لي أدوات المطبخ',v=>/kitchen/i.test(v)&&/organiz|storage|rack/i.test(v)],
 ['جزمة للمشي ضد الموية مقاس 42',v=>/walk/i.test(v)&&/shoe|sneaker|footwear/i.test(v)&&/waterproof|water.resistant/i.test(v)&&/42/.test(v)],
 ['شنطة ظهر للسفر مقاومة للماء',v=>/backpack/i.test(v)&&/travel/i.test(v)&&/waterproof|water.resistant/i.test(v)],
 ['حامل لابتوب قابل لتعديل الارتفاع',v=>/laptop/i.test(v)&&/stand/i.test(v)&&/adjustable/i.test(v)&&/height/i.test(v)]
];
const translationCases=[
 ['Cotton shirt',v=>/قميص/.test(v)&&/قطن/.test(v)],
 ['Stainless steel bottle 750ml, not insulated',v=>/قارور|زجاج|عبو/.test(v)&&/(?:فولاذ.*(?:مقاوم|غير\s*قابل).*صدأ|ستانلس)/.test(v)&&/(?:750|٧٥٠)\s*(?:مل|مليلتر)/.test(v)&&/(?:غير\s*معزول|ليست?\s*معزول|بدون\s*عزل)/.test(v)],
 ['USB-C cable, 2 m. Charger not included.',v=>/USB-C/i.test(v)&&/[2٢]\s*(?:متر|أمتار|امتار|م\b)/.test(v)&&/كابل|سلك/.test(v)&&/(?:لا\s*(?:يشمل|يتضمن)|غير\s*(?:مشمول|مرفق|متضمن)|بدون)\s*(?:ال)?شاحن|الشاحن\s*(?:غير\s*(?:مشمول|مرفق)|ليس\s*(?:مشمول|مرفق))/.test(v)],
 ['Set of 3 glass storage jars, 500 ml each. Not suitable for hot liquids.',v=>/[3٣]/.test(v)&&/(?:500|٥٠٠)\s*(?:مل|مليلتر)/.test(v)&&/زجاج/.test(v)&&/كل\s*(?:منها|منه|واحد|برطمان|عبوة|وعاء)/.test(v)&&/(?:غير\s*(?:مناسب|صالح|مخصص)|لا\s*(?:تصلح|يصلح|تناسب|يناسب|تستخدم|يستخدم))/.test(v)&&/ساخن|حار/.test(v)]
];
async function verifyRole(role,call,model,protocol,clock=Date.now,report=()=>{}){
 roleNames(role);const search=role==='search',cases=search?searchCases:translationCases,proof=[];
 for(const [input,check]of cases){const started=clock(),r=await call('chat',protocol.request(model,input,search?protocol.searchTask:protocol.translationTask('ar'),search?protocol.searchFormat:protocol.translationFormat)),elapsedMs=clock()-started;let v;try{v=JSON.parse(r.message?.content||'{}');}catch{throw Error('quality_or_latency_rejected');}const rawAnswer=search?v.queries?.[0]:v.translation,answer=search?protocol.finalizeSupplierQueries(input,v)[0]:v.translation;
 const passed=r.done===true&&r.done_reason!=='length'&&typeof answer==='string'&&check(answer)&&elapsedMs>=0&&elapsedMs<=(search?11500:45000)&&(!search||protocol.validateIntentQueries(input,{queries:[answer]}).length===1);
 report({role,model,input,rawAnswer,answer,elapsedMs,passed,promptTokens:r.prompt_eval_count??null,promptMs:Math.round((r.prompt_eval_duration||0)/1e6),generationMs:Math.round((r.eval_duration||0)/1e6),loadMs:Math.round((r.load_duration||0)/1e6)});if(!passed)throw Error('quality_or_latency_rejected');proof.push({input,answer,elapsedMs,passed});
 }return proof;
}
async function readJson(response){if(!response.ok||!response.body)throw Error('local_http_'+response.status);const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>65536)throw Error('response_limit');text+=decoder.decode(r.value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{await reader.cancel().catch(()=>{});}}
async function warmSearch(call,model,protocol,clock=Date.now,report=()=>{}){
 const body=protocol.request(model,searchCases[0][0],protocol.searchTask,protocol.searchFormat);
 body.options={...body.options,num_predict:1};const started=clock();
 await call('chat',body,{warmup:true});
 report({event:'LOCAL_SEARCH_WARMUP',model,elapsedMs:clock()-started,qualitySample:false});
}
async function main(){
 const [role,release,mode]=process.argv.slice(2),{active,rollback}=roleNames(role);
 if(!/^[a-f0-9]{40}$/.test(release||'')||!['--probe-only','--activate'].includes(mode))throw Error('explicit_candidate_and_mode_required');
 const protocol=globalThis.__trbhhLocalProtocol;if(!protocol)throw Error('candidate_protocol_required');
 if(process.env.LOCAL_AI_URL&&process.env.LOCAL_AI_URL!=='http://ollama:11434')throw Error('unexpected_local_endpoint');
 const fs=require('node:fs'),os=require('node:os'),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),560000),memory=()=>Number(fs.readFileSync('/sys/fs/cgroup/memory.current','utf8')),baseline=memory();let monitor,checking=false;
 async function guard(){controller.signal.throwIfAborted();assertResources(Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1]||0)*1024,os.loadavg()[0],memory()-baseline);const v=await readJson(await fetch('http://127.0.0.1:3000/api/version',{redirect:'error',signal:AbortSignal.timeout(2000)}));if(v.commit!==release)throw Error('running_release_changed');}
 async function call(path,body,options={}){
  if(!['tags','chat','copy','delete'].includes(path))throw Error('operation_blocked');
  if(path==='chat'&&![SOURCE,active].includes(body?.model))throw Error('model_blocked');
  if(path==='copy'&&!((body?.source===active&&body.destination===rollback)||(body?.source===SOURCE&&body.destination===active)||(body?.source===rollback&&body.destination===active)))throw Error('copy_blocked');
  if(path==='delete'&&body?.model!==active)throw Error('delete_blocked');
  if(mode==='--probe-only'&&['copy','delete'].includes(path))throw Error('probe_mutation_blocked');
  if(path==='chat')await guard();const preload=path==='chat'&&body.messages?.length===0;
  const timeout=path==='chat'?(preload||options.warmup?90000:role==='translation'?45000:12000):10000;
  // Alias rollback remains possible after the inference/resource controller aborts.
  const signal=path==='chat'?AbortSignal.any([controller.signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);
  const response=await fetch('http://ollama:11434/api/'+path,{method:path==='delete'?'DELETE':body?'POST':'GET',redirect:'error',signal,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(['copy','delete'].includes(path)){if(!response.ok)throw Error('alias_operation_failed');await response.body?.cancel();return null;}return readJson(response);
 }
 const Db=require('@prisma/client').PrismaClient,db=new Db();
 try{await guard();await assertLocalAiEnabled(db);installedCandidate(await call('tags'));monitor=setInterval(()=>{if(checking)return;checking=true;guard().catch(()=>controller.abort()).finally(()=>{checking=false;});},2000);
  // Existing installed weights only; preload avoids charging load time to an individual meaning case.
  const preload=protocol.request(SOURCE,'',protocol.searchTask,protocol.searchFormat);preload.messages=[];await call('chat',preload);
  const verify=async model=>{
   if(role==='search')await warmSearch(call,model,protocol,Date.now,sample=>console.log(JSON.stringify(sample)));
   return verifyRole(role,call,model,protocol,Date.now,sample=>console.log(JSON.stringify({event:'LOCAL_ROLE_QUALITY',...sample})));
  };
  const result=mode==='--probe-only'?{role,changed:false,activated:false,proof:await verify(SOURCE)}:await activateRole(role,call,verify,guard);
  if(mode==='--probe-only')await guard();console.log(JSON.stringify({status:mode==='--probe-only'?'LOCAL_ROLE_CANDIDATE_PASSED':'LOCAL_ROLE_READY',...result,release,localOnly:true,downloads:0,databaseWrites:0,storeChanged:false}));
 }finally{clearTimeout(timer);clearInterval(monitor);controller.abort();await db.$disconnect();}
}
module.exports={activateRole,verifyRole,roleNames,assertResources,installedCandidate,assertLocalAiEnabled,warmSearch};
if(module.id==='[stdin]')main().catch(error=>{console.log(JSON.stringify({status:'LOCAL_ROLE_NOT_ACTIVATED',reason:String(error.message).slice(0,150)}));process.exitCode=1;});
