import {createRequire} from 'node:module';
import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {summary,burst,readSmall,assertResources,releaseExploratory,assessPublicIntent,assessPublicHttp,assessHttpStage,DISTINCT_QUERIES}=createRequire(import.meta.url)('../../scripts/local-ai/capacity-check.cjs');
it('can probe real shop HTTP alone without loading staged models or calling any other route',()=>{
 const script=readFileSync(new URL('../../scripts/local-ai/capacity-check.cjs',import.meta.url),'utf8');
 const prelude=`const assert=require('node:assert/strict'),Module=require('node:module'),original=Module._load;
 Module._load=function(name,...args){if(name==='node:fs')return {readFileSync:p=>p==='/proc/meminfo'?'MemAvailable: 23068672 kB':String(1024**3)};if(name==='node:os')return {loadavg:()=>[1,1,1]};return original.call(this,name,...args);};
 let shopCalls=0;const shopQueries=[];let active=0,maxActive=0;globalThis.fetch=async(url,options)=>{assert.equal(options.method,undefined);assert.equal(options.redirect,'error');if(url==='http://127.0.0.1:3000/api/version')return Response.json({commit:'a'.repeat(40)});assert.match(String(url),/^http:\\/\\/127\\.0\\.0\\.1:3000\\/shop\\?q=/);shopCalls++;shopQueries.push(new URL(url).searchParams.get('q'));active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;return new Response('<html><p data-search-scope="trbhh-products" data-search-mode="semantic"></p></html>');};
 process.on('exit',()=>{assert.equal(shopCalls,120);assert.equal(new Set(shopQueries.slice(80)).size,40);assert.equal(maxActive,40);assert.ok(shopQueries.slice(80).every(q=>!/[0-9]/.test(q)));});\n`;
 const result=spawnSync(process.execPath,['-','b'.repeat(40),'--http-only'],{input:prelude+script,encoding:'utf8',timeout:9000});
 expect(result.status,result.stderr).toBe(0);
 const lines=result.stdout.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
 expect(lines.find(line=>line.event==='CAPACITY_HTTP_COMPLETE')).toMatchObject({publicHttpObservedConcurrency:40,publicHttpIntelligentConcurrency:40,publicHttpSemanticConcurrency:40,modelInferenceTested:false,deployed:false,distinctRequests:40,distinctSemantic:40,distinctErrors:0,distinctCacheState:'unverified',distinctQuality:'unverified',distinctPassed:true});
 expect(lines.filter(line=>line.event==='PUBLIC_HTTP_STAGE').map(line=>line.semantic)).toEqual([1,5,10,20,40]);
 expect(lines.find(line=>line.event==='PUBLIC_HTTP_DISTINCT')).toMatchObject({requests:40,semantic:40,errors:0,distinctCacheState:'unverified',passed:true});
 expect(result.stdout).not.toContain('MODEL_PRELOAD');expect(result.stdout).not.toContain('STAGED_MODEL_POOL');
},12000);
it('recognizes public semantic results without conflating legacy intent and literal modes',()=>{
 for(const mode of ['semantic','intent','literal','idle'])expect(assessPublicHttp(`<html><p data-search-scope="trbhh-products" data-search-mode="${mode}"></p></html>`,true)).toMatchObject({ok:true,mode});
 expect(assessPublicHttp('<html data-search-mode="semantic"></html>',true)).toMatchObject({ok:false,searchUnavailable:true});
 expect(assessPublicHttp('<html data-search-scope="trbhh-products" data-search-mode="semantic"></html>',false)).toMatchObject({ok:false});
 const result=summary([{ms:1,ok:true,mode:'semantic'},{ms:2,ok:true,mode:'intent'},{ms:3,ok:true,mode:'literal'},{ms:4,ok:false,mode:'semantic'}],10);
 expect(result).toMatchObject({intelligent:2,semantic:1,intent:1,literal:1,errors:1});
});
it('preserves rejected raw answers so validation failures are distinguishable from bad meaning',()=>{
 const protocol=createRequire(import.meta.url)('../../scripts/local-ai/protocol.cjs');
 const result=assessPublicIntent(protocol,'أبغى كفر Samsung S24',{done:true,message:{content:JSON.stringify({queries:['غطاء SamsungS24']})}},()=>true);
 expect(result).toMatchObject({rawAnswer:{queries:['غطاء SamsungS24']},answer:[],passed:false,rejection:'runtime_validation'});
 const semantic=assessPublicIntent(protocol,'شي يرتب لي أدوات المطبخ',{done:true,message:{content:JSON.stringify({queries:['أدوات مطبخ']})}},()=>false);
 expect(semantic).toMatchObject({answer:['أدوات مطبخ'],passed:false,rejection:'meaning_check'});
});
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
 if(String(url).startsWith('http://127.0.0.1:3000/shop?q='))return new Response('<html><p data-search-scope="trbhh-products" data-search-mode="literal">نتائج المنتجات: 1</p></html>');
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
 const qualityPrelude=prelude+`const noLoadFetch=globalThis.fetch;globalThis.fetch=(url,options)=>{assert.equal(String(url).includes('/shop'),false);return noLoadFetch(url,options);};\n`;
 const quality=spawnSync(process.execPath,['-','b'.repeat(40),'--quality-only'],{input:qualityPrelude+script,encoding:'utf8',timeout:5000});
 expect(quality.status,quality.stderr).toBe(0);expect(quality.stdout).not.toContain('PUBLIC_HTTP_STAGE');expect(quality.stdout).not.toContain('STAGED_MODEL_POOL');expect(quality.stdout).toContain('PUBLIC_QUALITY_COMPLETE');expect(quality.stdout).toContain('rawAnswer');
},15000);

it('applies semantic 4s, legacy intent 10s and literal 2.5s stage limits without crediting failed stages',()=>{
 const semantic={requests:40,success:40,errors:0,intelligent:40,semantic:40,p95Ms:4000};
 expect(assessHttpStage(semantic)).toEqual({passed:true,latencyBudgetMs:4000});
 expect(assessHttpStage({...semantic,p95Ms:4001}).passed).toBe(false);
 expect(assessHttpStage({...semantic,semantic:0,p95Ms:10000})).toEqual({passed:true,latencyBudgetMs:10000});
 expect(assessHttpStage({...semantic,intelligent:39,p95Ms:2501}).passed).toBe(false);
 expect(assessHttpStage({...semantic,errors:1,success:39}).passed).toBe(false);
 expect(DISTINCT_QUERIES).toHaveLength(40);expect(new Set(DISTINCT_QUERIES).size).toBe(40);
});
it('does not escalate to distinct requests after a warmed semantic stage exceeds 4s',()=>{
 const script=readFileSync(new URL('../../scripts/local-ai/capacity-check.cjs',import.meta.url),'utf8');
 const prelude=`const assert=require('node:assert/strict'),Module=require('node:module'),original=Module._load;
 Module._load=function(name,...args){if(name==='node:fs')return {readFileSync:p=>p==='/proc/meminfo'?'MemAvailable: 23068672 kB':String(1024**3)};if(name==='node:os')return {loadavg:()=>[1,1,1]};return original.call(this,name,...args);};
 let now=1000,shopCalls=0;Date.now=()=>now;
 globalThis.fetch=async(url,options)=>{assert.equal(options.method,undefined);if(url==='http://127.0.0.1:3000/api/version')return Response.json({commit:'a'.repeat(40)});assert.ok(String(url).startsWith('http://127.0.0.1:3000/shop?q='));shopCalls++;now+=4001;return new Response('<html><p data-search-scope="trbhh-products" data-search-mode="semantic"></p></html>');};
 process.on('exit',()=>assert.equal(shopCalls,5));\n`;
 const result=spawnSync(process.execPath,['-','b'.repeat(40),'--http-only'],{input:prelude+script,encoding:'utf8',timeout:5000});
 expect(result.status,result.stderr).toBe(0);expect(result.stdout).not.toContain('PUBLIC_HTTP_DISTINCT');
 const report=result.stdout.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).find(line=>line.event==='CAPACITY_HTTP_COMPLETE');
 expect(report).toMatchObject({publicHttpObservedConcurrency:0,publicHttpSemanticConcurrency:0,distinctRequests:0,distinctPassed:false,distinctCacheState:'unverified'});
});
