import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({setting:vi.fn(),stat:vi.fn(),read:vi.fn(),verify:vi.fn(),embed:vi.fn()}));
vi.mock('@/lib/settings',()=>({getSetting:mocks.setting}));
vi.mock('node:fs/promises',()=>({stat:mocks.stat}));
vi.mock('../../scripts/local-ai/semantic-core.cjs',async()=>{
 const {createRequire}=await import('node:module');const actual=createRequire(import.meta.url)('../../scripts/local-ai/semantic-core.cjs');
 return {...actual,readIndex:mocks.read,verifyModel:mocks.verify,embedTexts:mocks.embed};
});
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();mocks.setting.mockResolvedValue('1');mocks.stat.mockResolvedValue({ino:1,size:100,mtimeMs:1});mocks.verify.mockResolvedValue(undefined);mocks.embed.mockImplementation(async(texts:string[])=>texts.map(()=>Array(768).fill(.1)));mocks.read.mockResolvedValue({builtAt:new Date().toISOString(),docs:[{id:'1',text:'18V cordless drill',vector:new Float32Array(768).fill(.1)}]});});
describe('local public product search',()=>{
 it('batches concurrent distinct queries and caches vectors/snapshot',async()=>{
  const {semanticProductSearch}=await import('@/lib/ai/product-search');
  expect(await Promise.all(['دريل 18V','مثقاب 18V'].map(semanticProductSearch))).toEqual([{ids:['1'],mode:'semantic'},{ids:['1'],mode:'semantic'}]);
  await semanticProductSearch('دريل 18V');expect(mocks.embed).toHaveBeenCalledTimes(1);expect(mocks.embed.mock.calls[0][0]).toHaveLength(2);expect(mocks.read).toHaveBeenCalledTimes(1);
 });
 it('returns fallback without inference when disabled or index rejected',async()=>{
  const {semanticProductSearch}=await import('@/lib/ai/product-search');mocks.setting.mockResolvedValue('0');
  expect((await semanticProductSearch('drill')).mode).toBe('fallback');expect(mocks.read).not.toHaveBeenCalled();
  mocks.setting.mockResolvedValue('1');mocks.read.mockRejectedValue(Error('corrupt'));
  expect((await semanticProductSearch('drill')).mode).toBe('fallback');expect(mocks.embed).not.toHaveBeenCalled();
 });
 it('uses fallback for service outage; empty relevance is still semantic',async()=>{
  const {semanticProductSearch}=await import('@/lib/ai/product-search');mocks.embed.mockRejectedValueOnce(Error('offline'));
  expect((await semanticProductSearch('drill')).mode).toBe('fallback');
  expect(await semanticProductSearch('12V cordless drill')).toEqual({ids:[],mode:'semantic'});
 });
});
