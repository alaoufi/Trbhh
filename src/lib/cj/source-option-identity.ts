import {cjNamedVariantAttributes} from './variant-attributes';
export type CjSourceOptions={key:string;name:string;schema:string[];attributes:Record<string,string>};
type Source={variantKey?:string|null;variantName?:string|null;optionSchema?:string[];attributes?:Record<string,unknown>};
const named=/^(?:color|colour|size|voltage|volt|plug|plugtype|socket|model|capacity|volume|material|fabric|style|pattern|customfinish|اللون|المقاس|颜色|尺码|attributes|properties|options|variantProperties)$/i;
const unsafe=/^(?:__proto__|constructor|prototype)$/i;
const privateField=/(?:price|cost|margin|internal|secret|password|token|profit)|^api(?:key|secret|token|url|endpoint)$/i;
/** Raw supplier option facts only: no translation, title parsing, price or stock. */
export function cjSourceOptions(value:Source):CjSourceOptions|null{
 const key=(value.variantKey??'').trim(),name=(value.variantName??'').trim(),schema=value.optionSchema??[];
 if(key.length>4000||name.length>500||schema.length>30||schema.some(k=>typeof k!=='string'||!k.trim()||k.length>80||unsafe.test(k.trim())))return null;
 if(Object.keys(value.attributes??{}).some(k=>unsafe.test(k.trim())))return null;
 const entries=cjNamedVariantAttributes(Object.fromEntries(Object.entries(value.attributes??{}).filter(([k])=>!privateField.test(k)&&(named.test(k)||schema.includes(k)))));
 const attributes:Record<string,string>=Object.create(null);
 for(const [k,v] of entries){if(unsafe.test(k.trim()))return null;if(privateField.test(k))continue;if(!['string','number','boolean'].includes(typeof v)||!k.trim()||k.length>80||String(v).length>500)return null;const text=String(v).trim();if(!text||Object.hasOwn(attributes,k)&&attributes[k]!==text)return null;attributes[k]=text;}
 if(!key&&!Object.keys(attributes).length)return null;
 return {key,name,schema:schema.map(k=>k.trim()),attributes:Object.fromEntries(Object.entries(attributes).sort(([a],[b])=>a.localeCompare(b)))};
}
export function validCjSourceOptions(value:unknown):value is CjSourceOptions{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as CjSourceOptions;
 return Object.keys(v).sort().join(',')==='attributes,key,name,schema'&&typeof v.key==='string'&&v.key.length<=4000&&typeof v.name==='string'&&v.name.length<=500&&Array.isArray(v.schema)&&v.schema.length<=30&&v.schema.every(k=>typeof k==='string'&&!!k.trim()&&k.length<=80&&!unsafe.test(k.trim()))&&!!v.attributes&&typeof v.attributes==='object'&&!Array.isArray(v.attributes)&&Object.keys(v.attributes).length<=30&&Object.entries(v.attributes).every(([k,x])=>!unsafe.test(k.trim())&&!privateField.test(k)&&!!k.trim()&&k.length<=80&&typeof x==='string'&&!!x.trim()&&x.length<=500)&&!!(v.key||Object.keys(v.attributes).length);
}
export function sameCjSourceOptions(a:CjSourceOptions|null|undefined,b:CjSourceOptions|null|undefined):boolean{
 return validCjSourceOptions(a)&&validCjSourceOptions(b)&&a.key===b.key&&a.name===b.name&&JSON.stringify(a.schema)===JSON.stringify(b.schema)&&JSON.stringify(Object.entries(a.attributes).sort())===JSON.stringify(Object.entries(b.attributes).sort());
}
export function storedCjSourceOptions(value:{optionKey:string;name:string;optionSchema?:string[];attributes?:Record<string,unknown>}):CjSourceOptions|null{return cjSourceOptions({variantKey:value.optionKey,variantName:value.name,optionSchema:value.optionSchema,attributes:value.attributes});}
