// Endpoint transport verification only, never merchant OAuth/purchase E2E.
const {createHmac}=require('node:crypto');
const origin='https://trbhh.sa';
async function probe(fetcher,path,options,status,received=false){
 const controller=new AbortController();let timer;
 try{
  await Promise.race([
   (async()=>{
    const response=await fetcher(origin+path,{...options,redirect:'error',credentials:'omit',signal:controller.signal});
    if(response.status!==status||response.redirected)throw Error('probe');
    if(!response.body)throw Error('probe');
    const reader=response.body.getReader();const chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096)throw Error('probe');chunks.push(value);}}
    finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
    if(received&&JSON.parse(Buffer.concat(chunks).toString('utf8')).received!==true)throw Error('probe');
   })(),
   new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('probe'));},8000);})
  ]);
 }finally{clearTimeout(timer);controller.abort();}
}
async function runSmoke(env,fetcher=fetch){
 if(env.SUPPLIER_PUBLIC_ORIGIN!==origin||env.SUPPLIER_ALLOW_LIVE_ORDERS!=='false'||typeof env.SALLA_WEBHOOK_SECRET!=='string'||!env.SALLA_WEBHOOK_SECRET)return {codes:['unsafe_runtime']};
 let failure='callback_probe_failed';
 try{
  await probe(fetcher,'/api/integrations/salla/callback',{method:'GET',headers:{}},403);
  failure='unsigned_probe_failed';
  await probe(fetcher,'/api/integrations/salla/webhooks',{method:'POST',headers:{'content-type':'application/json'},body:'{}'},401);
  const body=JSON.stringify({event:'trbhh.integration.healthcheck',merchant:'0',created_at:new Date().toISOString(),data:{}});
  const signature=createHmac('sha256',env.SALLA_WEBHOOK_SECRET).update(body).digest('hex');
  const headers={'content-type':'application/json','x-salla-security-strategy':'Signature','x-salla-signature':signature};
  failure='signed_probe_failed';
  await probe(fetcher,'/api/integrations/salla/webhooks',{method:'POST',headers,body},200,true);
  failure='invalid_signature_probe_failed';
  await probe(fetcher,'/api/integrations/salla/webhooks',{method:'POST',headers:{...headers,'x-salla-signature':(signature[0]==='0'?'1':'0')+signature.slice(1)},body},400);
  return {codes:['callback_forbidden','unsigned_rejected','signed_ignored_received','invalid_signature_rejected']};
 }catch{return {codes:[failure]};}
}
module.exports={runSmoke};
if(require.main===module||module.id==='[stdin]'){
 runSmoke(process.env).then(result=>{console.log(JSON.stringify(result));if(result.codes.length!==4)process.exitCode=1;}).catch(()=>{console.log('{"codes":["smoke_failed"]}');process.exitCode=1;});
}
