import Link from 'next/link';
import { Store, ChevronLeft, Sparkles } from 'lucide-react';

/**
 * بانر مستقل «افتح متجرك» — يظهر لغير أصحاب المتاجر (زوّار وأعضاء بلا متجر).
 * منفصل عن الهيدر؛ الهيدر مخصّص لتسجيل الدخول أساساً.
 */
export function OpenStoreBanner() {
  return (
    <Link
      href="/store"
      className="flex items-center justify-between gap-3 overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-l from-primary/12 via-accent/40 to-transparent p-4 shadow-sm transition hover:-translate-y-0.5"
    >
      <span className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-white shadow"><Store className="h-6 w-6" /></span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-extrabold text-primary">افتح متجرك مجاناً <Sparkles className="h-4 w-4 text-amber-500" /></span>
          <span className="block text-xs text-muted-foreground">متجر مستقل باسمك ورابطك — اعرض منتجاتك وابدأ البيع.</span>
        </span>
      </span>
      <ChevronLeft className="h-5 w-5 shrink-0 text-primary" />
    </Link>
  );
}
