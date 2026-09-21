import 'server-only';
import { getSetting, setSetting } from '@/lib/settings';

/**
 * نموذج التسعير — يحفظ التكاليف منفصلة (تكلفة المورّد + الشحن + تكاليف أخرى) ويشتقّ
 * الربح وسعر البيع من هامش قابل للتعديل من الإدارة. الهامش الافتراضي ٣٠٪ (٣٠٠٠ نقطة
 * أساس) وليس مثبّتاً في الكود — يُقرأ من إعداد commerce_default_margin_bps.
 */
export const DEFAULT_MARGIN_BPS = 3000;
const SETTING_MARGIN = 'commerce_default_margin_bps';

export async function defaultMarginBps(): Promise<number> {
  const raw = await getSetting(SETTING_MARGIN, String(DEFAULT_MARGIN_BPS)).catch(() => String(DEFAULT_MARGIN_BPS));
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : DEFAULT_MARGIN_BPS;
}

export async function setDefaultMarginBps(bps: number): Promise<void> {
  const safe = Number.isFinite(bps) && bps >= 0 && bps <= 100000 ? Math.floor(bps) : DEFAULT_MARGIN_BPS;
  await setSetting(SETTING_MARGIN, String(safe));
}

export type PriceBreakdown = {
  supplierCostMinor: number;
  shippingCostMinor: number;
  otherCostsMinor: number;
  marginBps: number;
  profitMinor: number;
  salePriceMinor: number;
  currency: 'SAR';
};

/** يحسب الربح وسعر البيع من التكاليف والهامش (كل القيم بالهللة). */
export function computePrice(
  supplierCostMinor: number,
  shippingCostMinor: number,
  otherCostsMinor: number,
  marginBps: number,
): PriceBreakdown {
  const cost = Math.max(0, Math.round(supplierCostMinor));
  const shipping = Math.max(0, Math.round(shippingCostMinor));
  const other = Math.max(0, Math.round(otherCostsMinor));
  const bps = Number.isFinite(marginBps) && marginBps >= 0 ? Math.floor(marginBps) : DEFAULT_MARGIN_BPS;
  const base = cost + shipping + other;
  const profit = Math.ceil((base * bps) / 10000);
  return {
    supplierCostMinor: cost,
    shippingCostMinor: shipping,
    otherCostsMinor: other,
    marginBps: bps,
    profitMinor: profit,
    salePriceMinor: base + profit,
    currency: 'SAR',
  };
}
