import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {describe,expect,it,vi} from 'vitest';
const {update,smoke}=createRequire(import.meta.url)('../../scripts/local-ai/update-model.cjs');
function fixture(failCandidate=false,failActive=false,same=false){
 const calls:{path:string;body?:Record<string,unknown>}[]=[];
 let active=same?'new':'old';let rollback='';
 const api=vi.fn(async(path:string,body?:Record<string,unknown>)=>{
  calls.push({path,body});
  if(path==='tags')return {models:[{name:'trbhh-local:active',digest:active},{name:'qwen3:8b',digest:'new'}]};
  if(path==='copy'){
   if(body?.destination==='trbhh-local:rollback')rollback=active;
   else active=body?.source==='qwen3:8b'?'new':rollback;
  }
  if(path==='pull')return {status:'success'};
  if(path==='generate'){
   if(failCandidate&&body?.model==='qwen3:8b'||failActive&&body?.model==='trbhh-local:active')throw Error('smoke failure');
   const text=JSON.parse(String(body?.prompt)).text;
   return {done:true,response:JSON.stringify(text==='Cotton shirt'?{translation:'قميص قطني'}:{queries:[text.includes('Samsung')?'Samsung S24 case':text.includes('المطبخ')?'kitchen utensil organizer':'18V cordless drill']})};
  }
  return null;
 });return {api,calls};
}
describe('local model update lifecycle',()=>{
 it('does not switch or test an unchanged model',async()=>{const f=fixture(false,false,true);expect(await update(f.api)).toMatchObject({status:'unchanged'});expect(f.calls.map(c=>c.path)).toEqual(['tags','pull','tags']);});
 it('validates candidate, backs up active and tests the promoted alias',async()=>{const f=fixture();expect(await update(f.api)).toMatchObject({status:'updated',rollback:true});expect(f.calls.filter(c=>c.path==='copy').map(c=>c.body)).toEqual([{source:'trbhh-local:active',destination:'trbhh-local:rollback'},{source:'qwen3:8b',destination:'trbhh-local:active'}]);});
 it('leaves active untouched if candidate fails',async()=>{const f=fixture(true);await expect(update(f.api)).rejects.toThrow();expect(f.calls.some(c=>c.path==='copy')).toBe(false);});
 it('restores and verifies rollback if promoted alias fails',async()=>{const f=fixture(false,true);await expect(update(f.api)).rejects.toThrow();expect(f.calls.at(-2)).toEqual({path:'copy',body:{source:'trbhh-local:rollback',destination:'trbhh-local:active'}});expect(f.calls.at(-1)?.path).toBe('tags');});
 it('reports unverified rollback rather than claiming recovery',async()=>{const f=fixture(false,true);const api=async(path:string,body?:Record<string,unknown>)=>{if(path==='copy'&&body?.source==='trbhh-local:rollback')throw Error('restore failure');return f.api(path,body);};await expect(update(api)).rejects.toThrow('local_ai_rollback_failed');});
 it('rejects a valid JSON response that loses the kitchen organization intent',async()=>{const f=fixture();const call=async(path:string,body?:Record<string,unknown>)=>{if(path==='generate'&&String(body?.prompt).includes('المطبخ'))return {done:true,response:JSON.stringify({queries:['kitchen appliance']})};return f.api(path,body);};await expect(update(call)).rejects.toThrow('local_ai_smoke_failed');expect(f.calls.some(c=>c.path==='copy')).toBe(false);});
 it('rejects a warm response slower than the application deadline',async()=>{
  const f=fixture();let clock=0,calls=0;const spy=vi.spyOn(Date,'now').mockImplementation(()=>clock);
  try{const call=async(path:string,body?:Record<string,unknown>)=>{const result=await f.api(path,body);if(path==='generate')clock+=(++calls===1?60_000:12_000);return result;};await expect(smoke(call,'qwen3:8b')).rejects.toThrow('local_ai_too_slow');}finally{spy.mockRestore();}
 });
});

it('executes the updater when streamed into container Node stdin',()=>{
 const script=readFileSync(new URL('../../scripts/local-ai/update-model.cjs',import.meta.url),'utf8');
 const prelude='globalThis.fetch=async(url)=>new Response(JSON.stringify(String(url).endsWith("/pull")?{status:"success"}:{models:[{name:"trbhh-local:active",digest:"same"},{name:"qwen3:8b",digest:"same"}]}));\n';
 const result=spawnSync(process.execPath,['-'],{input:prelude+script,encoding:'utf8',timeout:5000});
 expect(result.status).toBe(0);expect(JSON.parse(result.stdout)).toMatchObject({status:'unchanged'});
});
