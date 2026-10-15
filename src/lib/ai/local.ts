import 'server-only';
import {getSetting} from '@/lib/settings';
import {request,searchTask,searchFormat,translationFormat,translationTask} from '../../../scripts/local-ai/protocol.cjs';

/** Service identities are deployment-owned: saved URLs must never enable cloud inference. */
export function localServiceUrl(raw:string,service:'ollama'|'libretranslate'):string|null {
 try {
  const url=new URL(raw);
  if(url.protocol!=='http:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))return null;
  if(![service,'localhost','127.0.0.1','[::1]'].includes(url.hostname))return null;
  return url.origin;
 } catch {return null;}
}

let running=0;
const cache=new Map<string,{expires:number;json:string;bytes:number}>();
let cacheBytes=0;
export function clearLocalInferenceCache(){cache.clear();cacheBytes=0;}
function cached(key:string):unknown|null {
 const entry=cache.get(key);if(!entry)return null;
 if(entry.expires<=Date.now()){cache.delete(key);cacheBytes-=entry.bytes;return null;}
 cache.delete(key);cache.set(key,entry);return JSON.parse(entry.json);
}
function remember(key:string,value:unknown){
 const json=JSON.stringify(value),bytes=Buffer.byteLength(key+json,'utf8');
 if(bytes>32_768)return;
 const old=cache.get(key);if(old){cacheBytes-=old.bytes;cache.delete(key);}
 while(cache.size>=128||cacheBytes+bytes>1_048_576){const oldest=cache.keys().next().value;if(oldest===undefined)break;cacheBytes-=cache.get(oldest)!.bytes;cache.delete(oldest);}
 cache.set(key,{json,bytes,expires:Date.now()+3_600_000});cacheBytes+=bytes;
}
export async function localGenerate(input:string,task:string,format:Record<string,unknown>,budgetMs=12_000):Promise<unknown|null> {
 // Leave room for instructions and output within the local 2048-token context.
 if(!input||Buffer.byteLength(input,'utf8')>2048||budgetMs<=0)return null;
 const base=localServiceUrl(process.env.LOCAL_AI_URL||'http://ollama:11434','ollama');
 if(!base)return null;
 try{if(await getSetting('local_ai_enabled','1')!=='1'){clearLocalInferenceCache();return null;}}catch{return null;}
 const key=JSON.stringify([base,input,task,format]),hit=cached(key);if(hit!==null)return hit;
 // Reject excess work immediately: do not let inference build a queue behind checkout.
 if(running>=1)return null;
 running++;
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
  remember(key,value);return value;
 } catch {return null;} finally {clearTimeout(timer);running--;}
}

export async function localTranslation(text:string,target:'ar'|'en',budgetMs=12_000):Promise<string|null> {
 const result=await localGenerate(text,translationTask(target),translationFormat,budgetMs) as {translation?:unknown}|null;
 return typeof result?.translation==='string'&&result.translation.trim()&&Buffer.byteLength(result.translation,'utf8')<=20_000?result.translation.trim():null;
}

const asciiDigits=(text:string)=>text.replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-0x660));
const joinedUnits=(text:string)=>text.replace(/(\d)\s+(V|W|mAh|Ah|ml|mm|cm|kg|GB|TB)\b/gi,'$1$2');
export async function localSearchQueries(query:string):Promise<string[]> {
 const text=asciiDigits(query.trim().slice(0,100));
 const result=await localGenerate(text,searchTask,searchFormat) as {queries?:unknown}|null;
 if(!Array.isArray(result?.queries))return [];
 const constraints=joinedUnits(text);
 const required=(constraints.match(/[A-Za-z]*\d+[A-Za-z\d.-]*|\d+(?:\.\d+)?/g)||[]).map(word=>word.toLowerCase());
 const brands=/\p{Script=Arabic}/u.test(text)?constraints.match(/\b[A-Za-z][A-Za-z0-9-]*\b/g)||[]:[];
 return [...new Set(result.queries.filter((value):value is string=>typeof value==='string')
  .map(value=>value.replace(/\s+/g,' ').trim())
  .filter(value=>value.length>0&&value.length<=100&&/[a-z]/i.test(value)&&!/[\p{Script=Arabic}\p{Cc}<>]/u.test(value)
   &&[...required,...brands.map(word=>word.toLowerCase())].every(word=>joinedUnits(value).toLowerCase().split(/[^a-z0-9.-]+/).includes(word))))].slice(0,3);
}
