import {beforeEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ReactNode} from 'react';

const state=vi.hoisted(()=>({allowed:true,cache:new Map<string,string>(),read:vi.fn(),write:vi.fn(),translate:vi.fn(),sourceName:'Cotton Summer Shirt',nameAr:'',category:'Summer Clothing'}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:async(module:string,action:string)=>{if(!state.allowed||module!=='products'||action!=='view')throw Error('denied');return {uid:9};}}));
vi.mock('@/components/access-boundary',()=>({AccessBoundary:({children,action}:{children:ReactNode;action?:string})=>action==='view'?children:null}));
vi.mock('@/lib/cj/config',()=>({cjConfig:()=>({configured:true})}));
vi.mock('@/lib/cj/sync',()=>({cjSyncSettings:async()=>({shippingMinor:500,usdToSarX100:375})}));
vi.mock('@/lib/cj/pricing',()=>({defaultMarginBps:async()=>3000,computePrice:()=>({salePriceMinor:5525})}));
vi.mock('@/lib/cj/client',()=>({getCategories:async()=>({ok:true,data:[{id:'CAT-1',name:state.category,path:'Clothing > Summer Clothing'}]}),listProductsPage:async()=>({ok:true,data:{total:1,items:[{pid:'PID-1',productSku:'SKU-1',productName:state.sourceName,categoryName:state.category,productImage:null,sellPrice:10}]}})}));
vi.mock('@/lib/cj/sample',()=>({sampleOneCjProduct:async()=>({ok:true,data:{name:state.sourceName,category:state.category,priceUsd:10,totalStock:7,images:[],variants:[{vid:'VID-1',sku:'SKU-BLUE',name:'Blue Large',priceUsd:10,weight:100,stock:7}]}})}));
vi.mock('@/lib/cj/mapping',()=>{
  const row=()=>({id:1,cj_product_id:'PID-1',cj_sku:'SKU-1',name:state.sourceName,name_ar:state.nameAr,trbhh_category:state.category,image:'',sale_price_minor:5525,sale_price_override_minor:null,supplier_cost_minor:3750,shipping_cost_minor:500,hidden:0,status:'draft',source_description:null,display_description_ar:null});
  return {importedCjPids:async()=>new Set(),listCjProducts:async()=>[row()],listVisibleCjProducts:async()=>[row()],getCjProductById:async()=>row()};
});
vi.mock('@/lib/cj/storefront',()=>({cjImg:(value:string)=>value,cjProductImages:()=>['https://example.test/saved-gallery.jpg'],cjStorefrontPublic:async()=>false}));
vi.mock('@/lib/cj/translate',async(importOriginal)=>{
  const actual=await importOriginal<typeof import('@/lib/cj/translate')>();
  return {...actual,getCachedArabic:async(texts:string[])=>{state.read(texts);return new Map(texts.filter(t=>state.cache.has(t)).map(t=>[t,state.cache.get(t)!]));},translateManyCached:state.translate,translateToArabic:state.translate};
});
vi.mock('@/app/admin/suppliers/cj/actions',()=>({importCjProduct:state.write,removeCjProduct:state.write,saveCjArabic:state.write,saveCjPrice:state.write,toggleCjHidden:state.write,translateCjProduct:state.write,translateAllCj:state.write,translateCjCategories:state.write,runCjTranslateWarm:state.write,refreshCjMediaAction:state.write,setCjStorefront:state.write,approveCjProduct:state.write,saveCjReview:state.write}));
import Browse from '@/app/admin/suppliers/cj/browse/page';
import Showcase from '@/app/admin/suppliers/cj/showcase/page';
import Review from '@/app/admin/suppliers/cj/review/[id]/page';
const withoutSourceDetails=(html:string)=>html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,'');
async function browse(params:Record<string,string|undefined>={}){return renderToStaticMarkup(await Browse({searchParams:Promise.resolve(params)}));}
beforeEach(()=>{vi.clearAllMocks();state.allowed=true;state.cache=new Map();state.sourceName='Cotton Summer Shirt';state.nameAr='';state.category='Summer Clothing';});

describe('CJ admin Arabic display uses only saved translations on GET',()=>{
  it.each([{}, {ar:'0'}, {detail:'PID-1'}])('reading browse %j never translates or writes',async params=>{
    const html=await browse(params);expect(html).toContain('تُعرض الترجمات العربية المحفوظة');
    expect(state.read).toHaveBeenCalled();expect(state.translate).not.toHaveBeenCalled();expect(state.write).not.toHaveBeenCalled();
  });
  it('shows missing Arabic clearly while retaining original text only in labeled source details',async()=>{
    const html=await browse({detail:'PID-1'}),visible=withoutSourceDetails(html);
    expect(visible).toContain('الترجمة العربية غير متاحة');expect(visible).toContain('اسم المنتج كما يظهر في المصدر');
    for(const source of ['Cotton Summer Shirt','Summer Clothing','Blue Large']){expect(html).toContain(source);expect(visible).not.toContain(source);}
    expect(html).toContain('النص الأصلي من المصدر');expect(visible).toContain('PID-1');expect(visible).toContain('SKU-1');
    const options=html.match(/<option\b[^>]*>[\s\S]*?<\/option>/g)??[];expect(options.join('')).toContain('value="CAT-1"');expect(options.join('')).not.toContain('Summer Clothing');expect(options.join('')).not.toContain('>الترجمة العربية غير متاحة · CAT-1');
  });
  it('uses cached Arabic in titles, category filters and detail variants without English fallback',async()=>{
    state.cache=new Map([['Cotton Summer Shirt','قميص صيفي قطني'],['Summer Clothing','ملابس صيفية'],['Blue Large','أزرق كبير']]);
    const visible=withoutSourceDetails(await browse({detail:'PID-1',cat:'CAT-1'}));
    for(const label of state.cache.values())expect(visible).toContain(label);
    expect(visible).not.toContain('الترجمة العربية غير متاحة');expect(state.translate).not.toHaveBeenCalled();
  });
  it('does not call a mixed Arabic-English imported title fully translated',async()=>{
    state.nameAr='قميص Cotton Summer Shirt';const visible=withoutSourceDetails(await browse());
    expect(visible).toContain('الترجمة العربية غير متاحة');expect(visible).not.toContain(state.nameAr);
  });
  it('keeps already Arabic source names and categories without inventing a missing translation',async()=>{
    state.sourceName='قميص قطني';state.category='ملابس صيفية';const visible=withoutSourceDetails(await browse());
    expect(visible).toContain('قميص قطني');expect(visible).toContain('ملابس صيفية');expect(visible).not.toContain('الترجمة العربية غير متاحة');
  });
  it('rejects a non-viewer before reading translation cache',async()=>{
    state.allowed=false;await expect(browse()).rejects.toThrow('denied');expect(state.read).not.toHaveBeenCalled();expect(state.translate).not.toHaveBeenCalled();
  });
  it('showcase never labels raw English as the Arabic product title',async()=>{
    const html=renderToStaticMarkup(await Showcase({searchParams:Promise.resolve({})}));
    expect(withoutSourceDetails(html)).toContain('الترجمة العربية غير متاحة');expect(withoutSourceDetails(html)).not.toContain('Cotton Summer Shirt');
    expect(html).toContain('النص الأصلي من المصدر');expect(html).toContain('Cotton Summer Shirt');expect(state.translate).not.toHaveBeenCalled();
    expect(html).toContain('src="https://example.test/saved-gallery.jpg"');
    expect(html).toContain('التعميم غير مفعّل');expect(html).not.toContain('تفعيل الإعلان للعامة');
  });
  it('keeps the review source section explicitly labeled and collapsed',async()=>{
    const html=renderToStaticMarkup(await Review({params:Promise.resolve({id:'1'}),searchParams:Promise.resolve({})}));
    expect(html).toMatch(/<details[^>]*><summary[^>]*>بيانات المصدر الأصلية/);expect(html).not.toMatch(/<details[^>]*\bopen\b/);
    expect(withoutSourceDetails(html)).not.toContain('Cotton Summer Shirt');expect(state.write).not.toHaveBeenCalled();
  });
});
