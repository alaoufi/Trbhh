import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { categoriesOn, categoryOptions, categoryLabels } from '@/lib/categories-v2';
import { applicableCategoryFields } from '@/domain/category-fields';
export async function AdCategoryDetails({adId}:{adId:number}) {
  if(!(await categoriesOn())) return null;
  const [ad,options,values,labels]=await Promise.all([prisma.ads.findUnique({where:{id:BigInt(adId)},select:{category_id:true,subcategory_id:true}}),categoryOptions(),prisma.ad_category_field_values.findMany({where:{ad_id:BigInt(adId)}}),categoryLabels()]);
  const cat=options.find(c=>c.id===Number(ad?.category_id));
  if(!cat)return null;
  const branch=cat.branches.find(s=>s.id===ad?.subcategory_id);
  const valueById = Object.fromEntries(values.map(v=>[String(v.field_id),v.value_text||'']));
  const visible = applicableCategoryFields(cat.fields, branch?.id||null, Object.fromEntries(cat.fields.map(f=>[f.key,valueById[String(f.id)]||'']))).filter(f=>valueById[String(f.id)]);
  return <section className="rounded-2xl border bg-slate-50 p-5"><Link href={`/categories/${cat.id}`} className="font-bold text-primary">{cat.name}{branch?` / ${branch.name}`:''}</Link>{visible.length>0&&<><h2 className="my-3 font-bold">{labels.details}</h2><dl className="grid gap-3 sm:grid-cols-2">{visible.map(f=><div key={f.id} className="rounded-xl bg-white p-3"><dt className="text-xs text-slate-500">{f.label}{f.unit?` (${f.unit})`:''}</dt><dd className="mt-1 font-semibold">{valueById[String(f.id)]}</dd></div>)}</dl></>}</section>;
}
