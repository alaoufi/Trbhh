const MODEL='embeddinggemma:300m';
function cosine(a,b){
 if(a.length!==b.length)throw Error('vector_dimension');
 let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]**2;bb+=b[i]**2;}
 return aa&&bb?dot/Math.sqrt(aa*bb):0;
}
// Explicit product properties are hard filters; similarity cannot override a contradiction.
// Missing or conflicting evidence stays unknown, never silently promoted to a promise.
const PROPERTY_RULES={
 wireless:{yes:/\b(?:wireless|cordless)\b|(?:^|\s)و?(?:لا\s*سلكي(?:ه)?|بدون\s+(?:اي\s+)?(?:سلك|اسلاك)|بلا\s+سلك)(?=\s|$)/u,no:/\b(?:(?:not\s+|non[- ]?)(?:wireless|cordless)|wired|corded|with\s+(?:a\s+)?(?:wire|cable))\b|(?:^|\s)و?(?:(?:غير|مو|ليس(?:ت)?)\s+لا\s*سلكي(?:ه)?|(?:مع|ب)\s*سلك|سلكي(?:ه)?)(?=\s|$)/u},
 insulated:{yes:/\binsulated\b|(?:^|\s)معزول(?:ه)?(?=\s|$)/u,no:/\b(?:not\s+|non[- ]?)insulated\b|(?:غير|مو|ليس)\s+معزول(?:ه)?|(?:بدون|بلا)\s+عزل/u},
 waterproof:{yes:/\bwater[- ]?(?:proof|resistant)\b|مقاوم(?:ه)?\s+(?:لل)?م(?:اء|ياه)|ضد\s+الم(?:اء|ويه)/u,no:/\b(?:not\s+|non[- ]?)water[- ]?(?:proof|resistant)\b|(?:غير|مو|ليس)\s+(?:مقاوم(?:ه)?\s+(?:لل)?م(?:اء|ياه)|ضد\s+الم(?:اء|ويه))/u},
};
function properties(raw){
 const text=raw.normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه');
 const out={};for(const [name,rule] of Object.entries(PROPERTY_RULES)){
  const negative=rule.no.test(text),positive=rule.yes.test(text.replace(new RegExp(rule.no.source,'gu'),' '));
  if(positive!==negative)out[name]=positive;
 }return out;
}
function rank(query,vector,docs){
 const normalized=text=>text.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/(\d)\s+(V|W|ml|GB|mm)\b/gi,'$1$2').toLowerCase();
 const source=normalized(query),required=source.match(/[a-z]*\d+[a-z\d.-]*|\d+(?:\.\d+)?/g)||[];
 if(/\p{Script=Arabic}/u.test(source))required.push(...source.match(/\b[a-z][a-z0-9-]*\b/g)||[]);
 const constraints=properties(query);
 return docs.filter(doc=>{const tokens=normalized(doc.text).split(/[^a-z0-9.-]+/),known=properties(doc.text);return required.every(value=>tokens.includes(value))&&Object.entries(constraints).every(([name,value])=>known[name]===value);})
  .map(doc=>({id:doc.id,score:cosine(vector,doc.vector)})).sort((a,b)=>b.score-a.score);
}
function createBatcher(embed){
 const pending=new Map(),queue=[];let running=false,scheduled=false;
 function kick(){if(running||scheduled||!queue.length)return;scheduled=true;setTimeout(()=>{scheduled=false;void flush();},5);}
 async function flush(){
  if(running||!queue.length)return;running=true;const batch=queue.splice(0,8);
  try{const vectors=await embed(batch.map(item=>item.text));
   if(!Array.isArray(vectors)||vectors.length!==batch.length||vectors.some(v=>!Array.isArray(v)||v.length<2||v.length>2048||v.length!==vectors[0].length||v.some(n=>!Number.isFinite(n))||!v.some(n=>n!==0)))throw Error('invalid_vectors');
   batch.forEach((item,i)=>item.resolve(Float32Array.from(vectors[i])));
  }catch(error){batch.forEach(item=>item.reject(error));}
  finally{batch.forEach(item=>pending.delete(item.text));running=false;kick();}
 }
 return text=>{
  if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>2048)return Promise.reject(Error('invalid_embedding_text'));
  if(pending.has(text))return pending.get(text);
  if(pending.size>=64)return Promise.reject(Error('embedding_queue_full'));
  const promise=new Promise((resolve,reject)=>queue.push({text,resolve,reject}));pending.set(text,promise);kick();return promise;
 };
}
const DIGEST='85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1';
const INDEX_PATH='/app/storage/local-search/products.v1.json';
const MAX_BYTES=64*1024*1024,MAX_AGE=90*60*1000,DIMENSION=768;
const {createHash}=require('node:crypto');
function hash(text){return createHash('sha256').update(text).digest('hex');}
function encodeVector(vector){const bytes=Buffer.alloc(vector.length*4);vector.forEach((value,i)=>bytes.writeFloatLE(value,i*4));return bytes.toString('base64');}
function decodeVector(value){
 if(typeof value!=='string'||value.length!==DIMENSION*4/3*4||! /^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('invalid_vector');
 const bytes=Buffer.from(value,'base64');if(bytes.length!==DIMENSION*4||bytes.toString('base64')!==value)throw Error('invalid_vector');
 const vector=new Float32Array(DIMENSION);for(let i=0;i<DIMENSION;i++)vector[i]=bytes.readFloatLE(i*4);
 if(vector.some(n=>!Number.isFinite(n))||!vector.some(n=>n!==0))throw Error('invalid_vector');return vector;
}
function validateIndex(value,now=Date.now(),allowStale=false){
 if(!value||value.version!==1||value.model!==MODEL||value.digest!==DIGEST||!Array.isArray(value.docs)||value.docs.length>10000)throw Error('invalid_index');
 const built=Date.parse(value.builtAt);if(!Number.isFinite(built)||built>now+60000||!allowStale&&now-built>MAX_AGE)throw Error('stale_index');
 const ids=new Set();const docs=value.docs.map(doc=>{
  if(!doc||typeof doc.id!=='string'||! /^[1-9][0-9]{0,19}$/.test(doc.id)||ids.has(doc.id)||typeof doc.text!=='string'||!doc.text.trim()||Buffer.byteLength(doc.text)>2048)throw Error('invalid_document');
  ids.add(doc.id);return{id:doc.id,text:doc.text,vector:decodeVector(doc.vector)};
 });return {version:1,model:MODEL,digest:DIGEST,builtAt:value.builtAt,docs};
}
async function readIndex(path=INDEX_PATH,allowStale=false){
 const fs=require('node:fs/promises'),constants=require('node:fs').constants;
 const parent=await fs.lstat(require('node:path').dirname(path));if(!parent.isDirectory()||parent.isSymbolicLink())throw Error('unsafe_index_directory');
 if(await fs.realpath(require('node:path').dirname(path))!==require('node:path').resolve(require('node:path').dirname(path)))throw Error('unsafe_index_directory');
 const stat=await fs.lstat(path);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>MAX_BYTES)throw Error('unsafe_index');
 const file=await fs.open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{const current=await file.stat();if(!current.isFile()||current.size>MAX_BYTES||current.ino!==stat.ino)throw Error('unsafe_index');
  const bytes=Buffer.alloc(current.size);let offset=0;
  while(offset<bytes.length){const part=await file.read(bytes,offset,bytes.length-offset,offset);if(!part.bytesRead)throw Error('index_changed');offset+=part.bytesRead;}
  const end=await file.stat();if(end.size!==current.size||end.mtimeMs!==current.mtimeMs)throw Error('index_changed');
  return validateIndex(JSON.parse(bytes.toString('utf8')),Date.now(),allowStale);
 }finally{await file.close();}
}
async function readJson(response,max=1048576){
 if(!response.ok||!response.body)throw Error('embedding_unavailable');const reader=response.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>max)throw Error('response_limit');text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{await reader.cancel().catch(()=>{});}
}
async function verifyModel(fetcher=fetch){
 const value=await readJson(await fetcher('http://embedding:11434/api/tags',{redirect:'error',signal:AbortSignal.timeout(2500)}));
 if(!value.models?.some(item=>item.name===MODEL&&item.digest===DIGEST))throw Error('embedding_model_mismatch');
}
async function embedTexts(texts,fetcher=fetch,timeout=2500){
 if(!Array.isArray(texts)||!texts.length||texts.length>8||texts.some(t=>typeof t!=='string'||!t.trim()||Buffer.byteLength(t)>2048))throw Error('invalid_embedding_text');
 const value=await readJson(await fetcher('http://embedding:11434/api/embed',{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeout),headers:{'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,input:texts,truncate:false,keep_alive:'24h',options:{num_thread:2,num_ctx:2048,num_batch:128}})}));
 if(!Array.isArray(value.embeddings)||value.embeddings.length!==texts.length||value.embeddings.some(v=>!Array.isArray(v)||v.length!==DIMENSION||v.some(n=>!Number.isFinite(n))||!v.some(n=>n!==0)))throw Error('invalid_vectors');return value.embeddings;
}
function documentText(row){
 const plain=value=>typeof value==='string'?value.slice(0,12000).replace(/<(script|style)[^>]*>[\s\S]*?(?:<\/\1>|$)/gi,' ').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim():'';
 const source=[plain(row.title),plain(row.description),plain(row.brand)].filter(Boolean).join(' | ');
 let text='',bytes=0;
 for(const character of source){
  // Do not split an emoji or emit a replacement for malformed source surrogates.
  if(character.length===1&&/[\uD800-\uDFFF]/.test(character))continue;
  const size=Buffer.byteLength(character);if(bytes+size>980)break;text+=character;bytes+=size;
 }
 return text.trim();
}
function documentInput(text){return 'title: '+text+' | text: '+text;}
module.exports={MODEL,DIGEST,INDEX_PATH,MAX_BYTES,MAX_AGE,DIMENSION,hash,rank,cosine,properties,createBatcher,encodeVector,decodeVector,validateIndex,readIndex,readJson,verifyModel,embedTexts,documentText,documentInput};
