import { describe, expect, it } from 'vitest';
import { parseCommerceProduct, parseStockAdjustment } from '@/lib/commerce/admin-input';
const form = (patch: Partial<Record<string, string>> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ title: 'سلعة معتمدة', price: '10.25', stock: '8', approved: '1', visible: '1', enabled: '1', ...patch })) fd.set(k, v ?? '');
  return fd;
};
describe('admin-approved goods input', () => {
  it('uses exact halalas and no automatic approval default', () => {
    expect(parseCommerceProduct(form()).priceMinor).toBe(1025);
    expect(parseCommerceProduct(form({ approved: '' })).approved).toBe(false);
  });
  it.each([{ price: '10.251' }, { price: '0' }, { stock: '-1' }, { stock: '1.5' }, { title: '' }, { adId: '-1' }])('rejects invalid %j', patch => {
    expect(() => parseCommerceProduct(form(patch))).toThrow();
  });
  it('allows draft products, zero availability, and an explicitly selected source ad', () => {
    expect(parseCommerceProduct(form({ approved: '', visible: '', stock: '0', adId: '12' })))
      .toMatchObject({ approved: false, visible: false, stock: 0, adId: 12n });
  });
  it('uses an explicit stock delta; a title edit defaults to no inventory change', () => {
    expect(parseStockAdjustment('')).toBe(0);
    expect(parseStockAdjustment('3')).toBe(3);
    expect(parseStockAdjustment('-2')).toBe(-2);
    expect(() => parseStockAdjustment('1.5')).toThrow();
    expect(() => parseStockAdjustment('1000001')).toThrow();
  });
});
