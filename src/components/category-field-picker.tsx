'use client';
import Link from 'next/link';
import { useState } from 'react';
import { categoryEditorPath, type CategoryEditorSection } from '@/lib/ad-categories/admin-navigation';
type Choice = { id: number; name: string };
export function CategoryFieldPicker({ categories, subcategories, section, initialCategory, initialSubcategory }: {
  categories: Choice[]; subcategories: (Choice & { categoryId: number })[];
  section: CategoryEditorSection; initialCategory: number | null; initialSubcategory: number | null;
}) {
  const [category, setCategory] = useState(String(initialCategory ?? subcategories.find(s => s.id === initialSubcategory)?.categoryId ?? ''));
  const [subcategory, setSubcategory] = useState(String(initialSubcategory ?? ''));
  const selected = subcategories.find(s => String(s.id) === subcategory && String(s.categoryId) === category);
  const input = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border bg-white p-2 text-sm';
  return (
    <section aria-label="اختيار القسم لإدارة الحقول" className="min-w-0 space-y-4 rounded-xl border bg-slate-50 p-3">
      <p className="text-sm">اختر القسم الرئيسي ثم الفرعي، ثم افتح حقوله. لا تتغيّر أي بيانات بمجرّد الاختيار.</p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div><label htmlFor="fp-cat">القسم الرئيسي</label>
          <select id="fp-cat" className={input} value={category} onChange={e => { setCategory(e.target.value); setSubcategory(''); }}>
            <option value="">اختر القسم الرئيسي</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div><label htmlFor="fp-sub">القسم الفرعي</label>
          <select id="fp-sub" className={input} value={subcategory} disabled={!category} onChange={e => setSubcategory(e.target.value)}>
            <option value="">اختر القسم الفرعي</option>
            {subcategories.filter(s => String(s.categoryId) === category).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>
      </div>
      {category && !subcategories.some(s => String(s.categoryId) === category) && <p role="status" className="text-sm">لا توجد أقسام فرعية هنا. أضِفها من «إضافة وتعديل الأقسام».</p>}
      {selected
        ? <Link className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 font-bold text-white" href={categoryEditorPath(selected.id, section)}>فتح حقول «{selected.name}»</Link>
        : <p className="text-sm text-muted-foreground">حدّد القسمين ليظهر زر فتح الحقول.</p>}
    </section>
  );
}
