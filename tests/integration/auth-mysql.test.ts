import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
const context = vi.hoisted(() => ({ uid: 0 }));
// Only the HTTP request boundary is mocked; all database operations and crypto below are real.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/roles', async (load) => ({ ...await load<typeof import('@/lib/roles')>(), requireManager: async () => ({ uid: context.uid }) }));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:async()=>({uid:context.uid})}));
import { prisma } from '@/lib/prisma';
import { ensureSchema } from '@/data/schema-sync';
import { consumeMfa, takeSecurityAttempt, mfaReadiness } from '@/lib/auth-security';
import { encryptSecret, generateTotpSecret, generateRecoveryCodes, recoveryHash, totpCode } from '@/lib/mfa-crypto';
import { AUTH_REQUIRE_ADMIN_MFA, AUTH_PASSWORD_MIN } from '@/lib/settings';
import { setUserPerms } from '@/lib/roles';
import { saveAuthPolicyAction } from '@/app/account/security/actions';

const enabled = process.env.AUTH_DB_TESTS === '1';
const suite = describe.skipIf(!enabled);
suite('isolated MySQL authentication transactions', () => {
  const ids: bigint[] = []; const attemptKeys: string[] = [];
  const suffix = randomUUID(); const password = 'quiet river bronze orchard';
  let originalSettings: { k: string; v: string | null }[] = [];
  let setupStarted = false; let secret: string; let codes: string[];
  async function enroll(uid: bigint) {
    const factor = generateTotpSecret(); const recovery = generateRecoveryCodes();
    await prisma.auth_mfa.upsert({ where: { user_id: uid }, create: { user_id: uid, secret: encryptSecret(factor, Number(uid)), recovery_hashes: JSON.stringify(recovery.map(recoveryHash)), version: 'test-' + suffix }, update: { secret: encryptSecret(factor, Number(uid)), recovery_hashes: JSON.stringify(recovery.map(recoveryHash)), last_step: -1, version: 'test-' + suffix } });
    return { factor, recovery };
  }
  beforeAll(async () => {
    const url = new URL(process.env.AUTH_TEST_DATABASE_URL || '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !['/ci', '/trbhh_auth_test'].includes(url.pathname)) throw new Error('Refusing a non-isolated auth test database');
    const current = await prisma.$queryRawUnsafe<{ db: string }[]>('SELECT DATABASE() AS db');
    if ('/' + current[0]?.db !== url.pathname) throw new Error('Connected database does not match the explicit test database');
    if (await prisma.users.count() !== 0) throw new Error('Auth DB suite requires an empty disposable database');
    await ensureSchema();
    originalSettings = await prisma.site_settings.findMany({ where: { k: { in: [AUTH_REQUIRE_ADMIN_MFA, AUTH_PASSWORD_MIN] } } });
    setupStarted = true;
    for (let i = 0; i < 3; i++) {
      const user = await prisma.users.create({ data: { userName: 'auth-test-' + suffix + '-' + i, name: 'Auth test fixture', password: await bcrypt.hash(password, 4), type: 'user', is_admin: i === 0 ? 1 : 0 } });
      ids.push(user.id);
    }
    context.uid = Number(ids[0]);
    for (const uid of ids) for (const prefix of ['mfa:', 'auth-policy:', 'password:']) attemptKeys.push(prefix + uid);
  }, 30_000);
  beforeEach(async () => {
    await prisma.admin_perms.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.admin_roles.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.auth_mfa.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.auth_security_limits.deleteMany({ where: { k: { in: attemptKeys } } });
    for (const [k, v] of [[AUTH_REQUIRE_ADMIN_MFA, '0'], [AUTH_PASSWORD_MIN, '12']]) await prisma.site_settings.upsert({ where: { k }, create: { k, v }, update: { v } });
    const owner = await enroll(ids[0]); secret = owner.factor; codes = owner.recovery;
  });
  afterAll(async () => {
    if (setupStarted) {
      await prisma.admin_perms.deleteMany({ where: { user_id: { in: ids } } });
      await prisma.admin_roles.deleteMany({ where: { user_id: { in: ids } } });
      await prisma.auth_mfa.deleteMany({ where: { user_id: { in: ids } } });
      await prisma.auth_security_limits.deleteMany({ where: { k: { in: attemptKeys } } });
      await prisma.users.deleteMany({ where: { id: { in: ids } } });
      await prisma.site_settings.deleteMany({ where: { k: { in: [AUTH_REQUIRE_ADMIN_MFA, AUTH_PASSWORD_MIN] } } });
      for (const row of originalSettings) await prisma.site_settings.create({ data: row });
    }
    await prisma.$disconnect();
  }, 20_000);
  it('accepts exactly one of two simultaneous TOTP requests', async () => {
    const code = totpCode(secret);
    const results = await Promise.all([consumeMfa(context.uid, code), consumeMfa(context.uid, code)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await consumeMfa(context.uid, code)).toBeNull();
  });
  it('accepts exactly one of two simultaneous recovery requests', async () => {
    const results = await Promise.all([consumeMfa(context.uid, codes[0]), consumeMfa(context.uid, codes[0])]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await consumeMfa(context.uid, codes[0])).toBeNull();
  });
  it('atomically enforces and expires the durable fixed-window attempt limit', async () => {
    const key = 'test-limit:' + suffix; attemptKeys.push(key);
    const allowed = await Promise.all(Array.from({ length: 12 }, () => takeSecurityAttempt(key)));
    expect(allowed.filter(Boolean)).toHaveLength(8);
    expect((await prisma.auth_security_limits.findUniqueOrThrow({ where: { k: key } })).hits).toBe(12);
    await prisma.$executeRawUnsafe('UPDATE auth_security_limits SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE k = ?', key);
    expect(await takeSecurityAttempt(key)).toBe(true);
    expect((await prisma.auth_security_limits.findUniqueOrThrow({ where: { k: key } })).hits).toBe(1);
  });
  it('checks real legacy staff readiness before activation and refuses the retired grant path', async () => {
    // Pre-migration fixture; multi-role MFA grants have their own isolated suite.
    await prisma.admin_perms.create({data:{user_id:ids[1],perm:'users:view'}});
    expect((await mfaReadiness()).find((r) => r.id === Number(ids[1]))?.enrolled).toBe(false);
    const form = (factor: string) => { const f = new FormData(); f.set('currentPassword', password); f.set('factorCode', factor); f.set('requireAdminMfa', 'on'); f.set('passwordMinimum', '12'); return f; };
    expect(await saveAuthPolicyAction(null, form(codes[0]))).toHaveProperty('error');
    expect((await prisma.site_settings.findUnique({ where: { k: AUTH_REQUIRE_ADMIN_MFA } }))?.v).toBe('0');
    await enroll(ids[1]);
    expect(await saveAuthPolicyAction(null, form(codes[1]))).toHaveProperty('notice');
    expect((await prisma.site_settings.findUnique({ where: { k: AUTH_REQUIRE_ADMIN_MFA } }))?.v).toBe('1');
    await expect(setUserPerms(Number(ids[2]), ['users:view'])).rejects.toThrow('rbac_legacy_grants_disabled');
    expect(await prisma.admin_perms.count({ where: { user_id: ids[2] } })).toBe(0);
    await enroll(ids[2]);
    await expect(setUserPerms(Number(ids[2]), ['users:view'])).rejects.toThrow('rbac_legacy_grants_disabled');
    expect(await prisma.admin_perms.count({ where: { user_id: ids[2] } })).toBe(0);
  }, 20_000);
});
