'use client';
import Link from 'next/link';
import { useId } from 'react';
import type {CatalogFilterValues} from '@/lib/cj/catalog-filters';

/**
 * فلترة «أقسام البضائع» تُطبَّق فوراً عند الاختيار (بلا زر عرض) عبر إرسال نموذج GET
 * تلقائياً عند تغيير القسم. البحث بالاسم يبقى بالإدخال ثم Enter أو زر «بحث».
 * نموذج GET بسيط بلا router — يُصيَّر على الخادم بلا اعتماد على سياق التنقّل.
 */
export function BrowseFilter({ q, cat, categories,filters={} }: { q: string; cat: string; categories: { id: string; label: string }[];filters?:CatalogFilterValues }) {
  const id = useId();
  const field='ms-2 min-h-9 w-40 rounded-lg border border-primary/25 bg-white px-2 py-1 text-sm';
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
      <label className="text-sm">السعر من ($)<input name="minPrice" type="number" min="0" max="1000000" step="0.01" defaultValue={filters.minPrice} className={field}/></label>
      <label className="text-sm">السعر إلى ($)<input name="maxPrice" type="number" min="0" max="1000000" step="0.01" defaultValue={filters.maxPrice} className={field}/></label>
      <label className="text-sm">ترتيب النتائج<select name="sort" defaultValue={filters.sort||'best'} className={field}><option value="best">الأكثر مطابقة</option><option value="price_asc">السعر: الأقل أولًا</option><option value="price_desc">السعر: الأعلى أولًا</option><option value="newest">الأحدث</option><option value="popular">الأكثر إدراجًا بالمتاجر</option><option value="stock">الأكثر مخزونًا</option></select></label>
      <details className="w-full rounded-xl border p-3" open={!!(filters.country||filters.platform||filters.supplier||filters.minStock||filters.verified||filters.flag)}><summary className="cursor-pointer text-sm font-bold">فلاتر إضافية لانتقاء المنتجات</summary><div className="mt-3 flex flex-wrap gap-3">
        <label className="text-sm">منصة البيع المقترحة<select name="platform" defaultValue={filters.platform||''} className={field}><option value="">جميع المنصات</option><option value="tiktok">TikTok</option><option value="amazon">Amazon</option><option value="ebay">eBay</option><option value="etsy">Etsy</option><option value="shopify">Shopify</option></select></label>
        <label className="text-sm">معرف المورد لدى CJ<input name="supplier" maxLength={200} defaultValue={filters.supplier} className={field} dir="ltr"/></label>
        <label className="text-sm">بلد المستودع<input name="country" maxLength={2} defaultValue={filters.country} placeholder="مثل CN أو US" className={field} dir="ltr"/></label>
        <label className="text-sm">المخزون من<input name="minStock" type="number" min="0" max="999999999" step="1" defaultValue={filters.minStock} className={field}/></label>
        <label className="text-sm">نوع المخزون<select name="verified" defaultValue={filters.verified||''} className={field}><option value="">جميع المخزونات</option><option value="1">مخزون متحقق منه</option></select></label>
        <label className="text-sm">انتقاء المنتجات<select name="flag" defaultValue={filters.flag||''} className={field}><option value="">جميع المنتجات</option><option value="0">رائجة</option><option value="1">جديدة</option><option value="2">لها فيديو</option></select></label>
      </div><p className="mt-3 text-xs text-muted-foreground">المنصة اقتراح للبيع وليست مصدر التوريد. فلتر المورد يحتاج معرفه الحقيقي لدى CJ؛ لا يوجد هنا تصنيف موثق لموردي AliExpress.</p></details>
      <p className="w-full text-xs text-muted-foreground">السعر بالدولار للمنتج لدى CJ دون الشحن والضرائب. المخزون وبلد المستودع لا يثبتان إمكانية التوصيل للسعودية؛ يُتحقق من الشحن عند اختيار المنتج.</p>
      <button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white">تطبيق الفلاتر</button>
      {(q || cat || Object.keys(filters).length>0) && <Link href="/admin/suppliers/cj/browse" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">مسح الفلاتر</Link>}
    </form>
  );
}
