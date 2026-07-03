// Client-safe store-design helpers: color palette, banner styles, backgrounds.

/** A large curated brand-color palette for the store designer. */
export const STORE_COLORS: string[] = [
  '#3287da', '#2563eb', '#1e40af', '#0ea5e9', '#0891b2', '#06b6d4',
  '#14b8a6', '#10b981', '#22c55e', '#16a34a', '#65a30d', '#84cc16',
  '#eab308', '#f59e0b', '#f97316', '#ea580c', '#ef4444', '#dc2626',
  '#e11d48', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1',
  '#0f766e', '#7c3aed', '#b45309', '#be123c', '#334155', '#0f172a',
];

export type BannerId = 'gradient' | 'mesh' | 'aurora' | 'sunset' | 'night' | 'solid';
export const BANNERS: { id: BannerId; name: string }[] = [
  { id: 'gradient', name: 'تدرّج' },
  { id: 'mesh', name: 'ميش' },
  { id: 'aurora', name: 'أورورا' },
  { id: 'sunset', name: 'غروب' },
  { id: 'night', name: 'ليلي' },
  { id: 'solid', name: 'صلب' },
];

/**
 * Ready-made store templates (مكتبة القوالب): each is a full visual identity
 * combining a brand color + banner style + a short vibe description. Suggested
 * to a merchant the first time they open a store so they start from a polished
 * look instead of a blank canvas.
 */
export type StoreTemplate = { id: string; name: string; color: string; banner: BannerId; vibe: string };
export const STORE_TEMPLATES: StoreTemplate[] = [
  { id: 'royal', name: 'أزرق ملكي', color: '#2563eb', banner: 'gradient', vibe: 'رسمي وموثوق' },
  { id: 'teal', name: 'تركوازي عصري', color: '#14b8a6', banner: 'mesh', vibe: 'حديث ونظيف' },
  { id: 'forest', name: 'أخضر طبيعي', color: '#16a34a', banner: 'gradient', vibe: 'طبيعي وصحّي' },
  { id: 'sunset', name: 'برتقالي حيوي', color: '#f97316', banner: 'sunset', vibe: 'دافئ وجذّاب' },
  { id: 'ruby', name: 'أحمر جريء', color: '#dc2626', banner: 'gradient', vibe: 'قوي ولافت' },
  { id: 'rose', name: 'وردي أنيق', color: '#ec4899', banner: 'mesh', vibe: 'راقٍ وناعم' },
  { id: 'violet', name: 'بنفسجي فاخر', color: '#7c3aed', banner: 'aurora', vibe: 'فخم ومميّز' },
  { id: 'midnight', name: 'ليلي أنيق', color: '#0ea5e9', banner: 'night', vibe: 'عصري وهادئ' },
  { id: 'gold', name: 'ذهبي فخم', color: '#b45309', banner: 'sunset', vibe: 'فخامة وتميّز' },
  { id: 'sky', name: 'سماوي هادئ', color: '#0ea5e9', banner: 'gradient', vibe: 'خفيف ومريح' },
  { id: 'emerald', name: 'زمرّدي', color: '#10b981', banner: 'mesh', vibe: 'أنيق ومنعش' },
  { id: 'slate', name: 'رمادي احترافي', color: '#334155', banner: 'gradient', vibe: 'محايد واحترافي' },
];

/** Loyalty/quality tier of a store from its followers + rating (like a store badge). */
export function storeTier(followers: number, ratingAvg: number, ratingCount: number): { key: 'gold' | 'silver' | 'active' | 'new'; label: string } {
  if (followers >= 50 && ratingAvg >= 4.5 && ratingCount >= 5) return { key: 'gold', label: 'متجر ذهبي' };
  if ((followers >= 15 && ratingAvg >= 4) || ratingCount >= 10) return { key: 'silver', label: 'متجر فضّي' };
  if (followers >= 3 || ratingCount >= 1) return { key: 'active', label: 'متجر نشِط' };
  return { key: 'new', label: 'متجر جديد' };
}

const hex = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#3287da');

/** CSS `background` value for a store banner given its style id and brand color. */
export function bannerBackground(id: string | null | undefined, color: string | null | undefined): string {
  const c = hex(color || '#3287da');
  switch (id) {
    case 'solid':
      return c;
    case 'mesh':
      return `radial-gradient(at 15% 20%, ${c} 0px, transparent 50%), radial-gradient(at 85% 10%, ${c}bb 0px, transparent 50%), radial-gradient(at 50% 100%, ${c}77 0px, transparent 55%), ${c}22`;
    case 'aurora':
      return `radial-gradient(at 12% 20%, ${c} 0, transparent 45%), radial-gradient(at 88% 12%, #ec4899 0, transparent 45%), radial-gradient(at 50% 100%, #6366f1 0, transparent 48%), #0f172a`;
    case 'sunset':
      return `linear-gradient(120deg, ${c} 0%, #f97316 100%)`;
    case 'night':
      return `linear-gradient(125deg, #0f172a 0%, ${c} 130%)`;
    case 'gradient':
    default:
      return `linear-gradient(120deg, ${c} 0%, ${c}bb 100%)`;
  }
}

/** Whether white text is readable on a solid brand color (simple luminance test). */
export function isLightColor(color: string | null | undefined): boolean {
  const c = hex(color || '#3287da').slice(1);
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}
