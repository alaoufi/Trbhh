import 'server-only';
import {readCjOptionSchema} from './variant-schema';
import {parseCjSizeChart,type CjSizeChart} from './size-chart';
import {preserveCjVariantAttributes} from './variant-attributes';
import {createHash} from 'node:crypto';
import {parseCjCatalogFilters,type CatalogFilterValues} from './catalog-filters';
import { cjConfig, type CjConfig } from './config';
import { readCjAuth, writeCjAuth } from './store';
import { getCommerceConfig } from '@/lib/commerce/settings';
import {cjPrivateFinancialOperationsAllowed} from './live-gates';
import type {
  CjResult, CjProductSummary, CjProductDetail, CjVariant, CjInventory, CjWarehouse, CjFreightOption, CjTrack,
  CjCategory, CjProductPage, CjBalance, CjCreatedOrder, CjOrderDetail,
} from './types';

/**
 * عميل CJdropshipping — مرجع: https://developers.cjdropshipping.com/en/api/introduction.html
 * قراءة فقط في هذه المرحلة (منتجات/تفاصيل/متغيّرات/مخزون/مستودعات/شحن/تتبّع).
 * إنشاء الطلب والدفع والتأكيد محظورة بحصار P0 مستقل بالإضافة إلى حارسي التفعيل،
 * فلا يُرسَل أي طلب حقيقي إلى CJ في الإنتاج قبل التفعيل اليدوي من الإدارة.
 */

const TIMEOUT_MS = 20000;
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000; // جدّد قبل الانتهاء بيوم

type CjEnvelope<T> = { code?: number; result?: boolean; success?: boolean; message?: string; data?: T };

function successfulEnvelope(env: CjEnvelope<unknown>): boolean {
  return env.code === 200 && env.result !== false && env.success !== false
    && (env.result === true || env.success === true);
}

// CJ يفرض حدّ معدّل صارم (طلب واحد/ثانية). نسلسل كل الطلبات بفاصل ≥1.1ث لتفادي
// code=1600200 «Too Many Requests». حد الحساب مشترك؛ نؤخر القراءة عند رفض CJ أيضاً.
const MIN_GAP_MS = 1100;
let lastAt = 0;
let rateLimitUntil = 0;
let gate: Promise<void> = Promise.resolve();
function throttle(): Promise<void> {
  gate = gate.then(async () => {
    for(;;){
      const wait = Math.max(MIN_GAP_MS - (Date.now() - lastAt), rateLimitUntil - Date.now());
      if(wait<=0)break;
      await new Promise((r) => setTimeout(r, wait));
    }
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
    : { apiKey: cfg.apiKey };
  const { status, body } = await fetchJson(`${cfg.base}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }).catch(() => ({ status: 0, body: null }));
  const env = (body || {}) as CjEnvelope<{ accessToken?: string; refreshToken?: string; accessTokenExpiryDate?: string; refreshTokenExpiryDate?: string }>;
  const data = env.data;
  if (status !== 200 || !successfulEnvelope(env) || !data?.accessToken || !data?.refreshToken) {
    // فشل التجديد → جرّب مصادقة كاملة مرّة واحدة.
    if (canRefresh) {
      const { status: s2, body: b2 } = await fetchJson(`${cfg.base}/authentication/getAccessToken`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: cfg.apiKey }),
      }).catch(() => ({ status: 0, body: null }));
      const e2 = (b2 || {}) as CjEnvelope<{ accessToken?: string; refreshToken?: string; accessTokenExpiryDate?: string; refreshTokenExpiryDate?: string }>;
      if (s2 === 200 && successfulEnvelope(e2) && e2.data?.accessToken && e2.data?.refreshToken) {
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

async function call<T>(path: string, opts: { method?: 'GET' | 'POST' | 'PATCH'; query?: Record<string, string | number | undefined>; body?: unknown } = {}): Promise<CjResult<T>> {
  const cfg = cjConfig();
  const tok = await accessToken(cfg);
  if (!tok.ok) return tok;
  const qs = opts.query
    ? '?' + Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  const request:RequestInit = {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'CJ-Access-Token': tok.data },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  };
  // Only proven non-mutating catalog reads may be replayed. In particular,
  // POST freightCalculate is a quote; order/payment POSTs must stay single-send.
  const retryableRead = (request.method === 'GET' && [
    '/product/listV2','/product/query','/product/variant/query','/product/stock/queryByVid','/product/stock/getInventoryByPid',
  ].includes(path)) || (request.method === 'POST' && ['/logistic/freightCalculate','/shopping/order/getOrderDetailBatch'].includes(path));
  let response:{status:number;body:unknown};
  for(let attempt=0;;attempt++){
    response=await fetchJson(`${cfg.base}${path}${qs}`,request).catch(()=>({status:0,body:null}));
    const limited=response.status===429||(response.body as CjEnvelope<unknown>|null)?.code===1600200;
    if(!limited||!retryableRead||attempt>=2)break;
    // CJ quota is shared by the account, including other workers/processes.
    // Cool down this process too, with jitter to avoid synchronized retries.
    rateLimitUntil=Math.max(rateLimitUntil,Date.now()+1500*2**attempt+Math.floor(Math.random()*500));
  }
  const {status,body}=response;
  const env = (body || {}) as CjEnvelope<T>;
  // This endpoint's documented successful envelope omits code/result.
  const parentSuccess = path === '/shopping/order/saveGenerateParentOrder' && env.code === undefined && env.success === true && env.result !== false;
  if (status !== 200 || !(successfulEnvelope(env) || parentSuccess)) {
    // سجلّ تشخيصي آمن (بلا توكن/سرّ): المسار + حالة HTTP + رمز/رسالة CJ — ليظهر السبب
    // الحقيقي في docker logs عند أخطاء مثل inventory_error/freight_error (حدّ معدّل، خيار
    // غير متوفّر، وجهة غير مدعومة…) بدل ابتلاعه. المسار بلا سلسلة الاستعلام (قد تحوي vid فقط).
    console.warn(`[cj] ${opts.method || 'GET'} ${path} → http=${status} code=${env.code ?? '-'} msg=${(env.message || '').slice(0, 160)}`);
    return { ok: false, error: env.message || `cj_http_${status}`, status };
  }
  return { ok: true, data: (env.data as T) };
}

/* ------------------------- قراءة فقط ------------------------- */

export async function testConnection(): Promise<CjResult<{ connected: true; email: string; accessTokenExpiresAt: string | null }>> {
  const cfg = cjConfig();
  const probe = await call<{ list?: unknown[] }>('/product/list', { query: { pageNum: 1, pageSize: 1 } });
  if (!probe.ok) return probe;
  if (!Array.isArray(probe.data?.list)) return { ok: false, error: 'cj_invalid_response', status: 200 };
  const stored = await readCjAuth(cfg.encryptionKey).catch(() => null);
  return { ok: true, data: { connected: true, email: cfg.email, accessTokenExpiresAt: stored?.accessExpiresAt ? stored.accessExpiresAt.toISOString() : null } };
}

export async function listProducts(pageNum = 1, pageSize = 20, filters: { productName?: string; categoryId?: string } = {}): Promise<CjResult<CjProductSummary[]>> {
  const r = await listProductsPage(pageNum, pageSize, filters);
  if (!r.ok) return r;
  return { ok: true, data: r.data.items };
}

/** صفحة منتجات مع الإجمالي (لتصفّح الآلاف: صفحات + قفز). */
export async function listProductsPage(pageNum = 1, pageSize = 20, filters: { productName?: string; categoryId?: string } = {}): Promise<CjResult<CjProductPage>> {
  const r = await call<{ list?: unknown[]; total?: unknown }>('/product/list', { query: { pageNum, pageSize, productName: filters.productName, categoryId: filters.categoryId } });
  if (!r.ok) return r;
  const list = Array.isArray(r.data?.list) ? r.data!.list! : [];
  const total = num(r.data?.total) ?? list.length;
  return { ok: true, data: { items: list.map((p) => mapSummary(p as Record<string, unknown>)), total, pageNum, pageSize } };
}

export type CjCatalogSupplier={id:string;name:string};
let supplierCache:{account:string;expires:number;data:CjCatalogSupplier[]}|null=null;
/** Bounded discovery from supplier products, not a claim to enumerate every supplier on CJ. */
export async function getCjCatalogSuppliers():Promise<CjResult<CjCatalogSupplier[]>>{
 const cfg=cjConfig(),account=createHash('sha256').update(JSON.stringify([cfg.base,cfg.email,cfg.apiKey,cfg.encryptionKey])).digest('hex');
 if(supplierCache?.account===account&&supplierCache.expires>Date.now())return {ok:true,data:supplierCache.data};
 const r=await call<{list?:unknown}>('/product/list',{query:{pageNum:1,pageSize:200,productType:'SUPPLIER_PRODUCT'}});
 if(!r.ok)return r;
 if(!Array.isArray(r.data?.list))return {ok:false,error:'cj_invalid_response',status:200};
 const suppliers=new Map<string,string>();
 for(const item of r.data.list){if(!item||typeof item!=='object')continue;const id=typeof item.supplierId==='string'?item.supplierId.trim():'',name=typeof item.supplierName==='string'?item.supplierName.trim():'';if(/^[A-Za-z0-9_-]{1,200}$/.test(id)&&name&&name.length<=200&&!/[\u0000-\u001f]/.test(name))suppliers.set(id,name);}
 const data=Array.from(suppliers,([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name));
 supplierCache={account,expires:Date.now()+10*60*1000,data};return {ok:true,data};
}

/** Interactive import catalog uses documented V2 filtering; existing sync callers keep their contract. */
export async function listBrowseProductsPage(pageNum=1,pageSize=24,options:{productName?:string;categoryId?:string;filters?:CatalogFilterValues}={}):Promise<CjResult<CjProductPage>>{
 const filters=parseCjCatalogFilters(options.filters||{});
 if(filters.error||!Number.isInteger(pageNum)||pageNum<1||pageNum>1000||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)return {ok:false,error:'cj_catalog_filters_invalid',status:400};
 const r=await call<{content?:unknown;totalRecords?:unknown}>('/product/listV2',{query:{page:pageNum,size:pageSize,keyWord:options.productName,categoryId:options.categoryId,...filters.query}});
 if(!r.ok)return r;
 if(!Array.isArray(r.data?.content)||!r.data.content.every(group=>group&&typeof group==='object'&&Array.isArray(group.productList)))return {ok:false,error:'cj_invalid_response',status:200};
 const list=r.data.content.flatMap(group=>group.productList) as unknown[];
 const total=num(r.data.totalRecords);
 if(total===null||!Number.isSafeInteger(total)||total<0||list.some(p=>!p||typeof p!=='object'||!String((p as Record<string,unknown>).id||(p as Record<string,unknown>).pid||'')))return {ok:false,error:'cj_invalid_response',status:200};
 return {ok:true,data:{items:list.map(p=>{const raw=p as Record<string,unknown>;const mapped=mapSummary(raw);return {...mapped,categoryName:str(raw.threeCategoryName)||mapped.categoryName};}),total,pageNum,pageSize}};
}

// شجرة التصنيفات نادرة التغيّر — نخزّنها في الذاكرة لتفادي حدّ المعدّل عند كل تحميل.
let categoryCache: { at: number; data: CjCategory[] } | null = null;
const CATEGORY_TTL_MS = 6 * 60 * 60 * 1000;

/** تصنيفات CJ مسطَّحة (المستوى الثالث مع المسار الكامل) — للفلترة. مخزّنة ٦ ساعات. */
export async function getCategories(): Promise<CjResult<CjCategory[]>> {
  if (categoryCache && Date.now() - categoryCache.at < CATEGORY_TTL_MS) return { ok: true, data: categoryCache.data };
  const r = await call<unknown>('/product/getCategory', {});
  if (!r.ok) return r;
  const out: CjCategory[] = [];
  const firsts = Array.isArray(r.data) ? r.data : [];
  for (const f of firsts as Record<string, unknown>[]) {
    const fName = String(f.categoryFirstName ?? '');
    const seconds = Array.isArray(f.categoryFirstList) ? (f.categoryFirstList as Record<string, unknown>[]) : [];
    for (const s of seconds) {
      const sName = String(s.categorySecondName ?? '');
      const thirds = Array.isArray(s.categorySecondList) ? (s.categorySecondList as Record<string, unknown>[]) : [];
      for (const t of thirds) {
        const id = String(t.categoryId ?? '');
        const name = String(t.categoryName ?? '');
        if (id && name) {const levels=[fName,sName,name].filter(Boolean);out.push({ id, name, path:levels.join(' › '),levels });}
      }
    }
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  categoryCache = { at: Date.now(), data: out };
  return { ok: true, data: out };
}

export async function getProduct(pid: string): Promise<CjResult<CjProductDetail>> {
  const r = await call<Record<string, unknown>>('/product/query', { query: { pid } });
  if (!r.ok) return r;
  const d = r.data || {};
  const rawVariants = Array.isArray(d.variants) ? d.variants : Array.isArray(d.stanProducts) ? d.stanProducts : [];
  const optionSchema=readCjOptionSchema(d.productKeyEn);
  const variants = (rawVariants as Record<string, unknown>[]).map(v=>({...mapVariant(v),optionSchema}));
  const summary = mapSummary(d);
  return { ok: true, data: { ...summary, description: str(d.description) || str(d.descriptionEn) || str(d.productDescription), optionSchema, variants } };
}

export async function getCjSizeChart(pid:string):Promise<CjResult<CjSizeChart>>{
 if(!/^[A-Za-z0-9_-]{1,200}$/.test(pid))return {ok:false,error:'invalid_product_id'};
 const result=await call<unknown>('/product/sizeChart/query',{query:{pid}});
 if(!result.ok)return result;
 const chart=parseCjSizeChart(result.data,pid);
 return chart?{ok:true,data:chart}:{ok:false,error:'cj_size_chart_invalid'};
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
/** Authenticated reconciliation only. Missing members remain unverified. */
export async function getCjOrderDetailBatch(orderIds:string[]):Promise<CjResult<Record<string,unknown>[]>>{
 if(!orderIds.length||orderIds.length>100||new Set(orderIds).size!==orderIds.length||orderIds.some(id=>!/^[A-Za-z0-9_-]{1,100}$/.test(id)))return {ok:false,error:'cj_batch_ids_invalid'};
 const result=await call<unknown>('/shopping/order/getOrderDetailBatch',{method:'POST',body:{orderIds}});
 if(!result.ok)return result;
 if(!Array.isArray(result.data)||result.data.some(r=>!r||typeof r!=='object'||Array.isArray(r)))return {ok:false,error:'cj_batch_response_invalid'};
 return {ok:true,data:result.data as Record<string,unknown>[]};
}

export async function getInventoryByPid(pid: string): Promise<CjResult<CjInventory[]>> {
  const r = await call<Record<string, unknown>>('/product/stock/getInventoryByPid', { query: { pid } });
  if (!r.ok) return r;
  // CJ returns inventory grouped under variantInventories, with each VID
  // containing country/warehouse quantities. Keep the stable VID association.
  const variants = Array.isArray(r.data?.variantInventories) ? r.data.variantInventories as Record<string, unknown>[] : [];
  const rows = variants.flatMap((variant) => {
    const vid = str(variant.vid);
    const inventory = Array.isArray(variant.inventory) ? variant.inventory as Record<string, unknown>[] : [];
    return inventory.map((item) => mapInventory({ ...item, vid }));
  });
  return { ok: true, data: rows };
}

/** المستودعات المتاحة تُشتقّ من جزء inventories في نتيجة CJ الخاصة بالمنتج. */
export async function getWarehouses(samplePid: string): Promise<CjResult<CjWarehouse[]>> {
  const r = await call<Record<string, unknown>>('/product/stock/getInventoryByPid', { query: { pid: samplePid } });
  if (!r.ok) return r;
  const seen = new Map<string, CjWarehouse>();
  const inventories = Array.isArray(r.data?.inventories) ? r.data.inventories as Record<string, unknown>[] : [];
  for (const inv of inventories) {
    const areaId = String(inv.areaId ?? '');
    if (areaId && !seen.has(areaId)) seen.set(areaId, { areaId, areaEnName: str(inv.areaEn ?? inv.areaEnName ?? inv.countryNameEn), countryCode: str(inv.countryCode) });
  }
  return { ok: true, data: [...seen.values()] };
}

/** احتساب الشحن إلى السعودية (endCountryCode='SA'). */
/** رمز بريدي سعودي افتراضي (الرياض) لحساب الشحن — كثير من مسارات CJ إلى السعودية
 *  تُعيد نتائج فارغة بلا رمز بريدي للوجهة، فنمرّر رمزاً صالحاً افتراضياً للتقدير. */
export const DEFAULT_KSA_DEST_ZIP = '11564';

export async function calculateFreightToKSA(products: { vid: string; quantity: number }[], zip?: string, originCountry = 'CN'): Promise<CjResult<CjFreightOption[]>> {
  const destZip = (zip && zip.trim()) || DEFAULT_KSA_DEST_ZIP;
  const r = await call<unknown>('/logistic/freightCalculate', {
    method: 'POST',
    body: { startCountryCode: originCountry, endCountryCode: 'SA', zip: destZip, products: products.map((p) => ({ vid: p.vid, quantity: p.quantity })) },
  });
  if (!r.ok) return r;
  // بعض استجابات CJ تُغلّف قائمة الشحن داخل كائن (data.freightList/list/…) بدل مصفوفة مباشرة؛
  // نقبل الحالتين. وإن بقيت فارغة نُسجّل البنية الخام (بلا أسرار) لنعرف اسم الحقل الفعلي.
  const raw = r.data as unknown;
  const list = Array.isArray(raw) ? raw
    : Array.isArray((raw as Record<string, unknown>)?.freightList) ? (raw as { freightList: unknown[] }).freightList
    : Array.isArray((raw as Record<string, unknown>)?.list) ? (raw as { list: unknown[] }).list
    : Array.isArray((raw as Record<string, unknown>)?.data) ? (raw as { data: unknown[] }).data
    : [];
  if (!list.length) console.warn(`[cj] freightCalculate empty start=${originCountry} end=SA zip=${destZip} vids=${products.map(p => p.vid).join(',').slice(0, 120)} raw=${JSON.stringify(raw).slice(0, 400)}`);
  return { ok: true, data: list.map((o) => mapFreight(o as Record<string, unknown>)) };
}

export async function getTracking(trackNumber: string): Promise<CjResult<CjTrack>> {
  const id=trackNumber.trim();
  if(!id||id.length>200)return {ok:false,error:'cj_tracking_number_invalid'};
  const r = await call<Record<string, unknown>[]>('/logistic/trackInfo', { query: { trackNumber:id } });
  if (!r.ok) return r;
  const matches=Array.isArray(r.data)?r.data.filter(d=>d&&d.trackingNumber===id):[];
  if(matches.length!==1)return {ok:false,error:'cj_tracking_identity_unavailable'};
  const d=matches[0];
  const details = Array.isArray(d.tracks) ? (d.tracks as Record<string, unknown>[]).map((t) => ({ date: str(t.date), description: str(t.description) })) : [];
  return { ok: true, data: { trackNumber:id, logisticName: str(d.logisticName), trackStatus: str(d.trackingStatus), lastMileCarrier:str(d.lastMileCarrier),lastTrackNumber:str(d.lastTrackNumber),details } };
}

/* ------------------------- استعلام حالة الطلب (قراءة فقط) ------------------------- */

/**
 * تفاصيل طلب CJ (getOrderDetail) — قراءة فقط، للاستطلاع الدوري وتطبيق الحالة.
 * لا تمسّ المال؛ لا تخضع لحارسَي الشراء (الاستعلام عن طلب قائم آمن دائماً).
 */
export async function getCjOrderDetail(orderId: string): Promise<CjResult<CjOrderDetail>> {
  const id = String(orderId || '').trim();
  if (!id) return { ok: false, error: 'order_id_required' };
  const r = await call<Record<string, unknown>>('/shopping/order/getOrderDetail', { query: { orderId: id } });
  if (!r.ok) return r;
  const d = r.data || {};
  return {
    ok: true,
    data: {
      orderId: String(d.orderId ?? id),
      orderNum: str(d.orderNum ?? d.orderNumber),
      cjOrderId: str(d.cjOrderId),
      orderStatus: str(d.orderStatus),
      subStatus: str(d.subStatus),
      trackNumber: str(d.trackNumber),
      proof: d,
    },
  };
}

/** رصيد محفظة CJ (getBalance) — قراءة فقط. للعرض والمطابقة قبل الدفع. */
export async function getCjBalance(): Promise<CjResult<CjBalance>> {
  const r = await call<Record<string, unknown>>('/shopping/pay/getBalance', {});
  if (!r.ok) return r;
  const d = r.data || {};
  const amount = d.amount === null || d.amount === undefined || typeof d.amount==='string'&&!/^\d+(?:\.\d{1,2})?$/.test(d.amount) ? null : num(d.amount);
  if(amount === null || amount < 0 || !Number.isSafeInteger(Math.round(amount*100)) || Math.abs(amount*100-Math.round(amount*100))>0.000001) return {ok:false,error:'balance_response_invalid'};
  return {
    ok: true,
    data: {
      amountUsd: amount,
      bonusUsd: num(d.noWithdrawalAmount) ?? 0,
      frozenUsd: num(d.freezeAmount) ?? 0,
    },
  };
}

/* ------------------------- الطلبات والدفع (مقفلة بحارسين) ------------------------- */

/** هل يُسمح بعملية حيّة تمسّ المال لدى CJ؟ حارسان معاً: مفتاح الشراء + متغيّر البيئة. */
async function liveOrdersAllowed(): Promise<boolean> {
  const config = await getCommerceConfig().catch(() => null);
  const liveAllowed = process.env.SUPPLIER_ALLOW_LIVE_ORDERS === 'true';
  return !!config?.purchasingEnabled && liveAllowed;
}

/**
 * P0 blockade for createOrderV3, wallet payment and confirmation.
 * No supplier mutation until atomic amount protection, reconciliation,
 * acceptance and inventory allocation are documented and verified.
 * Configuration alone cannot remove this safeguard. See docs/cj-purchase-commitment.md.
 */
async function purchaseCommitmentBlock(): Promise<{ ok: false; error: string }> {
  if (!(await liveOrdersAllowed())) return { ok: false, error: 'cj_purchasing_disabled' };
  return { ok: false, error: 'cj_purchase_commitment_unverified' };
}
export async function createCjOrder(_input: Record<string, unknown>): Promise<CjResult<CjCreatedOrder>> {
  return purchaseCommitmentBlock();
}
export async function payCjOrderBalance(_input: { orderId?: string; shipmentOrderId?: string; payId?: string }): Promise<CjResult<{ paid: true }>> {
  return purchaseCommitmentBlock();
}
export async function confirmCjOrder(_orderId: string): Promise<CjResult<{ confirmed: true }>> {
  return purchaseCommitmentBlock();
}

/** Worker-only transport. A durable claim is required by the caller before each mutation. */
export async function cjFulfillmentTransport(path: string, body?: unknown): Promise<CjResult<Record<string, unknown>>> {
  const reads = ['/shopping/order/getOrderDetail', '/shopping/wallet/billingHistory'];
  const writes = ['/shopping/order/createOrderV3', '/shopping/order/addCart', '/shopping/order/addCartConfirm', '/shopping/order/saveGenerateParentOrder', '/shopping/pay/payBalanceV2'];
  if (!reads.includes(path) && !writes.includes(path)) return {ok:false,error:'unsupported_fulfillment_endpoint'};
  if (writes.includes(path)) {
    if (!(await cjPrivateFinancialOperationsAllowed())) return {ok:false,error:'cj_fulfillment_disabled'};
    if (path.endsWith('createOrderV3') && (body as Record<string,unknown>)?.payType !== 3) return {ok:false,error:'unpaid_create_required'};
  }
  if (path.endsWith('getOrderDetail')) return call(path,{query:body as Record<string,string>});
  return call(path,{method:'POST',body});
}

export async function getCjBillingHistory(orderCode: string, pageNum = 1): Promise<CjResult<Record<string,unknown>>> {
  if (!orderCode.trim()) return {ok:false,error:'order_code_required'};
  return cjFulfillmentTransport('/shopping/wallet/billingHistory',{orderId:orderCode,pageNum,pageSize:100,tradeTypeList:[1]});
}

/** Physical warehouse identity maps to inventory area/country; an areaId is not storageId. */
export async function getCjWarehouseDetail(storageId:string):Promise<CjResult<Record<string,unknown>>> {
  if(!storageId.trim())return {ok:false,error:'storage_id_required'};
  return call('/warehouse/detail',{query:{id:storageId}});
}
/* ------------------------- محوّلات ------------------------- */

function str(v: unknown): string | null { return typeof v === 'string' && v.trim() ? v : null; }
function identifier(v: unknown): string | null {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : str(v);
}
function num(v: unknown): number | null { const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN; return Number.isFinite(n) ? n : null; }
/** سعر CJ قد يأتي رقماً أو نصاً أو نطاقاً «a--b» / «a-b» — نأخذ أدنى قيمة صالحة. */
function parsePrice(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  const first = s.split(/--|~|,|\s|to/i)[0].split('-')[0].trim();
  const n = Number(first.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapSummary(p: Record<string, unknown>): CjProductSummary {
  const productImages = Array.isArray(p.productImageSet)
    ? p.productImageSet.filter((value): value is string => typeof value === 'string' && !!value.trim())
    : typeof p.productImageSet === 'string' ? p.productImageSet.split(',').map(value => value.trim()).filter(Boolean) : [];
  const productImage = str(p.productImage) || str(p.bigImage) || str(p.bigimg) || str(p.img) || productImages[0] || null;
  return {
    pid: String(p.pid ?? p.productId ?? p.id ?? ''),
    productName: String(p.productNameEn ?? p.productName ?? p.nameEn ?? p.nameen ?? ''),
    productSku: String(p.productSku ?? p.sku ?? ''),
    sellPrice: parsePrice(p.sellPrice ?? p.sellprice ?? p.productPrice ?? p.price),
    productImage,
    productImages,
    categoryName: str(p.categoryName) || str(p.category) || str(p.categoryEn),
  };
}
function mapVariant(v: Record<string, unknown>): CjVariant {
  return {
    vid: String(v.vid ?? v.variantId ?? v.id ?? ''),
    variantSku: String(v.variantSku ?? v.sku ?? ''),
    variantName: str(v.variantNameEn) || str(v.variantName) || str(v.nameEn) || str(v.nameen) || str(v.variantKeyEn) || str(v.variantKey),
    variantKey: str(v.variantKeyEn) || str(v.variantKey) || str(v.variantProperty),
    variantSellPrice: parsePrice(v.variantSellPrice ?? v.sellPrice ?? v.sellprice),
    variantImage: str(v.variantImage) || str(v.bigImg) || str(v.bigimg) || str(v.img),
    variantWeight: num(v.variantWeight ?? v.weight),
    attributes: preserveCjVariantAttributes(v),
  };
}
function mapInventory(s: Record<string, unknown>): CjInventory {
  return {
    vid: String(s.vid ?? ''),
    areaId: identifier(s.areaId ?? s.storageAreaId),
    areaName: str(s.areaEn ?? s.areaEnName ?? s.countryNameEn ?? s.areaName),
    countryCode: str(s.countryCode),
    storageNum: num(s.totalInventory ?? s.storageNum ?? s.totalInventoryNum) ?? 0,
    cjInventoryQuantity: num(s.cjInventory ?? s.cjInventoryNum) ?? 0,
    verifiedWarehouse: num(s.verifiedWarehouse),
  };
}
function mapFreight(o: Record<string, unknown>): CjFreightOption {
  return {
    logisticName: String(o.logisticName ?? o.logisticAisle ?? ''),
    logisticPrice: num(o.logisticPrice) ?? Number.NaN,
    logisticAging: str(o.logisticAging),
    logisticPriceCn: num(o.logisticPriceCn),
    taxesFeeUsd: num(o.taxesFee),
    clearanceFeeUsd: num(o.clearanceOperationFee),
    totalPostageFeeUsd: num(o.totalPostageFee),
  };
}
