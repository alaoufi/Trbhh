import { describe, expect, it, vi } from 'vitest';
import { importCjProductByPid, type CjImportDeps } from '@/lib/cj/import';
import type { CjResult, CjProductDetail } from '@/lib/cj/types';
import type { UpsertCjInput } from '@/lib/cj/mapping';

// توحيد التصنيف: نعزل مصنّف الإعلانات وقائمة الأقسام عن الشبكة/القاعدة في الاختبار.
const catState = vi.hoisted(() => ({ categories: [] as { id: number; name: string }[], classifyId: 0 }));
vi.mock('@/lib/data', () => ({ getCategories: async () => catState.categories }));
vi.mock('@/lib/classifier', () => ({ classifyAdText: async () => ({ categoryId: catState.classifyId, confidence: 0.5, matched: [] }) }));

const detail = (pid: string, sellPrice: number | null = 10): CjProductDetail => ({
  pid, productName: `اسم ${pid}`, productSku: `SKU-${pid}`, sellPrice, productImage: `https://img/${pid}.jpg`, categoryName: 'ملابس', description: 'وصف', variants: [],
});
function harness(over: Partial<CjImportDeps> = {}) {
  const upserts: UpsertCjInput[] = [];
  const deps: CjImportDeps = {
    getProduct: async (pid) => ({ ok: true, data: detail(pid) } as CjResult<CjProductDetail>),
    settings: async () => ({ enabled: false, pageSize: 20, maxPages: 3, usdToSarX100: 375, shippingMinor: 500 }),
    marginBps: async () => 3000,
    upsert: async (input) => { upserts.push(input); },
    translate: async () => 'عنوان مترجم', // بلا شبكة في الاختبار
    ...over,
  };
  return { deps, upserts };
}

describe('CJ selective import → staging with cost×FX + shipping + margin', () => {
  it('stores API declared dimensions with dedicated query variants for future imports',async()=>{const v={vid:'v1',variantSku:'S1',variantName:'Ignored',variantKey:'Purple-US 12.5',variantSellPrice:10,variantImage:null,variantWeight:470};const {deps,upserts}=harness({getProduct:async pid=>({ok:true,data:{...detail(pid),optionSchema:['Color','Size'],variants:[v]}}),getVariants:async()=>({ok:true,data:[v]})});await importCjProductByPid('p',deps);expect(JSON.parse(upserts[0].detailsJson!).variants[0]).toMatchObject({vid:'v1',optionKey:'Purple-US 12.5',optionSchema:['Color','Size'],priceUsd:10});});
  it('imports one product by PID and computes the sale price', async () => {
    const { deps, upserts } = harness();
    const r = await importCjProductByPid('2609231107131613900', deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 10$ × 3.75 = 3750 هللة + 500 شحن = 4250 أساس؛ ربح 30% = 1275؛ بيع 5525
    expect(r.supplierCostMinor).toBe(3750);
    expect(r.salePriceMinor).toBe(5525);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ cjProductId: '2609231107131613900', cjSku: 'SKU-2609231107131613900' });
    expect(upserts[0].price.salePriceMinor).toBe(5525);
  });

  it('auto-assigns the matching trbhh category on import (unified taxonomy)', async () => {
    catState.categories = [{ id: 7, name: 'ملابس رجالية' }];
    catState.classifyId = 7;
    const { deps, upserts } = harness();
    await importCjProductByPid('2609231107131613900', deps);
    expect(upserts[0]).toMatchObject({ categoryId: 7, trbhhCategory: 'ملابس رجالية' });
    catState.categories = []; catState.classifyId = 0;
  });

  it('leaves the category empty when no trbhh categories are defined yet', async () => {
    catState.categories = []; catState.classifyId = 7;
    const { deps, upserts } = harness();
    await importCjProductByPid('2609231107131613900', deps);
    expect(upserts[0].categoryId ?? null).toBeNull();
    expect(upserts[0].trbhhCategory).toBe('');
    catState.classifyId = 0;
  });

  it('rejects a malformed PID without calling CJ or writing', async () => {
    const getProduct = vi.fn();
    const { deps, upserts } = harness({ getProduct });
    expect(await importCjProductByPid('bad id!', deps)).toEqual({ ok: false, error: 'bad_pid' });
    expect(getProduct).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });

  it('propagates a CJ read failure and imports nothing', async () => {
    const { deps, upserts } = harness({ getProduct: async () => ({ ok: false, error: 'cj_http_500', status: 500 }) });
    expect(await importCjProductByPid('123456', deps)).toEqual({ ok: false, error: 'cj_http_500' });
    expect(upserts).toHaveLength(0);
  });

  it('passes create-only authorization to the atomic database upsert', async () => {
    const upsert = vi.fn();
    const { deps } = harness({ upsert, createOnly: true });
    expect((await importCjProductByPid('CJ4', deps)).ok).toBe(true);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ cjProductId: 'CJ4' }), { createOnly: true });
  });
});
