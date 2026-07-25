/**
 * قوالب الهوية: كل هوية نشر (شخصية/متجر) تختار قالباً يُطبَّق على الموقع بالكامل
 * عند تفعيلها (data-theme) ليفرّق العضو بصرياً بين هوياته. القيم مطابقة لـ globals.css.
 */
export type IdentityTheme = { key: string; name: string; hsl: string; hex: string };

export const IDENTITY_THEMES: IdentityTheme[] = [
  { key: '', name: 'الافتراضي (أزرق)', hsl: '210 69% 53%', hex: '#3287da' },
  { key: 'desert', name: 'صحراء', hsl: '34 48% 46%', hex: '#ae7c3d' },
  { key: 'agri', name: 'زراعي', hsl: '138 44% 40%', hex: '#399457' },
  { key: 'spring', name: 'ربيعي', hsl: '330 55% 62%', hex: '#d16aa0' },
  { key: 'mint', name: 'نعناعي', hsl: '174 56% 40%', hex: '#2da39a' },
  { key: 'lavender', name: 'خزامى', hsl: '250 48% 64%', hex: '#8b7fd4' },
  { key: 'sea', name: 'بحري', hsl: '195 75% 42%', hex: '#1a9bc4' },
  { key: 'snow', name: 'ثلجي', hsl: '202 72% 52%', hex: '#3aa0db' },
  { key: 'mountain', name: 'جبلي', hsl: '95 32% 40%', hex: '#6a8747' },
  { key: 'sunset', name: 'غروب', hsl: '14 82% 56%', hex: '#eb6a3f' },
  { key: 'night', name: 'ليلي', hsl: '210 90% 66%', hex: '#5aa9f7' },
];

const BY_KEY = new Map(IDENTITY_THEMES.map((t) => [t.key, t]));

/** قالب صالح فقط (وإلا الافتراضي الفارغ). */
export function normTheme(v: string | null | undefined): string {
  const s = (v || '').trim();
  return BY_KEY.has(s) ? s : '';
}

/** اللون التمثيلي للقالب (للأيقونة/الشارة) — hex. */
export function themeHex(key: string | null | undefined): string {
  return (BY_KEY.get(normTheme(key)) || IDENTITY_THEMES[0]).hex;
}
