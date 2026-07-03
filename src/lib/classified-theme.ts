// Client-safe shared types + design themes/templates for classified ads (no server-only).

export type Pos = 'top' | 'center' | 'bottom';
export type Align = 'right' | 'center';
export type Size = 'sm' | 'md' | 'lg';
export type Pattern = 'none' | 'dots' | 'stripes' | 'grid' | 'rays';
export type Accent = 'none' | 'bar' | 'corner' | 'frame';
/** With an image + text: 'auto' = smart tidy arrangement, 'manual' = user places the text. */
export type Layout = 'auto' | 'manual';

export type Classified = {
  id: number;
  userId: number | null;
  title: string | null;
  text: string | null;
  image: string | null; // resolved media URL
  phone: string | null;
  whatsapp: string | null;
  link: string | null;
  theme: number;
  pos: Pos;
  align: Align;
  size: Size;
  bold: boolean;
  pattern: Pattern;
  accent: Accent;
  layout: Layout;
  createdAt: string | null;
  views: number;
  clicks: number;
};

/**
 * Build a working wa.me link from any phone format the advertiser entered.
 * WhatsApp requires the full international number with country code and no
 * leading zero or "+", e.g. 9665XXXXXXXX. Saudi locals like 05XXXXXXXX are
 * converted to 9665XXXXXXXX; numbers already carrying 966/00966/+966 are kept.
 * Returns null when there is no usable number.
 */
export function waLink(raw: string | null | undefined): string | null {
  let p = (raw || '').replace(/\D/g, '');
  if (!p) return null;
  if (p.startsWith('00')) p = p.slice(2); // 00966… → 966…
  if (p.startsWith('966')) {
    // ok as-is
  } else if (p.startsWith('05')) {
    p = '966' + p.slice(1); // 05XXXXXXXX → 9665XXXXXXXX
  } else if (p.startsWith('5') && p.length === 9) {
    p = '966' + p; // 5XXXXXXXX → 9665XXXXXXXX
  } else if (p.startsWith('0')) {
    p = '966' + p.slice(1); // other local → assume Saudi
  }
  return `https://wa.me/${p}`;
}

/** Gradient color themes. `text` = readable text color on this background. */
export const CLASSIFIED_THEMES: { from: string; to: string; text: 'light' | 'dark' }[] = [
  { from: '#3287da', to: '#1b4f8a', text: 'light' },
  { from: '#0ea5e9', to: '#1d4ed8', text: 'light' },
  { from: '#10b981', to: '#0ea5e9', text: 'light' },
  { from: '#7c3aed', to: '#2563eb', text: 'light' },
  { from: '#d4a017', to: '#8a6d0e', text: 'light' },
  { from: '#f59e0b', to: '#b91c1c', text: 'light' },
  { from: '#0f766e', to: '#065f46', text: 'light' },
  { from: '#e11d48', to: '#831843', text: 'light' },
  // soft / pastel (dark text)
  { from: '#a1c4fd', to: '#c2e9fb', text: 'dark' },
  { from: '#d4fc79', to: '#96e6a1', text: 'dark' },
  { from: '#fbc2eb', to: '#a6c1ee', text: 'dark' },
  { from: '#ffecd2', to: '#fcb69f', text: 'dark' },
  { from: '#e0c3fc', to: '#8ec5fc', text: 'dark' },
  { from: '#f5f7fa', to: '#c3cfe2', text: 'dark' },
  { from: '#fddb92', to: '#d1fdff', text: 'dark' },
  { from: '#cfd9df', to: '#e2ebf0', text: 'dark' },
];

export const POS_CLASS: Record<string, string> = {
  top: 'justify-start',
  center: 'justify-center',
  bottom: 'justify-end',
};
export const SIZE_TITLE: Record<string, string> = { sm: 'text-sm', md: 'text-base', lg: 'text-xl' };
export const SIZE_BODY: Record<string, string> = { sm: 'text-[11px]', md: 'text-xs', lg: 'text-sm' };

// "poster" sizes for text-only ads (no image) → big text that fills the card
export const SIZE_TITLE_POSTER: Record<string, string> = { sm: 'text-2xl', md: 'text-3xl', lg: 'text-4xl' };
export const SIZE_BODY_POSTER: Record<string, string> = { sm: 'text-sm', md: 'text-base', lg: 'text-lg' };

/** Decorative overlay pattern as an inline style. */
export function patternStyle(pattern: Pattern, dark: boolean): Record<string, string> {
  const c = dark ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.16)';
  switch (pattern) {
    case 'dots':
      return { backgroundImage: `radial-gradient(${dark ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.22)'} 1.5px, transparent 1.6px)`, backgroundSize: '14px 14px' };
    case 'stripes':
      return { backgroundImage: `repeating-linear-gradient(45deg, ${c} 0, ${c} 8px, transparent 8px, transparent 16px)` };
    case 'grid':
      return { backgroundImage: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`, backgroundSize: '18px 18px' };
    case 'rays':
      return { backgroundImage: `repeating-conic-gradient(from 0deg at 100% 0%, ${c} 0deg, ${c} 6deg, transparent 6deg, transparent 14deg)` };
    default:
      return {};
  }
}

export type Template = {
  id: number; name: string; theme: number;
  pos: Pos; align: Align; size: Size; bold: boolean; pattern: Pattern; accent: Accent;
};

const PRESETS: Omit<Template, 'id' | 'theme'>[] = [
  { name: 'بسيط', pos: 'bottom', align: 'right', size: 'md', bold: true, pattern: 'none', accent: 'none' },
  { name: 'شريط سفلي', pos: 'bottom', align: 'right', size: 'md', bold: true, pattern: 'none', accent: 'bar' },
  { name: 'وسط أنيق', pos: 'center', align: 'center', size: 'lg', bold: true, pattern: 'none', accent: 'frame' },
  { name: 'منقّط', pos: 'bottom', align: 'right', size: 'md', bold: true, pattern: 'dots', accent: 'bar' },
  { name: 'مخطّط', pos: 'top', align: 'right', size: 'md', bold: true, pattern: 'stripes', accent: 'corner' },
  { name: 'شبكي', pos: 'center', align: 'center', size: 'md', bold: true, pattern: 'grid', accent: 'frame' },
  { name: 'إشعاعي', pos: 'bottom', align: 'center', size: 'lg', bold: true, pattern: 'rays', accent: 'none' },
];

/** Large auto-generated template library (themes × presets). */
export const CLASSIFIED_TEMPLATES: Template[] = CLASSIFIED_THEMES.flatMap((_, ti) =>
  PRESETS.map((p, pi) => ({ id: ti * 100 + pi, theme: ti, ...p })),
);
