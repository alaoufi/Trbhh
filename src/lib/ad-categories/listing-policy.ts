import {CategoryValidationError} from './validation';

export const LISTING_TYPE_KEYS=['sale','wanted','rent','wanted_rent','service','service_request','job','job_seeker','transfer'] as const;
export type ListingTypeKey=typeof LISTING_TYPE_KEYS[number];
export const PRICING_MODE_KEYS=['fixed','bidding','hour','day','week','month','year','trip','project','quote','budget_optional','salary_optional'] as const;
export type PricingModeKey=typeof PRICING_MODE_KEYS[number];
export type ListingTypePolicy={key:ListingTypeKey;label:string;pricing:PricingModeKey[]};
export type ListingPolicy={types:ListingTypePolicy[]};
export type ListingSubmissionInput={listingType:unknown;pricingMode:unknown;price:unknown};
export type NormalizedListingSubmission={listingType:ListingTypeKey;adsType:'offer'|'request';priceType:'sale'|'rent'|'som'|null;rentPeriod:string|null;price:number};

const ALLOWED_PRICING:Record<ListingTypeKey,readonly PricingModeKey[]>={
  sale:['fixed','bidding'],wanted:['budget_optional'],rent:['hour','day','week','month','year','project','quote'],wanted_rent:['budget_optional'],
  service:['fixed','hour','day','week','month','trip','project','quote'],service_request:['budget_optional'],
  job:['salary_optional'],job_seeker:['salary_optional'],transfer:['fixed','bidding','quote'],
};
export const LISTING_TYPE_LABELS:Record<ListingTypeKey,string>={sale:'للبيع',wanted:'مطلوب شراء',rent:'للإيجار',wanted_rent:'مطلوب للإيجار',service:'تقديم خدمة',service_request:'طلب خدمة',job:'وظيفة',job_seeker:'باحث عن عمل',transfer:'للتنازل'};
export const PRICING_LABELS:Record<PricingModeKey,string>={fixed:'سعر محدد',bidding:'على السوم',hour:'بالساعة',day:'باليوم',week:'بالأسبوع',month:'بالشهر',year:'بالسنة',trip:'بالرحلة',project:'للمدة أو المشروع كاملًا',quote:'حسب الاتفاق',budget_optional:'ميزانية اختيارية',salary_optional:'الراتب اختياري'};
const PERIODS:Partial<Record<PricingModeKey,string>>={hour:'بالساعة',day:'يومي',week:'أسبوعي',month:'شهري',year:'سنوي',trip:'بالرحلة',project:'للمشروع'};
const REQUEST_TYPES=new Set<ListingTypeKey>(['wanted','wanted_rent','service_request','job_seeker']);
const OPTIONAL_PRICE=new Set<PricingModeKey>(['bidding','quote','budget_optional','salary_optional']);

export function validateListingPolicy(raw:unknown):ListingPolicy{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new CategoryValidationError('listing_types','سياسة أنواع الإعلان غير صالحة');
  const types=(raw as {types?:unknown}).types;
  if(!Array.isArray(types)||!types.length||types.length>LISTING_TYPE_KEYS.length)throw new CategoryValidationError('listing_types','أضف نوع إعلان واحدًا على الأقل');
  const seen=new Set<string>();
  return {types:types.map((item):ListingTypePolicy=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new CategoryValidationError('listing_types','نوع الإعلان غير صالح');
    const v=item as Record<string,unknown>,key=v.key;
    if(typeof key!=='string'||!LISTING_TYPE_KEYS.includes(key as ListingTypeKey)||seen.has(key))throw new CategoryValidationError('listing_types','نوع إعلان غير صالح أو مكرر');
    seen.add(key);
    if(typeof v.label!=='string'||!v.label.trim()||v.label.length>80)throw new CategoryValidationError('listing_types','اسم نوع الإعلان غير صالح');
    if(!Array.isArray(v.pricing)||!v.pricing.length)throw new CategoryValidationError('listing_types','طريقة التسعير مطلوبة');
    const pricing=[...new Set(v.pricing.map(String))];
    if(pricing.some(mode=>!ALLOWED_PRICING[key as ListingTypeKey].includes(mode as PricingModeKey)))throw new CategoryValidationError('listing_types','طريقة التسعير لا تناسب نوع الإعلان');
    return {key:key as ListingTypeKey,label:v.label.trim(),pricing:pricing as PricingModeKey[]};
  })};
}

export function defaultListingPolicy(kind:string):ListingPolicy{
  const keys:ListingTypeKey[]=kind==='property'?['sale','rent','wanted','wanted_rent']
    :kind==='service'?['service','service_request']
      :kind==='jobs'?['job','job_seeker']
        :kind==='other'?['sale','wanted','service','service_request']
          :['sale','wanted'];
  return {types:keys.map(key=>({key,label:LISTING_TYPE_LABELS[key],pricing:[...ALLOWED_PRICING[key]]}))};
}
export const allowedPricingModes=(key:ListingTypeKey)=>[...ALLOWED_PRICING[key]];

function numericPrice(value:unknown){
  const text=String(value??'').trim();
  if(!text)return 0;
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw new CategoryValidationError('price','السعر غير صالح');
  const price=Number(text);
  if(!Number.isFinite(price)||price<0||price>2147483647)throw new CategoryValidationError('price','السعر غير صالح');
  return price;
}

export function normalizeListingSubmission(rawPolicy:unknown,input:ListingSubmissionInput):NormalizedListingSubmission{
  const policy=validateListingPolicy(rawPolicy),listingType=String(input.listingType||'') as ListingTypeKey;
  const type=policy.types.find(item=>item.key===listingType);
  if(!type)throw new CategoryValidationError('listing_type','نوع الإعلان غير متاح لهذا القسم');
  const pricingMode=String(input.pricingMode||'') as PricingModeKey;
  if(!type.pricing.includes(pricingMode))throw new CategoryValidationError('pricing_mode','طريقة التسعير غير متاحة لهذا النوع');
  let price=numericPrice(input.price);
  if(!OPTIONAL_PRICE.has(pricingMode)&&price<=0)throw new CategoryValidationError('price','أدخل سعرًا أكبر من صفر');
  if(pricingMode==='bidding'||pricingMode==='quote')price=0;
  const adsType=REQUEST_TYPES.has(listingType)?'request':'offer';
  if(adsType==='request')return {listingType,adsType,priceType:null,rentPeriod:null,price};
  if(pricingMode==='bidding')return {listingType,adsType,priceType:'som',rentPeriod:null,price:0};
  if(['hour','day','week','month','year','trip','project'].includes(pricingMode))return {listingType,adsType,priceType:'rent',rentPeriod:PERIODS[pricingMode]??null,price};
  return {listingType,adsType,priceType:pricingMode==='salary_optional'?null:'sale',rentPeriod:null,price};
}

export function inferLegacyListingType(value:{listingType?:string|null;adsType?:string|null;priceType?:string|null}):ListingTypeKey{
  if(value.listingType&&LISTING_TYPE_KEYS.includes(value.listingType as ListingTypeKey))return value.listingType as ListingTypeKey;
  if(value.adsType==='request')return value.priceType==='rent'?'wanted_rent':'wanted';
  return value.priceType==='rent'?'rent':'sale';
}

export const isRequestListingType=(value:ListingTypeKey)=>REQUEST_TYPES.has(value);
export const pricingRequiresAmount=(value:PricingModeKey)=>!OPTIONAL_PRICE.has(value);
export function inferLegacyPricingMode(value:{priceType?:string|null;rentPeriod?:string|null}):PricingModeKey{
  if(value.priceType==='som')return 'bidding';
  if(value.priceType!=='rent')return 'fixed';
  const entry=Object.entries(PERIODS).find(([,label])=>label===value.rentPeriod);
  return (entry?.[0] as PricingModeKey|undefined)??'month';
}
