import {createRequire} from 'node:module';
import {expect,it,vi} from 'vitest';
const {createInferencePool}=createRequire(import.meta.url)('../../scripts/local-ai/inference-pool.cjs');
it('extends only explicitly configured background waits while keeping the default ceiling',async()=>{
 vi.useFakeTimers();
 try{
  const normal=createInferencePool(),background=createInferencePool({maxWaitMs:45000});let release!:(value:unknown)=>void;
  const first=normal.run('normal',()=>new Promise(()=>{}),45000);
  const second=background.run('background',()=>new Promise(resolve=>{release=resolve;}),45000);
  let completed=false;void second.then(()=>{completed=true;});
  await vi.advanceTimersByTimeAsync(15001);expect(await first).toBeNull();expect(completed).toBe(false);
  release({translation:'نص'});expect(await second).toEqual({translation:'نص'});
 }finally{vi.useRealTimers();}
});
it('serves forty identical simultaneous searches with one model execution',async()=>{
 const pool=createInferencePool();let release!:(value:unknown)=>void;
 const work=vi.fn(()=>new Promise(resolve=>{release=resolve;}));
 const jobs=Array.from({length:40},()=>pool.run('same',work,1000));
 await vi.waitFor(()=>expect(work).toHaveBeenCalledOnce());release({queries:['kitchen organizer']});
 expect(await Promise.all(jobs)).toEqual(Array.from({length:40},()=>({queries:['kitchen organizer']})));
 expect(pool.stats()).toMatchObject({executions:1,coalesced:39,active:0,waiters:0});
 expect(await pool.run('same',work,1000)).toEqual({queries:['kitchen organizer']});expect(work).toHaveBeenCalledOnce();
});
it('does not queue unrelated cold requests or exceed the waiter ceiling',async()=>{
 const pool=createInferencePool();let release!:(value:unknown)=>void;
 const work=()=>new Promise(resolve=>{release=resolve;});
 const jobs=Array.from({length:64},()=>pool.run('same',work,1000));
 expect(await pool.run('different',work,1000)).toBeNull();
 expect(await pool.run('same',work,1000)).toBeNull();
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));release({ok:true});await Promise.all(jobs);
 expect(pool.stats()).toMatchObject({executions:1,busy:1,waitersRejected:1});
});
it('a short waiter deadline cannot cancel the shared model request',async()=>{
 const pool=createInferencePool();let release!:(value:unknown)=>void;
 const first=pool.run('same',()=>new Promise(resolve=>{release=resolve;}),1000);
 expect(await pool.run('same',()=>{throw Error('duplicate');},5)).toBeNull();
 release({ok:true});expect(await first).toEqual({ok:true});expect(pool.stats().active).toBe(0);
});
it('retains the busy slot until underlying work settles and does not cache failures',async()=>{
 const pool=createInferencePool();let release!:(value:unknown)=>void;
 expect(await pool.run('slow',()=>new Promise(resolve=>{release=resolve;}),5)).toBeNull();
 expect(await pool.run('other',async()=>({ok:true}),1000)).toBeNull();release(null);
 await vi.waitFor(()=>expect(pool.stats().active).toBe(0));
 expect(await pool.run('slow',async()=>({ok:true}),1000)).toEqual({ok:true});
});
it('clearing during inference prevents late cache repopulation',async()=>{
 const pool=createInferencePool();let release!:(value:unknown)=>void;
 const first=pool.run('same',()=>new Promise(resolve=>{release=resolve;}),1000);
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));pool.clear();release({ok:true});await first;
 expect(pool.stats().entries).toBe(0);
});
