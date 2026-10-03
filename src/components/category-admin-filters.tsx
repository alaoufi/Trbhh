'use client';
import Link from 'next/link';
import {useState} from 'react';
import type {CategoryOption,SubcategoryOption} from '@/lib/ad-categories/contracts';
type Sub=Pick<SubcategoryOption,'id'|'name'|'categoryId'>;
export function CategoryAdminFilters({view,categories,subcategories,initialCategory,initialSubcategory,review}:{view:'ads'|'fields';categories:CategoryOption[];subcategories:Sub[];initialCategory:number|null;initialSubcategory:number|null;review:boolean}){
  const [category,setCategory]=useState(String(initialCategory??''));
  const [subcategory,setSubcategory]=useState(String(initialSubcategory??''));
  const input='min-h-11 w-full min-w-0 rounded-lg border bg-white p-2 text-sm';
  return <form method="get" className="grid min-w-0 gap-3 rounded-xl border p-3 sm:grid-cols-2">
    <div><label htmlFor="category-filter-main">القسم الرئيسي</label><select id="category-filter-main" name="category" className={input} value={category} onChange={e=>{setCategory(e.target.value);setSubcategory('');}}><option value="">جميع الأقسام</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    {view==='ads'&&<><div><label htmlFor="category-filter-sub">القسم الفرعي</label><select id="category-filter-sub" name="subcategory" className={input} value={subcategory} onChange={e=>setSubcategory(e.target.value)}><option value="">جميع الأقسام الفرعية</option>{subcategories.filter(s=>!category||s.categoryId===Number(category)).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div><label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="review" value="1" defaultChecked={review}/> غير مصنفة أو بانتظار المراجعة فقط</label></>}
    <button className="min-h-11 rounded-lg bg-primary px-3 py-2 text-white">عرض النتائج</button><Link className="inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2" href={`/admin/categories/${view}`}>مسح التصفية</Link>
  </form>;
}
