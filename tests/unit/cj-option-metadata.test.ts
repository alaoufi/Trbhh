import {describe,it,expect,vi} from 'vitest';
import {createCjOptionMetadataReader} from '@/lib/cj/option-metadata';
const local={vid:'v1',sku:'S1',name:'',optionKey:'',priceUsd:12,weight:470};
const source={vid:'v1',variantSku:'S1',variantName:'Purple-36',variantKey:'Purple-36',variantSellPrice:99,variantWeight:999,variantImage:null};
describe('read-only repair of legacy option display metadata',()=>{
 it('coalesces missing metadata reads and never adopts source price or weight',async()=>{
  const fetch=vi.fn(async()=>({ok:true as const,data:[source]}));const read=createCjOptionMetadataReader(fetch,()=>0);
  const [a,b]=await Promise.all([read('account','pid',[local]),read('account','pid',[local])]);expect(fetch).toHaveBeenCalledTimes(1);expect(a).toEqual(b);expect(a[0]).toMatchObject({...local,name:'Purple-36',optionKey:'Purple-36'});
 });
 it('repairs partial attributes when combinations cannot distinguish stored variants',async()=>{const fetch=vi.fn(async()=>({ok:true as const,data:[{...source,variantName:'Black-36',variantKey:'Black-36'},{...source,vid:'v2',variantSku:'S2',variantName:'Black-37',variantKey:'Black-37'}]}));const read=createCjOptionMetadataReader(fetch);const result=await read('a','pid',[{...local,name:'Black'},{...local,vid:'v2',sku:'S2',name:'Black'}]);expect(fetch).toHaveBeenCalledTimes(1);expect(result.map(v=>v.optionKey)).toEqual(['Black-36','Black-37']);});
 it('rejects SKU mismatches, duplicate VIDs and failures without inventing attributes',async()=>{
  for(const data of [[{...source,variantSku:'other'}],[source,source]]){const read=createCjOptionMetadataReader(async()=>({ok:true,data}));expect(await read('account','pid',[local])).toEqual([local]);}
  const read=createCjOptionMetadataReader(async()=>{throw Error('offline');});expect(await read('account','pid',[local])).toEqual([local]);
 });
 it('avoids extra reads for complete attributes and isolates caches across accounts',async()=>{
  const fetch=vi.fn(async()=>({ok:true as const,data:[source]}));const read=createCjOptionMetadataReader(fetch,()=>0);
  expect(await read('a','pid',[{...local,name:'Purple-36'}])).toEqual([{...local,name:'Purple-36'}]);expect(fetch).not.toHaveBeenCalled();
  await read('a','pid',[local]);await read('b','pid',[local]);expect(fetch).toHaveBeenCalledTimes(2);
 });
});
