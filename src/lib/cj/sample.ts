import 'server-only';
import { listProducts as cjList, getProduct as cjGet, getInventoryByVid as cjInvVid } from './client';
import type { CjResult, CjProductSummary, CjProductDetail, CjInventory, CjSampleProduct } from './types';

/**
 * عيّنة قراءة تفصيلية لمنتجات CJ (قراءة فقط، لا طلب ولا دفع ولا تعديل).
 * لكل منتج: PID/SKU/الاسم/التصنيف/السعر/الصور + المتغيّرات (vid/sku/اسم/سعر/وزن/مخزون)
 * + إجمالي المخزون. المخزون يُجلب لكل متغيّر (vid) لأن CJ v2 لا يدعم queryByPid.
 * كل طلبات CJ مُنظَّمة داخلياً (طلب/ثانية) لتفادي حدّ المعدّل. عدد المنتجات ≤10،
 * وعدد المتغيّرات المفحوصة للمخزون محدود لكل منتج. تعيد جزئياً ما نجح.
 */
const MAX_VARIANTS_STOCK = 6;

export type CjSampleDeps = {
  listProducts?: (page: number, size: number) => Promise<CjResult<CjProductSummary[]>>;
  getProduct?: (pid: string) => Promise<CjResult<CjProductDetail>>;
  getInventoryByVid?: (vid: string) => Promise<CjResult<CjInventory[]>>;
};

/** تفاصيل منتج واحد بمعرّفه (getProduct + مخزون لكل متغيّر) — للعرض عند الطلب. */
export async function sampleOneCjProduct(pid: string, deps: CjSampleDeps = {}): Promise<CjResult<CjSampleProduct>> {
  const getProduct = deps.getProduct ?? cjGet;
  const getInventoryByVid = deps.getInventoryByVid ?? cjInvVid;
  const detail = await getProduct(pid);
  if (!detail.ok) return detail;
  const d = detail.data;
  const rawVariants = Array.isArray(d.variants) ? d.variants : [];
  const stockByVid = new Map<string, number>();
  for (const v of rawVariants.slice(0, MAX_VARIANTS_STOCK)) {
    if (!v.vid) continue;
    const inv = await getInventoryByVid(v.vid);
    if (inv.ok) stockByVid.set(v.vid, inv.data.reduce((a, r) => a + (r.storageNum || 0), 0));
  }
  const variants = rawVariants.map((v) => ({ vid: v.vid, sku: v.variantSku, name: v.variantName, priceUsd: v.variantSellPrice, weight: v.variantWeight, stock: stockByVid.has(v.vid) ? stockByVid.get(v.vid)! : null }));
  const images = [...new Set([d.productImage, ...rawVariants.map((v) => v.variantImage)].filter((s): s is string => !!s))];
  return { ok: true, data: { pid: d.pid, sku: d.productSku, name: d.productName, category: d.categoryName, priceUsd: d.sellPrice, images, variants, totalStock: [...stockByVid.values()].reduce((a, b) => a + b, 0) } };
}

export async function sampleCjProducts(limit = 3, deps: CjSampleDeps = {}): Promise<CjResult<CjSampleProduct[]>> {
  const listProducts = deps.listProducts ?? cjList;
  const getProduct = deps.getProduct ?? cjGet;
  const getInventoryByVid = deps.getInventoryByVid ?? cjInvVid;
  const size = Math.max(1, Math.min(10, Math.floor(limit) || 3));

  const list = await listProducts(1, size);
  if (!list.ok) return list;

  const out: CjSampleProduct[] = [];
  for (const p of list.data.slice(0, size)) {
    if (!p.pid) continue;
    const detail = await getProduct(p.pid);
    const rawVariants = detail.ok ? detail.data.variants : [];
    const stockByVid = new Map<string, number>();
    for (const v of rawVariants.slice(0, MAX_VARIANTS_STOCK)) {
      if (!v.vid) continue;
      const inv = await getInventoryByVid(v.vid);
      if (inv.ok) stockByVid.set(v.vid, inv.data.reduce((a, r) => a + (r.storageNum || 0), 0));
    }
    const variants = rawVariants.map((v) => ({ vid: v.vid, sku: v.variantSku, name: v.variantName, priceUsd: v.variantSellPrice, weight: v.variantWeight, stock: stockByVid.has(v.vid) ? stockByVid.get(v.vid)! : null }));
    const images = [...new Set([p.productImage, ...rawVariants.map((v) => v.variantImage)].filter((s): s is string => !!s))];
    out.push({
      pid: p.pid, sku: p.productSku, name: p.productName, category: p.categoryName, priceUsd: p.sellPrice,
      images, variants, totalStock: [...stockByVid.values()].reduce((a, b) => a + b, 0),
    });
  }
  return { ok: true, data: out };
}
