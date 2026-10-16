import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
describe('read only public product index builder',()=>{
 it('warms a verified model before reusing an unchanged index in the streamed CLI',()=>{
  const script=readFileSync(new URL('../../scripts/local-ai/build-product-index.cjs',import.meta.url),'utf8');
  const prelude=`const assert=require('node:assert/strict'),Module=require('node:module'),original=Module._load;let warmed=false,verified=false,disconnected=false;
  const index={version:1,model:'embeddinggemma:300m',digest:'pinned',builtAt:new Date().toISOString(),docs:[]};
  globalThis.__trbhhSemanticCore={MODEL:index.model,DIGEST:index.digest,INDEX_PATH:'/app/storage/local-search/products.v1.json',MAX_BYTES:100000,verifyModel:async()=>{verified=true;},embedTexts:async(texts,fetcher,timeout)=>{assert.equal(verified,true);assert.deepEqual(texts,['task: search result | query: local search readiness']);assert.equal(timeout,60000);assert.equal(fetcher,fetch);warmed=true;return [Array(768).fill(.1)];},readIndex:async()=>{assert.equal(warmed,true);return index;},validateIndex:()=>index};
  globalThis.__trbhhPublicProductSelect='SELECT public_products';
  Module._load=function(name,...args){if(name==='@prisma/client')return {PrismaClient:class{async $queryRawUnsafe(){assert.equal(warmed,true);return [];}async $disconnect(){disconnected=true;}}};if(name==='node:fs/promises')return {mkdir:async()=>{},lstat:async()=>({isDirectory:()=>true,isSymbolicLink:()=>false,isFile:()=>true}),realpath:async p=>p,open:async()=>({writeFile:async()=>{},sync:async()=>{},close:async()=>{}}),rename:async()=>{}};return original.call(this,name,...args);};
  process.on('exit',()=>{assert.equal(warmed,true);assert.equal(disconnected,true);});\n`;
  const result=spawnSync(process.execPath,['-','--refresh'],{input:prelude+script,encoding:'utf8',timeout:5000});
  expect(result.status,result.stderr).toBe(0);expect(result.stdout).toContain('SEMANTIC_INDEX_COMPLETE');expect(result.stdout).toContain('"ready":false');
 });
 it('allows a cold local model to load offline without extending public query deadlines',async()=>{
  const c=require('../../scripts/local-ai/semantic-core.cjs'),{buildIndex}=require('../../scripts/local-ai/build-product-index.cjs');
  const spy=vi.spyOn(c,'embedTexts').mockResolvedValue([Array(768).fill(.1)]);
  try{await buildIndex({query:vi.fn().mockResolvedValueOnce([{id:1n,title:'drill'}]).mockResolvedValueOnce([]),initial:true});expect(spy.mock.calls[0][2]).toBe(60000);}finally{spy.mockRestore();}
 });
 it('removes only its own unique temporary file after a failed write',async()=>{
  const fs=require('node:fs/promises'),c=require('../../scripts/local-ai/semantic-core.cjs'),{writeIndex}=require('../../scripts/local-ai/build-product-index.cjs');
  const spies=[vi.spyOn(fs,'mkdir').mockResolvedValue(undefined),vi.spyOn(fs,'realpath').mockImplementation(async(p:unknown)=>p),vi.spyOn(fs,'lstat').mockImplementation(async(p:unknown)=>{if(p===c.INDEX_PATH)throw Object.assign(Error('absent'),{code:'ENOENT'});return {isDirectory:()=>true,isSymbolicLink:()=>false};})];
  const close=vi.fn(),open=vi.spyOn(fs,'open').mockResolvedValue({writeFile:async()=>{throw Error('disk_full');},close}),unlink=vi.spyOn(fs,'unlink').mockResolvedValue(undefined);spies.push(open,unlink);
  try{
   await expect(writeIndex({version:1,model:c.MODEL,digest:c.DIGEST,builtAt:new Date().toISOString(),docs:[]})).rejects.toThrow('disk_full');
   expect(unlink).toHaveBeenCalledTimes(1);expect(unlink.mock.calls[0][0]).toMatch(/\.products\.[a-f0-9-]+\.tmp$/);expect(unlink.mock.calls[0][0]).toBe(open.mock.calls[0][0]);expect(open.mock.calls[0].slice(1)).toEqual(['wx',0o600]);expect(close).toHaveBeenCalledTimes(1);
  }finally{spies.forEach(spy=>spy.mockRestore());}
 });
 it('keyset scans, sanitizes only public fields and reuses unchanged vectors',async()=>{
  const c=require('../../scripts/local-ai/semantic-core.cjs'),{buildIndex}=require('../../scripts/local-ai/build-product-index.cjs');
  const row={id:1n,title:'<b>Drill</b>',description:'<script>secret</script>18V cordless',brand:'Acme',private:'secret'};
  const query=vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([]),embed=vi.fn(async(texts:string[])=>texts.map(()=>Array(768).fill(.1)));
  const first=await buildIndex({query,embed,initial:true});expect(first.docs[0].text).toBe('Drill | 18V cordless | Acme');
  expect(query.mock.calls[0].slice(1)).toEqual(['0',100]);
  expect(query.mock.calls[1].slice(1)).toEqual(['1',100]);
  const second=await buildIndex({query:vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([]),embed,prior:c.validateIndex(first),initial:true});
  expect(embed).toHaveBeenCalledTimes(1);expect(second.docs).toEqual(first.docs);
 });
 it('fails rather than truncates an oversized catalog',async()=>{
  const {buildIndex}=require('../../scripts/local-ai/build-product-index.cjs');let id=0;
  await expect(buildIndex({query:async()=>Array.from({length:100},()=>({id:BigInt(++id),title:'x'})),embed:async(texts:string[])=>texts.map(()=>Array(768).fill(.1)),initial:true})).rejects.toThrow('catalog_limit');
 });
});
