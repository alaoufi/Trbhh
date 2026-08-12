export const TOPUP_BANNER_TEMPLATES = [
  { key: 'heritage', label: 'الذهبي الأخضر' }, { key: 'navy-gold', label: 'كحلي تربح' }, { key: 'ocean', label: 'الموج الفيروزي' }, { key: 'sunset', label: 'غروب دافئ' }, { key: 'royal', label: 'ملكي بنفسجي' }, { key: 'mint', label: 'نعناع مضيء' }, { key: 'midnight', label: 'ليل ذهبي' }, { key: 'pearl', label: 'لؤلؤي هادئ' }, { key: 'night-blue', label: 'أزرق ليلي' }, { key: 'offer-red', label: 'أحمر العروض' }, { key: 'glow-purple', label: 'بنفسجي متوهج' },
] as const;
export const TOPUP_BANNER_WIDTHS = [
  { key: 'full', label: 'ممتد — كامل عرض الصفحة' }, { key: 'standard', label: 'قياسي — عرض المحتوى' }, { key: 'card', label: 'بطاقة — عرض محدود' },
] as const;
export const TOPUP_BANNER_HEIGHTS = [
  { key: 'short', label: 'قصير — 120px' }, { key: 'medium', label: 'متوسط — 190px' }, { key: 'tall', label: 'كبير — 280px' },
] as const;
export type TopupBannerTemplate = typeof TOPUP_BANNER_TEMPLATES[number]['key'];
export type TopupBannerWidth = typeof TOPUP_BANNER_WIDTHS[number]['key'];
export type TopupBannerHeight = typeof TOPUP_BANNER_HEIGHTS[number]['key'];
export type TopupCampaignPresentation = { template: TopupBannerTemplate; width: TopupBannerWidth; height: TopupBannerHeight };
const hasKey = <T extends readonly { key: string }[]>(items: T, value: unknown): value is T[number]['key'] => typeof value === 'string' && items.some((item) => item.key === value);
export function normalizeTopupCampaignPresentation(value?: Partial<Record<keyof TopupCampaignPresentation | 'layout' | 'size', unknown>> | null): TopupCampaignPresentation {
  const legacyHeight = value?.size === 'compact' ? 'short' : value?.size === 'large' ? 'tall' : 'medium';
  return { template: hasKey(TOPUP_BANNER_TEMPLATES, value?.template) ? value.template : 'heritage', width: hasKey(TOPUP_BANNER_WIDTHS, value?.width) ? value.width : 'full', height: hasKey(TOPUP_BANNER_HEIGHTS, value?.height) ? value.height : legacyHeight };
}
