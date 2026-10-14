import {describe,it,expect} from 'vitest';
import {pagePermission,canAccessPage} from '../../src/lib/access-control/catalog';
describe('CJ stage access separation',()=>{
it('separates product, order, finance and shipping permissions',()=>{expect(pagePermission('/admin/suppliers/cj/browse')).toBe('products:view');expect(pagePermission('/admin/suppliers/cj/purchases')).toBe('orders:view');expect(pagePermission('/admin/suppliers/cj/payables')).toBe('settlements:view');expect(pagePermission('/admin/suppliers/cj/preparation')).toBe('shipping:view');expect(pagePermission('/admin/suppliers/cj/tracking')).toBe('shipping:view');expect(pagePermission('/admin/suppliers/cj/history')).toBe('settlements:view');});
it('requires all existing payable read permissions before showing navigation',()=>{expect(canAccessPage(new Set(['settlements:view']),'/admin/suppliers/cj/payables')).toBe(false);expect(canAccessPage(new Set(['settlements:view','orders:view','wallets:view']),'/admin/suppliers/cj/payables')).toBe(true);expect(canAccessPage(new Set(['orders:view']),'/admin/suppliers/cj/tracking')).toBe(false);});
});
