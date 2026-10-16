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
test('explicit wireless constraints defeat a higher semantic score for a wired product',()=>{
 const docs=[{id:'cable',text:'18V wired drill with cable',vector:[1,0]},{id:'battery',text:'18V cordless drill',vector:[.8,.2]}];
 for(const query of ['أبغى دريل بدون سلك 18V','مثقاب لاسلكي 18V','cordless drill 18V'])assert.equal(rank(query,[1,0],docs)[0]?.id,'battery');
 assert.equal(rank('دريل بسلك 18V',[.8,.2],docs)[0]?.id,'cable');
});
test('constraints apply to other products and do not invent a missing attribute',()=>{
 const docs=[{id:'wired',text:'Wired headphones',vector:[1,0]},{id:'wireless',text:'Wireless headphones',vector:[.8,.2]},{id:'unknown',text:'Headphones',vector:[1,0]}];
 assert.deepEqual(rank('سماعة بدون سلك',[1,0],docs).map(item=>item.id),['wireless']);
 assert.deepEqual(rank('أبي أسمع بدون ضجة وبدون سلك',[1,0],docs).map(item=>item.id),['wireless']);
 assert.deepEqual(rank('سماعات لاسلكية',[1,0],docs).map(item=>item.id),['wireless']);
 assert.deepEqual(rank('سماعة غير لاسلكية',[1,0],docs).map(item=>item.id),['wired']);
 assert.deepEqual(rank('سماعة بدون سلك',[1,0],[docs[2]]),[]);
});
test('negated insulation and water protection remain independent of vector similarity',()=>{
 assert.deepEqual(rank('قارورة 750ml بدون عزل',[1,0],[{id:'insulated',text:'Insulated water bottle 750ml',vector:[1,0]},{id:'plain',text:'Water bottle 750ml not insulated',vector:[.8,.2]}]).map(item=>item.id),['plain']);
 assert.deepEqual(rank('حذاء مشي ضد الموية 42',[1,0],[{id:'ordinary',text:'Non waterproof walking shoes size 42',vector:[1,0]},{id:'waterproof',text:'Waterproof walking shoes size 42',vector:[.8,.2]}]).map(item=>item.id),['waterproof']);
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

test('dedicated streamed preflight uses shared runtime code and two threads on embedding service only',()=>{
 const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
 const script=fs.readFileSync(path.join(__dirname,'local-semantic-benchmark.cjs'),'utf8');
 const shared=fs.readFileSync(path.resolve(__dirname,'../../../../scripts/local-ai/semantic-core.cjs'),'utf8');
 const digest='85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1';
 const wrapper=`globalThis.__trbhhSemanticCore=(()=>{const module={exports:{}};\n${shared}\nreturn module.exports;})();\n`;
 function execute(kind){
  const prelude=`const assert=require('node:assert/strict'),Module=require('node:module'),original=Module._load;
  Module._load=function(name,...args){if(name==='node:fs')return {readFileSync:()=> 'MemAvailable: 23068672 kB'};if(name==='node:os')return {loadavg:()=>[1,1,1]};return original.call(this,name,...args);};
  globalThis.__trbhhEmbeddingProbe='dedicated';
  ${kind==='missing_core'?'':wrapper}
  let ranked=0,embedCalls=0;
  if(globalThis.__trbhhSemanticCore){const real=globalThis.__trbhhSemanticCore.rank;globalThis.__trbhhSemanticCore.rank=(...args)=>{ranked++;return real(...args);};}
  globalThis.fetch=async(url,options)=>{
   assert.equal(options.redirect,'error');if(url==='http://127.0.0.1:3000/api/version')return Response.json({commit:'a'.repeat(40)});
   assert.ok(String(url).startsWith('http://embedding:11434/api/'));const endpoint=String(url).split('/').at(-1);
   assert.ok(['tags','ps','embed'].includes(endpoint),'dedicated preflight must never pull or mutate models');
   if(endpoint==='tags')return Response.json({models:${kind==='missing_model'?'[]':`[{name:'embeddinggemma:300m',size:622000000,digest:'${kind==='wrong_digest'?'wrong':digest}'}]`}});
   if(endpoint==='ps')return Response.json({models:[]});
   const body=JSON.parse(options.body);assert.equal(body.model,'embeddinggemma:300m');
   if(!body.input.length)return Response.json({embeddings:[]});
   embedCalls++;assert.equal(body.options.num_thread,2);assert.ok(body.input.length<=8);
   return Response.json({embeddings:body.input.map(()=>Array(768).fill(.1))});
  };
  process.on('exit',()=>{${kind==='valid'?'assert.equal(ranked,40);assert.equal(embedCalls,8);':'assert.equal(embedCalls,0);'}});\n`;
  return cp.spawnSync(process.execPath,['-'],{input:prelude+script,encoding:'utf8',timeout:5000});
 }
 const valid=execute('valid');assert.equal(valid.status,0,valid.stderr);assert.match(valid.stdout,/SEMANTIC_PROBE_COMPLETE/);assert.doesNotMatch(valid.stdout,/SEMANTIC_DOWNLOAD/);
 for(const kind of ['missing_core','wrong_digest','missing_model']){
  const failure=execute(kind);assert.equal(failure.status,1,kind+': '+failure.stderr);assert.match(failure.stderr,/SEMANTIC_PROBE_STOPPED/);assert.doesNotMatch(failure.stdout,/SEMANTIC_PROBE_COMPLETE/);
 }
});
