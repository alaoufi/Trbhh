import type {DisplayOption} from './variant-display';
type Entry={vid:string;opts:DisplayOption[]};
type Selector={groups:{label:string;values:string[]}[];groupLabels:string[];combo:Map<string,string>};
export function groupCjVariantFamilies(per:Entry[]){
 const groups=new Map<string,Entry[]>();
 for(const entry of per){const key=JSON.stringify([...new Set(entry.opts.map(o=>o.label))].sort());groups.set(key,[...(groups.get(key)??[]),entry]);}
 return [...groups].map(([key,entries])=>{
  const labels=entries[0].opts.map(o=>o.label);
  const title=labels.length===1?(labels[0]==='المجموعة'?'مجموعات المورد — محتوياتها غير موضحة نصيًا':labels[0]==='التشكيلة'?'عبوة مختلطة الألوان':labels[0]==='عدد القطع في العبوة'?'عبوة حسب عدد القطع — اللون غير محدد':labels[0]==='اللون'?'خيار لون — عدد القطع غير محدد':labels[0]):labels.join(' و');
  return {key,entries,title:title||'خيارات المورد'};
 });
}
/** Only equal attribute schemas can be combined; missing fields are never invented. */
export function buildCjVariantSelector(per:Entry[]):Selector|null{
 if(!per.length||per.some(p=>!p.vid||!p.opts.length||p.opts.some(o=>o.label==='الخيار'||!o.value)))return null;
 const labels=per[0].opts.map(o=>o.label);
 if(labels.length>4||new Set(labels).size!==labels.length)return null;
 const combo=new Map<string,string>();
 for(const p of per){
  if(p.opts.length!==labels.length||new Set(p.opts.map(o=>o.label)).size!==labels.length||!labels.every(l=>p.opts.some(o=>o.label===l)))return null;
  const key=JSON.stringify(labels.map(l=>p.opts.find(o=>o.label===l)!.value));
  if(combo.has(key))return null;
  combo.set(key,p.vid);
 }
 return {groupLabels:labels,combo,groups:labels.map(label=>({label,values:[...new Set(per.map(p=>p.opts.find(o=>o.label===label)!.value))]}))};
}
export function cjVariantValues(selector:Selector,label:string,chosen:Record<string,string>):string[]{
 const index=selector.groupLabels.indexOf(label);if(index<0)return [];
 const values=new Set<string>();
 for(const key of selector.combo.keys()){const row=JSON.parse(key) as string[];if(selector.groupLabels.slice(0,index).every((l,i)=>!chosen[l]||chosen[l]===row[i]))values.add(row[index]);}
 return [...values];
}
export function resolveCjVariantSelection(selector:Selector,chosen:Record<string,string>):string{
 if(!selector.groupLabels.every(l=>chosen[l]))return '';
 return selector.combo.get(JSON.stringify(selector.groupLabels.map(l=>chosen[l])))??'';
}
