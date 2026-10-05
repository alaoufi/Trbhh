import type {CategoryValue} from '@/lib/ad-categories/validation';
import {formatAdSpecification} from '@/lib/ad-presentation';
export function AdCategorySummary({fields}:{fields:{key:string;label:string;group:string;unit?:string;value:CategoryValue}[]}) {
  const visible=fields.map(field=>({...field,text:formatAdSpecification(field.value)})).filter(field=>field.text!=='');
  if(!visible.length) return null;
  return <div className="mb-4 space-y-3">{[...new Set(visible.map(f=>f.group))].map(group=><div key={group} className="overflow-hidden rounded-xl border border-primary/15 bg-card">
    {group&&<h3 className="border-b border-primary/10 border-s-4 border-s-amber-400 bg-primary/5 px-3 py-2 text-sm font-bold text-primary">{group}</h3>}
    <dl className="grid grid-cols-1 gap-px bg-primary/10 sm:grid-cols-2">{visible.filter(f=>f.group===group).map(f=><div key={f.key} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 bg-card px-3 py-2.5"><dt className="min-w-0 break-words text-xs text-muted-foreground">{f.label}</dt><dd className="min-w-0 break-words text-sm font-semibold text-primary"><bdi>{f.text}</bdi>{f.unit?` ${f.unit}`:''}</dd></div>)}</dl>
  </div>)}</div>;
}
