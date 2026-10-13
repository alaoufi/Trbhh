import {beforeEach,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const state=vi.hoisted(()=>({allowed:true, cached:vi.fn(), blocking:vi.fn(), rows:[{id:42,cj_product_id:'CJ-TEST',name:'Test source',name_ar:'',trbhh_category:'Category',status:'draft',hidden:0,images:null,image:'',supplier_cost_minor:12345,shipping_cost_minor:1111,sale_price_minor:98765,sale_price_override_minor:null}]}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:async()=>{if(!state.allowed)throw Error('denied');}}));
vi.mock('@/lib/cj/mapping',()=>({listCjProducts:async()=>state.rows,listVisibleCjProducts:async()=>state.rows}));
vi.mock('@/lib/cj/translate',()=>({getCachedArabic:state.cached,translateManyForDisplay:state.blocking,isArabicText:(text:string|undefined)=>Boolean(text&&/[\u0600-\u06ff]/.test(text))}));
vi.mock('@/lib/cj/storefront',()=>({cjImg:()=>'',cjProductImages:()=>[]}));
vi.mock('@/components/cj/product-image',()=>({CjProductImage:()=>null}));
vi.mock('@/components/cj/cj-text',()=>({CjText:({original,ar}:{original:string;ar?:string})=>ar||original}));
vi.mock('@/components/cj/cj-live-numbers',()=>({CjLiveNumbers:({pid,productId}:{pid:string;productId?:number})=>`LIVE:${pid}:${productId}`}));
vi.mock('@/components/cj/admin-nav',()=>({CjAdminNav:()=>null}));
vi.mock('@/components/access-boundary',()=>({AccessBoundary:()=>null}));
vi.mock('@/app/admin/suppliers/cj/actions',()=>({saveCjArabic:vi.fn(),saveCjPrice:vi.fn(),toggleCjHidden:vi.fn(),translateCjProduct:vi.fn(),translateAllCj:vi.fn(),refreshCjImportedAvailability:vi.fn(),removeCjProduct:vi.fn()}));
import Imported from '@/app/admin/suppliers/cj/imported/page';
import Showcase from '@/app/admin/suppliers/cj/showcase/page';
beforeEach(()=>{state.allowed=true;state.cached.mockReset().mockResolvedValue(new Map([['Test source','اسم محفوظ']]));state.blocking.mockReset().mockResolvedValue(new Map());});
it.each([Imported,Showcase])('renders live numbers with the imported identity instead of stored price',async Page=>{
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));
 expect(html).toContain('LIVE:CJ-TEST:42');expect(html).not.toContain('987.65');expect(html).not.toContain('134.56');
});
it.each([Imported,Showcase])('shows cached translation without waiting for external translation',async Page=>{
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));
 expect(html).toContain('اسم محفوظ');expect(state.cached).toHaveBeenCalled();expect(state.blocking).not.toHaveBeenCalled();
});
it.each([Imported,Showcase])('rejects unauthorized access before reading the catalog',async Page=>{
 state.allowed=false;await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow('denied');expect(state.cached).not.toHaveBeenCalled();
});
