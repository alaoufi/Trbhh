export const TOPUP_BANNER_TEMPLATES = [
  { key: 'heritage', label: 'الذهبي الأخضر' },
  { key: 'navy-gold', label: 'كحلي تربح' },
  { key: 'ocean', label: 'الموج الفيروزي' },
  { key: 'sunset', label: 'غروب دافئ' },
  { key: 'royal', label: 'ملكي بنفسجي' },
  { key: 'mint', label: 'نعناع مضيء' },
  { key: 'midnight', label: 'ليل ذهبي' },
  { key: 'pearl', label: 'لؤلؤي هادئ' },
] as const;
export const TOPUP_BANNER_LAYOUTS = [
  { key: 'ribbon', label: 'شريط العرض' },
  { key: 'cards', label: 'بطاقات المكافآت' },
  { key: 'spotlight', label: 'تركيز على العرض' },
  { key: 'split', label: 'تقسيم أنيق' },
] as const;
export const TOPUP_BANNER_SIZES = [
  { key: 'compact', label: 'مضغوط' },
  { key: 'standard', label: 'قياسي' },
  { key: 'large', label: 'كبير' },
] as const;

export type TopupBannerTemplate = typeof TOPUP_BANNER_TEMPLATES[number]['key'];
export type TopupBannerLayout = typeof TOPUP_BANNER_LAYOUTS[number]['key'];
export type TopupBannerSize = typeof TOPUP_BANNER_SIZES[number]['key'];
export type TopupCampaignPresentation = { template: TopupBannerTemplate; layout: TopupBannerLayout; size: TopupBannerSize };

const hasKey = <T extends readonly { key: string }[]>(items: T, value: unknown): value is T[number]['key'] =>
  typeof value === 'string' && items.some((item) => item.key === value);

export function normalizeTopupCampaignPresentation(value?: Partial<Record<keyof TopupCampaignPresentation, unknown>> | null): TopupCampaignPresentation {
  return {
    template: hasKey(TOPUP_BANNER_TEMPLATES, value?.template) ? value.template : 'heritage',
    layout: hasKey(TOPUP_BANNER_LAYOUTS, value?.layout) ? value.layout : 'ribbon',
    size: hasKey(TOPUP_BANNER_SIZES, value?.size) ? value.size : 'standard',
  };
}
