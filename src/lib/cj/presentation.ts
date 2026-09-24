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
    .replace(/[<＜](?:[/／]\s*)?\p{L}[^<＜>＞]*(?:[>＞]|$)/gu, (fragment: string, offset: number, source: string) => {
      // Keep a bare comparison such as x<y; translated/unfinished tags are display noise.
      if (/^[<＜]\p{L}[\p{L}\p{N}]*$/u.test(fragment) && offset > 0 && /[\p{L}\p{N}]/u.test(source[offset - 1])) return fragment;
      return ' ';
    })
    .replace(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif)(?:\?\S*)?/gi, '')
    .replace(/[ \t\u00a0]{2,}/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function cjPriceLabel(minor: number, currency = 'SAR'): string {
  if (currency !== 'SAR' || !Number.isSafeInteger(minor) || minor <= 0) return 'السعر قيد المراجعة';
  try { return `${formatSar(minor)} ر.س`; } catch { return 'السعر قيد المراجعة'; }
}

/** Commercially cleaner display-only title; source names remain untouched in CJ storage. */
export function cjProductDisplayTitle(raw:string|null|undefined):string{
  const plain=cjDescriptionText(raw??'').replace(/كل\s+مباراة/gu,'متعدد الاستخدامات').replace(/\s{2,}/g,' ').trim();
  const parts=plain.split(/\s*(?:[|｜]|[،,])\s*/u).filter(Boolean),unique:string[]=[];
  for(const part of parts)if(!unique.length||part.toLocaleLowerCase()!==unique[unique.length-1].toLocaleLowerCase())unique.push(part);
  let title=unique.join('، ');
  if(title.length>160){const shortened=title.slice(0,160),breakAt=shortened.lastIndexOf(' ');title=shortened.slice(0,breakAt>80?breakAt:160).trim();}
  return title||'بيانات المنتج قيد المراجعة';
}

export function cjSourceLink(raw: string): { href: string; label: string } | null {
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return { href: url.href, label: `رابط مرجعي (${url.hostname})` };
  } catch { return null; }
}
