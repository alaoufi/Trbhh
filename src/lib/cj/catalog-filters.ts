export const catalogFilterKeys=['minPrice','maxPrice','country','platform','supplier','minStock','verified','flag','sort'] as const;
export type CatalogFilterValues=Partial<Record<typeof catalogFilterKeys[number],string>>;
const sorts:Record<string,{orderBy:number;sort:string}>={best:{orderBy:0,sort:'desc'},price_asc:{orderBy:2,sort:'asc'},price_desc:{orderBy:2,sort:'desc'},newest:{orderBy:3,sort:'desc'},popular:{orderBy:1,sort:'desc'},stock:{orderBy:4,sort:'desc'}};
/** Only documented listV2 parameters. Invalid filters never turn into an unfiltered catalog. */
export function parseCjCatalogFilters(input:Record<string,string|string[]|undefined>){
 const values:CatalogFilterValues={},query:Record<string,string|number>={},params=new URLSearchParams();let error:string|null=null;
 for(const key of catalogFilterKeys){const raw=input[key];if(Array.isArray(raw)){error='اختر قيمة واحدة لكل فلتر.';continue;}const value=(raw||'').trim();if(value){values[key]=value;params.set(key,value);}}
 const price=(key:'minPrice'|'maxPrice',target:string)=>{const value=values[key];if(value!==undefined){if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(value)||Number(value)>1000000)error='أدخل سعرًا صحيحًا بالدولار، بمنزلتين عشريتين كحد أقصى.';else query[target]=Number(value);}};
 price('minPrice','startSellPrice');price('maxPrice','endSellPrice');
 if(values.minPrice&&values.maxPrice&&Number(values.minPrice)>Number(values.maxPrice))error='السعر الأدنى يجب ألا يتجاوز السعر الأعلى.';
 if(values.country){values.country=values.country.toUpperCase();params.set('country',values.country);if(!/^[A-Z]{2}$/.test(values.country))error='أدخل رمز بلد المستودع من حرفين مثل CN.';else query.countryCode=values.country;}
 if(values.platform){if(!['tiktok','amazon','ebay','etsy','shopify'].includes(values.platform))error='منصة البيع المختارة غير مدعومة.';else query.zonePlatform=values.platform;}
 if(values.supplier){if(!/^[A-Za-z0-9_-]{1,200}$/.test(values.supplier))error='معرف المورد غير صالح.';else query.supplierId=values.supplier;}
 if(values.minStock){if(!/^\d{1,9}$/.test(values.minStock))error='أدخل عددًا صحيحًا للمخزون.';else query.startWarehouseInventory=Number(values.minStock);}
 if(values.verified){if(values.verified!=='1')error='خيار المخزون غير صالح.';else query.verifiedWarehouse=1;}
 if(values.flag){if(!['0','1','2'].includes(values.flag))error='نوع المنتجات غير صالح.';else query.productFlag=Number(values.flag);}
 const order=sorts[values.sort||'best'];if(!order)error='ترتيب النتائج غير صالح.';else Object.assign(query,order);
 return {values,query,params,error};
}
