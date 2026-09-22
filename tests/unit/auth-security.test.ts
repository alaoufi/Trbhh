import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ user: vi.fn(), rows: vi.fn(), execute: vi.fn(), settings: vi.fn() }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
vi.mock('@/lib/settings', () => ({ getAuthSecuritySettings: db.settings }));
vi.mock('@/lib/prisma', () => ({ prisma: { users: { findUnique: db.user }, $queryRawUnsafe: db.rows, $executeRawUnsafe: db.execute, $transaction: async (work: (tx: unknown) => unknown) => work({ $queryRawUnsafe: db.rows, $executeRawUnsafe: db.execute }) } }));
import { sessionMeetsAuthPolicy, consumeMfa, takeSecurityAttempt } from '@/lib/auth-security';
import { encryptSecret, totpCode, recoveryHash } from '@/lib/mfa-crypto';
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('AUTH_SECRET', 'local-only-security-regression-key-123456789');
  db.user.mockResolvedValue({ auth_session_version: '0', archived_at: null, merged_into: null });
  db.settings.mockResolvedValue({ requireAdminMfa: false });
  db.rows.mockResolvedValue([]);
});
describe('session enforcement for every login and account-switch path', () => {
  it('rejects pre-enrollment and substituted MFA credential versions', async () => {
    db.rows.mockResolvedValue([{ version: 'enrolled-v2' }]);
    expect(await sessionMeetsAuthPolicy({ uid: 7 })).toBe(false);
    expect(await sessionMeetsAuthPolicy({ uid: 7, mfaVersion: 'v1' })).toBe(false);
    expect(await sessionMeetsAuthPolicy({ uid: 7, mfaVersion: 'enrolled-v2' })).toBe(true);
  });
  it('rejects sessions minted before password rotation', async () => {
    db.user.mockResolvedValue({ auth_session_version: 'rotated', archived_at: null });
    expect(await sessionMeetsAuthPolicy({ uid: 7 })).toBe(false);
    expect(await sessionMeetsAuthPolicy({ uid: 7, authVersion: 'rotated' })).toBe(true);
  });
  it('revokes an already authenticated banned or archived staff session',async()=>{
    db.user.mockResolvedValue({auth_session_version:'0',archived_at:null,ban:'checked',ban_until:null});
    expect(await sessionMeetsAuthPolicy({uid:7})).toBe(false);
    db.user.mockResolvedValue({auth_session_version:'0',archived_at:new Date(),ban:'no'});
    expect(await sessionMeetsAuthPolicy({uid:7})).toBe(false);
    db.user.mockResolvedValue({auth_session_version:'0',archived_at:null,ban:'checked',ban_until:new Date(0)});
    expect(await sessionMeetsAuthPolicy({uid:7})).toBe(true);
  });
  it('keeps a legacy unenrolled session until explicit activation', async () => {
    expect(await sessionMeetsAuthPolicy({ uid: 7 })).toBe(true);
    db.settings.mockResolvedValue({ requireAdminMfa: true });
    db.rows.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 7n }]);
    expect(await sessionMeetsAuthPolicy({ uid: 7 })).toBe(false);
  });
  it('does not fall back to password-only access on a database failure', async () => {
    db.rows.mockRejectedValue(new Error('database unavailable'));
    await expect(sessionMeetsAuthPolicy({ uid: 7 })).rejects.toThrow('database unavailable');
  });
});
describe('durable second-factor consumption', () => {
  it('enforces the persistent account counter before decrypting any secret', async () => {
    db.rows.mockResolvedValue([{ hits: 9 }]);
    expect(await consumeMfa(7, '123456')).toBeNull();
    expect(db.rows).toHaveBeenCalledTimes(1);
  });
  it('fails closed when rate-limit persistence is unavailable', async () => {
    db.execute.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(takeSecurityAttempt('mfa:7')).rejects.toThrow('storage unavailable');
  });
  it('locks and consumes TOTP and recovery state so a later attempt cannot replay either', async () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const recovery = 'ABCDEF0123456789ABCD';
    let lastStep = -1; let hashes = [recoveryHash(recovery)];
    db.rows.mockImplementation(async (sql: string) => sql.includes('SELECT hits') ? [{ hits: 1 }] : [{ user_id: 7n, secret: encryptSecret(secret, 7), version: 'v2', last_step: lastStep, recovery_hashes: JSON.stringify(hashes) }]);
    db.execute.mockImplementation(async (sql: string, ...args: unknown[]) => { if (sql.startsWith('UPDATE auth_mfa')) { lastStep = Number(args[0]); hashes = JSON.parse(String(args[1])); } return 1; });
    const code = totpCode(secret);
    expect(await consumeMfa(7, code)).toBe('v2');
    expect(await consumeMfa(7, code)).toBeNull();
    expect(await consumeMfa(7, recovery)).toBe('v2');
    expect(await consumeMfa(7, recovery)).toBeNull();
    expect(db.rows.mock.calls.filter(([sql]) => sql.includes('FROM auth_mfa')).every(([sql]) => sql.endsWith('FOR UPDATE'))).toBe(true);
  });
});
