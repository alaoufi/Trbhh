import { describe, expect, it, vi } from 'vitest';
import { createCjDetailReads } from '@/lib/cj/detail-reads';
import { sampleOneCjProduct } from '@/lib/cj/sample';
import { verifyCjVariantForSaudi } from '@/lib/cj/availability';
import type { CjProductDetail, CjInventory } from '@/lib/cj/types';

const product: CjProductDetail = { pid: 'P1', productName: 'Product', productSku: 'SKU', sellPrice: 12, productImage: null, categoryName: null, description: null, variants: [{ vid: 'V1', variantSku: 'SKU-1', variantName: 'Blue', variantSellPrice: 12, variantImage: null, variantWeight: 100 }] };
const inventory: CjInventory[] = [{ vid: 'V1', areaId: '1', areaName: 'China', countryCode: 'CN', storageNum: 8 }];

describe('CJ detail reads share fresh request-scoped supplier responses', () => {
  it('uses one product and one PID stock read while keeping selected stock and freight live', async () => {
    const getProduct = vi.fn(async () => ({ ok: true as const, data: product }));
    const getInventoryByPid = vi.fn(async () => ({ ok: true as const, data: inventory }));
    const selectedStock = vi.fn(async () => ({ ok: true as const, data: inventory }));
    const freight = vi.fn(async () => ({ ok: true as const, data: [{ logisticName: 'Route', logisticPrice: 3, logisticAging: '5-8', logisticPriceCn: null }] }));
    const reads = createCjDetailReads('P1', { getProduct, getInventoryByPid });
    const sample = await sampleOneCjProduct('P1', reads);
    await reads.getInventoryByPid();
    const check = await verifyCjVariantForSaudi('P1', product.variants[0], 1, { getVariants: reads.getVariants, getInventoryByVid: selectedStock, calculateFreight: freight });
    expect(sample).toMatchObject({ ok: true, data: { totalStock: 8 } });
    expect(check).toMatchObject({ status: 'available', stockQuantity: 8 });
    expect(getProduct).toHaveBeenCalledExactlyOnceWith('P1');
    expect(getInventoryByPid).toHaveBeenCalledExactlyOnceWith('P1');
    expect(selectedStock).toHaveBeenCalledExactlyOnceWith('V1');
    expect(freight).toHaveBeenCalledExactlyOnceWith([{ vid: 'V1', quantity: 1 }], undefined, 'CN');
  });

  it('deduplicates overlapping reads, but a new request fetches fresh data', async () => {
    const getProduct = vi.fn(async () => ({ ok: true as const, data: product }));
    const getInventoryByPid = vi.fn(async () => ({ ok: true as const, data: inventory }));
    const first = createCjDetailReads('P1', { getProduct, getInventoryByPid });
    await Promise.all([first.getProduct(), first.getProduct(), first.getVariants(), first.getInventoryByPid(), first.getInventoryByPid()]);
    expect(getProduct).toHaveBeenCalledTimes(1);
    expect(getInventoryByPid).toHaveBeenCalledTimes(1);
    await createCjDetailReads('P1', { getProduct, getInventoryByPid }).getProduct();
    expect(getProduct).toHaveBeenCalledTimes(2);
  });

  it('propagates a product failure instead of inventing an empty variant success', async () => {
    const failure = { ok: false as const, error: 'supplier_unavailable' };
    const reads = createCjDetailReads('P1', { getProduct: async () => failure });
    expect(await reads.getVariants()).toEqual(failure);
  });
});
