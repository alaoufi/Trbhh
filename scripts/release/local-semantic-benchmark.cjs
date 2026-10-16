/* Experimental retrieval probe, not an application release or a translation replacement. */
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
// Fixed synthetic regression examples, never customer or supplier account data.
const FIXTURES=[
 ['case','Samsung Galaxy S24 phone protective case',['أبغى كفر Samsung S24','غطاء يحمي جوالي Samsung S24']],
 ['drill','18V cordless drill',['أبغى دريل بدون سلك 18V','مثقاب شحن لاسلكي 18V']],
 ['organizer','Kitchen utensil storage organizer rack',['شي يرتب لي أدوات المطبخ','حامل لتنظيم أغراض الطبخ']],
 ['shoes','Waterproof walking shoes size 42',['جزمة للمشي ضد الموية مقاس 42','أحذية مشي مقاومة للماء 42']],
 ['fan','Portable desk cooling fan',['شي يبرد علي وأنا أشتغل على المكتب','مروحة صغيرة للمكتب']],
 ['lamp','Rechargeable camping lantern',['نور أشحنه وآخذه للبر بالليل','فانوس كشتات يشتغل بالشحن']],
 ['scale','Digital kitchen food weighing scale',['أبي أوزن مقادير الطبخ','ميزان للأكل في المطبخ']],
 ['vacuum','Cordless handheld car vacuum cleaner',['مكنسة صغيرة أنظف فيها السيارة','شي يشفط الفتات من مراتب السيارة']],
 ['bottle','Stainless steel drinking water bottle 750ml not insulated',['قارورة ستانلس 750ml بدون عزل','عبوة ماء فولاذ 750ml غير معزولة']],
 ['umbrella','Foldable rain umbrella',['شي يحميني من المطر وينطوي بالشنطة','مظلة مطر قابلة للطي']],
 ['headphones','Wireless noise cancelling headphones',['سماعة تعزل صوت الإزعاج','أبي أسمع بدون ضجة وبدون سلك']],
 ['stand','Adjustable laptop desk stand',['حامل أرفع عليه اللابتوب فوق الطاولة','قاعدة أعدل ارتفاع الكمبيوتر المحمول عليها']],
 ['charger','USB car phone charger',['شاحن للجوال يركب بالسيارة USB','أشحن تلفوني وأنا بالسيارة USB']],
 ['mat','Non slip bathroom floor mat',['فرشة للحمام ما تزحلق','دعاسة تمنع الانزلاق قدام المغسلة']],
 ['bag','Waterproof travel backpack',['شنطة ظهر للسفر ما يدخلها المطر','حقيبة ظهر مقاومة للماء للرحلات']],
 ['peeler','Vegetable potato peeling tool',['أداة أقشر فيها البطاطس','قشارة للخضار']],
 ['curtain','Blackout bedroom window curtains',['ستارة تمنع نور الشمس وقت النوم','أبي أعتم غرفة النوم بستائر']],
 ['pillow','Memory foam neck travel pillow',['مخدة تسند رقبتي بالطائرة','وسادة رقبة للسفر']],
 ['pump','Portable electric car tire air pump',['منفاخ أشبكه عشان أنفخ كفر السيارة','جهاز كهربائي محمول ينفخ الإطارات']],
 ['clock','Digital bedside alarm clock',['ساعة أنبه فيها للصلاة جنب السرير','منبه رقمي للطاولة جنب السرير']],
];
async function main(){
 const fs=require('node:fs'),os=require('node:os'),controller=new AbortController();
 const started=Date.now(),timer=setTimeout(()=>controller.abort(Error('semantic_probe_timeout')),600000);
 let monitor,checking=false,digest,used=false,minRam=Infinity,maxLoad=0,healthMax=0;
 const signal=ms=>AbortSignal.any([controller.signal,AbortSignal.timeout(ms)]),log=value=>console.log(JSON.stringify(value));
 async function json(response,max=524288){
  if(!response.body)throw Error('missing_body');let bytes=0,text='';const reader=response.body.getReader(),decoder=new TextDecoder();
  try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>max)throw Error('response_limit');text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}
  finally{await reader.cancel().catch(()=>{});}
 }
 async function guard(){
  controller.signal.throwIfAborted();const available=Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1]||0)*1024,load=os.loadavg()[0];
  minRam=Math.min(minRam,available);maxLoad=Math.max(maxLoad,load);
  if(available<6*1024**3||load>12)throw Error('semantic_resource_stop');
  const begin=Date.now(),response=await fetch('http://127.0.0.1:3000/api/version',{redirect:'error',signal:signal(2000)});
  if(!response.ok)throw Error('semantic_health_stop');const value=await json(response,4096);if(!/^[a-f0-9]{40}$/.test(value.commit))throw Error('unverified_running_release');healthMax=Math.max(healthMax,Date.now()-begin);return value.commit;
 }
 async function api(path,body,ms=30000){
  if(!['tags','ps','pull','embed'].includes(path)||body?.model&&body.model!==MODEL)throw Error('semantic_mutation_blocked');
  controller.signal.throwIfAborted();const response=await fetch('http://ollama:11434/api/'+path,{method:body?'POST':'GET',redirect:'error',signal:signal(ms),headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const value=await json(response);if(!response.ok)throw Error('semantic_'+path+'_'+response.status+': '+String(value.error||'').slice(0,180));return value;
 }
 const options={num_thread:4,num_ctx:2048,num_batch:128};
 try{
  const release=await guard(),tags=await api('tags'),loaded=await api('ps');
  if(tags.models?.some(item=>item.name==='trbhh-local:active')||loaded.models?.some(item=>item.name!==MODEL))throw Error('active_model_requires_isolated_probe');
  log({event:'SEMANTIC_PROBE_BEGIN',runningCommit:release,model:MODEL,scope:'synthetic retrieval quality + staged microbatch; not application capacity',applicationUnchanged:true});
  monitor=setInterval(()=>{if(checking)return;checking=true;guard().catch(error=>controller.abort(error)).finally(()=>{checking=false;});},2000);
  if(!tags.models?.some(item=>item.name===MODEL)){
   console.log('SEMANTIC_DOWNLOAD — approximately 622 MB once; application unchanged.');
   const progress=setInterval(()=>console.log('SEMANTIC_DOWNLOAD_WAIT — health guard active.'),30000);
   try{if((await api('pull',{model:MODEL,stream:false},480000)).status!=='success')throw Error('semantic_pull_incomplete');}finally{clearInterval(progress);}
  }
  const entry=(await api('tags')).models?.find(item=>item.name===MODEL);digest=entry?.digest;
  if(!digest||!entry.size||entry.size>800*1024**2)throw Error('semantic_model_size_or_digest');
  used=true;
  const embed=async texts=>(await api('embed',{model:MODEL,input:texts,truncate:false,keep_alive:'10m',options},60000)).embeddings;
  const batch=createBatcher(embed),docs=FIXTURES.map(([id,text])=>({id,text}));
  docs.push({id:'phone',text:'Samsung Galaxy S24 smartphone'},{id:'wired',text:'18V wired electric drill with cable'},{id:'utensils',text:'Kitchen cooking spoon utensils set'},{id:'ordinary',text:'Non waterproof walking shoes size 42'});
  const vectors=await Promise.all(docs.map(doc=>batch('title: '+doc.text+' | text: '+doc.text)));docs.forEach((doc,i)=>{doc.vector=vectors[i];});
  const trials=FIXTURES.flatMap(([expected,,queries])=>queries.map(query=>({expected,query})));
  await guard();const begin=Date.now(),results=await Promise.all(trials.map(async item=>{
   const start=Date.now(),vector=await batch('task: search result | query: '+item.query),first=rank(item.query,vector,docs)[0];
   return {query:item.query,expected:item.expected,actual:first?.id,score:Math.round((first?.score||0)*1000)/1000,ms:Date.now()-start,passed:first?.id===item.expected};
  }));
  results.forEach(result=>log({event:'SEMANTIC_RESULT',...result}));
  const sorted=results.map(item=>item.ms).sort((a,b)=>a-b),passed=results.filter(item=>item.passed).length,critical=results.slice(0,8).every(item=>item.passed),p95=sorted[Math.ceil(sorted.length*.95)-1];
  log({event:'SEMANTIC_PROBE_COMPLETE',model:MODEL,digest,queries:40,intents:20,criticalPassed:critical,correct:passed,p95Ms:p95,wallMs:Date.now()-begin,accepted:critical&&passed>=36&&p95<=3000,
   minHostAvailableGiB:Math.round(minRam/1024**3*100)/100,maxHostLoad:maxLoad,maxHealthMs:healthMax,totalSeconds:Math.round((Date.now()-started)/1000),deployed:false,scope:'synthetic candidate only; no live product index or HTTP search activation'});
 }finally{
  clearTimeout(timer);clearInterval(monitor);controller.abort();
  if(used)try{
   const response=await fetch('http://ollama:11434/api/embed',{method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),headers:{'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,input:[],keep_alive:0})});
   if(!response.ok)throw Error('unload_failed');await response.body?.cancel();
   const inventory=await fetch('http://ollama:11434/api/ps',{redirect:'error',signal:AbortSignal.timeout(3000)});
   if(!inventory.ok)throw Error('unload_unverified');const loaded=await json(inventory,65536);
   if(!Array.isArray(loaded.models)||loaded.models.some(item=>item.name===MODEL||item.model===MODEL))throw Error('candidate_still_loaded');
  }catch{console.error('SEMANTIC_CLEANUP_UNCONFIRMED');}
 }
}
module.exports={createBatcher,rank,cosine};
if(module.id==='[stdin]')main().catch(error=>{console.error(JSON.stringify({event:'SEMANTIC_PROBE_STOPPED',reason:String(error.message).slice(0,250),deployed:false}));process.exitCode=1;});
