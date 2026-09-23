import 'server-only';
import { listProducts as cjList, getProduct as cjGet, getInventoryByPid as cjInv } from './client';
import type { CjResult, CjProductSummary, CjProductDetail, CjInventory, CjSampleProduct } from './types';

/**
 * عيّنة قراءة تفصيلية لمنتجات CJ (قراءة فقط، لا طلب ولا دفع ولا تعديل).
 * لكل منتج: PID/SKU/الاسم/التصنيف/السعر/الصور + المتغيّرات (vid/sku/اسم/سعر/وزن/مخزون)
 * + إجمالي المخزون. محدودة العدد (≤10) لتفادي حدود معدّل CJ. تعيد جزئياً ما نجح.
 */
export type CjSampleDeps = {
  listProducts?: (page: number, size: number) => Promise<CjResult<CjProductSummary[]>>;
  getProduct?: (pid: string) => Promise<CjResult<CjProductDetail>>;
  getInventoryByPid?: (pid: string) => Promise<CjResult<CjInventory[]>>;
};

export async function sampleCjProducts(limit = 3, deps: CjSampleDeps = {}): Promise<CjResult<CjSampleProduct[]>> {
  const listProducts = deps.listProducts ?? cjList;
  const getProduct = deps.getProduct ?? cjGet;
  const getInventoryByPid = deps.getInventoryByPid ?? cjInv;
  const size = Math.max(1, Math.min(10, Math.floor(limit) || 3));

  const list = await listProducts(1, size);
  if (!list.ok) return list;

  const out: CjSampleProduct[] = [];
  for (const p of list.data.slice(0, size)) {
    if (!p.pid) continue;
    const [detail, inv] = await Promise.all([getProduct(p.pid), getInventoryByPid(p.pid)]);
    const stockByVid = new Map<string, number>();
    if (inv.ok) for (const row of inv.data) if (row.vid) stockByVid.set(row.vid, (stockByVid.get(row.vid) ?? 0) + (row.storageNum || 0));
    const variants = detail.ok
      ? detail.data.variants.map((v) => ({ vid: v.vid, sku: v.variantSku, name: v.variantName, priceUsd: v.variantSellPrice, weight: v.variantWeight, stock: stockByVid.has(v.vid) ? stockByVid.get(v.vid)! : null }))
      : [];
    const images = [...new Set([p.productImage, ...(detail.ok ? detail.data.variants.map((v) => v.variantImage) : [])].filter((s): s is string => !!s))];
    out.push({
      pid: p.pid, sku: p.productSku, name: p.productName, category: p.categoryName, priceUsd: p.sellPrice,
      images, variants, totalStock: [...stockByVid.values()].reduce((a, b) => a + b, 0),
    });
  }
  return { ok: true, data: out };
}
