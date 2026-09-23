import 'server-only';
import { cjConfig } from './config';
import { listProducts as cjListProducts } from './client';
import { upsertCjProduct, type UpsertCjInput } from './mapping';
import { computePrice, defaultMarginBps } from './pricing';
import { getSetting, getSettingNum, setSetting } from '@/lib/settings';
import type { CjProductSummary, CjResult } from './types';

/**
 * مزامنة كتالوج CJ إلى جدول cj_products (تخزين وسيط) — قراءة فقط، لا شراء.
 * تُجلب المنتجات صفحةً صفحة، وتُحتسب التكلفة (سعر CJ بالدولار × سعر الصرف القابل
 * للتعديل من الإدارة) ثم يُشتقّ الربح وسعر البيع من الهامش الافتراضي، فتُدرَج/تُحدَّث
 * بلا تكرار (مفتاح التفرّد cj_product_id+cj_variant_id). المزامنة المجدولة محكومة
 * بمفتاح cj_sync_enabled (معطّل افتراضياً) — لا تعمل حتى يفعّلها المشرف من اللوحة،
 * وكلها إعدادات في جدول الإعدادات لا قيم مثبّتة في الكود.
 * المنتجات المستوردة تبقى في cj_products للمراجعة ولا تُنشَر تلقائياً في المتجر.
 */

/** إعدادات المزامنة — كلها قابلة للتعديل من لوحة الإدارة (لا قيم صلبة في الكود). */
export const CJ_SYNC_SETTING_KEYS = {
  enabled: 'cj_sync_enabled',
  pageSize: 'cj_sync_page_size',
  maxPages: 'cj_sync_max_pages',
  usdToSarX100: 'cj_usd_to_sar_x100', // سعر صرف الدولار→الريال ×١٠٠ (٣٧٥ = ٣٫٧٥)
  shippingMinor: 'cj_sync_shipping_minor', // تقدير شحن ثابت لكل منتج (هللة) يُضاف للتكلفة
} as const;

export type CjSyncSettings = {
  enabled: boolean;
  pageSize: number;
  maxPages: number;
  usdToSarX100: number;
  shippingMinor: number;
};

const clampInt = (n: number, lo: number, hi: number, fallback: number): number =>
  Number.isFinite(n) && n >= lo && n <= hi ? Math.floor(n) : fallback;

export async function cjSyncSettings(): Promise<CjSyncSettings> {
  const [enabled, pageSize, maxPages, rate, shipping] = await Promise.all([
    getSetting(CJ_SYNC_SETTING_KEYS.enabled, '0'),
    getSettingNum(CJ_SYNC_SETTING_KEYS.pageSize, 20),
    getSettingNum(CJ_SYNC_SETTING_KEYS.maxPages, 3),
    getSettingNum(CJ_SYNC_SETTING_KEYS.usdToSarX100, 375),
    getSettingNum(CJ_SYNC_SETTING_KEYS.shippingMinor, 0),
  ]);
  return {
    enabled: enabled === '1',
    pageSize: clampInt(pageSize, 1, 50, 20),
    maxPages: clampInt(maxPages, 1, 20, 3),
    usdToSarX100: rate > 0 && rate <= 100000 ? Math.round(rate) : 375,
    shippingMinor: Math.max(0, Math.round(shipping)),
  };
}

/** حفظ إعدادات المزامنة (تحقّق وحدود آمنة) — يُستدعى من إجراء الإدارة. */
export async function saveCjSyncSettings(input: Partial<CjSyncSettings>): Promise<void> {
  const writes: Promise<void>[] = [];
  if (input.enabled !== undefined) writes.push(setSetting(CJ_SYNC_SETTING_KEYS.enabled, input.enabled ? '1' : '0'));
  if (input.pageSize !== undefined) writes.push(setSetting(CJ_SYNC_SETTING_KEYS.pageSize, String(clampInt(input.pageSize, 1, 50, 20))));
  if (input.maxPages !== undefined) writes.push(setSetting(CJ_SYNC_SETTING_KEYS.maxPages, String(clampInt(input.maxPages, 1, 20, 3))));
  if (input.usdToSarX100 !== undefined) writes.push(setSetting(CJ_SYNC_SETTING_KEYS.usdToSarX100, String(input.usdToSarX100 > 0 && input.usdToSarX100 <= 100000 ? Math.round(input.usdToSarX100) : 375)));
  if (input.shippingMinor !== undefined) writes.push(setSetting(CJ_SYNC_SETTING_KEYS.shippingMinor, String(Math.max(0, Math.round(input.shippingMinor)))));
  await Promise.all(writes);
}

export type CjSyncResult =
  | { ok: true; imported: number; pages: number; skipped: number }
  | { ok: false; error: string };

/** حقن التبعيات للاختبار (شبكة/قاعدة بيانات) دون مساس بالمسار الحقيقي. */
export type CjSyncDeps = {
  listProducts?: (page: number, size: number) => Promise<CjResult<CjProductSummary[]>>;
  upsert?: (input: UpsertCjInput) => Promise<void>;
  marginBps?: () => Promise<number>;
  settings?: () => Promise<CjSyncSettings>;
  configured?: boolean;
};

/**
 * تشغيل مزامنة الكتالوج. `force` يتجاوز مفتاح التفعيل (لزر «مزامنة الآن» في الإدارة)؛
 * أما المزامنة المجدولة (من الكرون) فتحترم المفتاح فلا تعمل ما لم يفعّلها المشرف.
 */
export async function syncCjCatalog(opts: { force?: boolean; maxPages?: number; deps?: CjSyncDeps } = {}): Promise<CjSyncResult> {
  const deps = opts.deps ?? {};
  const configured = deps.configured ?? cjConfig().configured;
  if (!configured) return { ok: false, error: 'cj_not_configured' };
  const settings = await (deps.settings ?? cjSyncSettings)();
  if (!opts.force && !settings.enabled) return { ok: false, error: 'cj_sync_disabled' };
  const listProducts = deps.listProducts ?? cjListProducts;
  const upsert = deps.upsert ?? upsertCjProduct;
  const margin = await (deps.marginBps ?? defaultMarginBps)();
  const maxPages = Math.max(1, Math.min(settings.maxPages, opts.maxPages ?? settings.maxPages));

  let imported = 0, skipped = 0, pages = 0;
  for (let page = 1; page <= maxPages; page++) {
    const r = await listProducts(page, settings.pageSize);
    if (!r.ok) {
      if (page === 1) return { ok: false, error: r.error };
      break; // احتفظ بما استُورد من الصفحات السابقة بدل إسقاط العملية كلها
    }
    pages++;
    for (const p of r.data) {
      if (!p.pid) { skipped++; continue; }
      const costMinor = p.sellPrice != null && p.sellPrice > 0 ? Math.round(p.sellPrice * settings.usdToSarX100) : 0;
      const price = computePrice(costMinor, settings.shippingMinor, 0, margin);
      await upsert({ cjProductId: p.pid, cjSku: p.productSku || '', name: p.productName || '', image: p.productImage || '', price });
      imported++;
    }
    if (r.data.length < settings.pageSize) break; // آخر صفحة
  }
  return { ok: true, imported, pages, skipped };
}
