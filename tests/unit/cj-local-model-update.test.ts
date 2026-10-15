import {createRequire} from 'node:module';
import {describe,expect,it,vi} from 'vitest';
const {update}=createRequire(import.meta.url)('../../scripts/local-ai/update-model.cjs');
function fixture(failCandidate=false,failActive=false,same=false){
 const calls:{path:string;body?:Record<string,unknown>}[]=[];
 let active=same?'new':'old';let rollback='';
 const api=vi.fn(async(path:string,body?:Record<string,unknown>)=>{
  calls.push({path,body});
  if(path==='tags')return {models:[{name:'trbhh-local:active',digest:active},{name:'qwen3:4b',digest:'new'}]};
  if(path==='copy'){
   if(body?.destination==='trbhh-local:rollback')rollback=active;
   else active=body?.source==='qwen3:4b'?'new':rollback;
  }
  if(path==='pull')return {status:'success'};
  if(path==='generate'){
   if(failCandidate&&body?.model==='qwen3:4b'||failActive&&body?.model==='trbhh-local:active')throw Error('smoke failure');
   const text=JSON.parse(String(body?.prompt)).text;
   return {done:true,response:JSON.stringify(text==='Cotton shirt'?{translation:'قميص قطني'}:{queries:[text.includes('Samsung')?'Samsung S24 case':'18V cordless drill']})};
  }
  return null;
 });return {api,calls};
}
describe('local model update lifecycle',()=>{
 it('does not switch or test an unchanged model',async()=>{const f=fixture(false,false,true);expect(await update(f.api)).toMatchObject({status:'unchanged'});expect(f.calls.map(c=>c.path)).toEqual(['tags','pull','tags']);});
 it('validates candidate, backs up active and tests the promoted alias',async()=>{const f=fixture();expect(await update(f.api)).toMatchObject({status:'updated',rollback:true});expect(f.calls.filter(c=>c.path==='copy').map(c=>c.body)).toEqual([{source:'trbhh-local:active',destination:'trbhh-local:rollback'},{source:'qwen3:4b',destination:'trbhh-local:active'}]);});
 it('leaves active untouched if candidate fails',async()=>{const f=fixture(true);await expect(update(f.api)).rejects.toThrow();expect(f.calls.some(c=>c.path==='copy')).toBe(false);});
 it('restores and verifies rollback if promoted alias fails',async()=>{const f=fixture(false,true);await expect(update(f.api)).rejects.toThrow();expect(f.calls.at(-2)).toEqual({path:'copy',body:{source:'trbhh-local:rollback',destination:'trbhh-local:active'}});expect(f.calls.at(-1)?.path).toBe('tags');});
 it('reports unverified rollback rather than claiming recovery',async()=>{const f=fixture(false,true);const api=async(path:string,body?:Record<string,unknown>)=>{if(path==='copy'&&body?.source==='trbhh-local:rollback')throw Error('restore failure');return f.api(path,body);};await expect(update(api)).rejects.toThrow('local_ai_rollback_failed');});
});
