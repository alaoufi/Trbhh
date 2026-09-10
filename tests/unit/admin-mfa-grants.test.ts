import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ lock: vi.fn(), credential: vi.fn(), remove: vi.fn(), create: vi.fn() }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
vi.mock('@/lib/auth', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getSetting: vi.fn(), setSetting: vi.fn() }));
vi.mock('@/lib/auth-security', () => ({ lockAuthPolicy: m.lock }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  $transaction: async (fn: (tx: unknown) => unknown) => fn({ auth_mfa: { findUnique: m.credential }, admin_perms: { deleteMany: m.remove, createMany: m.create }, admin_roles: { deleteMany: m.remove } }),
} }));
import { setUserPerms, applyRolePreset, AdminMfaEnrollmentRequired } from '@/lib/roles';
beforeEach(() => { vi.clearAllMocks(); m.lock.mockResolvedValue(true); m.credential.mockResolvedValue(null); });
describe('admin grants after MFA activation', () => {
  it('rejects new permissions before changing any existing grants when the account is unenrolled', async () => {
    await expect(setUserPerms(8, ['users:view'])).rejects.toBeInstanceOf(AdminMfaEnrollmentRequired);
    expect(m.lock).toHaveBeenCalledTimes(1); expect(m.remove).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
  it('applies the same guard to role presets', async () => {
    await expect(applyRolePreset(8, 'manager')).rejects.toBeInstanceOf(AdminMfaEnrollmentRequired);
    expect(m.create).not.toHaveBeenCalled();
  });
  it('allows an enrolled ordinary member to be granted admin permissions', async () => {
    m.credential.mockResolvedValue({ version: 'enrolled' });
    await setUserPerms(8, ['users:view']);
    expect(m.create).toHaveBeenCalledOnce();
  });
  it('allows permission removal and staged grants before enforcement', async () => {
    await setUserPerms(8, []);
    expect(m.remove).toHaveBeenCalledTimes(2);
    m.lock.mockResolvedValue(false);
    await setUserPerms(8, ['users:view']);
    expect(m.create).toHaveBeenCalledOnce();
  });
});
