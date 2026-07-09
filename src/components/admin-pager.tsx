import Link from 'next/link';
import { ChevronRight, ChevronLeft } from 'lucide-react';

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);

/** نافذة أرقام الصفحات حول الصفحة الحالية: 1 … 4 5 [6] 7 8 … 20 */
function pageWindow(page: number, pages: number): (number | '…')[] {
  const out: (number | '…')[] = [];
  const around = 2;
  let last = 0;
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= around) {
      if (last && p - last > 1) out.push('…');
      out.push(p);
      last = p;
    }
  }
  return out;
}

/**
 * ترقيم صفحات موحّد (الإدارة والموقع): أرقام صفحات قابلة للنقر + السابق/التالي،
 * ويحافظ على بقية باراميترات الرابط (البحث/التصنيف).
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
    <div className="space-y-1.5 py-2">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <Link href={href(page - 1)} className={`${btn} ${page <= 1 ? off : ''}`} aria-label="السابق"><ChevronRight className="h-4 w-4" /></Link>
        {pageWindow(page, pages).map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1 text-sm font-bold text-muted-foreground">…</span>
          ) : (
            <Link
              key={p}
              href={href(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-extrabold ${p === page ? 'bg-primary text-white shadow' : 'border text-primary hover:bg-secondary'}`}
            >
              {en(p)}
            </Link>
          ),
        )}
        <Link href={href(page + 1)} className={`${btn} ${page >= pages ? off : ''}`} aria-label="التالي"><ChevronLeft className="h-4 w-4" /></Link>
      </div>
      <div className="text-center text-xs font-bold text-muted-foreground">صفحة {en(page)} من {en(pages)} — الإجمالي {en(total)}</div>
    </div>
  );
}
