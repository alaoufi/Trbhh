import 'server-only';
import {getSetting} from '@/lib/settings';
import {request,searchTask,searchFormat,publicSearchTask,publicSearchFormat,translationFormat,translationTask,asciiDigits,validateIntentQueries} from '../../../scripts/local-ai/protocol.cjs';
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

const pool=createInferencePool();
export function clearLocalInferenceCache(){pool.clear();}
export async function localGenerate(input:string,task:string,format:Record<string,unknown>,budgetMs=12_000):Promise<unknown|null> {
 // Leave room for instructions and output within the local 2048-token context.
 if(!input||Buffer.byteLength(input,'utf8')>2048||budgetMs<=0)return null;
 const base=localServiceUrl(process.env.LOCAL_AI_URL||'http://ollama:11434','ollama');
 if(!base)return null;
 try{if(await getSetting('local_ai_enabled','1')!=='1'){clearLocalInferenceCache();return null;}}catch{return null;}
 const key=JSON.stringify([base,input,task,format]);
 return pool.run(key,async()=>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(15_000,budgetMs));
 try {
  const response=await fetch(`${base}/api/chat`,{
   method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json'},
   body:JSON.stringify(request('trbhh-local:active',input,task,format)),
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
}

export async function localTranslation(text:string,target:'ar'|'en',budgetMs=12_000):Promise<string|null> {
 const result=await localGenerate(text,translationTask(target),translationFormat,budgetMs) as {translation?:unknown}|null;
 return typeof result?.translation==='string'&&result.translation.trim()&&Buffer.byteLength(result.translation,'utf8')<=20_000?result.translation.trim():null;
}

export async function localSearchQueries(query:string):Promise<string[]> {
 const text=asciiDigits(query.normalize('NFC').trim().replace(/\s+/g,' ').slice(0,100));
 return validateIntentQueries(text,await localGenerate(text,searchTask,searchFormat));
}
/** A bounded local interpretation; callers retain the original text and every visibility filter. */
export async function localPublicSearchQueries(query:string):Promise<string[]> {
 const text=asciiDigits(query.normalize('NFC').trim().replace(/\s+/g,' '));
 if(!text||text.length>100||/^[A-Za-z0-9_-]+$/.test(text)&&/\d/.test(text))return [];
 return validateIntentQueries(text,await localGenerate(text,publicSearchTask,publicSearchFormat,8500),true);
}
