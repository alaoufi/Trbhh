/* One model execution per process; identical requests share work, never queue distinct misses. */
function createInferencePool(){
 const cache=new Map();let bytes=0,active=null,epoch=0;
 const counts={executions:0,coalesced:0,cacheHits:0,busy:0,waitersRejected:0};
 function clear(){cache.clear();bytes=0;epoch++;}
 function hit(key){
  const value=cache.get(key);if(!value)return null;
  if(value.expires<=Date.now()){cache.delete(key);bytes-=value.bytes;return null;}
  cache.delete(key);cache.set(key,value);counts.cacheHits++;return JSON.parse(value.json);
 }
 function remember(key,value){
  const json=JSON.stringify(value),size=Buffer.byteLength(key+json,'utf8');if(size>32768)return;
  while(cache.size>=128||bytes+size>1048576){const oldest=cache.keys().next().value;if(oldest===undefined)break;bytes-=cache.get(oldest).bytes;cache.delete(oldest);}
  cache.set(key,{json,bytes:size,expires:Date.now()+3600000});bytes+=size;
 }
 async function run(key,work,budgetMs){
  if(!Number.isFinite(budgetMs)||budgetMs<=0)return null;
  const value=hit(key);if(value!==null)return value;
  let job=active;
  if(job&&job.key!==key){counts.busy++;return null;}
  if(job&&job.waiters>=64){counts.waitersRejected++;return null;}
  if(job){counts.coalesced++;}else{
   const generation=epoch;job={key,waiters:0,promise:null};active=job;counts.executions++;
   const current=job;
   job.promise=Promise.resolve().then(work).then(result=>{
    if(result!==null&&result!==undefined&&generation===epoch)remember(key,result);
    return result??null;
   }).catch(()=>null).finally(()=>{if(active===current)active=null;});
  }
  job.waiters++;let timer;
  try{return await Promise.race([job.promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),Math.min(15000,budgetMs));})]);}
  finally{clearTimeout(timer);job.waiters--;}
 }
 return {run,clear,stats:()=>({...counts,active:active?1:0,waiters:active?.waiters||0,entries:cache.size,bytes})};
}
module.exports={createInferencePool};
