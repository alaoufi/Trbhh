import {createRequire} from 'node:module';
import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {summary,burst,readSmall,assertResources,releaseExploratory}=createRequire(import.meta.url)('../../scripts/local-ai/capacity-check.cjs');
it('releases only the exploratory model, never unloading the active application alias',async()=>{
 const fetcher=vi.fn(async(_url:string,_init:{body:string})=>Response.json({done:true}));
 await releaseExploratory('trbhh-local:active',fetcher);expect(fetcher).not.toHaveBeenCalled();
 expect(await releaseExploratory('qwen3.5:9b',fetcher)).toBe(true);
 expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({model:'qwen3.5:9b',messages:[],stream:false,keep_alive:0});
});
it('counts literal/unknown answers separately from successful intelligence',()=>{
 const result=summary([{ms:10,ok:true,mode:'intent'},{ms:20,ok:true,mode:'literal'},{ms:100,ok:false,mode:'unknown'}],100);
 expect(result).toMatchObject({requests:3,success:2,errors:1,intelligent:1,literal:1,unknown:0,p95Ms:100});
});
it('caps fanout at forty and stops issuing requests after abort',async()=>{
 const worker=vi.fn(async()=>({ok:true,ms:1,mode:'unknown'}));
 await expect(burst(41,worker,new AbortController().signal)).rejects.toThrow('unsafe_fanout');
 const abort=new AbortController();abort.abort();await expect(burst(40,worker,abort.signal)).rejects.toThrow();expect(worker).not.toHaveBeenCalled();
 expect((await burst(40,worker,new AbortController().signal)).length).toBe(40);
});
it('bounds HTML response bytes rather than retaining unbounded pages',async()=>{
 await expect(readSmall(new Response('x'.repeat(20)),10)).rejects.toThrow('response_too_large');
 expect(await readSmall(new Response('safe'),10)).toBe('safe');
});
it('refuses memory and load pressure before launching another stage',()=>{
 expect(()=>assertResources({available:5*1024**3,load:1,appGrowth:0})).toThrow('low_memory');
 expect(()=>assertResources({available:20*1024**3,load:13,appGrowth:0})).toThrow('host_load');
 expect(()=>assertResources({available:20*1024**3,load:1,appGrowth:600*1024**2})).toThrow('app_memory_growth');
 expect(()=>assertResources({available:20*1024**3,load:2,appGrowth:0})).not.toThrow();
});
it('runs the whole probe with fixed endpoints and reports model sharing separately from HTTP',()=>{
 const protocol=fileURLToPath(new URL('../../scripts/local-ai/protocol.cjs',import.meta.url));
 const pool=fileURLToPath(new URL('../../scripts/local-ai/inference-pool.cjs',import.meta.url));
 const script=readFileSync(new URL('../../scripts/local-ai/capacity-check.cjs',import.meta.url),'utf8');
 const prelude=`
const assert=require('node:assert/strict'),Module=require('node:module'),original=Module._load;
Module._load=function(name,...args){
 if(name==='node:fs')return {readFileSync:p=>p==='/proc/meminfo'?'MemAvailable: 23068672 kB':String(1024**3)};
 if(name==='node:os')return {loadavg:()=>[1,1,1]};return original.call(this,name,...args);
};
globalThis.__trbhhCapacityProtocol=require(${JSON.stringify(protocol)});
globalThis.__trbhhCapacityPool=require(${JSON.stringify(pool)}).createInferencePool;
globalThis.fetch=async(url,options)=>{
 if(url==='http://127.0.0.1:3000/api/version')return Response.json({commit:'a'.repeat(40)});
 if(String(url).startsWith('http://127.0.0.1:3000/search?q='))return new Response('<html><p data-search-mode="literal">النتائج: 1</p></html>');
 if(url==='http://ollama:11434/api/tags')return Response.json({models:[{name:'trbhh-local:active'}]});
 assert.equal(url,'http://ollama:11434/api/chat');assert.equal(options.method,'POST');
 const body=JSON.parse(options.body);assert.equal(body.model,'trbhh-local:active');
 if(!body.messages.length)return Response.json({done:true});
 const text=body.messages[1].content;
 const number=text.match(/مطبخ ([0-9]+)/)?.[1];
 const value=text.includes('Arabic catalog')?text.includes('Samsung')?'غطاء Samsung S24':text.includes('18V')?'مثقاب لاسلكي 18V':text.includes('42')?'حذاء مشي مقاوم للماء 42':'منظم أدوات المطبخ':'kitchen organizer'+(number?' '+number:'');
 return Response.json({done:true,done_reason:'stop',message:{content:JSON.stringify({queries:[value]})}});
};\n`;
 const result=spawnSync(process.execPath,['-','b'.repeat(40)],{input:prelude+script,encoding:'utf8',timeout:12000});
 expect(result.status,result.stderr).toBe(0);
 const lines=result.stdout.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
 const end=lines.find(line=>line.event==='CAPACITY_COMPLETE');
 expect(end).toMatchObject({publicQualityPassed:true,candidateSharedBurstPassed:true,publicHttpObservedConcurrency:40,publicHttpIntelligentConcurrency:0,deployed:false});
 expect(lines.find(line=>line.scenario==='distinct_cold')).toMatchObject({concurrency:40,intelligent:1,literal:39,modelExecutions:1});
},15000);
