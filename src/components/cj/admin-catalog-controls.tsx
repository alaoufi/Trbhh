import Link from 'next/link';

export function CjAdminCatalogControls({ path, catalog, categories }: { path: string; catalog: { page: number; pageCount: number; cat: number }; categories: { id: number; name: string }[] }) {
  const href = (page: number) => `${path}?page=${page}${catalog.cat ? `&cat=${catalog.cat}` : ''}`;
  return <div className="flex flex-wrap items-center justify-between gap-3">
    <form method="get" action={path} className="flex flex-wrap items-center gap-2">
      <label htmlFor="cj-admin-category" className="text-sm font-bold">القسم:</label>
      <select id="cj-admin-category" name="cat" defaultValue={catalog.cat || ''} className="min-h-11 rounded-xl border border-primary/25 bg-white px-3 text-sm">
        <option value="">كل الأقسام</option>
        {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
      <button type="submit" className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-white">تصفية</button>
      {catalog.cat ? <Link href={path} className="px-3 text-sm font-bold text-primary">إلغاء التصفية</Link> : null}
    </form>
    <nav aria-label="صفحات سلع المورد" className="flex items-center gap-3 text-sm">
      {catalog.page > 1 ? <Link href={href(catalog.page - 1)} className="rounded-xl border px-3 py-3 font-bold text-primary">السابق</Link> : null}
      <span>الصفحة {catalog.page} من {catalog.pageCount}</span>
      {catalog.page < catalog.pageCount ? <Link href={href(catalog.page + 1)} className="rounded-xl border px-3 py-3 font-bold text-primary">التالي</Link> : null}
    </nav>
  </div>;
}
