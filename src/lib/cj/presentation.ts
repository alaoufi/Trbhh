import { formatSar } from '@/lib/commerce/money';

/** Display only: preserve the source record and never render provider HTML. */
export function cjDescriptionText(raw: string): string {
  let text = raw.slice(0, 100_000);
  for (let i = 0; i < 2; i++) {
    text = text.replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, '&');
  }
  return text
    .replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\s*li\b[^>]*>/gi, '\n• ')
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr|ul|ol)\s*>/gi, '\n')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<\s*\/?\s*[a-z][^>]*(?:>|$)/gi, ' ')
    .replace(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif)(?:\?\S*)?/gi, '')
    .replace(/[ \t\u00a0]{2,}/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function cjPriceLabel(minor: number, currency = 'SAR'): string {
  if (currency !== 'SAR' || !Number.isSafeInteger(minor) || minor <= 0) return 'السعر قيد المراجعة';
  try { return `${formatSar(minor)} ر.س`; } catch { return 'السعر قيد المراجعة'; }
}

export function cjSourceLink(raw: string): { href: string; label: string } | null {
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return { href: url.href, label: `رابط مرجعي (${url.hostname})` };
  } catch { return null; }
}
