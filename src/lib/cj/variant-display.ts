import type {CjVariant} from './types';
import {cjNamedVariantAttributes} from './variant-attributes';

export type DisplayOption={label:string;value:string;source:'attribute'|'parsed'};
const SIZE=/^(?:xxs|xs|s|m|l|xl|xxl|xxxl|\d{1,3}(?:xs|xl)|(?:(?:US|EU|UK)\s*)?\d{1,2}(?:\.\d+)?|\d+(?:\.\d+)?(?:cm|mm|inch|in))$/i;
const LABELS:[RegExp,string][]=[[/color|colour/i,'اللون'],[/size/i,'المقاس'],[/voltage|volt/i,'الفولت'],[/plug|socket/i,'القابس'],[/model/i,'الموديل'],[/capacity|volume/i,'السعة'],[/material|fabric/i,'الخامة'],[/warehouse|area/i,'المستودع']];
const VALUES=new Map(Object.entries({black:'أسود',white:'أبيض',red:'أحمر',blue:'أزرق',green:'أخضر',yellow:'أصفر',pink:'وردي',purple:'بنفسجي',orange:'برتقالي',brown:'بني',grey:'رمادي',gray:'رمادي',silver:'فضي',gold:'ذهبي',beige:'بيج',navy:'كحلي','navy blue':'كحلي','dark blue':'أزرق داكن','light blue':'أزرق فاتح',eu:'أوروبي',european:'أوروبي',us:'أمريكي',uk:'بريطاني',china:'صيني'}));
const COLOR_KEYS=['navy blue','dark blue','light blue','black','white','red','blue','green','yellow','pink','purple','orange','brown','grey','gray','silver','gold','beige','navy'];
const SIZE_SUFFIX='(?:xxxs|xxs|xxl|xxxl|xs|xl|s|m|l|\\d{1,3}(?:xs|xl)|(?:(?:US|EU|UK)\\s*)?\\d{1,2}(?:\\.\\d+)?|\\d+(?:\\.\\d+)?(?:cm|mm|inch|in))';
function labelFor(key:string):string{return LABELS.find(([pattern])=>pattern.test(key))?.[1]??key.trim().replace(/[_-]+/g,' ');}
function safeText(value:unknown):string|null{if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean')return null;const text=String(value).trim();return text&&text.length<=160?text:null;}
function translateKnownValue(value:string):string{return VALUES.get(value.trim().toLowerCase())??value;}
function normalizedValue(label:string,value:string):string{
 if(label!=='المقاس')return value;
 return value.trim().replace(/^(us|eu|uk)\s*/i,(_,system:string)=>system.toUpperCase()+' ').replace(/^(?:xxxs|xxs|xs|s|m|l|xl|xxl|xxxl)$/i,v=>v.toUpperCase());
}

/** Uses only values actually present in CJ attributes/variant key; raw source is not mutated. */
function parseCjVariantDisplayOptions(variant:Pick<CjVariant,'variantKey'|'variantName'|'attributes'>,productName=''):DisplayOption[]{
  const options:DisplayOption[]=[];
  const attrs=variant.attributes??{};
  for(const [key,value] of cjNamedVariantAttributes(attrs)){
    // استبعاد الحقول التقنية الخام القادمة من CJ (باركود/أبعاد/أسعار/وقت/معايير) فلا تظهر
    // كخيارات للمشتري؛ نُبقي الخيارات الحقيقية (لون/مقاس/فولت/قابس/سعة/موديل/خامة/مخصّص).
    const clean=safeText(value);
    if(!clean
      ||/^(?:vid|pid|sku|id|price|weight|barcode|createtime|updatetime|addtime|stock|inventory|quantity|currency|status|isDefault|sellPrice|createUserId|productId)$/i.test(key)
      ||/^variant(?:id|sku|name|image|price|weight|key|property|unit|length|width|height|standard|sellprice|sugsellprice|volume)/i.test(key))continue;
    const label=labelFor(key),translated=translateKnownValue(clean);
    if(!options.some(o=>o.label===label&&o.value===translated))options.push({label,value:translated,source:'attribute'});
  }
  if(options.length){
    const parsed=parseCjVariantDisplayOptions({...variant,attributes:{}},productName);
    if(parsed.some(o=>options.some(existing=>existing.label===o.label&&normalizedValue(o.label,existing.value)!==normalizedValue(o.label,o.value))))return [{label:'الخيار',value:'بيانات متعارضة لدى المورد',source:'parsed'}];
    return [...options,...parsed.filter(o=>o.label!=='الخيار'&&!options.some(existing=>existing.label===o.label))];
  }
  let source=(variant.variantKey||variant.variantName||'').trim();
  if(productName&&source.toLowerCase().startsWith(productName.trim().toLowerCase()+' '))source=source.slice(productName.trim().length).trim();
  if(!source)return [];
  // Pack count is a purchase attribute, never a clothing size. Match the entire
  // source option so unrelated numbers in the product title cannot become counts.
  const mixed=/^(\d+)\s+(black|white)\s+and\s+(\d+)\s+(black|white)$/i.exec(source);
  if(mixed)return [{label:'التشكيلة',value:`${mixed[1]} ${translateKnownValue(mixed[2])} + ${mixed[3]} ${translateKnownValue(mixed[4])}`,source:'parsed'}];
  const group=/^set\s*(\d+)$/i.exec(source);
  if(group)return [{label:'المجموعة',value:group[1],source:'parsed'}];
  const pack=/^(?:(black|white|red|blue|green|pink|grey|gray)\s*)?(\d+)\s*(?:packs?|pcs?|pieces?)(?:\s*(black|white|red|blue|green|pink|grey|gray))?$/i.exec(source);
  if(pack){
    if(pack[1]&&pack[3]&&pack[1].toLowerCase()!==pack[3].toLowerCase())return [{label:'الخيار',value:source,source:'parsed'}];
    const color=pack[1]||pack[3];
    return [...(color?[{label:'اللون',value:translateKnownValue(color),source:'parsed' as const}]:[]),{label:'عدد القطع في العبوة',value:pack[2],source:'parsed'}];
  }
  const labeled=source.split(/\s*[,;|]\s*/).flatMap(part=>{
    const match=part.match(/^([^:=]+)\s*[:=]\s*(.+)$/);return match?[{label:labelFor(match[1]),value:translateKnownValue(match[2].trim()),source:'parsed' as const}]:[];
  });
  if(labeled.length)return labeled.filter(item=>item.label&&item.value);
  const parts=source.split(/\s*[-–—]\s*/).filter(Boolean);
  if(parts.length===2){
    const sizeIndex=SIZE.test(parts[0])?0:SIZE.test(parts[1])?1:-1;
    if(sizeIndex>=0&&(COLOR_KEYS.includes(parts[1-sizeIndex].toLowerCase())||[...VALUES.values()].includes(parts[1-sizeIndex])))return [{label:'اللون',value:translateKnownValue(parts[1-sizeIndex]),source:'parsed'},{label:'المقاس',value:parts[sizeIndex],source:'parsed'}];
  }
  // CJ sometimes repeats the complete product title in every variant, with the
  // actual option values appended (for example "... Coat For Men Red S").
  // Parse only a known color/size suffix; never show that full source title as
  // a customer-facing option when we cannot safely interpret it.
  const colorPattern=COLOR_KEYS.join('|');
  const suffix=new RegExp(`(?:^|[\\s_-])(${colorPattern})(?:[\\s_-]+(${SIZE_SUFFIX}))?$`,'i').exec(source);
  if(suffix){
    const color=suffix[1];
    return [{label:'اللون',value:translateKnownValue(color),source:'parsed'},...(suffix[2]?[{label:'المقاس',value:suffix[2].toUpperCase(),source:'parsed' as const}]:[])];
  }
  // مقاس بصيغة أبعاد (مثل 70x100cm / 50×50 / 100 x 200 cm) في نهاية الاسم — يُستخرج
  // كمقاس، مع لون معروف إن وُجد. يعالج المتغيّرات التي يكرّر فيها المورد كامل الاسم.
  const dimension=/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(cm|mm|m|inch|in)?\s*$/i.exec(source);
  if(dimension){
    const unit=(dimension[3]||'').toLowerCase();
    const size=`${dimension[1]}×${dimension[2]}${unit}`;
    const colorHit=new RegExp(`(?:^|[\\s_-])(${colorPattern})(?:[\\s_-]|$)`,'i').exec(source);
    return [...(colorHit?[{label:'اللون',value:translateKnownValue(colorHit[1]),source:'parsed' as const}]:[]),{label:'المقاس',value:size,source:'parsed'}];
  }
  // لا نعرض مصدراً طويلاً أو خالياً من حرف لاتيني/عربي أو رقم (رموز/محارف غير قابلة للعرض
  // تظهر مربعات فارغة ⬚) كخيار — يتحوّل حينها إلى «الخيار N» في المستدعي.
  if(source.length>60||!/[A-Za-z0-9؀-ۿ]/.test(source))return [];
  return [{label:'الخيار',value:source,source:'parsed'}];
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

/** Prefer meaningful source properties over technical keys; retain exact VID/SKU elsewhere. */
export function cjVariantDisplayOptions(variant:Pick<CjVariant,'variantKey'|'variantName'|'attributes'>,productName=''):DisplayOption[]{
 const attrs=variant.attributes??{};
 const candidates=[variant.variantKey,attrs.variantKeyEn,attrs.variantProperty,variant.variantName,attrs.variantNameEn,attrs.nameEn];
 let fallback:DisplayOption[]=[],best:DisplayOption[]=[];
 const evidence=new Map<string,string>();
 for(const candidate of candidates){
  const source=safeText(candidate);if(!source)continue;
  const parsed=parseCjVariantDisplayOptions({...variant,variantKey:source,variantName:source},productName).map(o=>({...o,value:normalizedValue(o.label,o.value)}));
  if(parsed.some(o=>o.value==='بيانات متعارضة لدى المورد'))return [];
  for(const option of parsed.filter(o=>o.label!=='الخيار')){
   if(evidence.has(option.label)&&evidence.get(option.label)!==option.value)return [];
   evidence.set(option.label,option.value);
  }
  if(parsed.some(o=>o.label!=='الخيار')&&parsed.length>best.length)best=parsed;
  if(!fallback.length)fallback=parsed;
 }
 return (best.length?best:fallback.length?fallback:parseCjVariantDisplayOptions(variant,productName)).map(o=>({...o,value:normalizedValue(o.label,o.value)}));
}
