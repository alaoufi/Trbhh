import {beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({access:vi.fn(async(_m:string,_a:string)=>({uid:7})),children:vi.fn(async()=>[{id:2n}]),ads:vi.fn(async()=>[] as {id:bigint;title:string;created_at:Date|null;data_archive:string|null}[]),node:vi.fn(async()=>{}),remove:vi.fn(async()=>({archived:true,deleted:true}))}));
vi.mock('@/lib/prisma',()=>({prisma:{sub_categories:{findMany:f.children},ads:{findMany:f.ads}}}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:f.access}));
vi.mock('@/lib/ad-categories/tree-deletion',()=>({deleteEmptyCategoryNode:f.node,deleteTreeAd:f.remove}));
vi.mock('@/lib/data',()=>({bustAdCaches:async()=>{}}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {loadCategoryTreeAds,removeCategoryTreeAd,removeEmptyTreeNode} from '@/app/admin/categories/tree-actions';
beforeEach(()=>{vi.clearAllMocks();f.access.mockReset();f.access.mockResolvedValue({uid:7});f.children.mockResolvedValue([{id:2n}]);f.ads.mockResolvedValue([]);});
it('checks ad read access before fetching titles and refuses unrelated branches',async()=>{await expect(loadCategoryTreeAds(1,3)).rejects.toThrow();expect(f.ads).not.toHaveBeenCalled();expect(f.access.mock.calls).toEqual([['categories','view'],['ads','view']]);});
it('returns bounded cursor pages, explicit unknown dates and archive status',async()=>{f.ads.mockResolvedValue(Array.from({length:26},(_,i)=>({id:BigInt(100-i),title:'عنوان',created_at:null,data_archive:i?'': '2026-01-01'})));const r=await loadCategoryTreeAds(1,2,'101');expect(r.items).toHaveLength(25);expect(r.next).toBe('76');expect(r.items[0]).toMatchObject({archived:true,age:'تاريخ الإضافة غير متاح'});expect(f.ads).toHaveBeenCalledWith(expect.objectContaining({take:26,where:{subcategory_id:2,id:{lt:101n}}}));});
it('keeps unassigned and mismatched direct ads reachable',async()=>{await loadCategoryTreeAds(1,null);expect(f.ads).toHaveBeenCalledWith(expect.objectContaining({where:{category_id:1n,OR:[{subcategory_id:null},{subcategory_id:{notIn:[2]}}]}}));});
it('refuses forged archive/delete modes before writes',async()=>{expect((await removeCategoryTreeAd('9','invalid' as never)).ok).toBe(false);expect(f.remove).not.toHaveBeenCalled();});
it('requires independent ad-delete permission and forwards explicit archive intent',async()=>{await removeCategoryTreeAd('9','archive');expect(f.access.mock.calls).toEqual([['categories','view'],['ads','view'],['ads','archive']]);expect(f.remove).toHaveBeenCalledWith(7,9n,'archive');});
it('requires category-delete capability and refuses all work after authorization denial',async()=>{f.access.mockRejectedValueOnce(Error('denied'));await expect(removeEmptyTreeNode(2,1)).rejects.toThrow('denied');expect(f.node).not.toHaveBeenCalled();});

it('does not allow delete capability to substitute for archive capability',async()=>{f.access.mockImplementation(async(m,a)=>{if(m==='ads'&&a==='archive')throw Error('denied');return {uid:7};});await expect(removeCategoryTreeAd('9','archive')).rejects.toThrow('denied');expect(f.remove).not.toHaveBeenCalled();});
