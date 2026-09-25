import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ReactNode} from 'react';

const state=vi.hoisted(()=>({allowed:true,edit:false,suspend:false,remove:false,cache:new Map<string,string>(),savedRows:new Map<string,string>(),read:vi.fn(),write:vi.fn(),translate:vi.fn(),translateSearch:vi.fn(async()=> 'diamond'),list:vi.fn(async()=>({ok:true as const,data:{total:1,items:[{pid:'PID-1',productSku:'SKU-1',productName:state.sourceName,categoryName:state.category,productImage:null,sellPrice:10}]}})),sourceName:'Cotton Summer Shirt',nameAr:'',category:'Summer Clothing',categoryPath:'Clothing > Summer Clothing',variantName:'Blue Large'}));
vi.mock('@/lib/prisma',()=>({prisma:{cj_translations:{
  findMany:async(arg:{where:{source_key:{in:string[]}}})=>{
    const saved=new Map([...state.cache].map(([source,target])=>[createHash('sha1').update('en:ar:'+source).digest('hex'),target]));
    for(const[key,target]of state.savedRows)saved.set(key,target);
    return arg.where.source_key.in.filter(key=>saved.has(key)).map(key=>({source_key:key,target_ar:saved.get(key)!}));
  },
  upsert:async(arg:{where:{source_key:string};create:{target_ar:string};update:{target_ar?:string}})=>{
    state.write(arg);const key=arg.where.source_key;
    if(!state.savedRows.has(key))state.savedRows.set(key,arg.create.target_ar);
    else if(arg.update.target_ar!==undefined)state.savedRows.set(key,arg.update.target_ar);
    return{source_key:key,target_ar:state.savedRows.get(key)};
  },
}}}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:async(module:string,action:string)=>{if(!state.allowed||module!=='products'||action!=='view')throw Error('denied');return {uid:9};}}));
vi.mock('@/components/access-boundary',()=>({AccessBoundary:({children,action}:{children:ReactNode;action?:string})=>action==='view'||(action==='edit'&&state.edit)||(action==='suspend'&&state.suspend)||(action==='delete'&&state.remove)?children:null}));
vi.mock('@/lib/cj/config',()=>({cjConfig:()=>({configured:true})}));
vi.mock('@/lib/cj/sync',()=>({cjSyncSettings:async()=>({shippingMinor:500,usdToSarX100:375})}));
vi.mock('@/lib/cj/pricing',()=>({defaultMarginBps:async()=>3000,computePrice:()=>({salePriceMinor:5525})}));
vi.mock('@/lib/cj/client',()=>({getCategories:async()=>({ok:true,data:[{id:'CAT-1',name:state.category,path:state.categoryPath}]}),listProductsPage:state.list}));
vi.mock('@/lib/cj/search',()=>({translateArabicCjSearch:state.translateSearch}));
vi.mock('@/lib/cj/sample',()=>({sampleOneCjProduct:async()=>({ok:true,data:{name:state.sourceName,category:state.category,priceUsd:10,totalStock:7,images:[],variants:[{vid:'VID-1',sku:'SKU-BLUE',name:state.variantName,priceUsd:10,weight:100,stock:7}]}})}));
vi.mock('@/lib/cj/mapping',()=>{
  const row=()=>({id:1,cj_product_id:'PID-1',cj_sku:'SKU-1',name:state.sourceName,name_ar:state.nameAr,trbhh_category:state.category,image:'',sale_price_minor:5525,sale_price_override_minor:null,supplier_cost_minor:3750,shipping_cost_minor:500,hidden:0,status:'draft',source_description:null,display_description_ar:null});
  return {importedCjPids:async()=>new Set(),listCjProducts:async()=>[row()],listVisibleCjProducts:async()=>[row()],getCjProductById:async()=>row(),parseCjAvailability:()=>null};
});
vi.mock('@/lib/cj/storefront',()=>({cjImg:(value:string)=>value,cjProductImages:()=>['https://example.test/saved-gallery.jpg'],cjStorefrontPublic:async()=>false}));
vi.mock('@/lib/settings',()=>({getSetting:async(_k:string,fallback='')=>fallback}));
vi.mock('@/lib/cj/translate',async(importOriginal)=>{
  const actual=await importOriginal<typeof import('@/lib/cj/translate')>();
  return {...actual,getCachedArabic:async(texts:string[])=>{state.read(texts);return actual.getCachedArabic(texts);},translateManyCached:state.translate,translateToArabic:state.translate};
});
vi.mock('@/app/admin/suppliers/cj/actions',()=>({importCjProduct:state.write,removeCjProduct:state.write,saveCjArabic:state.write,saveCjPrice:state.write,toggleCjHidden:state.write,translateCjProduct:state.write,translateCjBrowsePage:state.write,translateAllCj:state.write,translateCjCategories:state.write,runCjTranslateWarm:state.write,refreshCjMediaAction:state.write,refreshCjImportedAvailability:state.write,saveCjTranslationSettings:state.write,setCjStorefront:state.write,approveCjProduct:state.write,saveCjReview:state.write}));
import Browse from '@/app/admin/suppliers/cj/browse/page';
import Showcase from '@/app/admin/suppliers/cj/showcase/page';
import Review from '@/app/admin/suppliers/cj/review/[id]/page';
import {learnTranslation} from '@/lib/cj/translate';
const withoutSourceDetails=(html:string)=>html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,'');
async function browse(params:Record<string,string|undefined>={}){return renderToStaticMarkup(await Browse({searchParams:Promise.resolve(params)}));}
beforeEach(()=>{vi.clearAllMocks();state.allowed=true;state.edit=false;state.suspend=false;state.remove=false;state.cache=new Map();state.savedRows.clear();state.sourceName='Cotton Summer Shirt';state.nameAr='';state.category='Summer Clothing';state.categoryPath='Clothing > Summer Clothing';state.variantName='Blue Large';state.list.mockImplementation(async()=>({ok:true,data:{total:1,items:[{pid:'PID-1',productSku:'SKU-1',productName:state.sourceName,categoryName:state.category,productImage:null,sellPrice:10}]}}));state.translateSearch.mockResolvedValue('diamond');});

describe('CJ admin Arabic display uses only saved translations on GET',()=>{
  it('translates Arabic product-name searches to the CJ source language before querying the catalog',async()=>{
    const html=await browse({q:'الماس'});
    expect(state.translateSearch).toHaveBeenCalledWith('الماس');
    expect(state.list).toHaveBeenCalledWith(1,24,{productName:'diamond',categoryId:undefined});
    expect(html).toContain('بحث بالاسم');
  });
  it.each([{}, {ar:'0'}, {detail:'PID-1'}])('reading browse %j never translates or writes',async params=>{
    const html=await browse(params);expect(html).toContain('تُعرض الترجمات العربية المحفوظة');
    expect(state.read).toHaveBeenCalled();expect(state.translate).not.toHaveBeenCalled();expect(state.write).not.toHaveBeenCalled();
  });
  it('shows missing Arabic clearly while retaining original text only in labeled source details',async()=>{
    const html=await browse({detail:'PID-1'}),visible=withoutSourceDetails(html);
    expect(visible).toContain('الترجمة العربية غير متاحة');expect(visible).toContain('اكتب اسم المنتج بالعربية أو الإنجليزية');
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
  it('renders saved padded titles, category paths and variants through the real cache contract without changing source text',async()=>{
    state.sourceName=' Cotton Summer Shirt ';state.category=' Summer Clothing ';state.categoryPath=' Clothing > Summer Clothing ';state.variantName=' Blue Large ';
    const translations=new Map([[state.sourceName,'قميص صيفي قطني'],[state.category,'ملابس صيفية'],[state.categoryPath,'ملابس › ملابس صيفية'],[state.variantName,'أزرق كبير']]);
    for(const[source,target]of translations)await learnTranslation(source,target);
    expect(state.savedRows.size).toBe(4);state.write.mockClear();
    const html=await browse({detail:'PID-1',cat:'CAT-1'}),visible=withoutSourceDetails(html);
    for(const label of translations.values())expect(visible).toContain(label);
    expect(visible).not.toContain('الترجمة العربية غير متاحة');expect(visible).not.toContain('تصنيف بانتظار الترجمة');
    expect(html).toContain(state.sourceName);expect(html).toContain(state.categoryPath.replace('>','&gt;'));expect(html).toContain(state.variantName);
    const showcase=renderToStaticMarkup(await Showcase({searchParams:Promise.resolve({})}));
    expect(withoutSourceDetails(showcase)).toContain('قميص صيفي قطني');expect(withoutSourceDetails(showcase)).not.toContain('الترجمة العربية غير متاحة');expect(showcase).toContain(state.sourceName);
    expect(state.translate).not.toHaveBeenCalled();expect(state.write).not.toHaveBeenCalled();
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
  it('offers the explicit current-page translation action only to editors with server query inputs',async()=>{
    expect(await browse()).not.toContain('ترجمة منتجات هذه الصفحة');state.edit=true;
    const html=await browse({page:'2',q:'cotton',cat:'CAT-1',detail:'PID-1'});
    expect(html).toContain('ترجمة منتجات هذه الصفحة');expect(html).toContain('name="page" value="2"');expect(html).toContain('name="q" value="cotton"');expect(html).toContain('name="cat" value="CAT-1"');expect(html).toContain('name="detail" value="PID-1"');
    expect(html).not.toContain('name="texts"');expect(html).not.toContain('name="productName"');expect(state.translate).not.toHaveBeenCalled();expect(state.write).not.toHaveBeenCalled();
  });
  it('renders only static Arabic page-translation feedback, never query-supplied diagnostic text',async()=>{
    expect(await browse({page_translation:'unavailable'})).toContain('تعذّر استكمال ترجمة الصفحة الآن');
    expect(await browse({page_translation:'partial'})).toContain('توفّر بعض الترجمات');
    expect(await browse({page_translation:'PRIVATE provider details'})).not.toContain('PRIVATE provider details');
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
  it('shows edit, visibility, and confirmed delete controls on the imported product detail to authorized admins',async()=>{
    state.edit=true;state.suspend=true;state.remove=true;
    const html=renderToStaticMarkup(await Review({params:Promise.resolve({id:'1'}),searchParams:Promise.resolve({})}));
    expect(html).toContain('حفظ المراجعة');expect(html).toContain('إخفاء من المعاينة');expect(html).toContain('تأكيد الحذف');expect(html).toContain('حذف السلعة من تربح');
  });
});
