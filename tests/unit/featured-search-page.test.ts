import {expect,it,vi} from 'vitest';
import {featuredSearchPage} from '@/lib/featured-search-page';
function fixture(featured:number[],ordinary:number[]){
 const count=vi.fn(async()=>featured.length);
 const read=vi.fn(async(isFeatured:boolean,skip:number,take:number)=>(isFeatured?featured:ordinary).slice(skip,skip+take));
 return {count,read};
}
it('pages across 25+ featured rows without repeats or skipped ordinary rows',async()=>{
 const f=fixture(Array.from({length:27},(_,i)=>i+1),Array.from({length:40},(_,i)=>i+100));
 const first=await featuredSearchPage(24,0,f.count,f.read);
 const second=await featuredSearchPage(24,24,f.count,f.read);
 const third=await featuredSearchPage(24,48,f.count,f.read);
 expect(first).toEqual(Array.from({length:24},(_,i)=>i+1));
 expect(second).toEqual([25,26,27,...Array.from({length:21},(_,i)=>i+100)]);
 expect(third).toEqual(Array.from({length:19},(_,i)=>i+121));
 expect(f.read.mock.calls).toEqual([[true,0,24],[true,24,3],[false,0,21],[false,21,24]]);
});
it('handles all ordinary, all featured, empty, and beyond-end pages',async()=>{
 for(const [featured,ordinary] of [[[],[1,2,3]],[[1,2,3],[]],[[],[]]]){
  const f=fixture(featured,ordinary);
  expect(await featuredSearchPage(2,0,f.count,f.read)).toEqual([...featured,...ordinary].slice(0,2));
  expect(await featuredSearchPage(2,9,f.count,f.read)).toEqual([]);
 }
});
it('does not query for an empty page request',async()=>{
 const f=fixture([1],[2]);expect(await featuredSearchPage(0,0,f.count,f.read)).toEqual([]);
 expect(f.count).not.toHaveBeenCalled();expect(f.read).not.toHaveBeenCalled();
});
it('normalizes negative offsets and rejects unbounded/noninteger page requests',async()=>{
 const f=fixture([1],[2]);expect(await featuredSearchPage(2,-5,f.count,f.read)).toEqual([1,2]);
 for(const take of [Infinity,NaN,-1,1.5])await expect(featuredSearchPage(take,0,f.count,f.read)).rejects.toThrow('invalid_search_page');
});
