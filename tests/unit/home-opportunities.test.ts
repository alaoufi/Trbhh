import { describe, expect, it, vi } from 'vitest';
import { opportunityCategories, selectHomeOpportunities } from '@/lib/home-opportunities';
import type { AdCard } from '@/lib/data';
import type { CategoryFormConfig } from '@/lib/ad-categories/contracts';
const config: CategoryFormConfig = {enabled:true,categories:Array.from({length:9},(_,i)=>({id:i+1,name:`Category ${i+1}`,active:true,order:i})),subcategories:[],labels:{}};
const ad = (id:number, category=1, seller:string|null='Seller'): AdCard => ({id,title:`Item ${id}`,price:15,adsType:'sale',image:'/real.jpg',cityName:null,categoryName:`Category ${category}`,createdAt:null,special:false,urgent:false,views:0,sellerName:seller,sellerTrusted:false});
describe('homepage opportunity selection',()=>{
 it('retains public fallback even when category navigation is unavailable',()=>{
  expect(opportunityCategories(null,[])).toEqual([]);
  expect(selectHomeOpportunities({...config,categories:[]},[ad(1)],[]).tiles[0].href).toBe('/ads/1');
  expect(selectHomeOpportunities({...config,enabled:false},[ad(1)],[]).ads.map(x=>x.id)).toEqual([1]);
 });
 it('deduplicates active categories, prefers relevant seeds and bounds candidates',()=>{
  const c={...config,categories:[...config.categories,{...config.categories[0]}, {id:20,name:'Hidden',active:false,order:0}]};
  const result=opportunityCategories(c,[ad(1,8)],new Date('2026-10-20T12:00:00Z'));
  expect(result).toHaveLength(6); expect(result[0].id).toBe(8); expect(new Set(result.map(x=>x.id)).size).toBe(6);
 });
 it('rotates at Riyadh midnight with deterministic results',()=>{
  const a=opportunityCategories(config,[],new Date('2026-10-20T20:59:59Z'));
  expect(opportunityCategories(config,[],new Date('2026-10-20T10:00:00Z'))).toEqual(a);
  expect(opportunityCategories(config,[],new Date('2026-10-20T21:00:00Z'))).not.toEqual(a);
 });
 it('does not manufacture advertisements for entirely empty inventory',()=>{
  const result=selectHomeOpportunities(config,[],[],new Date('2026-10-20T12:00:00Z'));
  expect(result.ads).toEqual([]);expect(result.tiles).toHaveLength(0);
  expect(result.tiles.every(x=>x.image===null&&x.href===`/?category=${x.categoryId}`)).toBe(true);
 });
 it('diversifies categories and sellers before dominant inventory and preserves prices',()=>{
  const ads=[ad(1,1,'Dominant'),ad(2,1,'Dominant'),ad(3,2,'Dominant'),ad(4,2,'Other'),ad(5,3,null),ad(6,4,null)];
  const result=selectHomeOpportunities(config,ads,[],new Date('2026-10-20T12:00:00Z'));
  expect(result.ads.slice(0,4).map(x=>x.id)).toEqual([1,4,5,6]);
  expect(result.ads.find(x=>x.id===1)).toBe(ads[0]); expect(ads[0].price).toBe(15);
 });
 it('suppresses duplicate IDs and normalized titles without inventing records',()=>{
  const result=selectHomeOpportunities(config,[ad(1),ad(1),{...ad(2),title:'  ITEM   1  '},ad(3)],[]);
  expect(result.ads.map(x=>x.id)).toEqual([1,3]);
 });
});
vi.mock('@/lib/data',()=>({searchAds:vi.fn()}));
import { searchAds } from '@/lib/data';
import { getHomeOpportunities } from '@/lib/home-opportunities-server';
describe('opportunity public loader',()=>{
 it('makes no queries when disabled',async()=>{
  vi.mocked(searchAds).mockReset(); expect((await getHomeOpportunities(null,[ad(1)])).ads.map(x=>x.id)).toEqual([1]);expect(searchAds).not.toHaveBeenCalled();
 });
 it('keeps successful public results when another category query fails',async()=>{
  vi.mocked(searchAds).mockReset().mockImplementation(async args=>{if(args.categoryId===1)return [ad(90)];throw new Error('offline');});
  const result=await getHomeOpportunities(config,[ad(1)],new Date('2026-10-20T12:00:00Z'));
  expect(result.ads.map(x=>x.id)).toEqual([90,1]);
 });
 it('uses at most six bounded category public queries and retains fallback on failures',async()=>{
  vi.mocked(searchAds).mockReset().mockRejectedValue(new Error('unavailable'));
  const result=await getHomeOpportunities(config,[ad(1)]);
  expect(searchAds).toHaveBeenCalledTimes(6);for(const [args] of vi.mocked(searchAds).mock.calls) expect(args).toEqual({categoryId:expect.any(Number),take:3,skip:0});
  expect(result.ads.map(x=>x.id)).toEqual([1]);expect(result.tiles).toHaveLength(1);
 });
});


describe('featured-first filled opportunity placements',()=>{
 it('fills four placements with real ads even when all inventory belongs to one category',()=>{const source=[ad(1),ad(2),ad(3),ad(4)];const result=selectHomeOpportunities(config,source,[]);expect(result.tiles).toHaveLength(4);expect(result.tiles.every(tile=>tile.image&&tile.href.startsWith('/ads/'))).toBe(true);expect(new Set(result.tiles.map(tile=>tile.href)).size).toBe(4);});
 it('puts genuine featured ads first even from outside the queried category set',()=>{const featured={...ad(99,9),special:true};const source=[ad(1),ad(2),ad(3),featured];const result=selectHomeOpportunities(config,source,[]);expect(result.tiles[0].href).toBe('/ads/99');expect(result.ads[0].id).toBe(99);});
 it('does not label a cross-category fallback with the empty category name',()=>{const c={...config,categories:config.categories.slice(0,4)};const result=selectHomeOpportunities(c,[{...ad(10,8),href:'/companies/source/10'}],[]);expect(result.tiles).toHaveLength(1);expect(result.tiles[0]).toMatchObject({href:'/companies/source/10',categoryName:'Category 8',image:'/real.jpg'});});
 it('uses available public fallback without querying categories when category configuration is disabled',async()=>{vi.mocked(searchAds).mockReset();const result=await getHomeOpportunities({...config,enabled:false},[ad(1)]);expect(result.tiles[0]?.href).toBe('/ads/1');expect(searchAds).not.toHaveBeenCalled();});
});
