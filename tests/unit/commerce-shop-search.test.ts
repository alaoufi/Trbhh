import {beforeEach,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
const state=vi.hoisted(()=>({enabled:true,search:vi.fn(),intent:vi.fn(),read:vi.fn(),query:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:state.query}}));
vi.mock('@/lib/auth',()=>({getSession:async()=>null}));
vi.mock('@/lib/roles',()=>({hasAction:()=>false}));
vi.mock('@/lib/account',()=>({primaryImages:async()=>new Map()}));
vi.mock('@/lib/commerce/settings',()=>({getCommerceConfig:async()=>({enabled:state.enabled,purchasingEnabled:false,paymentsEnabled:false,shippingFeeMinor:null,text:{title:'متجر تربح',description:'منتجات',buy:'شراء',unavailable:'مغلق'}})}));
vi.mock('@/lib/commerce/schema',()=>({assertCommerceSchemaReady:async()=>{}}));
vi.mock('@/lib/commerce/runtime',()=>({getCommerceGateway:async()=>null}));
vi.mock('@/lib/commerce/public-product',()=>({searchPublicCommerceProducts:state.search,readPublicCommerceProducts:state.read}));
vi.mock('@/lib/ai/local',()=>({localPublicSearchQueries:state.intent}));
vi.mock('@/components/commerce/commerce-home',()=>({CommerceHome:()=>null}));
vi.mock('@/components/commerce/catalog',()=>({firstImageUrl:()=>''}));
import Shop from '@/app/shop/page';
beforeEach(()=>{vi.clearAllMocks();state.enabled=true;state.intent.mockResolvedValue(['منظم أدوات المطبخ']);state.search.mockResolvedValue([]);state.read.mockResolvedValue(new Map());state.query.mockResolvedValue([]);});
it('searches only approved saved store products and preserves the visitors phrase in the form',async()=>{
 const html=renderToStaticMarkup(await Shop({searchParams:Promise.resolve({q:'شي يرتب لي أدوات المطبخ'})}));
 expect(state.search).toHaveBeenCalledWith('شي يرتب لي أدوات المطبخ',['منظم أدوات المطبخ']);
 expect(state.read).not.toHaveBeenCalled();expect(state.query).not.toHaveBeenCalled();
 expect(html).toContain('action="/shop"');expect(html).toContain('data-search-scope="trbhh-products"');expect(html).toContain('data-search-mode="intent"');
 expect(html).toContain('شي يرتب لي أدوات المطبخ');expect(html).not.toContain('أحدث إعلانات تربح');
});
it('honors store closure before any model or product query',async()=>{
 state.enabled=false;await Shop({searchParams:Promise.resolve({q:'مطبخ'})});
 expect(state.intent).not.toHaveBeenCalled();expect(state.search).not.toHaveBeenCalled();
});
it('keeps the original phrase during model overload without querying suppliers',async()=>{
 state.intent.mockResolvedValue([]);
 const html=renderToStaticMarkup(await Shop({searchParams:Promise.resolve({q:'مطبخ'})}));
 expect(state.search).toHaveBeenCalledWith('مطبخ',[]);expect(html).toContain('data-search-mode="literal"');
});
it('does not enable model inference on the unrelated advertisements search page',()=>{
 expect(readFileSync('src/app/search/page.tsx','utf8')).not.toContain('localPublicSearchQueries');
 expect(readFileSync('scripts/local-ai/capacity-check.cjs','utf8')).not.toContain('/search?q=');
});
