import 'server-only';
import type {CjDetails} from './mapping';
import type {CjResult,CjVariant} from './types';
import {cjVariantDisplayOptions} from './variant-display';
import {groupCjVariantFamilies,buildCjVariantSelector} from './variant-selector';

type Row=CjDetails['variants'][number];
const missing=(v:Row,title:string)=>{const opts=cjVariantDisplayOptions({variantName:v.name,variantKey:v.optionKey,attributes:v.attributes,optionSchema:v.optionSchema},title);return !opts.length||opts.some(o=>o.label==='الخيار');};
/** Display metadata only. Prices, inventory and order identity always remain local/verified. */
export function createCjOptionMetadataReader(fetchVariants:(pid:string)=>Promise<CjResult<CjVariant[]>>,now=Date.now){
 const cache=new Map<string,{until:number;pending:Promise<CjVariant[]>}>();
 return async(account:string,pid:string,rows:Row[],title=''):Promise<Row[]>=>{
  const families=groupCjVariantFamilies(rows.map(v=>({vid:v.vid,opts:cjVariantDisplayOptions({variantName:v.name,variantKey:v.optionKey,attributes:v.attributes,optionSchema:v.optionSchema},title)})));
  const unresolved=new Set(families.filter(f=>!buildCjVariantSelector(f.entries)).flatMap(f=>f.entries.map(v=>v.vid)));
  if(!unresolved.size)return rows;
  const key=JSON.stringify([account,pid]);let entry=cache.get(key);
  if(!entry||entry.until<=now()){
   if(cache.size>=100)cache.delete(cache.keys().next().value!);
   const pending=fetchVariants(pid).then(r=>r.ok?r.data:[]).catch(()=>[]);
   entry={until:now()+5*60*1000,pending};cache.set(key,entry);
  }
  const live=await entry.pending;
  const ids=live.map(v=>v.vid);
  if(new Set(ids).size!==ids.length||new Set(rows.map(v=>v.vid)).size!==rows.length)return rows;
  const byId=new Map(live.map(v=>[v.vid,v]));
  return rows.map(row=>{
   if(!unresolved.has(row.vid))return row;
   const source=byId.get(row.vid);
   if(!source||!row.sku||source.variantSku!==row.sku)return row;
   const enriched={...row,name:source.variantName||row.name,optionKey:source.variantKey||row.optionKey,optionSchema:source.optionSchema??row.optionSchema,attributes:source.attributes??row.attributes};
   return missing(enriched,title)?row:enriched;
  });
 };
}
