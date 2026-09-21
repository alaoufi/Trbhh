import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/auth', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getSetting: vi.fn(), setSetting: vi.fn() }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: vi.fn() }));
import { ALL_KEYS, ROLE_PRESET, SERVICES } from '@/lib/roles';
import { ADMIN_NAV } from '@/components/admin-nav-def';
describe('independent supplier permissions', () => {
  it('registers view/add/edit/delete without granting access to ordinary staff presets', () => {
    expect(SERVICES.find(s => s.key === 'suppliers')?.actions).toEqual(['view', 'add', 'edit', 'delete']);
    expect(ALL_KEYS).toEqual(expect.arrayContaining(['suppliers:view', 'suppliers:add', 'suppliers:edit', 'suppliers:delete']));
    for (const role of ['moderator', 'monitor', 'store_monitor', 'member', 'visitor'] as const) expect(ROLE_PRESET[role].some(p => p.startsWith('suppliers:'))).toBe(false);
  });
  it('scopes supplier navigation independently and accounting to commerce', () => {
    expect(ADMIN_NAV.find(n => n.href === '/admin/suppliers')?.perm).toBe('suppliers');
    expect(ADMIN_NAV.find(n => n.href === '/admin/commerce/accounts')?.perm).toBe('commerce');
  });
});
