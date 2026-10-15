/* Diagnostic only: never creates an active alias or changes application settings. */
const CANDIDATES=['qwen3.5:4b','qwen3.5:9b'];
async function api(path,body){
 if(!['chat','pull','tags'].includes(path)||body?.model&&!CANDIDATES.includes(body.model))throw Error('benchmark_mutation_blocked');
 const loading=path==='chat'&&body?.messages?.length===0;
 const limit=path==='pull'?30*60*1000:loading?300000:120000,started=Date.now();
 console.log(`BENCHMARK_STAGE=${path} MODEL=${body?.model||'inventory'}`);
 const progress=setInterval(()=>console.log(`BENCHMARK_WAIT=${path} SECONDS=${Math.round((Date.now()-started)/1000)}`),30000);
 try{
  const response=await fetch(`http://ollama:11434/api/${path}`,{method:path==='tags'?'GET':'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(limit)});
  const result=await response.json();
  if(!response.ok)throw Error(`benchmark_${path}_${response.status}: ${String(result.error||'request failed').slice(0,300)}`);
  return result;
 }finally{clearInterval(progress);}
}
async function compare(call,gate,log=console.log){
 const initial=await call('tags');
 if(initial.models?.some(model=>model.name==='trbhh-local:active'))throw Error('benchmark_existing_active_model_requires_review');
 const rejected=[];
 for(const model of CANDIDATES){
  let installed=false;
  log(`BENCHMARK_CANDIDATE=${model} — no application deployment or activation.`);
  try{
   if((await call('pull',{model,stream:false}))?.status!=='success')throw Error('benchmark_pull_incomplete');
   const tags=await call('tags'),digest=tags.models?.find(item=>item.name===model)?.digest;
   if(!digest)throw Error('benchmark_candidate_missing');
   installed=true;
   const proof=await gate(call,model);
   return {status:'LOCAL_AI_CANDIDATE_PASSED',model,digest,proof,rejected,activated:false};
  }catch(error){
   const failure={model,error:String(error.message).slice(0,400),proof:error.proof||[]};rejected.push(failure);log(JSON.stringify(failure));
  }finally{if(installed)await call('chat',{model,messages:[],stream:false,keep_alive:0});}
 }
 return {status:'LOCAL_AI_NO_ACCEPTED_CANDIDATE',rejected,activated:false};
}
module.exports={compare,api};
if(module.id==='[stdin]'){
 if(typeof globalThis.__trbhhLocalGate!=='function')throw Error('benchmark_gate_missing');
 compare(api,globalThis.__trbhhLocalGate).then(result=>{console.log(JSON.stringify(result));if(result.status!=='LOCAL_AI_CANDIDATE_PASSED')process.exitCode=1;}).catch(error=>{console.error(String(error.message).slice(0,400));process.exitCode=1;});
}
