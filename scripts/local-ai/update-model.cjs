/* Model downloads contain no customer text. Inference stays on the Docker network. */
const ACTIVE='trbhh-local:active',ROLLBACK='trbhh-local:rollback',SOURCE='qwen3:8b';
const {request,searchTask,searchFormat,translationTask,translationFormat}=globalThis.__trbhhLocalProtocol||require('./protocol.cjs');
function isPreload(path,body){return path==='chat'&&Array.isArray(body?.messages)&&body.messages.length===0;}
function apiTimeout(path,body){return path==='pull'?30*60*1000:isPreload(path,body)?5*60*1000:120000;}
async function api(path,body){
 const loading=isPreload(path,body),started=Date.now();
 if(loading)console.log('LOCAL_AI_PRELOAD — loading installed weights; maximum 5 minutes.');
 const progress=loading?setInterval(()=>console.log(`LOCAL_AI_PRELOAD — ${Math.round((Date.now()-started)/1000)} seconds elapsed; waiting for model readiness.`),30000):null;
 try {
 const response=await fetch(`http://ollama:11434/api/${path}`,{method:path==='delete'?'DELETE':body?'POST':'GET',redirect:'error',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(apiTimeout(path,body))});
 if(!response.ok)throw Error(`local_ai_${path}_failed`);
 if(response.status===204||path==='copy')return null;
 const result=await response.json();
 if(loading)console.log(`LOCAL_AI_PRELOAD_READY — ${Math.round((Date.now()-started)/1000)} seconds.`);
 return result;
 } catch(error){if(error?.name==='TimeoutError'||error?.name==='AbortError')throw Error(loading?'local_ai_preload_timeout':`local_ai_${path}_timeout`);throw error;}
 finally{if(progress)clearInterval(progress);}
}
async function smoke(call,model){
 // Loading/repacking CPU weights is preparation, not search latency. Use identical
 // runner options to the application so the first real query does not reload it.
 const preparation=request(model,'','',{});delete preparation.format;preparation.messages=[];
 const loaded=await call('chat',preparation);
 if(loaded?.done!==true)throw Error('local_ai_preload_incomplete');
 const proof=[];
 const cases=[
  {text:'غطاء Samsung S24',key:'queries',check:v=>Array.isArray(v)&&v.length>0&&v.every(q=>typeof q==='string'&&/Samsung/i.test(q)&&/S24/i.test(q)&&/case|cover/i.test(q))},
  {text:'أبغى دريل بدون سلك 18V',key:'queries',check:v=>Array.isArray(v)&&v.length>0&&v.every(q=>typeof q==='string'&&/drill/i.test(q)&&/cordless|wireless/i.test(q)&&/18\s*V/i.test(q))},
  {text:'شي يرتب لي أدوات المطبخ',key:'queries',check:v=>Array.isArray(v)&&v.length>0&&v.every(q=>typeof q==='string'&&/kitchen|utensil/i.test(q)&&/organiz|storage|rack/i.test(q)&&!/^organiz(?:e|ing) your/i.test(q))},
  {text:'جزمة للمشي ضد الموية مقاس 42',key:'queries',check:v=>Array.isArray(v)&&v.length>0&&v.every(q=>typeof q==='string'&&/shoe|footwear/i.test(q)&&/walk/i.test(q)&&/waterproof|water.resistant/i.test(q)&&/\b42\b/.test(q))},
  {text:'Cotton shirt',key:'translation',check:v=>typeof v==='string'&&/قطن/.test(v)&&/قميص/.test(v)},
  {text:'Stainless steel bottle 750ml, not insulated',key:'translation',check:v=>typeof v==='string'&&/زجاجة|قارورة|عبوة/.test(v)&&/750|٧٥٠/.test(v)&&/غير معزول|بدون عزل/.test(v)&&/ستانلس|فولاذ|صدأ/.test(v)},
 ];
 for(const test of cases){
  const started=Date.now();
  const body=request(model,test.text,test.key==='queries'?searchTask:translationTask('ar'),test.key==='queries'?searchFormat:translationFormat);
  const result=await call('chat',body);
  const elapsedMs=Date.now()-started;
  if(!result||result.done!==true||result.done_reason==='length')throw Error('local_ai_smoke_incomplete');
  const parsed=JSON.parse(result.message?.content||'{}');
  if(!test.check(parsed[test.key])||(test.key==='queries'&&parsed.queries.some(q=>!/^[ -~]+$/.test(q)))){
   const error=Error('local_ai_smoke_failed');error.proof=[...proof,{input:test.text,elapsedMs,result:parsed[test.key],passed:false}];throw error;
  }
  // Every inference, including the first after preparation, must fit app deadlines.
  if(elapsedMs>(test.key==='translation'?8500:11500))throw Error('local_ai_too_slow');
  proof.push({input:test.text,elapsedMs,result:parsed[test.key]});
 }
 return proof;
}
async function update(call=api){
 const previous=await call('tags');
 const old=previous.models?.find(model=>model.name===ACTIVE);
 // Download only the explicitly chosen model family. No automatic migration to larger models.
 const pulled=await call('pull',{model:SOURCE,stream:false});
 if(pulled?.status!=='success')throw Error('local_ai_pull_incomplete');
 const tags=await call('tags'),candidate=tags.models?.find(model=>model.name===SOURCE);
 if(!candidate?.digest)throw Error('local_ai_candidate_missing');
 if(candidate.digest===old?.digest)return {status:'unchanged',digest:candidate.digest,proof:await smoke(call,ACTIVE)};
 await smoke(call,SOURCE); // Active alias remains untouched during validation.
 if(old)await call('copy',{source:ACTIVE,destination:ROLLBACK});
 try {
  await call('copy',{source:SOURCE,destination:ACTIVE});
  const promoted=await call('tags');
  if(promoted.models?.find(model=>model.name===ACTIVE)?.digest!==candidate.digest)throw Error('local_ai_promotion_unverified');
  await smoke(call,ACTIVE);
 } catch(error){
  try {
   if(old){
    await call('copy',{source:ROLLBACK,destination:ACTIVE});
    const restored=await call('tags');
    if(restored.models?.find(model=>model.name===ACTIVE)?.digest!==old.digest)throw Error('restore mismatch');
   } else await call('delete',{model:ACTIVE});
  } catch {throw Error('local_ai_rollback_failed');}
  throw error;
 }
 return {status:'updated',digest:candidate.digest,rollback:!!old};
}
module.exports={update,smoke,apiTimeout};
if(require.main===module||module.id==='[stdin]')(process.argv[2]==='--verify'?smoke(api,ACTIVE).then(proof=>({status:'LOCAL_AI_READY',model:SOURCE,proof})):update()).then(result=>console.log(JSON.stringify(result))).catch(error=>{if(error.proof)console.error(JSON.stringify({status:'LOCAL_AI_QUALITY_REJECTED',proof:error.proof}));console.error(error.message==='local_ai_rollback_failed'?'Local AI rollback could not be verified. Manual intervention required.':`Local model not accepted: ${String(error.message).replace(/[^a-z0-9_]/gi,'_').slice(0,80)}. Candidate rejected or previous model restored.`);process.exitCode=1;});
