/** Bounded JSON-only supplier properties; never retain arbitrary nested payloads. */
export function preserveCjVariantAttributes(raw:Record<string,unknown>):Record<string,unknown>{
 const result:Record<string,unknown>={};
 for(const [key,value] of Object.entries(raw).slice(0,100)){
  if(['string','number','boolean'].includes(typeof value)){if(typeof value!=='string'||value.length<=4000)result[key]=value;continue;}
  if(!/^(?:attributes|properties|options|variantProperties)$/i.test(key)||!value||typeof value!=='object')continue;
  if(Array.isArray(value))result[key]=value.slice(0,32).filter(v=>v&&typeof v==='object'&&!Array.isArray(v)).map(v=>Object.fromEntries(Object.entries(v).filter(([k,x])=>k.length<=80&&['string','number','boolean'].includes(typeof x)&&String(x).length<=500).slice(0,12)));
  else result[key]=Object.fromEntries(Object.entries(value).filter(([k,x])=>k.length<=80&&['string','number','boolean'].includes(typeof x)&&String(x).length<=500).slice(0,32));
 }
 return result;
}

export function cjNamedVariantAttributes(attrs:Record<string,unknown>):[string,unknown][]{
 const entries:[string,unknown][]=[];
 for(const [key,value] of Object.entries(attrs)){
  if(!/^(?:attributes|properties|options|variantProperties)$/i.test(key)){entries.push([key,value]);continue;}
  let data=value;
  if(typeof data==='string'&&data.length<=8000){try{data=JSON.parse(data);}catch{continue;}}
  if(Array.isArray(data))for(const item of data.slice(0,32)){
   if(!item||typeof item!=='object')continue;
   const name=item.name??item.label??item.propertyName??item.key;
   const option=item.value??item.propertyValue??item.optionValue;
   if(typeof name==='string'&&name.length<=80)entries.push([name,option]);
  }
  else if(data&&typeof data==='object')entries.push(...Object.entries(data).slice(0,32));
 }
 return entries;
}
