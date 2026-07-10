import Link from 'next/link';
import { HandCoins, ChevronLeft } from 'lucide-react';
import { getTopupPromo, getTopupTiers, getTopupCampaignUntil } from '@/lib/settings';
import { Countdown } from '@/components/countdown';

/**
 * بانر «عرض» حملة زيادة الشحن: الشرائح من التسعيرات وبنفس ترتيب إدخالها حرفياً،
 * مع عداد تنازلي حتى نهاية العرض (إن حُددت مدته). لا باقات = لا بانر إطلاقاً،
 * وينتهي العداد = يختفي البانر تلقائياً.
 */
export async function TopupPromoBanner() {
  const [promo, tiers, until] = await Promise.all([
    getTopupPromo().catch(() => ({ pct: 0, min: 0, first: 0 })),
    getTopupTiers().catch(() => []),
    getTopupCampaignUntil().catch(() => null),
  ]);
  if (tiers.length === 0) return null; // لا باقات = لا يظهر العرض
  if (until && until.getTime() <= Date.now()) return null; // انتهى العرض
  // الأرقام من شرائح لوحة التحكم حرفياً — أول شريحة كما أدخلتها هي المثال الرئيسي
  const amount = tiers[0].amount;
  const bonus = tiers[0].bonus;
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
          {/* شارة «عرض» + الأرقام بارزة وغامقة داخل حبوب بيضاء عالية التباين */}
          <span className="flex flex-wrap items-center gap-1.5 text-base font-extrabold drop-shadow">
            <span className="animate-pulse rounded-full bg-red-600 px-2.5 py-0.5 text-sm font-black text-white shadow ring-1 ring-white/50">عرض 🔥</span>
            💰 اشحن بـ
            <span className="rounded-lg bg-white px-2 py-0.5 text-xl font-black leading-6 text-emerald-900 shadow" dir="ltr">{amount}</span>
            ر.س ونضيف لك
            <span className="rounded-lg bg-amber-300 px-2 py-0.5 text-xl font-black leading-6 text-amber-950 shadow" dir="ltr">+{bonus}</span>
            فوراً
            <span className="rounded-full bg-white px-2.5 py-1 text-sm font-black text-emerald-800 shadow">يصبح رصيدك {amount + bonus} ر.س</span>
          </span>
          {tiers.length > 1 && (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {tiers.slice(0, 4).map((t, i) => (
                <span key={`${t.amount}-${i}`} className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-emerald-900 shadow ring-1 ring-emerald-200">
                  اشحن <span dir="ltr">{t.amount}</span> ← <span className="text-amber-600" dir="ltr">+{t.bonus}</span> ⭐
                </span>
              ))}
            </span>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-white drop-shadow">
            {until && (
              <span className="flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-1 font-black ring-1 ring-white/30">
                ⏳ ينتهي العرض خلال: <Countdown until={until.toISOString()} className="text-amber-300" />
              </span>
            )}
            <span>تُضاف المكافأة تلقائياً فور تأكيد الشحن{promo.first > 0 ? `، ومكافأة أول شحن +${promo.first} ر.س إضافية` : ''}.</span>
          </span>
        </span>
      </span>
      <ChevronLeft className="relative h-5 w-5 shrink-0 drop-shadow" />
    </Link>
  );
}
