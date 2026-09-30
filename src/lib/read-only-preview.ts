const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PREVIEW_ACTION_PATHS = new Set(['/login', '/store-login', '/admin/categories']);

export type PreviewCategoryVisibility = {
  categories: Record<string, boolean>;
  subcategories: Record<string, boolean>;
};
export const PREVIEW_CATEGORY_VISIBILITY_KEY = 'trbhh:preview:category-visibility:v1';

type ActiveCategory = { id: number; active: boolean };

export function parsePreviewCategoryVisibility(values: Record<string, string>): PreviewCategoryVisibility {
  const parsed: PreviewCategoryVisibility = { categories: {}, subcategories: {} };
  for (const [field, value] of Object.entries(values)) {
    const match = field.match(/^(category|subcategory):(\d+)$/);
    if (!match || !['0', '1'].includes(value)) continue;
    parsed[match[1] === 'category' ? 'categories' : 'subcategories'][match[2]] = value === '1';
  }
  return parsed;
}

/** Apply an isolated preview overlay without mutating rows read from production. */
export function applyPreviewCategoryVisibility<C extends ActiveCategory, S extends ActiveCategory>(
  categories: C[],
  subcategories: S[],
  overrides: PreviewCategoryVisibility,
): { categories: C[]; subcategories: S[] } {
  const apply = <T extends ActiveCategory>(items: T[], values: Record<string, boolean>) =>
    items.map(item => Object.prototype.hasOwnProperty.call(values, String(item.id))
      ? { ...item, active: values[String(item.id)] }
      : item);
  return { categories: apply(categories, overrides.categories), subcategories: apply(subcategories, overrides.subcategories) };
}

/** Hostinger preview mode backed by a SELECT-only production database user. */
export function isReadOnlyPreview(): boolean {
  return process.env.TRBHH_READ_ONLY_PREVIEW === '1';
}

export function previewRobotsHeader(): string | null {
  return isReadOnlyPreview() ? 'noindex, nofollow, noarchive' : null;
}

/** Reject every write except login, whose preview path only reads MySQL and writes its cookie/rate limit to Redis. */
export function readOnlyPreviewResponse(method: string, pathname = ''): Response | null {
  const normalizedMethod = method.toUpperCase();
  if (!isReadOnlyPreview() || READ_METHODS.has(normalizedMethod)) return null;
  if (normalizedMethod === 'POST' && PREVIEW_ACTION_PATHS.has(pathname)) return null;
  return Response.json(
    { error: 'read_only_preview', message: 'هذه معاينة للقراءة فقط؛ الحفظ والشراء معطلان.' },
    { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store', 'X-Trbhh-Preview-Mode': 'read-only', 'X-Robots-Tag':'noindex, nofollow, noarchive' } },
  );
}
