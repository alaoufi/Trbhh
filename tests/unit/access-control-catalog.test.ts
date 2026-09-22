import {describe,it,expect} from 'vitest';
import {DEPARTMENTS,DEFAULT_ROLES,PERMISSIONS,SENSITIVE_KEYS,legacyPermission,canAccessPage,pagePermission,permissionKeySet} from '@/lib/access-control/catalog';

describe('access control registry and defaults',()=>{
  it('covers ten departments and rejects unknown or prototype-shaped permissions',()=>{
    expect(DEPARTMENTS).toHaveLength(10);
    expect(new Set(PERMISSIONS.map(p=>p.key)).size).toBe(PERMISSIONS.length);
    for(const key of ['__proto__:view','finance:__proto__','unknown:view','ads:edit'])expect(permissionKeySet.has(key)).toBe(false);
    expect(legacyPermission('unknown:view')).toBeNull();
    expect(legacyPermission('ads:suspend')).toBe('ads:archive');
    expect(legacyPermission('ads:edit')).toBeNull();
  });
  it('never seeds sensitive financial actions in any role, including the access administrator',()=>{
    for(const key of ['settlements:approve','settlements:delete','invoices:delete','topups:delete','returns:approve','returns:refund','returns:delete','periods:close_period','periods:reopen_period','periods:approve','orders:refund','tax:manage_settings','tax:approve','access_control:manage_settings','finance:export','backup:export','backup:edit'])expect(SENSITIVE_KEYS.has(key)).toBe(true);
    for(const role of DEFAULT_ROLES)for(const key of role.permissions){expect(permissionKeySet.has(key)).toBe(true);expect(SENSITIVE_KEYS.has(key)).toBe(false);}
  });
  it('uses explicit module/action grants instead of role labels or a wildcard',()=>{
    expect(canAccessPage(new Set(['manager','*','users:view']),'/admin/finance')).toBe(false);
    expect(canAccessPage(new Set(['finance:view']),'/admin/finance')).toBe(true);
    expect(canAccessPage(new Set(['finance:view']),'/admin/finance?section=tax')).toBe(false);
    expect(canAccessPage(new Set(['tax:view']),'/admin/finance?section=tax')).toBe(true);
    expect(canAccessPage(new Set(['users:view']),'/admin/access-control')).toBe(false);
    expect(pagePermission('/admin/unregistered-module')).toBeNull();
  });
  it('isolates integrations, orders and wallet screens from supplier/product/member grants',()=>{
    expect(pagePermission('/admin/suppliers/integrations')).toBe('integrations:view');
    expect(pagePermission('/admin/commerce/orders/123')).toBe('orders:view');
    expect(pagePermission('/admin/revenue?tab=wallets')).toBe('wallets:view');
    expect(canAccessPage(new Set(['suppliers:view']),'/admin/suppliers/integrations')).toBe(false);
    expect(canAccessPage(new Set(['users:view']),'/admin/revenue?tab=wallets')).toBe(false);
  });
});
