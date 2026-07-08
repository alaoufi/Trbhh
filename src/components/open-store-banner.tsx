import Link from 'next/link';
import { Store, ChevronLeft, Sparkles } from 'lucide-react';
import { getStoreSubPricing } from '@/lib/settings';

/**
 * بانر مستقل متحرك «افتح متجرك مجاناً» — تدرّج ألوان متباين متحرك + لمعة، ويذكر
 * الفترة التجريبية. يظهر لغير أصحاب المتاجر (زوّار وأعضاء بلا متجر).
 */
export async function OpenStoreBanner() {
  const trialDays = await getStoreSubPricing().then((p) => p.trialDays).catch(() => 0);
  return (
    <Link
      href="/store"
      className="store-cta-anim relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl p-4 text-white shadow-lg ring-1 ring-white/20 transition hover:-translate-y-0.5"
      style={{ backgroundImage: 'linear-gradient(110deg,#1d4ed8,#7c3aed,#db2777,#f59e0b,#10b981,#1d4ed8)' }}
    >
      {/* لمعة متحركة تمرّ فوق البانر */}
      <span className="shimmer-sweep pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 bg-white/30 blur-md" />
      <span className="relative flex min-w-0 items-center gap-3">
        <span className="float-3d grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/25 shadow-inner ring-1 ring-white/30"><Store className="h-6 w-6" /></span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 text-base font-extrabold drop-shadow">
            افتح متجرك مجاناً <Sparkles className="h-4 w-4 text-amber-200" />
            {trialDays > 0 && (
              <span className="animate-pulse rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-[#1d4ed8] shadow">فترة تجريبية {trialDays} أيام</span>
            )}
          </span>
          <span className="block text-xs font-medium text-white/95 drop-shadow">متجر مستقل باسمك ورابطك — ابدأ البيع الآن.</span>
        </span>
      </span>
      <ChevronLeft className="relative h-5 w-5 shrink-0 drop-shadow" />
    </Link>
  );
}
