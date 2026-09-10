'use server';
import { randomUUID, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireUser, verifyPassword, newPasswordError, hashPassword, createSession, shouldUseSecureCookies } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { consumeMfa, getMfaCredential, takeSecurityAttempt, clearSecurityAttempts, mfaReadiness, lockAuthPolicy } from '@/lib/auth-security';
import { generateTotpSecret, encryptSecret, decryptSecret, generateRecoveryCodes, recoveryHash, matchFactor } from '@/lib/mfa-crypto';
import { requireManager } from '@/lib/roles';
import { AUTH_PASSWORD_MIN, AUTH_REQUIRE_ADMIN_MFA } from '@/lib/settings';

const COOKIE = 'trbhh_mfa_enrollment';
const value = (form: FormData, key: string) => String(form.get(key) || '');
const digest = (hash: string) => createHash('sha256').update(hash).digest('hex');
export type SecurityState = { error?: string; notice?: string; setupKey?: string; recoveryCodes?: string[] } | null;

export async function startMfaAction(_previous: SecurityState, form: FormData): Promise<SecurityState> {
  const session = await requireUser();
  if (!(await takeSecurityAttempt('enroll:' + session.uid))) return { error: 'محاولات كثيرة؛ انتظر عشر دقائق.' };
  const user = await prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { password: true } });
  const password = value(form, 'currentPassword');
  if (!user?.password || !(await verifyPassword(password, user.password))) return { error: 'كلمة المرور الحالية غير صحيحة.' };
  const weak = await newPasswordError(password);
  if (weak) return { error: 'حدّث كلمة مرورك أولاً من النموذج أدناه. ' + weak };
  const old = await getMfaCredential(session.uid);
  if (old && !(await consumeMfa(session.uid, value(form, 'factorCode')))) return { error: 'لتغيير تطبيق التحقق أدخل رمزاً جديداً أو رمز استرداد غير مستخدم.' };
  const setupKey = generateTotpSecret();
  const pending = JSON.stringify({ uid: session.uid, secret: setupKey, priorVersion: old?.version || null, passwordDigest: digest(user.password), expires: Date.now() + 600_000 });
  (await cookies()).set(COOKIE, encryptSecret(pending, session.uid), { httpOnly: true, secure: shouldUseSecureCookies(), sameSite: 'strict', path: '/', maxAge: 600 });
  await clearSecurityAttempts('enroll:' + session.uid);
  return { setupKey, notice: 'أضف حساباً في تطبيق التحقق باستخدام المفتاح أدناه: نوع زمني TOTP، ستة أرقام، كل 30 ثانية. ثم أدخل الرمز لتأكيد الربط.' };
}

export async function finishMfaAction(_previous: SecurityState, form: FormData): Promise<SecurityState> {
  const session = await requireUser();
  if (!(await takeSecurityAttempt('enroll-confirm:' + session.uid))) return { error: 'محاولات كثيرة؛ انتظر عشر دقائق وابدأ الربط من جديد.' };
  const sealed = (await cookies()).get(COOKIE)?.value;
  if (!sealed) return { error: 'انتهت جلسة الربط؛ ابدأ من جديد.' };
  let pending: { uid: number; secret: string; priorVersion: string | null; passwordDigest: string; expires: number };
  try { pending = JSON.parse(decryptSecret(sealed, session.uid)); } catch { return { error: 'جلسة الربط غير صالحة؛ ابدأ من جديد.' }; }
  if (pending.uid !== session.uid || pending.expires <= Date.now()) return { error: 'انتهت جلسة الربط؛ ابدأ من جديد.' };
  const code = value(form, 'code');
  const matched = /^\d{6}$/.test(code) ? matchFactor({ secret: pending.secret, lastStep: -1, recoveryHashes: [] }, code) : null;
  if (!matched) return { error: 'رمز التطبيق غير صحيح. تأكد من الوقت التلقائي في جهازك.' };
  if (!form.get('saveRecovery')) return { error: 'وافق على حفظ رموز الاسترداد بعد ظهورها.' };
  const codes = generateRecoveryCodes(); const version = randomUUID();
  const updated = await prisma.$transaction(async (tx) => {
    const users = await tx.$queryRawUnsafe<{ password: string }[]>('SELECT password FROM users WHERE id = ? FOR UPDATE', session.uid);
    if (!users[0]?.password || digest(users[0].password) !== pending.passwordDigest) return false;
    const rows = await tx.$queryRawUnsafe<{ version: string }[]>('SELECT version FROM auth_mfa WHERE user_id = ? FOR UPDATE', session.uid);
    if ((rows[0]?.version || null) !== pending.priorVersion) return false;
    await tx.$executeRawUnsafe(
      'INSERT INTO auth_mfa (user_id,secret,recovery_hashes,last_step,version) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE secret=VALUES(secret),recovery_hashes=VALUES(recovery_hashes),last_step=VALUES(last_step),version=VALUES(version)',
      session.uid, encryptSecret(pending.secret, session.uid), JSON.stringify(codes.map(recoveryHash)), matched.lastStep, version);
    return true;
  });
  if (!updated) return { error: 'تغيّرت إعدادات الحساب أثناء الربط؛ ابدأ من جديد.' };
  await createSession({ ...session, mfaVersion: version });
  (await cookies()).delete(COOKIE);
  await clearSecurityAttempts('enroll-confirm:' + session.uid);
  revalidatePath('/account/security'); revalidatePath('/admin/security');
  return { recoveryCodes: codes, notice: 'تم تفعيل التحقق وإلغاء صلاحية الجلسات السابقة. احفظ هذه الرموز الآن في مكان آمن؛ كل رمز يعمل مرة واحدة ولن نعرضها مجدداً.' };
}

export async function changeOwnPasswordAction(_previous: SecurityState, form: FormData): Promise<SecurityState> {
  const session = await requireUser();
  if (!(await takeSecurityAttempt('password-change:' + session.uid))) return { error: 'محاولات كثيرة؛ انتظر عشر دقائق.' };
  const user = await prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { password: true } });
  if (!user?.password || !(await verifyPassword(value(form, 'currentPassword'), user.password))) return { error: 'كلمة المرور الحالية غير صحيحة.' };
  const password = value(form, 'newPassword'); const error = await newPasswordError(password);
  if (error) return { error };
  if (password !== value(form, 'confirmPassword')) return { error: 'تأكيد كلمة المرور غير مطابق.' };
  const authVersion = randomUUID();
  const updated = await prisma.users.updateMany({ where: { id: BigInt(session.uid), password: user.password }, data: { password: await hashPassword(password), auth_session_version: authVersion } });
  if (!updated.count) return { error: 'تغيّرت كلمة المرور؛ سجّل الدخول مجدداً.' };
  await clearSecurityAttempts('password-change:' + session.uid);
  await createSession({ ...session, authVersion });
  return { notice: 'حُفظت كلمة المرور الجديدة وأُلغيت الجلسات الأخرى.' };
}

export async function saveAuthPolicyAction(_previous: SecurityState, form: FormData): Promise<SecurityState> {
  const session = await requireManager();
  if (!(await takeSecurityAttempt('auth-policy:' + session.uid))) return { error: 'محاولات كثيرة؛ انتظر عشر دقائق.' };
  const user = await prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { password: true } });
  if (!user?.password || !(await verifyPassword(value(form, 'currentPassword'), user.password))) return { error: 'كلمة المرور الحالية غير صحيحة.' };
  const enabled = !!form.get('requireAdminMfa');
  const min = Number(value(form, 'passwordMinimum'));
  if (!Number.isInteger(min) || min < 12 || min > 64) return { error: 'الحد الأدنى بين 12 و64 حرفاً.' };
  // Policy changes require a fresh factor even when general enforcement is currently off.
  if (!(await consumeMfa(session.uid, value(form, 'factorCode')))) return { error: 'اربط تطبيق التحقق أولاً، ثم أدخل رمزاً جديداً أو رمز استرداد لتعديل السياسة.' };
  const saved = await prisma.$transaction(async (tx) => {
    await lockAuthPolicy(tx);
    if (enabled) {
      const readiness = await mfaReadiness(tx);
      if (!readiness.length || readiness.some((r) => !r.enrolled)) return false;
    }
    for (const [k, v] of [[AUTH_PASSWORD_MIN, String(min)], [AUTH_REQUIRE_ADMIN_MFA, enabled ? '1' : '0']]) {
      await tx.site_settings.upsert({ where: { k }, create: { k, v }, update: { v } });
    }
    return true;
  });
  if (!saved) return { error: 'لا يمكن الإلزام قبل ربط تطبيق التحقق لكل حسابات الإدارة الظاهرة في القائمة.' };
  await clearSecurityAttempts('auth-policy:' + session.uid);
  revalidatePath('/account/security'); revalidatePath('/admin/security');
  return { notice: enabled ? 'حُفظت السياسة: التحقق إلزامي لكل حسابات الإدارة.' : 'حُفظت السياسة: يبقى التحقق إلزامياً لكل حساب ربط تطبيقه بالفعل.' };
}
