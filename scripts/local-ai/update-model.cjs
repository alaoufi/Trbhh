/* Model downloads contain no customer text. Inference stays on the Docker network. */
const ACTIVE='trbhh-local:active',ROLLBACK='trbhh-local:rollback',SOURCE='qwen3:8b';
async function api(path,body){
 const response=await fetch(`http://ollama:11434/api/${path}`,{method:path==='delete'?'DELETE':body?'POST':'GET',redirect:'error',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(path==='pull'?30*60*1000:120000)});
 if(!response.ok)throw Error(`local_ai_${path}_failed`);
 if(response.status===204||path==='copy')return null;
 return response.json();
}
async function smoke(call,model){
 const proof=[];
 const cases=[
  {text:'غطاء Samsung S24',key:'queries',task:'Produce JSON queries, an array of concise English catalog search phrases for the input. Preserve brand, model and accessory intent.',check:v=>Array.isArray(v)&&v.length>0&&v.every(q=>typeof q==='string'&&/Samsung/i.test(q)&&/S24/i.test(q)&&/case|cover/i.test(q))},
  {text:'أبغى دريل بدون سلك 18V',key:'queries',task:'Produce JSON queries, an array of English catalog search phrases for the input. Preserve voltage and cordless intent.',check:v=>Array.isArray(v)&&v.length>0&&v.every(q=>typeof q==='string'&&/drill/i.test(q)&&/cordless|wireless/i.test(q)&&/18\s*V/i.test(q))},
  {text:'شي يرتب لي أدوات المطبخ',key:'queries',task:'Understand colloquial Arabic shopping intent and return JSON queries, an array of concise English catalog terms for the SAME item.',check:v=>Array.isArray(v)&&v.length>0&&v.every(q=>typeof q==='string'&&/kitchen|utensil/i.test(q)&&/organiz|storage|rack/i.test(q))},
  {text:'Cotton shirt',key:'translation',task:'Translate the input into Arabic. Return JSON translation, a string.',check:v=>typeof v==='string'&&/قطن/.test(v)&&/قميص/.test(v)},
 ];
 for(const test of cases){
  const started=Date.now();
  const result=await call('generate',{model,stream:false,think:false,keep_alive:'24h',format:{type:'object',properties:{[test.key]:test.key==='queries'?{type:'array',items:{type:'string'},maxItems:3}:{type:'string'}},required:[test.key],additionalProperties:false},system:test.task,prompt:JSON.stringify({text:test.text}),options:{temperature:0,num_thread:4,num_ctx:2048,num_predict:256}});
  const elapsedMs=Date.now()-started;
  if(!result||result.done!==true||result.done_reason==='length')throw Error('local_ai_smoke_incomplete');
  const parsed=JSON.parse(result.response);if(!test.check(parsed[test.key]))throw Error('local_ai_smoke_failed');
  // First request may load the weights. Subsequent requests must fit app deadlines.
  if(proof.length>0&&elapsedMs>(test.key==='translation'?8500:11500))throw Error('local_ai_too_slow');
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
 if(candidate.digest===old?.digest)return {status:'unchanged',digest:candidate.digest};
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
module.exports={update,smoke};
if(require.main===module||module.id==='[stdin]')(process.argv[2]==='--verify'?smoke(api,ACTIVE).then(proof=>({status:'LOCAL_AI_READY',model:SOURCE,proof})):update()).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message==='local_ai_rollback_failed'?'Local AI rollback could not be verified. Manual intervention required.':`Local model not accepted: ${String(error.message).replace(/[^a-z0-9_]/gi,'_').slice(0,80)}. Candidate rejected or previous model restored.`);process.exitCode=1;});
