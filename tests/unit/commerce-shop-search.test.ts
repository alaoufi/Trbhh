import {beforeEach,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import type {PublicCommerceProduct} from '@/lib/commerce/public-product';
const state=vi.hoisted(()=>({enabled:true,session:false,permission:false,search:vi.fn(),intent:vi.fn(),read:vi.fn(),query:vi.fn(),ads:vi.fn(),home:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:state.query,ads:{findMany:state.ads}}}));
vi.mock('@/lib/auth',()=>({getSession:async()=>state.session?{uid:1}:null}));
vi.mock('@/lib/roles',()=>({hasAction:async()=>state.permission}));
vi.mock('@/lib/account',()=>({primaryImages:async()=>new Map()}));
vi.mock('@/lib/commerce/settings',()=>({getCommerceConfig:async()=>({enabled:state.enabled,purchasingEnabled:false,paymentsEnabled:false,shippingFeeMinor:null,text:{title:'متجر تربح',description:'منتجات',buy:'شراء',unavailable:'مغلق'}})}));
vi.mock('@/lib/commerce/schema',()=>({assertCommerceSchemaReady:async()=>{}}));
vi.mock('@/lib/commerce/runtime',()=>({getCommerceGateway:async()=>null}));
vi.mock('@/lib/commerce/public-product',()=>({searchTrbhhProducts:state.search,readPublicCommerceProducts:state.read}));
vi.mock('@/lib/ai/local',()=>({localPublicSearchQueries:state.intent}));
vi.mock('@/components/commerce/commerce-home',()=>({CommerceHome:state.home}));
vi.mock('@/components/commerce/catalog',()=>({firstImageUrl:()=>''}));
import Shop from '@/app/shop/page';
function product(id:string,featured=false):PublicCommerceProduct{return {id,title:`Product ${id}`,priceMinor:100,stock:1,images:[],description:'',brand:null,options:[],variants:[],requiresVariantSelection:false,featured,saudiShippingAvailable:true,deliveryEstimate:null,weightLabel:null,bundledShipping:false};}
beforeEach(()=>{vi.clearAllMocks();state.enabled=true;state.session=false;state.permission=false;state.search.mockResolvedValue({products:[],mode:'semantic'});state.read.mockResolvedValue(new Map());state.query.mockResolvedValue([]);state.ads.mockResolvedValue([]);state.home.mockReturnValue(null);});
it('searches saved store products once and preserves the visitors original phrase',async()=>{
 const html=renderToStaticMarkup(await Shop({searchParams:Promise.resolve({q:'شي يرتب لي أدوات المطبخ',preview:'1'})}));
 expect(state.search).toHaveBeenCalledExactlyOnceWith('شي يرتب لي أدوات المطبخ');
 expect(state.intent).not.toHaveBeenCalled();expect(state.read).not.toHaveBeenCalled();expect(state.query).not.toHaveBeenCalled();expect(state.ads).not.toHaveBeenCalled();
 expect(html).toContain('action="/shop"');expect(html).toContain('data-search-scope="trbhh-products"');expect(html).toContain('data-search-mode="semantic"');
 expect(html).toContain('شي يرتب لي أدوات المطبخ');expect(html).not.toContain('name="preview"');
});
it.each([{session:false,permission:false},{session:true,permission:false}])('honors store closure before search for unauthorized preview %o',async({session,permission})=>{
 state.enabled=false;state.session=session;state.permission=permission;
 await Shop({searchParams:Promise.resolve({q:'مطبخ',preview:'1'})});
 expect(state.search).not.toHaveBeenCalled();expect(state.intent).not.toHaveBeenCalled();expect(state.query).not.toHaveBeenCalled();expect(state.read).not.toHaveBeenCalled();
});
it('honors ordinary store closure before search',async()=>{
 state.enabled=false;await Shop({searchParams:Promise.resolve({q:'مطبخ'})});expect(state.search).not.toHaveBeenCalled();
});
it('reports literal fallback from the saved-product search without rewrite',async()=>{
 state.search.mockResolvedValue({products:[],mode:'literal'});
 const html=renderToStaticMarkup(await Shop({searchParams:Promise.resolve({q:'مطبخ'})}));
 expect(state.search).toHaveBeenCalledExactlyOnceWith('مطبخ');expect(state.intent).not.toHaveBeenCalled();expect(html).toContain('data-search-mode="literal"');
});
it('preserves semantic rank across featured flags and IDs in a single result section',async()=>{
 state.search.mockResolvedValue({products:[product('2'),product('99',true),product('3')],mode:'semantic'});
 renderToStaticMarkup(await Shop({searchParams:Promise.resolve({q:'مطبخ'})}));
 const props=state.home.mock.calls[0][0];
 expect(props.hero).toEqual([]);expect(props.sections).toHaveLength(1);
 expect(props.sections[0].items.map((item:{id:string})=>item.id)).toEqual(['2','99','3']);
 expect(props.sections[0].items.every((item:{buyable:boolean})=>!item.buyable)).toBe(true);
});
it('never substitutes ad demos for an empty authorized preview search',async()=>{
 state.enabled=false;state.session=true;state.permission=true;
 const html=renderToStaticMarkup(await Shop({searchParams:Promise.resolve({q:'مطبخ',preview:'1'})}));
 expect(state.search).toHaveBeenCalledOnce();expect(state.ads).not.toHaveBeenCalled();expect(html).toContain('name="preview"');expect(html).toContain('لا توجد منتجات معتمدة مطابقة لبحثك.');
});
it('retains the ordinary saved-product read and featured-first display without a query',async()=>{
 state.query.mockResolvedValue([{id:2n},{id:99n}]);state.read.mockResolvedValue(new Map([['2',product('2')],['99',product('99',true)]]));
 renderToStaticMarkup(await Shop({searchParams:Promise.resolve({q:'  '})}));
 expect(state.search).not.toHaveBeenCalled();expect(state.intent).not.toHaveBeenCalled();expect(state.query).toHaveBeenCalledOnce();expect(state.read).toHaveBeenCalledWith([2n,99n]);
 expect(state.home.mock.calls[0][0].hero[0].id).toBe('99');
});
it('keeps supplier and model rewrite imports out of the visitor shop flow and leaves ads search unrelated',()=>{
 const source=readFileSync('src/app/shop/page.tsx','utf8');
 expect(source).not.toMatch(/localPublicSearchQueries|@\/lib\/ai|@\/lib\/cj|CJMCP/);
 expect(readFileSync('src/app/search/page.tsx','utf8')).not.toContain('localPublicSearchQueries');
 expect(readFileSync('scripts/local-ai/capacity-check.cjs','utf8')).not.toContain('/search?q=');
});

it('counts only the ranked products the shared grid can render',async()=>{
 state.search.mockResolvedValue({products:Array.from({length:40},(_,i)=>product(String(i+1),i%2===1)),mode:'semantic'});
 const html=renderToStaticMarkup(await Shop({searchParams:Promise.resolve({q:'مطبخ'})}));
 const items=state.home.mock.calls[0][0].sections[0].items;
 expect(items).toHaveLength(20);expect(items.map((item:{id:string})=>item.id)).toEqual(Array.from({length:20},(_,i)=>String(i+1)));
 expect(html).toContain('نتائج المنتجات: 20');expect(html).not.toContain('نتائج المنتجات: 40');
});
