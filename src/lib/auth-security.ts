import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { getAuthSecuritySettings } from './settings';
export { lockAuthPolicy } from './auth-policy-lock';
import { decryptSecret, matchFactor } from './mfa-crypto';

export type MfaCredential = { user_id: bigint; secret: string; recovery_hashes: string; last_step: bigint; version: string };
export async function getMfaCredential(uid: number): Promise<MfaCredential | null> {
  await ensureSchema();
  const rows = await prisma.$queryRawUnsafe<MfaCredential[]>('SELECT user_id,secret,recovery_hashes,last_step,version FROM auth_mfa WHERE user_id = ?', uid);
  return rows[0] || null;
}
/** Strict account-level classification also covers granular permissions and assigned roles. */
export async function isPrivilegedAccount(uid: number): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ id: bigint }[]>(
    "SELECT u.id FROM users u WHERE u.id = ? AND (u.is_admin = 1 OR EXISTS (SELECT 1 FROM admin_perms p WHERE p.user_id = u.id) OR EXISTS (SELECT 1 FROM admin_roles r WHERE r.user_id = u.id) OR EXISTS (SELECT 1 FROM access_user_roles ar WHERE ar.user_id=u.id)) LIMIT 1", uid);
  return rows.length > 0;
}
export async function getAuthSessionVersion(uid: number): Promise<string | null> {
  await ensureSchema();
  const user = await prisma.users.findUnique({ where: { id: BigInt(uid) }, select: { auth_session_version: true, archived_at: true, merged_into: true, ban:true, ban_until:true } });
  const banned=user?.ban==='checked'&&(!user.ban_until||user.ban_until.getTime()>Date.now());
  return !user || user.archived_at || user.merged_into || banned ? null : user.auth_session_version;
}
export async function sessionMeetsAuthPolicy(session: { uid: number; mfaVersion?: string; authVersion?: string }): Promise<boolean> {
  const currentVersion = await getAuthSessionVersion(session.uid);
  if (currentVersion === null || (session.authVersion || '0') !== currentVersion) return false;
  const credential = await getMfaCredential(session.uid);
  if (credential) return session.mfaVersion === credential.version;
  const settings = await getAuthSecuritySettings();
  return !settings.requireAdminMfa || !(await isPrivilegedAccount(session.uid));
}
/** Persistent fixed-window counter, shared by all app workers; errors fail closed. */
export async function takeSecurityAttempt(key: string, maximum = 8): Promise<boolean> {
  await ensureSchema();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'INSERT INTO auth_security_limits (k,hits,expires_at) VALUES (?,1,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)) ON DUPLICATE KEY UPDATE hits=IF(expires_at <= UTC_TIMESTAMP(),1,hits+1), expires_at=IF(expires_at <= UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE),expires_at)', key);
    const rows = await tx.$queryRawUnsafe<{ hits: number }[]>('SELECT hits FROM auth_security_limits WHERE k = ? FOR UPDATE', key);
    return Number(rows[0]?.hits) <= maximum;
  });
}
export async function clearSecurityAttempts(key: string): Promise<void> {
  await prisma.$executeRawUnsafe('DELETE FROM auth_security_limits WHERE k = ?', key);
}
/** The lock serializes parallel TOTP/recovery requests, preventing reuse on another worker. */
export async function consumeMfa(uid: number, code: string): Promise<string | null> {
  if (!(await takeSecurityAttempt('mfa:' + uid))) return null;
  const version = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<MfaCredential[]>('SELECT user_id,secret,recovery_hashes,last_step,version FROM auth_mfa WHERE user_id = ? FOR UPDATE', uid);
    const row = rows[0]; if (!row) return null;
    const result = matchFactor({ secret: /^\d{6}$/.test(code.trim()) ? decryptSecret(row.secret, uid) : '', lastStep: Number(row.last_step), recoveryHashes: JSON.parse(row.recovery_hashes) as string[] }, code);
    if (!result) return null;
    await tx.$executeRawUnsafe('UPDATE auth_mfa SET last_step = ?, recovery_hashes = ? WHERE user_id = ?', result.lastStep, JSON.stringify(result.recoveryHashes), uid);
    return row.version;
  });
  if (version) await clearSecurityAttempts('mfa:' + uid);
  return version;
}
export async function mfaReadiness(tx: Pick<Prisma.TransactionClient, '$queryRawUnsafe'> = prisma): Promise<{ id: number; name: string; enrolled: boolean }[]> {
  await ensureSchema();
  const rows = await tx.$queryRawUnsafe<{ id: bigint; name: string; version: string | null }[]>(
    "SELECT DISTINCT u.id, COALESCE(u.name,u.userName,'عضو') AS name, m.version FROM users u LEFT JOIN auth_mfa m ON m.user_id=u.id WHERE u.archived_at IS NULL AND (u.merged_into IS NULL OR u.merged_into=0) AND (u.is_admin=1 OR EXISTS (SELECT 1 FROM admin_perms p WHERE p.user_id=u.id) OR EXISTS (SELECT 1 FROM admin_roles r WHERE r.user_id=u.id) OR EXISTS (SELECT 1 FROM access_user_roles ar WHERE ar.user_id=u.id))");
  return rows.map((r) => ({ id: Number(r.id), name: r.name, enrolled: !!r.version }));
}
