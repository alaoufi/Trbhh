import Link from 'next/link';
import { ChevronRight, ChevronLeft } from 'lucide-react';

/**
 * ترقيم صفحات موحّد للوحة الإدارة — يحافظ على بقية باراميترات الرابط
 * (البحث/التصنيف) ويعرض «صفحة س من ص» مع السابق/التالي.
 */
export function AdminPager({ basePath, page, pages, total, params }: { basePath: string; page: number; pages: number; total: number; params: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set('page', String(p));
    const qs = sp.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  };
  const btn = 'flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-bold text-primary hover:bg-secondary';
  const off = 'pointer-events-none opacity-40';
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 py-2">
      <Link href={href(page - 1)} className={`${btn} ${page <= 1 ? off : ''}`}><ChevronRight className="h-4 w-4" /> السابق</Link>
      <span className="rounded-lg bg-secondary/60 px-3 py-1.5 text-sm font-bold text-muted-foreground">
        صفحة {new Intl.NumberFormat('en-US').format(page)} من {new Intl.NumberFormat('en-US').format(pages)} <span className="text-xs">({new Intl.NumberFormat('en-US').format(total)})</span>
      </span>
      <Link href={href(page + 1)} className={`${btn} ${page >= pages ? off : ''}`}>التالي <ChevronLeft className="h-4 w-4" /></Link>
    </div>
  );
}
