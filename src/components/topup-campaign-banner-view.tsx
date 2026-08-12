import Link from 'next/link';
import { HandCoins, Sparkles } from 'lucide-react';
import { Countdown } from '@/components/countdown';
import type { TopupTier } from '@/lib/settings';
import { normalizeTopupCampaignPresentation, type TopupCampaignPresentation } from '@/lib/topup-campaign-presentation';

type Props = { tiers: TopupTier[]; until?: Date | null; presentation?: Partial<TopupCampaignPresentation> | null; firstBonus?: number; preview?: boolean };
const themes = { heritage: 'from-emerald-900 via-emerald-600 to-amber-400 text-white', 'navy-gold': 'from-[#020b1f] via-[#12336b] to-[#efb22d] text-white', ocean: 'from-sky-800 via-cyan-600 to-teal-300 text-white', sunset: 'from-orange-900 via-orange-500 to-yellow-300 text-white', royal: 'from-indigo-900 via-violet-600 to-pink-400 text-white', mint: 'from-emerald-900 via-emerald-500 to-lime-300 text-emerald-950', midnight: 'from-slate-950 via-slate-700 to-amber-400 text-white', pearl: 'from-slate-100 via-white to-sky-100 text-slate-900 ring-1 ring-sky-200', 'night-blue': 'from-[#020617] via-[#0f3c82] to-[#22d3ee] text-white', 'offer-red': 'from-[#7f1d1d] via-[#dc2626] to-[#fbbf24] text-white', 'glow-purple': 'from-[#3b0764] via-[#9333ea] to-[#fb7185] text-white' } as const;
const widths = { full: 'w-full', standard: 'mx-auto w-[92%]', card: 'mx-auto w-[78%]' } as const;
const heights = { short: 'min-h-[120px]', medium: 'min-h-[190px]', tall: 'min-h-[280px]' } as const;

export function TopupCampaignBannerView({ tiers, until = null, presentation, firstBonus = 0, preview = false }: Props) {
  const visual = normalizeTopupCampaignPresentation(presentation); const lead = tiers[0] ?? { amount: 100, bonus: 10 };
  const inner = <span className="relative z-10 flex w-full flex-col items-center justify-center gap-2 p-4 text-center"><span className="flex flex-wrap items-center justify-center gap-1.5 text-base font-black"><span className="rounded-full bg-red-600 px-3 py-0.5 text-sm text-white shadow">عرض 🔥</span><HandCoins className="h-5 w-5" /> اشحن بـ <b className="rounded-lg bg-white px-2 py-0.5 text-xl text-emerald-950" dir="ltr">{lead.amount}</b> ريال تحصل على <b className="rounded-lg bg-amber-300 px-2 py-0.5 text-xl text-amber-950" dir="ltr">{lead.bonus}</b> ريال</span>{tiers.length > 1 && <span className="flex flex-wrap justify-center gap-1.5">{tiers.slice(1, 6).map((tier, i) => <span key={`${tier.amount}-${i}`} className="rounded-full bg-white/95 px-2 py-1 text-xs font-black text-emerald-900">اشحن {tier.amount} ← <b className="text-amber-700">+{tier.bonus}</b> ريال</span>)}</span>}{until && <span className="rounded-xl bg-black/40 px-3 py-1.5"><span className="block text-[10px] font-bold">ينتهي العرض خلال</span><Countdown until={until.toISOString()} /></span>}<span className="flex items-center gap-1 text-xs font-bold"><Sparkles className="h-3.5 w-3.5" /> تضاف المكافأة فور تأكيد الشحن{firstBonus > 0 ? ` — ومكافأة أول شحن ${firstBonus} ر.س` : ''}</span></span>;
  const cls = `topup-banner-motion relative flex overflow-hidden rounded-2xl bg-[length:200%_200%] shadow-xl ${themes[visual.template]} ${widths[visual.width]} ${heights[visual.height]}`;
  const stars = <><span className="topup-star topup-star-a">✦</span><span className="topup-star topup-star-b">✧</span><span className="topup-star topup-star-c">✦</span><span className="topup-star topup-star-d">✧</span></>;
  return preview ? <div className={cls}>{stars}{inner}</div> : <Link href="/account/wallet#topup" className={`${cls} transition hover:-translate-y-0.5`}>{stars}{inner}</Link>;
}
