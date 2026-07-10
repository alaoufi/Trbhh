import Link from 'next/link';
import { HandCoins, ChevronLeft } from 'lucide-react';
import { getTopupPromo } from '@/lib/settings';

/**
 * بانر تسويقي لعرض الشحن: «اشحن بـ100 ر.س ونضيف لك 10 ر.س — يصبح رصيدك 110».
 * الأرقام محسوبة من إعدادات التحكم (نسبة المكافأة + الحد الأدنى + مكافأة أول شحن)،
 * ولا يظهر البانر إلا عند تفعيل أي منهما (نسبة > 0 أو مكافأة أول شحن > 0).
 */
export async function TopupPromoBanner() {
  const promo = await getTopupPromo().catch(() => ({ pct: 0, min: 0, first: 0 }));
  if (promo.pct <= 0 && promo.first <= 0) return null;
  const amount = Math.max(promo.min, 100); // مثال حي بالحد الأدنى (أو 100 ر.س)
  const bonus = Math.round((amount * promo.pct) / 100);
  return (
    <Link
      href="/account/wallet#topup"
      className="store-cta-anim relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl p-4 text-white shadow-lg ring-1 ring-white/20 transition hover:-translate-y-0.5"
      style={{ backgroundImage: 'linear-gradient(110deg,#065f46,#059669,#f59e0b,#10b981,#0d9488,#065f46)' }}
    >
      <span className="shimmer-sweep pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 bg-white/30 blur-md" />
      {/* نجوم متلألئة تملأ البانر */}
      <span className="star-twinkle right-[6%] top-1 text-base">✨</span>
      <span className="star-twinkle right-[24%] bottom-1 text-xs" style={{ animationDelay: '0.4s' }}>⭐</span>
      <span className="star-twinkle right-[45%] top-0.5 text-sm" style={{ animationDelay: '0.9s' }}>✨</span>
      <span className="star-twinkle left-[30%] bottom-0.5 text-base" style={{ animationDelay: '1.3s' }}>🌟</span>
      <span className="star-twinkle left-[12%] top-1 text-xs" style={{ animationDelay: '0.6s' }}>⭐</span>
      <span className="star-twinkle left-[45%] top-2 text-sm" style={{ animationDelay: '1.7s' }}>✨</span>
      <span className="relative flex min-w-0 items-center gap-3">
        <span className="float-3d grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/25 shadow-inner ring-1 ring-white/30"><HandCoins className="h-6 w-6" /></span>
        <span className="min-w-0">
          {promo.pct > 0 ? (
            <>
              <span className="flex flex-wrap items-center gap-2 text-base font-extrabold drop-shadow">
                💰 اشحن بـ{amount} ر.س ونضيف لك {bonus} ر.س فوراً
                <span className="animate-pulse rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-emerald-700 shadow">يصبح رصيدك {amount + bonus} ر.س</span>
              </span>
              <span className="block text-xs font-medium text-white/95 drop-shadow">
                مكافأة {promo.pct}٪ على كل شحن{promo.min > 0 ? ` من ${promo.min} ر.س فأكثر` : ''} — تُضاف تلقائياً فور تأكيد الشحن{promo.first > 0 ? `، ومكافأة أول شحن +${promo.first} ر.س إضافية` : ''}.
              </span>
            </>
          ) : (
            <>
              <span className="block text-base font-extrabold drop-shadow">🎁 مكافأة أول شحن: +{promo.first} ر.س تُضاف لرصيدك</span>
              <span className="block text-xs font-medium text-white/95 drop-shadow">اشحن رصيدك لأول مرة واحصل على المكافأة تلقائياً فور تأكيد الشحن.</span>
            </>
          )}
        </span>
      </span>
      <ChevronLeft className="relative h-5 w-5 shrink-0 drop-shadow" />
    </Link>
  );
}
