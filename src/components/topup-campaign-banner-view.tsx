import Link from 'next/link';
import { HandCoins, Sparkles } from 'lucide-react';
import { Countdown } from '@/components/countdown';
import type { TopupTier } from '@/lib/settings';
import { getTopupBannerThemeStyle, normalizeTopupCampaignPresentation, topupRewardLabel, type TopupCampaignPresentation } from '@/lib/topup-campaign-presentation';

type Props = {
  tiers: TopupTier[];
  until?: Date | null;
  presentation?: Partial<TopupCampaignPresentation> | null;
  firstBonus?: number;
  preview?: boolean;
};

const widths = { full: 'w-full', standard: 'mx-auto w-[92%]', card: 'mx-auto w-[78%]' } as const;
const heights = { short: 'min-h-[120px]', medium: 'min-h-[190px]', tall: 'min-h-[280px]' } as const;

export function TopupCampaignBannerView({ tiers, until = null, presentation, firstBonus = 0, preview = false }: Props) {
  const visual = normalizeTopupCampaignPresentation(presentation);
  const lead = tiers[0] ?? { amount: 100, bonus: 10 };
  const isLightTemplate = visual.template === 'pearl' || visual.template === 'mint';
  const textColor = isLightTemplate ? 'text-slate-900' : 'text-white';
  const inner = (
    <span className="relative z-10 flex w-full flex-col items-center justify-center gap-2 p-4 text-center">
      <span className="flex flex-wrap items-center justify-center gap-2 text-base font-black" aria-label={topupRewardLabel(lead.amount, lead.bonus)}>
        <span className="rounded-full bg-red-600 px-3 py-0.5 text-sm text-white shadow">عرض 🔥</span>
        <HandCoins className="h-5 w-5" aria-hidden="true" />
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl bg-white/95 px-3 py-1.5 text-emerald-950 shadow-md">
          <span className="text-xs font-extrabold">اشحن</span>
          <b className="text-2xl leading-none" dir="ltr">{lead.amount}</b>
          <span className="text-xs font-extrabold">ريال</span>
        </span>
        <span className="text-lg font-black" aria-hidden="true">←</span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl bg-amber-300 px-3 py-1.5 text-amber-950 shadow-md ring-2 ring-white/60">
          <span className="text-xs font-extrabold">مكافأة الشحن</span>
          <b className="text-2xl leading-none" dir="ltr">+{lead.bonus}</b>
          <span className="text-xs font-extrabold">ريال</span>
        </span>
      </span>
      {tiers.length > 1 && (
        <span className="flex flex-wrap justify-center gap-1.5">
          {tiers.slice(1, 6).map((tier, i) => (
            <span key={`${tier.amount}-${i}`} className="rounded-full bg-white/95 px-2 py-1 text-xs font-black text-emerald-900">
              اشحن {tier.amount} ← <b className="text-amber-700">+{tier.bonus}</b> ريال
            </span>
          ))}
        </span>
      )}
      {until && <span className="rounded-xl bg-black/40 px-3 py-1.5"><span className="block text-[10px] font-bold">ينتهي العرض خلال</span><Countdown until={until.toISOString()} /></span>}
      <span className="flex items-center gap-1 text-xs font-bold"><Sparkles className="h-3.5 w-3.5" />تضاف المكافأة فور تأكيد الشحن{firstBonus > 0 ? ` — ومكافأة أول شحن ${firstBonus} ر.س` : ''}</span>
    </span>
  );
  const cls = `topup-banner-motion relative flex overflow-hidden rounded-2xl bg-[length:200%_200%] shadow-xl ${textColor} ${widths[visual.width]} ${heights[visual.height]}`;
  const stars = <><span className="topup-star topup-star-a">✦</span><span className="topup-star topup-star-b">✧</span><span className="topup-star topup-star-c">✦</span><span className="topup-star topup-star-d">✧</span></>;
  const style = getTopupBannerThemeStyle(visual.template);

  return preview
    ? <div className={cls} style={style}>{stars}{inner}</div>
    : <Link href="/account/wallet#topup" className={`${cls} transition hover:-translate-y-0.5`} style={style}>{stars}{inner}</Link>;
}
