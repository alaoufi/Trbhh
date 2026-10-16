import 'server-only';
import {stat} from 'node:fs/promises';
import {getSetting} from '@/lib/settings';
import {MODEL,DIGEST,INDEX_PATH,MAX_AGE,readIndex,hash,rank,createBatcher,embedTexts,verifyModel} from '../../../scripts/local-ai/semantic-core.cjs';

type Snapshot={builtAt:string;docs:{id:string;text:string;vector:Float32Array}[]};
type Result={ids:string[];mode:'semantic'|'fallback'};
let snapshot:Snapshot|null=null,stamp='',checkedAt=0,refresh:Promise<Snapshot|null>|null=null;
const vectors=new Map<string,Float32Array>();let vectorBytes=0,verifiedUntil=0;
const batch=createBatcher(async(texts:string[])=>{
 if(Date.now()>verifiedUntil){await verifyModel();verifiedUntil=Date.now()+60000;}
 return embedTexts(texts);
});
async function currentIndex():Promise<Snapshot|null>{
 if(Date.now()-checkedAt<60000)return snapshot&&Date.now()-Date.parse(snapshot.builtAt)<=MAX_AGE?snapshot:null;
 if(refresh)return refresh;
 refresh=(async()=>{
  try{
   const info=await stat(INDEX_PATH),next=`${info.ino}:${info.size}:${info.mtimeMs}`;
   if(next!==stamp||!snapshot){snapshot=await readIndex();stamp=next;vectors.clear();vectorBytes=0;}
   checkedAt=Date.now();return snapshot&&Date.now()-Date.parse(snapshot.builtAt)<=MAX_AGE?snapshot:null;
  }catch{snapshot=null;stamp='';checkedAt=Date.now();vectors.clear();vectorBytes=0;return null;}
 })().finally(()=>{refresh=null;});return refresh;
}
function cache(key:string,vector:Float32Array){
 if(vectors.has(key))return;
 while(vectors.size>=256||vectorBytes+vector.byteLength>1048576){const first=vectors.keys().next().value;if(first===undefined)break;vectorBytes-=vectors.get(first)!.byteLength;vectors.delete(first);}
 vectors.set(key,vector);vectorBytes+=vector.byteLength;
}
async function search(query:string):Promise<Result>{
 if(await getSetting('local_ai_enabled','1')!=='1')return {ids:[],mode:'fallback'};
 const index=await currentIndex();if(!index?.docs.length)return {ids:[],mode:'fallback'};
 const key=hash(`${MODEL}:${DIGEST}:${stamp}:${query}`);
 let vector=vectors.get(key);
 if(!vector){vector=await batch('task: search result | query: '+query) as Float32Array;cache(key,vector);}
 const matches=rank(query,vector,index.docs) as {id:string;score:number}[],cutoff=Math.max(.1,(matches[0]?.score||0)*.7);
 return {ids:matches.filter(item=>item.score>=cutoff).slice(0,40).map(item=>item.id),mode:'semantic'};
}
/** Local public catalog only. The caller must recheck public eligibility on hydration. */
export async function semanticProductSearch(raw:string):Promise<Result>{
 const query=raw.normalize('NFC').replace(/\s+/g,' ').trim();
 if(!query||query.length>200||Buffer.byteLength(query)>1800)return {ids:[],mode:'fallback'};
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([search(query),new Promise<Result>(resolve=>{timer=setTimeout(()=>resolve({ids:[],mode:'fallback'}),3000);})]);}
 catch{return {ids:[],mode:'fallback'};}finally{clearTimeout(timer);}
}
