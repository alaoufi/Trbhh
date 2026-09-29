import {describe, expect, it} from 'vitest';
import {supplierTrustBadges} from '@/lib/suppliers/trust-badges';

describe('supplier trust badges', () => {
  it('only exposes badges backed by explicit verified state', () => {
    expect(supplierTrustBadges({supplierVerified: true, connected: true, featured: true, available: true})).toEqual([
      {key: 'verified-supplier', label: 'مورد موثق'},
      {key: 'connected-source', label: 'مصدر متصل'},
      {key: 'featured-product', label: 'منتج معتمد'},
      {key: 'available-now', label: 'متوفر الآن'},
    ]);
  });

  it('does not present unavailable or unverified products as trusted', () => {
    expect(supplierTrustBadges({supplierVerified: false, connected: false, featured: false, available: false})).toEqual([]);
  });
});
