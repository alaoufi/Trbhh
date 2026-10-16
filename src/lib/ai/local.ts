import 'server-only';
import {getSetting} from '@/lib/settings';
import {request,searchTask,searchFormat,publicSearchTask,publicSearchFormat,translationFormat,translationTask,asciiDigits,validateIntentQueries,finalizeSupplierQueries} from '../../../scripts/local-ai/protocol.cjs';
import {createInferencePool} from '../../../scripts/local-ai/inference-pool.cjs';

/** Service identities are deployment-owned: saved URLs must never enable cloud inference. */
export function localServiceUrl(raw:string,service:'ollama'|'libretranslate'):string|null {
 try {
  const url=new URL(raw);
  if(url.protocol!=='http:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))return null;
  if(![service,'localhost','127.0.0.1','[::1]'].includes(url.hostname))return null;
  return url.origin;
 } catch {return null;}
}

const pool=createInferencePool({maxWaitMs:45_000});
type PriorityOptions={priority?:'background'};
let searches=0;
let background:{controller:AbortController;done:Promise<void>}|null=null;
export function localSearchActive(){return searches>0;}
export function clearLocalInferenceCache(){pool.clear();background?.controller.abort();}
export async function localGenerate(input:string,task:string,format:Record<string,unknown>,budgetMs=12_000,options:PriorityOptions={}):Promise<unknown|null> {
 // Leave room for instructions and output within the local 2048-token context.
 if(!input||Buffer.byteLength(input,'utf8')>2048||budgetMs<=0)return null;
 const base=localServiceUrl(process.env.LOCAL_AI_URL||'http://ollama:11434','ollama');
 if(!base)return null;
 try{if(await getSetting('local_ai_enabled','1')!=='1'){clearLocalInferenceCache();return null;}}catch{return null;}
 const isSearch=!!(format.properties as Record<string,unknown>|undefined)?.queries;
 const isBackground=options.priority==='background';
 if(isBackground&&(localSearchActive()||background))return null;
 const model=isSearch?'trbhh-local:search':'trbhh-local:translation';
 const key=JSON.stringify([base,model,input,task,format]);
 const backgroundController=isBackground?new AbortController():null;
 let backgroundFinished:(()=>void)|undefined;
 if(backgroundController)background={controller:backgroundController,done:new Promise<void>(resolve=>{backgroundFinished=resolve;})};
 if(isSearch)searches++;
 try{
 if(isSearch&&background){
  const running=background;running.controller.abort();
  let wait:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([running.done.then(()=>new Promise(resolve=>setTimeout(resolve,0))),new Promise(resolve=>{wait=setTimeout(resolve,250);})]);}finally{clearTimeout(wait);}
 }
 return await pool.run(key,async()=>{
 const controller=backgroundController||new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(isBackground?45_000:15_000,budgetMs));
 try {
  if(isBackground&&(controller.signal.aborted||localSearchActive()))return null;
  const response=await fetch(`${base}/api/chat`,{
   method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json'},
   body:JSON.stringify(request(model,input,task,format)),
  });
  if(!response.ok||!response.body)return null;
  const reader=response.body.getReader();let text='',bytes=0;const decoder=new TextDecoder();
  while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>65_536){await reader.cancel();return null;}text+=decoder.decode(part.value,{stream:true});}
  text+=decoder.decode();
  const result=JSON.parse(text);
  if(result.done!==true||result.done_reason==='length'||typeof result.message?.content!=='string')return null;
  const value=JSON.parse(result.message.content);if(!value||typeof value!=='object'||Array.isArray(value))return null;
  return value;
 } catch {return null;} finally {clearTimeout(timer);}
 },budgetMs);
 }finally{if(background?.controller===backgroundController)background=null;backgroundFinished?.();if(isSearch)searches--;}
}

export async function localTranslation(text:string,target:'ar'|'en',budgetMs=12_000,options:PriorityOptions={}):Promise<string|null> {
 const result=await localGenerate(text,translationTask(target),translationFormat,budgetMs,options) as {translation?:unknown}|null;
 return typeof result?.translation==='string'&&result.translation.trim()&&Buffer.byteLength(result.translation,'utf8')<=20_000?result.translation.trim():null;
}

export async function localSearchQueries(query:string):Promise<string[]> {
 const text=asciiDigits(query.normalize('NFC').trim().replace(/\s+/g,' ').slice(0,100));
 return finalizeSupplierQueries(text,await localGenerate(text,searchTask,searchFormat));
}
/** A bounded local interpretation; callers retain the original text and every visibility filter. */
export async function localPublicSearchQueries(query:string):Promise<string[]> {
 const text=asciiDigits(query.normalize('NFC').trim().replace(/\s+/g,' '));
 if(!text||text.length>100||/^[A-Za-z0-9_-]+$/.test(text)&&/\d/.test(text))return [];
 return validateIntentQueries(text,await localGenerate(text,publicSearchTask,publicSearchFormat,8500),true);
}
