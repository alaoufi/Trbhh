'use client';
import { useState } from 'react';
import type { CategoryOption } from '@/domain/category-fields';
import { applicableCategoryFields } from '@/domain/category-fields';
type Labels = {category:string;branch:string;details:string};
export function CategoryPicker({options,labels,initialCategory=0,initialBranch=null,values={}}:{options:CategoryOption[];labels:Labels;initialCategory?:number;initialBranch?:number|null;values?:Record<string,string>}) {
  const [id,setId]=useState(initialCategory);
  const [branch,setBranch]=useState(initialBranch||0);
  const cat=options.find(c=>c.id===id);
  const cls='w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900';
  return <section className="space-y-4 rounded-2xl border bg-slate-50 p-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-2"><span className="block font-bold">{labels.category}</span><select required name="category_id" value={id} className={cls} onChange={e=>{setId(Number(e.target.value));setBranch(0);}}><option value="0" disabled>اختر القسم</option>{options.filter(c=>c.active||c.id===initialCategory).map(c=><option key={c.id} value={c.id}>{c.name}{!c.active?' (مغلق للإعلانات الجديدة)':''}</option>)}</select></label>
      <label className="space-y-2"><span className="block font-bold">{labels.branch}</span><select name="subcategory_id" value={branch} onChange={e=>setBranch(Number(e.target.value))} className={cls}><option value="">عام / بدون فرع</option>{cat?.branches.filter(s=>s.active||(id===initialCategory&&s.id===initialBranch)).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    </div>
  {!!cat?.fields.length&&<fieldset key={`${id}-${branch}`} className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 font-bold">{labels.details}</legend>{applicableCategoryFields(cat.fields,branch||null,Object.fromEntries(cat.fields.map(f=>[f.key,values[f.id]||'']))).map(f=><label key={f.id} className="space-y-1"><span className="block text-sm">{f.label}{f.unit?` (${f.unit})`:''}{f.required?' *':''}</span>{f.type==='select'?<select name={`category_field_${f.id}`} defaultValue={id===initialCategory?values[f.id]||'':''} required={f.required&&id!==initialCategory} className={cls}><option value="">اختر</option>{f.options.map(o=><option key={o}>{o}</option>)}</select>:<input name={`category_field_${f.id}`} type={f.type==='number'?'number':'text'} min={f.type==='number'?0:undefined} step={f.type==='number'?'any':undefined} maxLength={500} defaultValue={id===initialCategory?values[f.id]||'':''} required={f.required&&id!==initialCategory} className={cls}/>}</label>)}</fieldset>}
  </section>;
}
