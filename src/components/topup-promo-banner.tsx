import Link from 'next/link';
import { HandCoins, ChevronLeft } from 'lucide-react';
import { getTopupPromo, getTopupTiers } from '@/lib/settings';

/**
 * بانر تسويقي لحملة زيادة الشحن: «اشحن بـ100 ر.س ونضيف لك 10 ر.س — يصبح رصيدك 110».
 * الشرائح من التسعيرات (مبلغ ← مكافأة، متغيرة)، مع مكافأة أول شحن — ولا يظهر
 * البانر إلا عند وجود شرائح أو نسبة قديمة أو مكافأة أول شحن.
 */
export async function TopupPromoBanner() {
  const [promo, tiers] = await Promise.all([
    getTopupPromo().catch(() => ({ pct: 0, min: 0, first: 0 })),
    getTopupTiers().catch(() => []),
  ]);
  if (tiers.length === 0 && promo.pct <= 0 && promo.first <= 0) return null;
  // المثال الرئيسي: أول شريحة من الحملة، وإلا النسبة القديمة
  const amount = tiers.length ? tiers[0].amount : Math.max(promo.min, 100);
  const bonus = tiers.length ? tiers[0].bonus : Math.round((amount * promo.pct) / 100);
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
          {bonus > 0 ? (
            <>
              {/* الأرقام بارزة وغامقة داخل حبوب بيضاء عالية التباين */}
              <span className="flex flex-wrap items-center gap-1.5 text-base font-extrabold drop-shadow">
                💰 اشحن بـ
                <span className="rounded-lg bg-white px-2 py-0.5 text-xl font-black leading-6 text-emerald-900 shadow" dir="ltr">{amount}</span>
                ر.س ونضيف لك
                <span className="rounded-lg bg-amber-300 px-2 py-0.5 text-xl font-black leading-6 text-amber-950 shadow" dir="ltr">+{bonus}</span>
                فوراً
                <span className="animate-pulse rounded-full bg-white px-2.5 py-1 text-sm font-black text-emerald-800 shadow">يصبح رصيدك {amount + bonus} ر.س</span>
              </span>
              {tiers.length > 1 ? (
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {tiers.slice(0, 4).map((t) => (
                    <span key={t.amount} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-emerald-900 shadow ring-1 ring-emerald-200">
                      اشحن <span dir="ltr">{t.amount}</span> ← <span className="text-amber-600" dir="ltr">+{t.bonus}</span> ⭐
                    </span>
                  ))}
                </span>
              ) : (
                <span className="block text-xs font-bold text-white drop-shadow">
                  {tiers.length ? 'حملة زيادة الشحن — كلما زاد شحنك زادت مكافأتك، تُضاف تلقائياً فور التأكيد' : `مكافأة ${promo.pct}٪ على كل شحن${promo.min > 0 ? ` من ${promo.min} ر.س فأكثر` : ''}`}{promo.first > 0 ? `، ومكافأة أول شحن +${promo.first} ر.س إضافية` : ''}.
                </span>
              )}
            </>
          ) : (
            <>
              <span className="flex flex-wrap items-center gap-1.5 text-base font-extrabold drop-shadow">
                🎁 مكافأة أول شحن:
                <span className="rounded-lg bg-white px-2 py-0.5 text-xl font-black leading-6 text-emerald-900 shadow" dir="ltr">+{promo.first}</span>
                ر.س تُضاف لرصيدك
              </span>
              <span className="block text-xs font-bold text-white drop-shadow">اشحن رصيدك لأول مرة واحصل على المكافأة تلقائياً فور تأكيد الشحن.</span>
            </>
          )}
        </span>
      </span>
      <ChevronLeft className="relative h-5 w-5 shrink-0 drop-shadow" />
    </Link>
  );
}
