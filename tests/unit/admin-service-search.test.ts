import { describe, expect, it } from 'vitest';
import { findAdminServices } from '@/lib/admin-service-search';

describe('admin service search', () => {
  it('finds bank accounts from Arabic service terms', () => {
    expect(findAdminServices('آيبان', new Set(['users']))[0]?.href).toBe('/admin/revenue?tab=accounts');
    expect(findAdminServices('الحساب البنكي', new Set(['users']))[0]?.label).toBe('حسابات الشحن البنكية');
  });

  it('does not reveal a service outside the staff permission', () => {
    expect(findAdminServices('آيبان', new Set(['ads']))).toEqual([]);
  });
});
