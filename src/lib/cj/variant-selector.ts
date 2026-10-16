import type {DisplayOption} from './variant-display';
const UNSPECIFIED='غير مذكور في هذا الخيار';
type Entry={vid:string;opts:DisplayOption[]};
type Selector={groups:{label:string;values:string[]}[];groupLabels:string[];combo:Map<string,string>};
/** Ambiguous translated combinations must use the full SKU list. */
export function buildCjVariantSelector(per:Entry[]):Selector|null{
 if(per.length<2||per.some(p=>!p.vid||!p.opts.length||p.opts.some(o=>o.label==='الخيار'||!o.value||o.value===UNSPECIFIED)))return null;
 const labels=[...new Set(per.flatMap(p=>p.opts.map(o=>o.label)))];
 if(labels.length>4)return null;
 const combo=new Map<string,string>();
 for(const p of per){
  if(new Set(p.opts.map(o=>o.label)).size!==p.opts.length)return null;
  const key=JSON.stringify(labels.map(l=>p.opts.find(o=>o.label===l)?.value??UNSPECIFIED));
  if(combo.has(key))return null;
  combo.set(key,p.vid);
 }
 return {groupLabels:labels,combo,groups:labels.map(label=>({label,values:[...new Set(per.map(p=>p.opts.find(o=>o.label===label)?.value??UNSPECIFIED))]}))};
}
export function resolveCjVariantSelection(selector:Selector,chosen:Record<string,string>):string{
 if(!selector.groupLabels.every(l=>chosen[l]))return '';
 return selector.combo.get(JSON.stringify(selector.groupLabels.map(l=>chosen[l])))??'';
}
