import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  credential: vi.fn(), consume: vi.fn(), privileged: vi.fn(), settings: vi.fn(), attempt: vi.fn(), clear: vi.fn(), password: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { users: { findFirst: async () => ({ id: 7n, name: 'Admin', password: 'hash', auth_session_version: 'verified-v1', type: 'user', archived_at: null, merged_into: null }) } } }));
vi.mock('@/lib/auth', () => ({ verifyPassword: mocks.password }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
vi.mock('@/lib/moderation', () => ({ isUserBanned: async () => false }));
vi.mock('@/lib/redis', () => ({ rateGet: async () => 0, rateHit: async () => 1, rateReset: async () => {} }));
vi.mock('@/lib/settings', () => ({ getAuthSecuritySettings: mocks.settings }));
vi.mock('@/lib/auth-security', () => ({ getMfaCredential: mocks.credential, consumeMfa: mocks.consume, isPrivilegedAccount: mocks.privileged, takeSecurityAttempt: mocks.attempt, clearSecurityAttempts: mocks.clear }));
import { verifyLogin } from '@/lib/login-core';
beforeEach(() => {
  vi.clearAllMocks(); mocks.password.mockResolvedValue(true); mocks.credential.mockResolvedValue({ version: 'v1' }); mocks.consume.mockResolvedValue(null); mocks.privileged.mockResolvedValue(true); mocks.settings.mockResolvedValue({ requireAdminMfa: false, passwordMinimum: 12 }); mocks.attempt.mockResolvedValue(true);
});
describe('login second factor enforcement', () => {
  it('does not grant an enrolled account a password-only login', async () => {
    expect((await verifyLogin('admin', 'correct password')).ok).toBe(false);
  });
  it('rejects invalid or replayed second factors', async () => {
    expect((await verifyLogin('admin', 'correct password', '123456')).ok).toBe(false);
  });
  it('binds a successful login to the consumed credential version', async () => {
    mocks.consume.mockResolvedValue('v1');
    expect(await verifyLogin('admin', 'correct password', '123456')).toMatchObject({ ok: true, mfaVersion: 'v1', authVersion: 'verified-v1' });
  });
  it('preserves staged access for an unenrolled account before activation', async () => {
    mocks.credential.mockResolvedValue(null);
    expect((await verifyLogin('admin', 'legacy')).ok).toBe(true);
  });
  it('rejects unenrolled admins once enforcement is activated', async () => {
    mocks.credential.mockResolvedValue(null); mocks.settings.mockResolvedValue({ requireAdminMfa: true });
    expect((await verifyLogin('admin', 'legacy')).ok).toBe(false);
  });
  it('never spends a second factor before the password has been verified', async () => {
    mocks.password.mockResolvedValue(false);
    expect((await verifyLogin('admin', 'wrong', '123456')).ok).toBe(false);
    expect(mocks.consume).not.toHaveBeenCalled();
  });
});
