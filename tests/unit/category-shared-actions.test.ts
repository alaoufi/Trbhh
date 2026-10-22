import {beforeEach,describe,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({access:vi.fn(async()=>({uid:7})),execute:vi.fn(async()=>1),rows:[] as {id:bigint;name:string;version:number;fields_json:string}[]}));
vi.mock('@/lib/prisma',()=>({prisma:{$transaction:async(work:(tx:unknown)=>unknown)=>work({$queryRaw:async(strings:TemplateStringsArray)=>strings.join('?').startsWith('SELECT id FROM categories')?[{id:1n}]:f.rows,$executeRaw:f.execute})}}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:f.access}));
vi.mock('@/lib/settings',()=>({setSetting:vi.fn()}));
vi.mock('@/lib/data',()=>({bustAdCaches:async()=>{}}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw Error(url);}}));
import {saveSharedCategoryFields,autosaveCategoryFields} from '@/app/admin/categories/actions';
import {groupCategoryFields} from '@/lib/ad-categories/shared-fields';
import type {SubcategoryOption} from '@/lib/ad-categories/contracts';
const field={key:'color',label:'اللون',type:'text' as const,group:'',visible:true,required:true,order:0,options:[]};
const sub:SubcategoryOption={id:2,name:'ستائر',categoryId:1,version:4,active:true,order:0,kind:'goods',priceEnabled:true,goodsEnabled:true,fields:[field]};
function form(){const fd=new FormData();fd.set('category_id','1');fd.set('versions_json',JSON.stringify([{id:2,version:4}]));fd.set('changes_json',JSON.stringify([{id:groupCategoryFields([sub])[0].id,visible:false}]));fd.set('return_to','/admin/categories?scope=parent&category=1&section=display');return fd;}
beforeEach(()=>{vi.clearAllMocks();f.access.mockResolvedValue({uid:7});f.rows=[{id:2n,name:'ستائر',version:4,fields_json:JSON.stringify([field])}];});
describe('shared field admin write',()=>{
 it('requires edit permission and changes only flags with versioned audited writes',async()=>{await expect(saveSharedCategoryFields(form())).rejects.toThrow('scope=parent&category=1&section=display&saved=1');expect(f.access).toHaveBeenCalledWith('categories','edit');const call=f.execute.mock.calls[0] as unknown[];expect(JSON.parse(String(call[1]))[0]).toMatchObject({key:'color',visible:false,required:false});expect(call.slice(2)).toEqual([2,4]);expect(f.execute).toHaveBeenCalledTimes(2);});
 it('refuses stale definitions before any write',async()=>{f.rows[0].version=5;await expect(saveSharedCategoryFields(form())).rejects.toThrow('error=input');expect(f.execute).not.toHaveBeenCalled();});
 it('refuses changed membership or forged subcategory snapshots',async()=>{f.rows.push({...f.rows[0],id:3n});await expect(saveSharedCategoryFields(form())).rejects.toThrow('error=input');expect(f.execute).not.toHaveBeenCalled();});
 it('does not access or write database after authorization failure',async()=>{f.access.mockRejectedValueOnce(Error('forbidden'));await expect(saveSharedCategoryFields(form())).rejects.toThrow('forbidden');expect(f.execute).not.toHaveBeenCalled();});
 it('refuses a forged field signature',async()=>{const fd=form();fd.set('changes_json',JSON.stringify([{id:'other-category',required:true}]));await expect(saveSharedCategoryFields(fd)).rejects.toThrow('error=input');expect(f.execute).not.toHaveBeenCalled();});
});

 it('autosaves without redirect and returns authoritative flags and incremented versions',async()=>{
   const result=await autosaveCategoryFields(form());
   expect(result[0]).toMatchObject({id:2,version:5,fields:[{...field,visible:false,required:false}]});
 });
 it('limits a child exception to that child while retaining full version checks',async()=>{
   f.rows.push({...f.rows[0],id:3n});const fd=form();fd.set('versions_json',JSON.stringify([{id:2,version:4},{id:3,version:4}]));fd.set('subcategory_id','2');
   const result=await autosaveCategoryFields(fd);expect(result.map(s=>s.version)).toEqual([5,4]);expect(result[1].fields[0].visible).toBe(true);
 });
