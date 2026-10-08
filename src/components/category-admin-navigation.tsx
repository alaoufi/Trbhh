import Link from 'next/link';
import { CATEGORY_ADMIN_PAGES, type CategoryAdminView } from '@/lib/ad-categories/admin-navigation';

/** بطاقات التنقّل بين مهام «الأقسام وحقولها» — كل مهمة في صفحتها عبر ?view=. */
export function CategoryAdminNavigation({ home = false, current }: { home?: boolean; current?: CategoryAdminView }) {
  const links = (
    <nav aria-label="مهام الأقسام وحقولها" className="grid min-w-0 gap-2 sm:grid-cols-2">
      {Object.entries(CATEGORY_ADMIN_PAGES).map(([key, item]) => (
        <Link
          key={key}
          href={`/admin/categories?view=${key}`}
          aria-current={current === key ? 'page' : undefined}
          className={`min-h-11 min-w-0 break-words rounded-xl border p-3 ${current === key ? 'border-primary bg-primary text-white' : 'bg-white hover:border-primary'}`}
        >
          <span className="block font-bold">{item.title}</span>
          {home && <span className="mt-1 block text-sm text-muted-foreground">{item.desc}</span>}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="space-y-2">
      {home ? (
        links
      ) : (
        <details className="min-w-0 rounded-xl border p-2">
          <summary className="min-h-11 cursor-pointer px-2 py-3 text-sm font-medium">الانتقال إلى مهمة أخرى ▾</summary>
          <div className="pt-2">{links}</div>
        </details>
      )}
    </div>
  );
}
