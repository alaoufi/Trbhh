import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const core=()=>require('../../scripts/local-ai/semantic-core.cjs');
describe('private product semantic core',()=>{
 it('bounds hostile LONGTEXT scanning and truncates multilingual text on code-point boundaries',()=>{
  const c=core(),original=String.prototype.replace;let largestScan=0;
  const spy=vi.spyOn(String.prototype,'replace').mockImplementation(function(this:string,...args:Parameters<string['replace']>){largestScan=Math.max(largestScan,this.length);return original.apply(this,args);});
  let text='';
  try{text=c.documentText({title:'أ'.repeat(489)+'😀',description:'<b>large</b>'.repeat(100000),brand:'safe'});}finally{spy.mockRestore();}
  expect(largestScan).toBeLessThanOrEqual(12000);expect(Buffer.byteLength(text)).toBeLessThanOrEqual(980);expect(text).not.toContain('\uFFFD');expect(text).not.toMatch(/[\uD800-\uDBFF]$/);
  expect(c.documentText({title:'<script>private</script><b>Drill</b>',description:'18V',brand:'Acme'})).toBe('Drill | 18V | Acme');
  expect(c.documentText({title:'Drill',description:'<script>'+ 'private'.repeat(10000)+'</script>',brand:'Acme'})).toBe('Drill | Acme');
 });
 it('keeps the bounded dedicated model warm beyond the refresh interval with a short public timeout',async()=>{
  const c=core(),fetcher=vi.fn(async(_url:string,_options:{body:string;signal:AbortSignal})=>Response.json({embeddings:[Array(768).fill(.1)]}));
  await c.embedTexts(['drill'],fetcher);
  const options=fetcher.mock.calls[0][1];expect(JSON.parse(options.body).keep_alive).toBe('24h');expect(JSON.parse(options.body).options.num_thread).toBe(2);expect(options.signal).toBeInstanceOf(AbortSignal);
 });
 it('rejects corrupt, stale, private-shaped and mismatched indexes',()=>{
  const c=core(),vector=c.encodeVector(new Float32Array(768).fill(.1));
  const index={version:1,model:c.MODEL,digest:c.DIGEST,builtAt:new Date().toISOString(),docs:[{id:'1',text:'18V cordless drill',vector}]};
  expect(c.validateIndex(index).docs[0].vector).toBeInstanceOf(Float32Array);
  for(const bad of [{...index,digest:'bad'},{...index,builtAt:'2000-01-01'},{...index,docs:[{id:'0',text:'x',vector}]},{...index,docs:[{id:'1',text:'x',vector:'bad'}]},{...index,docs:[{id:'1',text:'x',vector:c.encodeVector(new Float32Array(768))}]}])expect(()=>c.validateIndex(bad)).toThrow();
 });
 it('preserves exact model and property hard constraints',()=>{
  const c=core(),v=Float32Array.from([1,0]);
  const docs=[{id:'1',text:'18V cordless drill',vector:v},{id:'2',text:'18V wired drill with cable',vector:v},{id:'3',text:'12V cordless drill',vector:v}];
  expect(c.rank('دريل بدون سلك 18V',v,docs).map((x:{id:string})=>x.id)).toEqual(['1']);
 });
 it('coalesces queries, serializes batches and bounds overload',async()=>{
  const c=core();let active=0,max=0;
  const embed=vi.fn(async(texts:string[])=>{max=Math.max(max,++active);await new Promise(r=>setTimeout(r,5));active--;return texts.map(()=>[1,0]);});
  const batch=c.createBatcher(embed),same=batch('same');expect(batch('same')).toBe(same);
  const pending=Array.from({length:63},(_,i)=>batch(String(i)));await expect(batch('over')).rejects.toThrow('queue_full');
  await Promise.all([same,...pending]);expect(max).toBe(1);expect(embed.mock.calls.every(([texts])=>texts.length<=8)).toBe(true);
 });
 it('rejects symlink and oversized index files before parsing',async()=>{
  const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path'),c=core();
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'semantic-test-')),file=path.join(directory,'index.json');
  try{
   await fs.writeFile(file,'{}');const handle=await fs.open(file,'r+');await handle.truncate(c.MAX_BYTES+1);await handle.close();
   await expect(c.readIndex(file)).rejects.toThrow('unsafe_index');
   if(process.platform!=='win32'){const link=path.join(directory,'link.json');await fs.symlink(file,link);await expect(c.readIndex(link)).rejects.toThrow('unsafe_index');}
  }finally{await fs.rm(directory,{recursive:true,force:true});}
 });
});
