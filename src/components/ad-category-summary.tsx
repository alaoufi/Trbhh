import type {CategoryValue} from '@/lib/ad-categories/validation';
export function AdCategorySummary({fields}:{fields:{key:string;label:string;group:string;unit?:string;value:CategoryValue}[]}) {
  if(!fields.length) return null;
  return <div className="space-y-3">{[...new Set(fields.map(f=>f.group))].map(group=><div key={group} className="rounded-xl border border-primary/20 p-3">
    {group&&<h3 className="mb-2 text-sm font-bold text-primary">{group}</h3>}
    <dl className="grid grid-cols-2 gap-3">{fields.filter(f=>f.group===group).map(f=><div key={f.key}><dt className="text-xs text-muted-foreground">{f.label}</dt><dd className="break-words text-sm">{Array.isArray(f.value)?f.value.join('، '):typeof f.value==='boolean'?(f.value?'نعم':'لا'):String(f.value)}{f.unit?` ${f.unit}`:''}</dd></div>)}</dl>
  </div>)}</div>;
}
