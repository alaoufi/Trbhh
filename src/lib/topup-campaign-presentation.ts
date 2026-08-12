export const TOPUP_BANNER_TEMPLATES = [
  { key: 'heritage', label: 'الذهبي الأخضر' }, { key: 'navy-gold', label: 'كحلي تربح' }, { key: 'ocean', label: 'الموج الفيروزي' }, { key: 'sunset', label: 'غروب دافئ' }, { key: 'royal', label: 'ملكي بنفسجي' }, { key: 'mint', label: 'نعناع مضيء' }, { key: 'midnight', label: 'ليل ذهبي' }, { key: 'pearl', label: 'لؤلؤي هادئ' }, { key: 'night-blue', label: 'أزرق ليلي' }, { key: 'offer-red', label: 'أحمر العروض' }, { key: 'glow-purple', label: 'بنفسجي متوهج' },
] as const;
export const TOPUP_BANNER_WIDTHS = [
  { key: 'full', label: 'ممتد — كامل عرض الصفحة' }, { key: 'standard', label: 'قياسي — عرض المحتوى' }, { key: 'card', label: 'بطاقة — عرض محدود' },
] as const;
export const TOPUP_BANNER_HEIGHTS = [
  { key: 'short', label: 'قصير — 120px' }, { key: 'medium', label: 'متوسط — 190px' }, { key: 'tall', label: 'كبير — 280px' },
] as const;
export const TOPUP_BANNER_EFFECTS = ['animated-gradient', 'sparkles', 'shimmer'] as const;
export type TopupBannerTemplate = typeof TOPUP_BANNER_TEMPLATES[number]['key'];
export type TopupBannerWidth = typeof TOPUP_BANNER_WIDTHS[number]['key'];
export type TopupBannerHeight = typeof TOPUP_BANNER_HEIGHTS[number]['key'];
export type TopupCampaignPresentation = { template: TopupBannerTemplate; width: TopupBannerWidth; height: TopupBannerHeight };

const TOPUP_BANNER_THEME_STYLES: Record<TopupBannerTemplate, { backgroundImage: string }> = {
  heritage: { backgroundImage: 'linear-gradient(115deg, #065f46 0%, #10b981 38%, #f59e0b 72%, #0f766e 100%)' },
  'navy-gold': { backgroundImage: 'linear-gradient(115deg, #020b1f 0%, #12336b 42%, #efb22d 78%, #051c42 100%)' },
  ocean: { backgroundImage: 'linear-gradient(115deg, #075985 0%, #0891b2 40%, #2dd4bf 74%, #164e63 100%)' },
  sunset: { backgroundImage: 'linear-gradient(115deg, #7c2d12 0%, #f97316 42%, #fde047 78%, #ea580c 100%)' },
  royal: { backgroundImage: 'linear-gradient(115deg, #312e81 0%, #7c3aed 42%, #f472b6 78%, #4c1d95 100%)' },
  mint: { backgroundImage: 'linear-gradient(115deg, #064e3b 0%, #34d399 42%, #bef264 78%, #059669 100%)' },
  midnight: { backgroundImage: 'linear-gradient(115deg, #020617 0%, #334155 42%, #f59e0b 78%, #0f172a 100%)' },
  pearl: { backgroundImage: 'linear-gradient(115deg, #e0f2fe 0%, #ffffff 42%, #dbeafe 76%, #f8fafc 100%)' },
  'night-blue': { backgroundImage: 'linear-gradient(115deg, #020617 0%, #0f3c82 42%, #22d3ee 78%, #082f49 100%)' },
  'offer-red': { backgroundImage: 'linear-gradient(115deg, #7f1d1d 0%, #dc2626 42%, #fbbf24 78%, #991b1b 100%)' },
  'glow-purple': { backgroundImage: 'linear-gradient(115deg, #3b0764 0%, #9333ea 42%, #fb7185 78%, #581c87 100%)' },
};

export function getTopupBannerThemeStyle(template: TopupBannerTemplate) {
  return TOPUP_BANNER_THEME_STYLES[template];
}

export function topupRewardLabel(amount: number, bonus: number) {
  return `اشحن ${amount} ريال — مكافأة الشحن +${bonus} ريال`;
}

const hasKey = <T extends readonly { key: string }[]>(items: T, value: unknown): value is T[number]['key'] => typeof value === 'string' && items.some((item) => item.key === value);
export function normalizeTopupCampaignPresentation(value?: Partial<Record<keyof TopupCampaignPresentation | 'layout' | 'size', unknown>> | null): TopupCampaignPresentation {
  const legacyHeight = value?.size === 'compact' ? 'short' : value?.size === 'large' ? 'tall' : 'medium';
  return { template: hasKey(TOPUP_BANNER_TEMPLATES, value?.template) ? value.template : 'heritage', width: hasKey(TOPUP_BANNER_WIDTHS, value?.width) ? value.width : 'full', height: hasKey(TOPUP_BANNER_HEIGHTS, value?.height) ? value.height : legacyHeight };
}
