import { describe, expect, it, vi } from 'vitest';
import { sampleCjProducts, sampleOneCjProduct, type CjSampleDeps } from '@/lib/cj/sample';
import type { CjResult, CjProductSummary, CjProductDetail, CjInventory } from '@/lib/cj/types';

const summary = (pid: string): CjProductSummary => ({ pid, productName: `اسم ${pid}`, productSku: `SKU-${pid}`, sellPrice: 12.5, productImage: `https://img/${pid}.jpg`, categoryName: 'إلكترونيات' });
const detail = (pid: string): CjProductDetail => ({ ...summary(pid), description: 'وصف', variants: [
  { vid: `${pid}-A`, variantSku: `V-${pid}-A`, variantName: 'أحمر', variantSellPrice: 12.5, variantImage: `https://img/${pid}-A.jpg`, variantWeight: 120 },
  { vid: `${pid}-B`, variantSku: `V-${pid}-B`, variantName: 'أزرق', variantSellPrice: 13, variantImage: null, variantWeight: 130 },
] });
// مخزون لكل متغيّر (vid): A موزّع على منطقتين (40+10)، B في منطقة واحدة (7).
const invByVid = (vid: string): CjInventory[] => vid.endsWith('-A')
  ? [{ vid, areaId: 'CN', areaName: 'China', countryCode: 'CN', storageNum: 40 }, { vid, areaId: 'US', areaName: 'US', countryCode: 'US', storageNum: 10 }]
  : [{ vid, areaId: 'CN', areaName: 'China', countryCode: 'CN', storageNum: 7 }];

const deps = (over: Partial<CjSampleDeps> = {}): CjSampleDeps => ({
  listProducts: async () => ({ ok: true, data: [summary('1'), summary('2'), summary('3'), summary('4')] } as CjResult<CjProductSummary[]>),
  getProduct: async (pid) => ({ ok: true, data: detail(pid) }),
  getInventoryByVid: async (vid) => ({ ok: true, data: invByVid(vid) }),
  getInventoryByPid: async (pid) => ({ ok: true, data: [...invByVid(`${pid}-A`), ...invByVid(`${pid}-B`)] }),
  ...over,
});

describe('CJ read-only detailed sample (PID/SKU/name/images/price/variants/weight/stock/category)', () => {
  it('reads all variant stock in one PID request without per-variant requests', async () => {
    const batch = vi.fn(async () => ({ ok: true as const, data: [...invByVid('1-A'), ...invByVid('1-B')] }));
    const perVariant = vi.fn(async () => ({ ok: true as const, data: [] }));
    const result = await sampleOneCjProduct('1', deps({ getInventoryByPid: batch, getInventoryByVid: perVariant }));
    expect(batch).toHaveBeenCalledExactlyOnceWith('1');
    expect(perVariant).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, data: { totalStock: 57, variants: [{ stock: 50 }, { stock: 7 }] } });
  });

  it('keeps missing or invalid batch stock unknown and excludes unrelated VIDs', async () => {
    const result = await sampleOneCjProduct('1', deps({ getInventoryByPid: async () => ({ ok: true, data: [
      ...invByVid('1-A'), { ...invByVid('1-B')[0], storageNum: Number.NaN }, ...invByVid('OTHER-A'),
    ] }) }));
    expect(result).toMatchObject({ ok: true, data: { totalStock: 50, variants: [{ stock: 50 }, { stock: null }] } });
  });

  it('retains details with unknown stock after batch failure without multiplying requests', async () => {
    const perVariant = vi.fn(async () => ({ ok: true as const, data: [] }));
    const result = await sampleOneCjProduct('1', deps({ getInventoryByPid: async () => ({ ok: false, error: 'supplier_unavailable' }), getInventoryByVid: perVariant }));
    expect(result).toMatchObject({ ok: true, data: { totalStock: 0, variants: [{ stock: null }, { stock: null }] } });
    expect(perVariant).not.toHaveBeenCalled();
  });
  it('assembles all requested fields and aggregates stock per variant (by vid)', async () => {
    const r = await sampleCjProducts(3, deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(3);
    const p = r.data[0];
    expect(p).toMatchObject({ pid: '1', sku: 'SKU-1', name: 'اسم 1', category: 'إلكترونيات', priceUsd: 12.5 });
    expect(p.images).toContain('https://img/1.jpg');
    expect(p.images).toContain('https://img/1-A.jpg');
    expect(p.variants.find((v) => v.vid === '1-A')).toMatchObject({ sku: 'V-1-A', weight: 120, stock: 50 });
    expect(p.variants.find((v) => v.vid === '1-B')).toMatchObject({ weight: 130, stock: 7 });
    expect(p.totalStock).toBe(57);
  });

  it('caps the sample size and never exceeds 10', async () => {
    const r = await sampleCjProducts(999, deps({ listProducts: async () => ({ ok: true, data: Array.from({ length: 20 }, (_, i) => summary(String(i + 1))) }) }));
    expect(r.ok && r.data.length <= 10).toBe(true);
  });

  it('propagates a list failure and degrades gracefully when detail/stock fail', async () => {
    expect(await sampleCjProducts(3, deps({ listProducts: async () => ({ ok: false, error: 'cj_http_401', status: 401 }) }))).toEqual({ ok: false, error: 'cj_http_401', status: 401 });
    const r = await sampleCjProducts(1, deps({ getProduct: async () => ({ ok: false, error: 'cj_http_500' }), getInventoryByVid: async () => ({ ok: false, error: 'cj_http_500' }) }));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.data[0].variants).toEqual([]); expect(r.data[0].totalStock).toBe(0); expect(r.data[0].pid).toBe('1'); }
  });
});
