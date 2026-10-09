'use client';
import Link from 'next/link';
import { useId } from 'react';

/**
 * فلترة «أقسام البضائع» تُطبَّق فوراً عند الاختيار (بلا زر عرض) عبر إرسال نموذج GET
 * تلقائياً عند تغيير القسم. البحث بالاسم يبقى بالإدخال ثم Enter أو زر «بحث».
 * نموذج GET بسيط بلا router — يُصيَّر على الخادم بلا اعتماد على سياق التنقّل.
 */
export function BrowseFilter({ q, cat, categories }: { q: string; cat: string; categories: { id: string; label: string }[] }) {
  const id = useId();
  return (
    <form method="get" action="/admin/suppliers/cj/browse" className="flex flex-wrap items-end gap-2">
      <label className="text-sm" htmlFor={`${id}-q`}>بحث بالاسم
        <input id={`${id}-q`} name="q" defaultValue={q} className="ms-2 w-56 min-h-9 rounded-lg border border-primary/25 bg-white px-2 py-1 text-sm" placeholder="اكتب اسم المنتج بالعربية أو الإنجليزية" />
      </label>
      <label className="text-sm" htmlFor={`${id}-cat`}>أقسام البضائع
        <select id={`${id}-cat`} name="cat" defaultValue={cat} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="ms-2 w-72 min-h-9 rounded-lg border border-primary/25 bg-white px-2 py-1 text-sm">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white">بحث</button>
      {(q || cat) && <Link href="/admin/suppliers/cj/browse" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">مسح الفلاتر</Link>}
    </form>
  );
}
