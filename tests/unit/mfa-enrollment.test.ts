import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const m = vi.hoisted(() => ({ password: vi.fn(), policyError: vi.fn(), credential: vi.fn(), consume: vi.fn(), attempt: vi.fn(), ready: vi.fn(), user: vi.fn(), rows: vi.fn(), execute: vi.fn(), set: vi.fn(), get: vi.fn(), setting: vi.fn(), session: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: m.set, get: m.get, delete: vi.fn() }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ uid: 7, name: 'Tester', type: 'user' }), verifyPassword: m.password, newPasswordError: m.policyError, hashPassword: async () => 'newhash', createSession: m.session, shouldUseSecureCookies: () => true }));
vi.mock('@/lib/roles', () => ({ requireManager: async () => ({ uid: 7 }) }));
vi.mock('@/lib/settings', () => ({ AUTH_PASSWORD_MIN: 'min', AUTH_REQUIRE_ADMIN_MFA: 'mfa', setSetting: m.setting }));
vi.mock('@/lib/auth-security', () => ({ consumeMfa: m.consume, getMfaCredential: m.credential, takeSecurityAttempt: m.attempt, clearSecurityAttempts: async () => {}, mfaReadiness: m.ready, lockAuthPolicy: async () => false }));
vi.mock('@/lib/prisma', () => ({ prisma: { users: { findUnique: m.user }, $transaction: async (fn: (tx: unknown) => unknown) => fn({ $queryRawUnsafe: m.rows, $executeRawUnsafe: m.execute, site_settings: { upsert: m.setting } }) } }));
import { startMfaAction, finishMfaAction, saveAuthPolicyAction } from '@/app/account/security/actions';
import { encryptSecret, totpCode } from '@/lib/mfa-crypto';
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };
function pending(overrides = {}) {
  return encryptSecret(JSON.stringify({ uid: 7, secret, priorVersion: null, passwordDigest: createHash('sha256').update('hash').digest('hex'), expires: Date.now() + 600000, ...overrides }), 7);
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('AUTH_SECRET', 'local-only-security-regression-key-123456789');
  m.user.mockResolvedValue({ password: 'hash' }); m.password.mockResolvedValue(true); m.policyError.mockResolvedValue(null); m.attempt.mockResolvedValue(true); m.credential.mockResolvedValue(null); m.consume.mockResolvedValue('v1');
  m.get.mockImplementation(() => ({ value: pending() }));
});
describe('authenticated enrollment', () => {
  it('never reveals a setup secret without a correct current password', async () => {
    m.password.mockResolvedValue(false);
    expect(await startMfaAction(null, form({ currentPassword: 'wrong' }))).toHaveProperty('error');
    expect(m.set).not.toHaveBeenCalled();
  });
  it('requires upgrading a legacy weak password before enrollment', async () => {
    m.policyError.mockResolvedValue('too short');
    expect(await startMfaAction(null, form({ currentPassword: 'legacy' }))).toHaveProperty('error');
    expect(m.set).not.toHaveBeenCalled();
  });
  it('requires a fresh factor before replacing an existing authenticator', async () => {
    m.credential.mockResolvedValue({ version: 'v1' }); m.consume.mockResolvedValue(null);
    expect(await startMfaAction(null, form({ currentPassword: 'correct' }))).toHaveProperty('error');
    expect(m.set).not.toHaveBeenCalled();
  });
  it('does not enable MFA merely because a secret was generated', async () => {
    expect(await startMfaAction(null, form({ currentPassword: 'correct' }))).toHaveProperty('setupKey');
    expect(m.execute).not.toHaveBeenCalled();
    expect(m.set).toHaveBeenCalledWith('trbhh_mfa_enrollment', expect.any(String), expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', maxAge: 600 }));
  });
  it('rejects expired enrollment before any credential write', async () => {
    m.get.mockReturnValue({ value: pending({ expires: Date.now() - 1 }) });
    expect(await finishMfaAction(null, form({ code: totpCode(secret), saveRecovery: 'on' }))).toHaveProperty('error');
    expect(m.execute).not.toHaveBeenCalled();
  });
  it('rejects tampering and enrollment copied from another account', async () => {
    m.get.mockReturnValue({ value: encryptSecret(JSON.stringify({ uid: 8 }), 8) });
    expect(await finishMfaAction(null, form({ code: totpCode(secret), saveRecovery: 'on' }))).toHaveProperty('error');
    expect(m.execute).not.toHaveBeenCalled();
  });
  it('requires an actual new TOTP code before the credential is committed', async () => {
    expect(await finishMfaAction(null, form({ code: 'invalid', saveRecovery: 'on' }))).toHaveProperty('error');
    expect(m.execute).not.toHaveBeenCalled();
  });
  it('rejects an enrollment created before the password was changed', async () => {
    m.rows.mockResolvedValueOnce([{ password: 'changedhash' }]);
    expect(await finishMfaAction(null, form({ code: totpCode(secret), saveRecovery: 'on' }))).toHaveProperty('error');
    expect(m.execute).not.toHaveBeenCalled();
  });
  it('does not let an old enrollment replace a newer credential', async () => {
    m.rows.mockResolvedValueOnce([{ password: 'hash' }]).mockResolvedValueOnce([{ version: 'newer' }]);
    expect(await finishMfaAction(null, form({ code: totpCode(secret), saveRecovery: 'on' }))).toHaveProperty('error');
    expect(m.execute).not.toHaveBeenCalled();
  });
  it('commits confirmed enrollment with hashed recovery codes and a new bound session', async () => {
    m.rows.mockResolvedValueOnce([{ password: 'hash' }]).mockResolvedValueOnce([]);
    const result = await finishMfaAction(null, form({ code: totpCode(secret), saveRecovery: 'on' }));
    expect(result?.recoveryCodes).toHaveLength(10);
    expect(m.execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(m.execute.mock.calls)).not.toContain(result!.recoveryCodes![0]);
    expect(m.session).toHaveBeenCalledWith(expect.objectContaining({ uid: 7, mfaVersion: expect.any(String) }));
  });
});
describe('safe policy activation', () => {
  it('refuses activation until every privileged account is enrolled', async () => {
    m.ready.mockResolvedValue([{ id: 7, enrolled: true }, { id: 8, enrolled: false }]);
    expect(await saveAuthPolicyAction(null, form({ currentPassword: 'correct', factorCode: '123456', passwordMinimum: '12', requireAdminMfa: 'on' }))).toHaveProperty('error');
    expect(m.setting).not.toHaveBeenCalled();
  });
  it('requires an additional factor to disable or change the security policy', async () => {
    m.consume.mockResolvedValue(null);
    expect(await saveAuthPolicyAction(null, form({ currentPassword: 'correct', factorCode: '123456', passwordMinimum: '12' }))).toHaveProperty('error');
    expect(m.setting).not.toHaveBeenCalled();
  });
});
