import { describe, expect, it } from 'vitest';
import { computePrice, DEFAULT_MARGIN_BPS } from '@/lib/cj/pricing';

describe('CJ pricing — cost breakdown + admin margin (not hardcoded final price)', () => {
  it('derives profit and sale price from cost + shipping + other and margin', () => {
    const p = computePrice(2000, 1500, 0, 3000); // 20 + 15 ر.س, 30%
    expect(p.supplierCostMinor).toBe(2000);
    expect(p.shippingCostMinor).toBe(1500);
    expect(p.profitMinor).toBe(1050); // ceil(3500 * 30%)
    expect(p.salePriceMinor).toBe(4550);
    expect(p.currency).toBe('SAR');
  });

  it('default margin is 30% and stored separately, not fixed in output', () => {
    expect(DEFAULT_MARGIN_BPS).toBe(3000);
    const zero = computePrice(1000, 0, 0, 0);
    expect(zero.profitMinor).toBe(0);
    expect(zero.salePriceMinor).toBe(1000);
  });

  it('clamps negatives and rounds costs', () => {
    const p = computePrice(-50, 10.7, 0, 2000);
    expect(p.supplierCostMinor).toBe(0);
    expect(p.shippingCostMinor).toBe(11);
    expect(p.salePriceMinor).toBe(p.supplierCostMinor + p.shippingCostMinor + p.otherCostsMinor + p.profitMinor);
  });
});
