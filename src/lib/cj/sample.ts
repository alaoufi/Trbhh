import 'server-only';
import { listProducts as cjList, getProduct as cjGet, getInventoryByPid as cjInvPid } from './client';
import type { CjResult, CjProductSummary, CjProductDetail, CjInventory, CjSampleProduct } from './types';
import { collectCjProductImages } from './media';

/**
 * عيّنة قراءة تفصيلية لمنتجات CJ (قراءة فقط، لا طلب ولا دفع ولا تعديل).
 * لكل منتج: PID/SKU/الاسم/التصنيف/السعر/الصور + المتغيّرات (vid/sku/اسم/سعر/وزن/مخزون)
 * + إجمالي المخزون. يُجلب مخزون المنتج دفعةً واحدة مع الحفاظ على معرّف كل متغيّر.
 * كل طلبات CJ مُنظَّمة داخلياً (طلب/ثانية) لتفادي حدّ المعدّل. عدد المنتجات ≤10.
 * تبقى الكمية غير المعروفة null؛ هذه بيانات عرض وليست موافقة شراء.
 */
export type CjSampleDeps = {
  listProducts?: (page: number, size: number) => Promise<CjResult<CjProductSummary[]>>;
  getProduct?: (pid: string) => Promise<CjResult<CjProductDetail>>;
  /** Legacy dependency shape retained for callers; samples now use one PID batch. */
  getInventoryByVid?: (vid: string) => Promise<CjResult<CjInventory[]>>;
  getInventoryByPid?: (pid: string) => Promise<CjResult<CjInventory[]>>;
};

function buildSample(d: CjProductDetail, inventory: CjInventory[]): CjSampleProduct {
  const rawVariants = Array.isArray(d.variants) ? d.variants : [];
  const vids = new Set(rawVariants.map(v => v.vid));
  const stockByVid = new Map<string, number>();
  for (const row of inventory) {
    if (!vids.has(row.vid) || !Number.isSafeInteger(row.storageNum) || row.storageNum < 0) continue;
    const total = (stockByVid.get(row.vid) ?? 0) + row.storageNum;
    if (Number.isSafeInteger(total)) stockByVid.set(row.vid, total);
  }
  const variants = rawVariants.map(v => ({ vid: v.vid, sku: v.variantSku, name: v.variantName, priceUsd: v.variantSellPrice, weight: v.variantWeight, stock: stockByVid.get(v.vid) ?? null }));
  return { pid: d.pid, sku: d.productSku, name: d.productName, category: d.categoryName, priceUsd: d.sellPrice, images: collectCjProductImages(d), variants, totalStock: [...stockByVid.values()].reduce((a, b) => a + b, 0) };
}

/** تفاصيل منتج واحد: طلب تفاصيل وطلب مخزون مجمّع، بلا استعلام لكل خيار. */
export async function sampleOneCjProduct(pid: string, deps: CjSampleDeps = {}): Promise<CjResult<CjSampleProduct>> {
  const getProduct = deps.getProduct ?? cjGet;
  const getInventoryByPid = deps.getInventoryByPid ?? cjInvPid;
  const detail = await getProduct(pid);
  if (!detail.ok) return detail;
  const d = detail.data;
  const inv = d.variants?.length ? await getInventoryByPid(pid).catch(() => null) : null;
  return { ok: true, data: buildSample(d, inv?.ok ? inv.data : []) };
}

export async function sampleCjProducts(limit = 3, deps: CjSampleDeps = {}): Promise<CjResult<CjSampleProduct[]>> {
  const listProducts = deps.listProducts ?? cjList;
  const getProduct = deps.getProduct ?? cjGet;
  const getInventoryByPid = deps.getInventoryByPid ?? cjInvPid;
  const size = Math.max(1, Math.min(10, Math.floor(limit) || 3));

  const list = await listProducts(1, size);
  if (!list.ok) return list;

  const out: CjSampleProduct[] = [];
  for (const p of list.data.slice(0, size)) {
    if (!p.pid) continue;
    const detail = await getProduct(p.pid);
    const d = detail.ok ? detail.data : { ...p, description: null, variants: [] };
    const inv = d.variants?.length ? await getInventoryByPid(p.pid).catch(() => null) : null;
    out.push(buildSample(d, inv?.ok ? inv.data : []));
  }
  return { ok: true, data: out };
}
