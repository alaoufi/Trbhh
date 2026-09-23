import 'server-only';
import { cjConfig, type CjConfig } from './config';
import { readCjAuth, writeCjAuth } from './store';
import { getCommerceConfig } from '@/lib/commerce/settings';
import type {
  CjResult, CjProductSummary, CjProductDetail, CjVariant, CjInventory, CjWarehouse, CjFreightOption, CjTrack,
} from './types';

/**
 * عميل CJdropshipping — مرجع: https://developers.cjdropshipping.com/en/api/introduction.html
 * قراءة فقط في هذه المرحلة (منتجات/تفاصيل/متغيّرات/مخزون/مستودعات/شحن/تتبّع).
 * إنشاء الطلب مُقفل بحارسين: مفتاح الشراء المركزي + SUPPLIER_ALLOW_LIVE_ORDERS،
 * فلا يُرسَل أي طلب حقيقي إلى CJ في الإنتاج قبل التفعيل اليدوي من الإدارة.
 */

const TIMEOUT_MS = 20000;
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000; // جدّد قبل الانتهاء بيوم

type CjEnvelope<T> = { code?: number; result?: boolean; message?: string; data?: T };

// CJ يفرض حدّ معدّل صارم (طلب واحد/ثانية). نسلسل كل الطلبات بفاصل ≥1.1ث لتفادي
// code=1600200 «Too Many Requests». التسلسل على مستوى العملية يكفي (مثيل واحد).
const MIN_GAP_MS = 1100;
let lastAt = 0;
let gate: Promise<void> = Promise.resolve();
function throttle(): Promise<void> {
  gate = gate.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
  });
  return gate;
}

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
  await throttle();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { message: text.slice(0, 200) }; }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function toDate(v: unknown): Date | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** يجلب رمز وصول صالحاً (من المخزون أو بالتجديد أو بمصادقة جديدة). */
async function accessToken(cfg: CjConfig): Promise<CjResult<string>> {
  if (!cfg.configured) return { ok: false, error: 'cj_not_configured' };
  const now = Date.now();
  const stored = await readCjAuth(cfg.encryptionKey);
  if (stored && stored.accessExpiresAt && stored.accessExpiresAt.getTime() - now > REFRESH_MARGIN_MS) {
    return { ok: true, data: stored.tokens.accessToken };
  }
  // جرّب التجديد إن توفّر refresh صالح، وإلا صادِق من جديد.
  const canRefresh = !!stored?.tokens.refreshToken && (!stored.refreshExpiresAt || stored.refreshExpiresAt.getTime() - now > 0);
  const endpoint = canRefresh ? '/authentication/refreshAccessToken' : '/authentication/getAccessToken';
  const payload = canRefresh
    ? { refreshToken: stored!.tokens.refreshToken }
    : { email: cfg.email, password: cfg.apiKey };
  const { status, body } = await fetchJson(`${cfg.base}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }).catch(() => ({ status: 0, body: null }));
  const env = (body || {}) as CjEnvelope<{ accessToken?: string; refreshToken?: string; accessTokenExpiryDate?: string; refreshTokenExpiryDate?: string }>;
  const data = env.data;
  if (status !== 200 || !data?.accessToken || !data?.refreshToken) {
    // فشل التجديد → جرّب مصادقة كاملة مرّة واحدة.
    if (canRefresh) {
      const { status: s2, body: b2 } = await fetchJson(`${cfg.base}/authentication/getAccessToken`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: cfg.email, password: cfg.apiKey }),
      }).catch(() => ({ status: 0, body: null }));
      const e2 = (b2 || {}) as CjEnvelope<{ accessToken?: string; refreshToken?: string; accessTokenExpiryDate?: string; refreshTokenExpiryDate?: string }>;
      if (s2 === 200 && e2.data?.accessToken && e2.data?.refreshToken) {
        await writeCjAuth({ tokens: { accessToken: e2.data.accessToken, refreshToken: e2.data.refreshToken }, accessExpiresAt: toDate(e2.data.accessTokenExpiryDate), refreshExpiresAt: toDate(e2.data.refreshTokenExpiryDate) }, cfg.encryptionKey);
        return { ok: true, data: e2.data.accessToken };
      }
      return { ok: false, error: e2.message || 'cj_auth_failed', status: s2 };
    }
    return { ok: false, error: env.message || 'cj_auth_failed', status };
  }
  await writeCjAuth({ tokens: { accessToken: data.accessToken, refreshToken: data.refreshToken }, accessExpiresAt: toDate(data.accessTokenExpiryDate), refreshExpiresAt: toDate(data.refreshTokenExpiryDate) }, cfg.encryptionKey);
  return { ok: true, data: data.accessToken };
}

async function call<T>(path: string, opts: { method?: 'GET' | 'POST'; query?: Record<string, string | number | undefined>; body?: unknown } = {}): Promise<CjResult<T>> {
  const cfg = cjConfig();
  const tok = await accessToken(cfg);
  if (!tok.ok) return tok;
  const qs = opts.query
    ? '?' + Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  const { status, body } = await fetchJson(`${cfg.base}${path}${qs}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'CJ-Access-Token': tok.data },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).catch(() => ({ status: 0, body: null }));
  const env = (body || {}) as CjEnvelope<T>;
  if (status !== 200 || (env.result === false)) return { ok: false, error: env.message || `cj_http_${status}`, status };
  return { ok: true, data: (env.data as T) };
}

/* ------------------------- قراءة فقط ------------------------- */

export async function testConnection(): Promise<CjResult<{ email: string }>> {
  const cfg = cjConfig();
  const tok = await accessToken(cfg);
  if (!tok.ok) return tok;
  return { ok: true, data: { email: cfg.email } };
}

export async function listProducts(pageNum = 1, pageSize = 20): Promise<CjResult<CjProductSummary[]>> {
  const r = await call<{ list?: unknown[] }>('/product/list', { query: { pageNum, pageSize } });
  if (!r.ok) return r;
  const list = Array.isArray(r.data?.list) ? r.data!.list! : [];
  return { ok: true, data: list.map((p) => mapSummary(p as Record<string, unknown>)) };
}

export async function getProduct(pid: string): Promise<CjResult<CjProductDetail>> {
  const r = await call<Record<string, unknown>>('/product/query', { query: { pid } });
  if (!r.ok) return r;
  const d = r.data || {};
  const variants = Array.isArray(d.variants) ? (d.variants as Record<string, unknown>[]).map(mapVariant) : [];
  return { ok: true, data: { ...mapSummary(d), description: str(d.description), variants } };
}

export async function getVariants(pid: string): Promise<CjResult<CjVariant[]>> {
  const r = await call<unknown[]>('/product/variant/query', { query: { pid } });
  if (!r.ok) return r;
  const list = Array.isArray(r.data) ? r.data : [];
  return { ok: true, data: list.map((v) => mapVariant(v as Record<string, unknown>)) };
}

export async function getInventoryByVid(vid: string): Promise<CjResult<CjInventory[]>> {
  const r = await call<unknown[]>('/product/stock/queryByVid', { query: { vid } });
  if (!r.ok) return r;
  const list = Array.isArray(r.data) ? r.data : [];
  return { ok: true, data: list.map((s) => mapInventory(s as Record<string, unknown>)) };
}

export async function getInventoryByPid(pid: string): Promise<CjResult<CjInventory[]>> {
  const r = await call<unknown[]>('/product/stock/queryByPid', { query: { pid } });
  if (!r.ok) return r;
  const list = Array.isArray(r.data) ? r.data : [];
  return { ok: true, data: list.map((s) => mapInventory(s as Record<string, unknown>)) };
}

/** المستودعات المتاحة تُشتقّ من مخزون منتج (areaId/areaName/countryCode مميّزة). */
export async function getWarehouses(samplePid: string): Promise<CjResult<CjWarehouse[]>> {
  const r = await getInventoryByPid(samplePid);
  if (!r.ok) return r;
  const seen = new Map<string, CjWarehouse>();
  for (const inv of r.data) {
    if (inv.areaId && !seen.has(inv.areaId)) seen.set(inv.areaId, { areaId: inv.areaId, areaEnName: inv.areaName, countryCode: inv.countryCode });
  }
  return { ok: true, data: [...seen.values()] };
}

/** احتساب الشحن إلى السعودية (endCountryCode='SA'). */
export async function calculateFreightToKSA(products: { vid: string; quantity: number }[], zip?: string): Promise<CjResult<CjFreightOption[]>> {
  const r = await call<unknown[]>('/logistic/freightCalculate', {
    method: 'POST',
    body: { startCountryCode: 'CN', endCountryCode: 'SA', zip, products: products.map((p) => ({ vid: p.vid, quantity: p.quantity })) },
  });
  if (!r.ok) return r;
  const list = Array.isArray(r.data) ? r.data : [];
  return { ok: true, data: list.map((o) => mapFreight(o as Record<string, unknown>)) };
}

export async function getTracking(trackNumber: string): Promise<CjResult<CjTrack>> {
  const r = await call<Record<string, unknown>>('/logistic/getTrackInfo', { query: { trackNumber } });
  if (!r.ok) return r;
  const d = r.data || {};
  const details = Array.isArray(d.tracks) ? (d.tracks as Record<string, unknown>[]).map((t) => ({ date: str(t.date), description: str(t.description) })) : [];
  return { ok: true, data: { trackNumber, logisticName: str(d.logisticName), trackStatus: str(d.trackStatus), details } };
}

/* ------------------------- الطلبات (مقفلة) ------------------------- */

/**
 * إنشاء طلب لدى CJ — لا يُنفَّذ إطلاقاً إلا بحارسين: مفتاح الشراء المركزي مفعّل
 * (commerce_purchasing_enabled) و SUPPLIER_ALLOW_LIVE_ORDERS='true'. وإلا يُرفض
 * فوراً بلا أي اتصال شبكي. هذا يمنع أي شراء/خصم حقيقي في الإنتاج قبل التفعيل اليدوي.
 */
export async function createCjOrder(input: unknown): Promise<CjResult<{ orderId: string }>> {
  const config = await getCommerceConfig().catch(() => null);
  const liveAllowed = process.env.SUPPLIER_ALLOW_LIVE_ORDERS === 'true';
  if (!config?.purchasingEnabled || !liveAllowed) {
    return { ok: false, error: 'cj_purchasing_disabled' };
  }
  const r = await call<{ orderId?: string }>('/shopping/order/createOrderV2', { method: 'POST', body: input });
  if (!r.ok) return r;
  return { ok: true, data: { orderId: String(r.data?.orderId || '') } };
}

/* ------------------------- محوّلات ------------------------- */

function str(v: unknown): string | null { return typeof v === 'string' && v.trim() ? v : null; }
function num(v: unknown): number | null { const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN; return Number.isFinite(n) ? n : null; }

function mapSummary(p: Record<string, unknown>): CjProductSummary {
  return {
    pid: String(p.pid ?? p.productId ?? ''),
    productName: String(p.productNameEn ?? p.productName ?? ''),
    productSku: String(p.productSku ?? p.sku ?? ''),
    sellPrice: num(p.sellPrice),
    productImage: str(p.productImage) || str(p.bigImage),
    categoryName: str(p.categoryName),
  };
}
function mapVariant(v: Record<string, unknown>): CjVariant {
  return {
    vid: String(v.vid ?? v.variantId ?? ''),
    variantSku: String(v.variantSku ?? v.sku ?? ''),
    variantName: str(v.variantNameEn ?? v.variantName),
    variantSellPrice: num(v.variantSellPrice ?? v.sellPrice),
    variantImage: str(v.variantImage),
    variantWeight: num(v.variantWeight),
  };
}
function mapInventory(s: Record<string, unknown>): CjInventory {
  return {
    vid: String(s.vid ?? ''),
    areaId: str(s.areaId ?? s.storageAreaId),
    areaName: str(s.areaEnName ?? s.countryNameEn ?? s.areaName),
    countryCode: str(s.countryCode),
    storageNum: num(s.storageNum ?? s.totalInventoryNum) ?? 0,
  };
}
function mapFreight(o: Record<string, unknown>): CjFreightOption {
  return {
    logisticName: String(o.logisticName ?? o.logisticAisle ?? ''),
    logisticPrice: num(o.logisticPrice) ?? 0,
    logisticAging: str(o.logisticAging),
    logisticPriceCn: num(o.logisticPriceCn),
  };
}
