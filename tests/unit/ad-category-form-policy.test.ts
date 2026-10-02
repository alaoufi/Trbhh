import {it,expect,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AdForm} from '@/components/ad-form';
import {AdCategoryEditor} from '@/components/ad-category-editor';
import {AdCategorySummary} from '@/components/ad-category-summary';
import {CATEGORY_LABELS,type CategoryFormConfig} from '@/lib/ad-categories/contracts';
vi.stubGlobal('React',React);
vi.mock('@/components/image-uploader',()=>({ImageUploader:()=>null}));
vi.mock('@/components/audio-recorder',()=>({AudioRecorder:()=>null}));
const cfg:CategoryFormConfig={enabled:true,labels:CATEGORY_LABELS,categories:[{id:12,name:'الوظائف',active:true,order:0}],subcategories:[{id:34,categoryId:12,name:'وظائف إدارية',active:true,order:0,version:2,kind:'jobs',priceEnabled:false,goodsEnabled:false,fields:[]}]};
const form=(config=cfg)=>renderToStaticMarkup(React.createElement(AdForm,{action:async()=>{},countries:[],cities:[],submitLabel:'حفظ',initial:{id:1,categoryId:12,subcategoryId:34,price:50},categoryConfig:config,allowOldPrice:true,allowStock:true}));
it('actual shared job form omits generic prices, goods and discount controls',()=>{
  const html=form();expect(html).toContain('name="category_version"');expect(html).not.toContain('name="price"');expect(html).not.toContain('name="condition"');expect(html).not.toContain('name="stock_state"');expect(html).not.toContain('name="old_price"');
});
it('active category forms never duplicate legacy extras even for goods',()=>{
  const html=form({...cfg,subcategories:[{...cfg.subcategories[0],kind:'goods',priceEnabled:true,goodsEnabled:true}]});
  expect(html).toContain('name="price"');expect(html).toContain('name="stock_state"');expect(html).not.toContain('name="condition"');expect(html).not.toContain('name="negotiable"');
});
it('new unconfigured editor starts without price or goods defaults',()=>{
  const html=renderToStaticMarkup(React.createElement(AdCategoryEditor,{categoryId:12,action:async()=>{}}));
  expect(html).not.toContain('name="price_enabled" value="1" checked');
  expect(html).not.toContain('name="goods_enabled" value="1" checked');
  expect(html).toContain('استبدال الحقول والسياسة بالقالب المختار');
});
it('shows stale-category error even after the global feature is switched off',()=>{
  const html=renderToStaticMarkup(React.createElement(AdForm,{action:async()=>{},countries:[],cities:[],submitLabel:'حفظ',error:'category',categoryConfig:{...cfg,enabled:false}}));
  expect(html).toContain(CATEGORY_LABELS.error);
});
it('public values escape user input and preserve meaningful false/zero',()=>{
  const html=renderToStaticMarkup(React.createElement(AdCategorySummary,{fields:[{key:'x',label:'قيمة',group:'تفاصيل',value:'<script>bad</script>'},{key:'b',label:'متاح',group:'',value:false},{key:'n',label:'عدد',group:'',value:0}]}));
  expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).toContain('لا');expect(html).toContain('>0<');
  expect(html).toContain('grid-cols-1');expect(html).toContain('sm:grid-cols-2');
});
it('does not render empty optional values in advertisement details',()=>{
  const html=renderToStaticMarkup(React.createElement(AdCategorySummary,{fields:[
    {key:'empty',label:'حقل فارغ',group:'تفاصيل',value:''},
    {key:'spaces',label:'مسافات',group:'تفاصيل',value:'   '},
    {key:'array',label:'قائمة فارغة',group:'تفاصيل',value:[]},
    {key:'value',label:'الحالة',group:'تفاصيل',value:'جديد'},
  ]}));
  expect(html).not.toContain('حقل فارغ');
  expect(html).not.toContain('مسافات');
  expect(html).not.toContain('قائمة فارغة');
  expect(html).toContain('الحالة');
  expect(html).toContain('جديد');
});
it('presents precise location as optional without exposing raw coordinates',()=>{
  const html=renderToStaticMarkup(React.createElement(AdForm,{action:async()=>{},countries:[{id:1,name:'السعودية'}],cities:[],areas:[],submitLabel:'حفظ',initial:{id:1,lat:'24.713612',lng:'46.675312',showExactLocationPublicly:false},categoryConfig:{...cfg,enabled:false}}));
  expect(html).toContain('يوجد موقع محدد لهذا الإعلان');
  expect(html).toContain('تحديث موقعي الحالي');
  expect(html).toContain('إزالة الموقع الدقيق');
  expect(html).toContain('إظهار نقطة الوصول والاتجاهات للزوار');
  expect(html).not.toContain('تم تحديد الموقع (');
  expect(html).toContain('type="hidden" name="lat"');
  expect(html).toContain('type="hidden" name="lng"');
  expect(html).not.toContain('required="" name="lat"');
  expect(html).not.toContain('required="" name="lng"');
});
it.each([null,99])('allows keeping unavailable classification %s on edit without required selectors',subcategoryId=>{
  const html=renderToStaticMarkup(React.createElement(AdForm,{action:async()=>{},countries:[],cities:[],submitLabel:'حفظ',initial:{id:1,categoryId:12,subcategoryId},categoryConfig:cfg}));
  expect(html).toContain('name="category_mode"');expect(html).toContain('value="preserve"');
  expect(html).not.toContain('name="category_id"');expect(html).not.toContain('name="subcategory_id"');expect(html).not.toContain('name="category_version"');expect(html).not.toContain('name="category_values"');
});
it('never offers legacy preservation to a new ad',()=>{
  const html=renderToStaticMarkup(React.createElement(AdForm,{action:async()=>{},countries:[],cities:[],submitLabel:'حفظ',categoryConfig:cfg}));
  expect(html).not.toContain('value="preserve"');expect(html).toContain('name="subcategory_id"');
});
it('preservation does not expose editable generic prices even if an inactive option was included',()=>{
  const html=form({...cfg,subcategories:[{...cfg.subcategories[0],active:false,kind:'goods',priceEnabled:true,goodsEnabled:true}]});
  expect(html).toContain('value="preserve"');expect(html).not.toContain('name="price"');expect(html).not.toContain('name="stock_state"');
});
const choiceConfig:CategoryFormConfig={
  ...cfg,
  categories:[...cfg.categories,{id:90,name:'عروض أخرى',active:true,order:1},{id:91,name:'غير مفعّل',active:false,order:2}],
  subcategories:[...cfg.subcategories,
    {...cfg.subcategories[0],id:35,name:'بلا تعريف',version:0},
    {...cfg.subcategories[0],id:36,name:'فرعي مخفي',active:false},
    {...cfg.subcategories[0],id:37,categoryId:90,name:'احتياطي بلا تعريف',version:0},
    {...cfg.subcategories[0],id:38,categoryId:91,name:'فرعي لأب مخفي'},
  ],
};
it('offers only active categories with an active configured child and only eligible dependent options',()=>{
  const html=form(choiceConfig);
  const category=html.match(/<select[^>]*name="taxonomy_group"[^>]*>([\s\S]*?)<\/select>/)?.[1]||'';
  const subcategory=html.match(/<select[^>]*name="subcategory_id"[^>]*>([\s\S]*?)<\/select>/)?.[1]||'';
  expect(category).toContain('الوظائف');
  expect(category).not.toContain('عروض أخرى');expect(category).not.toContain('غير مفعّل');
  expect(subcategory).toContain('وظائف إدارية');
  expect(subcategory).not.toContain('بلا تعريف');expect(subcategory).not.toContain('فرعي مخفي');
});
it('uses a public group selector while posting the selected leaf database ids',()=>{
  const grouped:CategoryFormConfig={...cfg,groups:[{key:'jobs-business',name:'وظائف وأعمال',order:1,categoryIds:[12]}],subcategories:cfg.subcategories.map(item=>({...item,groupKey:'jobs-business',sourceSubcategoryIds:[item.id]}))};
  const html=form(grouped);
  expect(html).toMatch(/<select[^>]*name="taxonomy_group"/);
  expect(html).toContain('وظائف وأعمال');
  expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="category_id"[^>]*value="12"/);
});
it('preserves legacy fallback editing without forcing an empty required subcategory',()=>{
  const html=renderToStaticMarkup(React.createElement(AdForm,{action:async()=>{},countries:[],cities:[],submitLabel:'حفظ',initial:{id:1,categoryId:90,subcategoryId:37},categoryConfig:choiceConfig}));
  expect(html).toContain('value="preserve"');
  expect(html).not.toContain('name="category_id"');expect(html).not.toContain('name="subcategory_id"');
  expect(html).not.toContain('name="category_version"');
});
it('migrates an alias only after explicit reclassification without losing values',()=>{
  const canonical={...cfg.subcategories[0],id:11,categoryId:1,name:'سيارات',groupKey:'vehicles-equipment',sourceSubcategoryIds:[11,22]};
  const aliasConfig:CategoryFormConfig={...cfg,categories:[{id:1,name:'سيارات حديثة',active:true,order:1},{id:2,name:'سيارات قديمة',active:true,order:2}],groups:[{key:'vehicles-equipment',name:'سيارات ونقليات ومعدات',order:1,categoryIds:[1,2]}],subcategories:[canonical]};
  const html=renderToStaticMarkup(React.createElement(AdForm,{action:async()=>{},countries:[],cities:[],submitLabel:'حفظ',initial:{id:1,categoryId:2,subcategoryId:22,categoryValues:{condition:'مستعمل'}},categoryConfig:aliasConfig}));
  expect(html).toContain('name="category_mode"');
  expect(html).toContain('مرتبط بالتصنيف الموحد');
  expect(html).not.toContain('التصنيف الحالي غير متاح');
  expect(html).not.toContain('name="category_id"');
  expect(html).not.toContain('name="subcategory_id"');
});
