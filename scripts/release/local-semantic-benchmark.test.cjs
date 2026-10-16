const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBatcher,rank,cosine}=require('./local-semantic-benchmark.cjs');
test('forty distinct queries are batched without parallel model calls',async()=>{
 let active=0,max=0;const calls=[];
 const batch=createBatcher(async texts=>{active++;max=Math.max(max,active);calls.push(texts);await new Promise(r=>setTimeout(r,1));active--;return texts.map(()=>[1,0]);});
 const results=await Promise.all(Array.from({length:40},(_,i)=>batch('query '+i)));
 assert.equal(results.length,40);assert.equal(calls.length,5);assert.equal(max,1);assert.ok(calls.every(texts=>texts.length<=8));
});
test('duplicates share one embedding and malformed vectors reject the entire batch',async()=>{
 let calls=0;const batch=createBatcher(async texts=>{calls++;return texts.map(()=>[1,0]);});
 await Promise.all(Array.from({length:40},()=>batch('same')));assert.equal(calls,1);
 const invalid=createBatcher(async()=>[[NaN,0]]);await assert.rejects(invalid('bad'),/invalid_vectors/);
});
test('queue admission is bounded rather than growing during overload',async()=>{
 const batch=createBatcher(async texts=>texts.map(()=>[1,0]));
 const admitted=Array.from({length:64},(_,i)=>batch('unique '+i));
 await assert.rejects(batch('overflow'),/embedding_queue_full/);await Promise.all(admitted);
});
test('ranking preserves model and quantity constraints without translating them',()=>{
 const docs=[{id:'wrong',text:'Samsung S23 case',vector:[1,0]},{id:'right',text:'Samsung S24 case',vector:[.9,.1]}];
 assert.equal(rank('أبغى غطاء Samsung S24',[1,0],docs)[0].id,'right');
 assert.equal(cosine([1,0],[1,0]),1);assert.throws(()=>cosine([1],[1,0]),/vector_dimension/);
});
test('the full streamed probe never activates a model and rejects poor retrieval despite fast vectors',()=>{
 const fs=require('node:fs'),cp=require('node:child_process'),script=fs.readFileSync('scripts/release/local-semantic-benchmark.cjs','utf8');
 const prelude=`
const assert=require('node:assert/strict'),Module=require('node:module'),original=Module._load;
Module._load=function(name,...args){if(name==='node:fs')return {readFileSync:()=> 'MemAvailable: 23068672 kB'};if(name==='node:os')return {loadavg:()=>[1,1,1]};return original.call(this,name,...args);};
let pulled=false;
globalThis.fetch=async(url,options)=>{
 if(url==='http://127.0.0.1:3000/api/version')return Response.json({commit:'a'.repeat(40)});
 assert.ok(String(url).startsWith('http://ollama:11434/api/'));
 const path=String(url).split('/').at(-1);assert.ok(['tags','ps','pull','embed'].includes(path));
 if(path==='tags')return Response.json({models:pulled?[{name:'embeddinggemma:300m',size:622000000,digest:'verified'}]:[]});
 if(path==='ps')return Response.json({models:[]});
 const body=JSON.parse(options.body);assert.equal(body.model,'embeddinggemma:300m');
 if(path==='pull'){pulled=true;return Response.json({status:'success'});}
 assert.ok(body.input.length<=8);return Response.json({embeddings:body.input.map(()=>[1,0])});
};\n`;
 const result=cp.spawnSync(process.execPath,['-'],{input:prelude+script,encoding:'utf8',timeout:5000});
 assert.equal(result.status,0,result.stderr);const end=JSON.parse(result.stdout.trim().split('\n').at(-1));
 assert.equal(end.event,'SEMANTIC_PROBE_COMPLETE');assert.equal(end.accepted,false);assert.equal(end.queries,40);assert.equal(end.deployed,false);
 const failedCleanup=prelude+`const cleanupFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>String(url).endsWith('/embed')&&JSON.parse(options.body).input.length===0?new Response('unload failed',{status:500}):cleanupFetch(url,options);\n`;
 const failure=cp.spawnSync(process.execPath,['-'],{input:failedCleanup+script,encoding:'utf8',timeout:5000});
 assert.equal(failure.status,0);assert.match(failure.stderr,/SEMANTIC_CLEANUP_UNCONFIRMED/);
});
