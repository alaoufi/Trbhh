import { describe, expect, it, vi } from 'vitest';
import { syncCjCatalog, type CjSyncSettings, type CjSyncDeps } from '@/lib/cj/sync';
import type { CjProductSummary, CjResult } from '@/lib/cj/types';
import type { UpsertCjInput } from '@/lib/cj/mapping';

const settings = (over: Partial<CjSyncSettings> = {}): CjSyncSettings => ({
  enabled: true, pageSize: 2, maxPages: 5, usdToSarX100: 375, shippingMinor: 0, ...over,
});
const product = (pid: string, sellPrice: number | null = 10): CjProductSummary => ({
  pid, productName: `اسم ${pid}`, productSku: `SKU-${pid}`, sellPrice, productImage: `https://img/${pid}.jpg`, categoryName: null,
});
function harness(pages: CjResult<CjProductSummary[]>[], over: Partial<CjSyncSettings> = {}) {
  const upserts: UpsertCjInput[] = [];
  const deps: CjSyncDeps = {
    configured: true,
    settings: async () => settings(over),
    marginBps: async () => 3000,
    listProducts: vi.fn(async (page: number) => pages[page - 1] ?? ({ ok: true, data: [] } as CjResult<CjProductSummary[]>)),
    upsert: async (input) => { upserts.push(input); },
  };
  return { deps, upserts };
}

describe('CJ catalog sync — gated, paginated, cost→margin pricing into cj_products', () => {
  it('refuses when CJ is not configured (no network)', async () => {
    const r = await syncCjCatalog({ deps: { configured: false } });
    expect(r).toEqual({ ok: false, error: 'cj_not_configured' });
  });

  it('respects the scheduled-sync switch unless forced', async () => {
    const { deps } = harness([{ ok: true, data: [product('1')] }], { enabled: false });
    expect(await syncCjCatalog({ deps })).toEqual({ ok: false, error: 'cj_sync_disabled' });
    const forced = await syncCjCatalog({ force: true, deps });
    expect(forced.ok).toBe(true);
  });

  it('converts USD cost via the admin rate and derives sale price from the margin', async () => {
    const { deps, upserts } = harness([{ ok: true, data: [product('1', 10)] }], { pageSize: 2, shippingMinor: 500 });
    const r = await syncCjCatalog({ force: true, deps });
    expect(r).toEqual({ ok: true, imported: 1, pages: 1, skipped: 0 });
    // 10$ × 3.75 = 3750 هللة تكلفة + 500 شحن = 4250 أساس؛ ربح 30% = ceil(1275)=1275؛ بيع 5525
    expect(upserts[0].price.supplierCostMinor).toBe(3750);
    expect(upserts[0].price.shippingCostMinor).toBe(500);
    expect(upserts[0].price.profitMinor).toBe(1275);
    expect(upserts[0].price.salePriceMinor).toBe(5525);
    expect(upserts[0].cjProductId).toBe('1');
  });

  it('paginates until a short page and counts pages', async () => {
    const { deps, upserts } = harness([
      { ok: true, data: [product('1'), product('2')] }, // full page (size 2) → continue
      { ok: true, data: [product('3')] },               // short page → stop
    ], { pageSize: 2, maxPages: 5 });
    const r = await syncCjCatalog({ force: true, deps });
    expect(r).toEqual({ ok: true, imported: 3, pages: 2, skipped: 0 });
    expect(upserts.map((u) => u.cjProductId)).toEqual(['1', '2', '3']);
  });

  it('skips products with no id, and treats null/zero price as zero cost', async () => {
    const { deps, upserts } = harness([{ ok: true, data: [product('', 10), product('9', null)] }], { pageSize: 5 });
    const r = await syncCjCatalog({ force: true, deps });
    expect(r).toEqual({ ok: true, imported: 1, pages: 1, skipped: 1 });
    expect(upserts[0].price.supplierCostMinor).toBe(0);
  });

  it('fails on a first-page error but keeps earlier pages on a later error', async () => {
    const first = await syncCjCatalog({ force: true, deps: harness([{ ok: false, error: 'cj_http_401', status: 401 }]).deps });
    expect(first).toEqual({ ok: false, error: 'cj_http_401' });
    const { deps } = harness([
      { ok: true, data: [product('1'), product('2')] },
      { ok: false, error: 'cj_http_500' },
    ], { pageSize: 2, maxPages: 5 });
    expect(await syncCjCatalog({ force: true, deps })).toEqual({ ok: true, imported: 2, pages: 1, skipped: 0 });
  });
});
