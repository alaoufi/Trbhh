// Read-only database scan. The only writes are an atomic private local index file.
const core=globalThis.__trbhhSemanticCore||require('./semantic-core.cjs');
const publicSelect=globalThis.__trbhhPublicProductSelect||require('./public-product-select.cjs');
async function buildIndex({query,embed=texts=>core.embedTexts(texts,fetch,60000),prior=null,initial=false,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const docs=[],seen=new Set(),reuse=new Map((prior?.digest===core.DIGEST?prior.docs:[]).map(doc=>[core.hash(doc.text),doc.vector]));let after='0',count=0;
 while(true){
  const pageAfter=after,rows=await query(publicSelect+' AND cp.id>? ORDER BY cp.id LIMIT ?',after,100);
  if(!Array.isArray(rows)||rows.length>100)throw Error('invalid_catalog_page');if(!rows.length)break;
  for(const row of rows){
   const id=String(row.id);if(!/^[1-9][0-9]{0,19}$/.test(id)||BigInt(id)<BigInt(after))throw Error('invalid_catalog_order');
   if(seen.has(id))continue;seen.add(id);after=id;if(++count>10000)throw Error('catalog_limit');
   const text=core.documentText(row);if(text)docs.push({id,text,vector:reuse.get(core.hash(text))||null});
  }
  if(after===pageAfter)throw Error('catalog_not_advancing');
 }
 const changed=docs.filter(doc=>!doc.vector),batchSize=initial?8:2;
 for(let i=0;i<changed.length;i+=batchSize){
  const batch=changed.slice(i,i+batchSize),vectors=await embed(batch.map(doc=>core.documentInput(doc.text)));
  if(!Array.isArray(vectors)||vectors.length!==batch.length)throw Error('invalid_vectors');
  batch.forEach((doc,j)=>{doc.vector=core.decodeVector(core.encodeVector(vectors[j]));});
  if(!initial&&i+batchSize<changed.length)await pause(100);
 }
 const result={version:1,model:core.MODEL,digest:core.DIGEST,builtAt:new Date().toISOString(),docs:docs.map(doc=>({id:doc.id,text:doc.text,vector:core.encodeVector(doc.vector)}))};
 core.validateIndex(result);return result;
}
async function writeIndex(index){
 const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto'),dir=path.dirname(core.INDEX_PATH);
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 const stat=await fs.lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink()||await fs.realpath(dir)!==dir)throw Error('unsafe_index_directory');
 try{const old=await fs.lstat(core.INDEX_PATH);if(old.isSymbolicLink()||!old.isFile())throw Error('unsafe_index_target');}catch(error){if(error.code!=='ENOENT')throw error;}
 const bytes=JSON.stringify(index);if(Buffer.byteLength(bytes)>core.MAX_BYTES)throw Error('index_too_large');core.validateIndex(index);
 const temp=path.join(dir,'.products.'+randomUUID()+'.tmp');let file,owned=false;
 try{file=await fs.open(temp,'wx',0o600);owned=true;await file.writeFile(bytes);await file.sync();await file.close();file=null;await fs.rename(temp,core.INDEX_PATH);owned=false;}
 finally{try{if(file)await file.close();}finally{if(owned)await fs.unlink(temp);}}
}
async function main(){
 const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
 try{
  await core.verifyModel();
  // Refresh the residency lease even when every product vector can be reused.
  await core.embedTexts(['task: search result | query: local search readiness'],fetch,60000);
  let prior=null;try{prior=await core.readIndex(core.INDEX_PATH,true);}catch{/* Rebuild safely; never reuse corrupt vectors. */}
  const index=await buildIndex({query:(...args)=>db.$queryRawUnsafe(...args),prior,initial:process.argv.includes('--initial')||!prior?.docs.length});
  await writeIndex(index);
  console.log(JSON.stringify({event:'SEMANTIC_INDEX_COMPLETE',ready:index.docs.length>0,count:index.docs.length,builtAt:index.builtAt,model:index.model,digest:index.digest}));
 }finally{await db.$disconnect();}
}
module.exports={buildIndex,writeIndex};
if(require.main===module||module.id==='[stdin]')main().catch(error=>{console.error(JSON.stringify({event:'SEMANTIC_INDEX_FAILED',reason:String(error.message).slice(0,200)}));process.exitCode=1;});
