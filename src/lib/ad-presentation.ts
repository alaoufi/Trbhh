type PriceData = { price: number; adsType?: string; priceType?: string | null; rentPeriod?: string | null; priceEnabled?:boolean };

/** Presentation only: callers must pass the schema's public projection. */
export function formatAdSpecification(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim()).join('، ');
  if (value && typeof value === 'object' && 'min' in value && 'max' in value) {
    const { min, max } = value;
    if (typeof min === 'number' && typeof max === 'number' && Number.isFinite(min) && Number.isFinite(max) && min <= max) return `${min}–${max}`;
  }
  return '';
}

export function adPriceLabel(ad: PriceData): string {
  if(ad.priceEnabled === false) return '';
  if (!Number.isFinite(ad.price) || ad.price <= 0) {
    if (ad.priceType === 'som') return 'على السوم';
    if (ad.priceType === 'negotiable') return 'السعر قابل للتفاوض';
    return ad.adsType === 'request' ? 'الميزانية غير محددة' : 'السعر غير محدد';
  }
  const amount = `${new Intl.NumberFormat('en-US').format(ad.price)} ر.س`;
  const period: Record<string, string> = { 'بالساعة': 'ساعة', 'يومي': 'يوم', 'أسبوعي': 'أسبوع', 'شهري': 'شهر', 'سنوي': 'سنة' };
  return ad.priceType === 'rent' ? `${amount} / ${period[ad.rentPeriod || ''] || ad.rentPeriod?.trim() || 'تأجير'}` : amount;
}

/** Remove only an exact repeated title, preserving repeated words in normal titles. */
export function compactAdTitle(raw: string): string {
  const title = raw.replace(/\s+/g, ' ').trim();
  const parts = title.split(/\s*[|\n]+\s*/).filter(Boolean);
  if (parts.length > 1 && parts.every((part) => part === parts[0])) return parts[0];
  const words = title.split(' ');
  for (let count = 2; count <= Math.floor(words.length / 2); count++) {
    if (words.length % count) continue;
    const base = words.slice(0, count).join(' ');
    if (Array.from({ length: words.length / count }, (_, i) => words.slice(i * count, (i + 1) * count).join(' ')).every((part) => part === base)) return base;
  }
  return title;
}
