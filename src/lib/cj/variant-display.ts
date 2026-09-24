import type {CjVariant} from './types';

export type DisplayOption={label:string;value:string;source:'attribute'|'parsed'};
const SIZE=/^(?:xxs|xs|s|m|l|xl|xxl|xxxl|\d{1,3}(?:xs|xl)|\d+(?:\.\d+)?(?:cm|mm|inch|in))$/i;
const LABELS:[RegExp,string][]=[[/color|colour/i,'اللون'],[/size/i,'المقاس'],[/voltage|volt/i,'الفولت'],[/plug|socket/i,'القابس'],[/model/i,'الموديل'],[/capacity|volume/i,'السعة'],[/material|fabric/i,'الخامة'],[/warehouse|area/i,'المستودع']];
const VALUES=new Map(Object.entries({black:'أسود',white:'أبيض',red:'أحمر',blue:'أزرق',green:'أخضر',yellow:'أصفر',pink:'وردي',purple:'بنفسجي',orange:'برتقالي',brown:'بني',grey:'رمادي',gray:'رمادي',silver:'فضي',gold:'ذهبي',beige:'بيج',navy:'كحلي',eu:'أوروبي',european:'أوروبي',us:'أمريكي',uk:'بريطاني',china:'صيني'}));
function labelFor(key:string):string{return LABELS.find(([pattern])=>pattern.test(key))?.[1]??key.trim().replace(/[_-]+/g,' ');}
function safeText(value:unknown):string|null{if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean')return null;const text=String(value).trim();return text&&text.length<=160?text:null;}
function translateKnownValue(value:string):string{return VALUES.get(value.trim().toLowerCase())??value;}

/** Uses only values actually present in CJ attributes/variant key; raw source is not mutated. */
export function cjVariantDisplayOptions(variant:Pick<CjVariant,'variantKey'|'variantName'|'attributes'>):DisplayOption[]{
  const options:DisplayOption[]=[];
  const attrs=variant.attributes??{};
  for(const [key,value] of Object.entries(attrs)){
    const clean=safeText(value);if(!clean||/^(?:vid|pid|sku|id|price|weight)$/i.test(key)||/^variant(?:id|sku|name|image|price|weight|key)/i.test(key))continue;
    options.push({label:labelFor(key),value:translateKnownValue(clean),source:'attribute'});
  }
  if(options.length)return options;
  const source=(variant.variantKey||variant.variantName||'').trim();
  if(!source)return [];
  const labeled=source.split(/\s*[,;|]\s*/).flatMap(part=>{
    const match=part.match(/^([^:=]+)\s*[:=]\s*(.+)$/);return match?[{label:labelFor(match[1]),value:translateKnownValue(match[2].trim()),source:'parsed' as const}]:[];
  });
  if(labeled.length)return labeled.filter(item=>item.label&&item.value);
  const parts=source.split(/\s*[-–—]\s*/).filter(Boolean);
  if(parts.length===2){
    const sizeIndex=SIZE.test(parts[0])?0:SIZE.test(parts[1])?1:-1;
    if(sizeIndex>=0)return [{label:'اللون',value:translateKnownValue(parts[1-sizeIndex]),source:'parsed'},{label:'المقاس',value:parts[sizeIndex],source:'parsed'}];
  }
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
