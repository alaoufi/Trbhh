import type {CjVariant} from './types';
import {cjNamedVariantAttributes} from './variant-attributes';
export type DisplayOption={label:string;value:string;source:'attribute'|'parsed'};
const LABELS:Record<string,string>={color:'اللون',colour:'اللون',size:'المقاس',voltage:'الفولت',volt:'الفولت',plug:'القابس',plugtype:'القابس',socket:'القابس',model:'الموديل',capacity:'السعة',volume:'الحجم',material:'الخامة',fabric:'الخامة',warehouse:'المستودع',style:'النمط',pattern:'النقشة',length:'الطول',width:'العرض',height:'الارتفاع',count:'العدد',quantity:'الكمية',pack:'العبوة',customfinish:'التشطيب',اللون:'اللون',المقاس:'المقاس',颜色:'اللون',尺码:'المقاس'};
const VALUES=new Map(Object.entries({black:'أسود',white:'أبيض',red:'أحمر',blue:'أزرق',green:'أخضر',yellow:'أصفر',pink:'وردي',purple:'بنفسجي',orange:'برتقالي',brown:'بني',grey:'رمادي',gray:'رمادي',silver:'فضي',gold:'ذهبي',beige:'بيج',navy:'كحلي','navy blue':'كحلي','dark blue':'أزرق داكن','light blue':'أزرق فاتح',eu:'أوروبي',european:'أوروبي',us:'أمريكي',uk:'بريطاني',china:'صيني'}));
const text=(v:unknown)=>typeof v==='string'||typeof v==='number'||typeof v==='boolean'?String(v).trim():'';
const label=(key:string)=>{const normalized=key.trim().toLowerCase().replace(/[ _-]/g,'');return Object.hasOwn(LABELS,normalized)?LABELS[normalized]:key.trim();};
/** Only explicit named API properties, or productKeyEn schema + variantKey values. No title/SKU/image inference. */
export function cjVariantDisplayOptions(variant:Pick<CjVariant,'variantKey'|'variantName'|'attributes'|'optionSchema'>,_productName=''):DisplayOption[]{
 const attrs=variant.attributes??{},named=cjNamedVariantAttributes(Object.fromEntries(Object.entries(attrs).filter(([key])=>(Object.hasOwn(LABELS,key.toLowerCase().replace(/[ _-]/g,''))&&!/^(quantity|count|volume|warehouse|length|width|height|pack)$/i.test(key))||/^(attributes|properties|options|variantProperties)$/i.test(key))));
 const raw:{label:string;value:string;source:'attribute'|'parsed'}[]=named.map(([key,v])=>({label:label(key),value:text(v),source:'attribute' as const})).filter(o=>o.label&&o.label.length<=80&&o.value&&o.value.length<=160);
 const schema=variant.optionSchema;
 if(schema?.length){
  if(new Set(schema.map(key=>typeof key==='string'?label(key):'')).size!==schema.length)return [];
  if(schema.length>30||schema.some(k=>typeof k!=='string'||!k.trim()||k.length>80))return [];
  const key=text(variant.variantKey)||text(attrs.variantKeyEn)||text(attrs.variantKey);
  if(!key){if(!schema.every(key=>raw.some(o=>o.label===label(key))))return [];}
  else {
  if(key.length>4000)return [];
  const values=schema.length===1?[key]:key.split('-').map(v=>v.trim());
  if(values.length!==schema.length||values.some(v=>!v||v.length>160))return [];
  raw.push(...schema.map((key,i)=>({label:label(key),value:values[i],source:'parsed' as const})));
  }
 }
 const result:DisplayOption[]=[];
 for(const option of raw){
  const translated=VALUES.get(option.value.toLowerCase())??option.value;
  const prior=result.find(o=>o.label===option.label);
  if(prior&&prior.value!==translated)return [];
  if(!prior)result.push({...option,value:translated});
 }
 return result;
}
/** Display-only cleanup. The caller must retain the imported source separately. */
export function cleanCjDisplayDescription(raw:string):string{
  const lines=raw.replace(/\r\n?/g,'\n').split('\n').map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
  const seen=new Set<string>(),out:string[]=[];
  for(const line of lines){
    const normalized=line.replace(/[:：\s]+$/,'').replace(/^معلومات المنتج\s*/i,'معلومات المنتج').toLocaleLowerCase();
    if(/^معلومات المنتج$/.test(normalized)&&seen.has('heading:product-info'))continue;
    if(/^معلومات المنتج$/.test(normalized))seen.add('heading:product-info');
    if(out.length&&line===out[out.length-1])continue;
    out.push(line);
  }
  return out.join('\n\n').slice(0,20000);
}
