import 'server-only';
import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { ensureSchema } from '@/data/schema-sync';
import { hashPassword } from '@/lib/auth';
import { sendVerification } from '@/lib/sms';

type Intent = { expiresAt: Date; attempts: number };
const MAX_ATTEMPTS = 5;
const TTL_MS = 10 * 60_000;

export function isRegistrationIntentUsable(intent: Intent, now = new Date()): boolean {
  return intent.expiresAt.getTime() > now.getTime() && intent.attempts < MAX_ATTEMPTS;
}
export function nextRegistrationOtpAttempts(previous: number): number { return previous; }

export async function startSaudiRegistrationIntent(input: { name: string; phone: string; password: string; refBy?: number }) {
  await ensureSchema();
  const existing = await prisma.users.findFirst({ where: { phoneNumber: input.phone }, select: { id: true } });
  if (existing) return { ok: false as const, error: 'رقم الجوال مسجّل مسبقاً' };
  const now = new Date();
  const rows = await prisma.$queryRawUnsafe<{ attempts: number; last_sent: Date }[]>(
    'SELECT attempts,last_sent FROM registration_intents WHERE phone = ? LIMIT 1', input.phone,
  );
  const previous = rows[0];
  if (previous && now.getTime() - new Date(previous.last_sent).getTime() < 60_000) return { ok: false as const, error: 'انتظر دقيقة قبل طلب رمز جديد.' };
  const attempts = nextRegistrationOtpAttempts(Number(previous?.attempts || 0));
  if (attempts >= MAX_ATTEMPTS) return { ok: false as const, error: 'تجاوزت الحد المسموح للمحاولات. حاول بعد قليل.' };
  const code = String(randomInt(1000, 10000));
  const expiry = new Date(now.getTime() + TTL_MS);
  await prisma.$executeRawUnsafe(
    `INSERT INTO registration_intents (phone,name,password_hash,ref_by,code,expires_at,attempts,last_sent)
     VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),password_hash=VALUES(password_hash),ref_by=VALUES(ref_by),code=VALUES(code),expires_at=VALUES(expires_at),attempts=VALUES(attempts),last_sent=VALUES(last_sent)`,
    input.phone, input.name, await hashPassword(input.password), input.refBy || null, code, expiry, attempts, now,
  );
  const delivered = await sendVerification(input.phone, `رمز التحقق لإنشاء حسابك في تربح: ${code}`);
  if (!delivered) return { ok: false as const, error: 'تعذّر إرسال رمز التحقق حالياً. حاول لاحقاً أو تواصل مع الإدارة.' };
  return { ok: true as const };
}

export async function consumeSaudiRegistrationIntent(phone: string, code: string) {
  await ensureSchema();
  const rows = await prisma.$queryRawUnsafe<{ name: string; password_hash: string; ref_by: bigint | null; code: string; expires_at: Date; attempts: number }[]>(
    'SELECT name,password_hash,ref_by,code,expires_at,attempts FROM registration_intents WHERE phone = ? LIMIT 1', phone,
  );
  const intent = rows[0];
  if (!intent || !isRegistrationIntentUsable({ expiresAt: new Date(intent.expires_at), attempts: Number(intent.attempts) })) return { ok: false as const, error: 'الرمز غير صحيح أو منتهي الصلاحية. اطلب رمزاً جديداً.' };
  await prisma.$executeRawUnsafe('UPDATE registration_intents SET attempts = attempts + 1 WHERE phone = ?', phone);
  if (String(intent.code) !== String(code).trim()) return { ok: false as const, error: 'الرمز غير صحيح أو منتهي الصلاحية. اطلب رمزاً جديداً.' };
  try {
    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.users.findFirst({ where: { phoneNumber: phone }, select: { id: true } });
      if (existing) return null;
      const created = await tx.users.create({ data: { name: intent.name, userName: phone, phoneNumber: phone, password: intent.password_hash, type: 'user', ban: 'no', trusted: 0, allow_phone: 1, whatsapp: 1, step: 0, forget: 0, is_admin: 0, ...(intent.ref_by ? { ref_by: Number(intent.ref_by) } : {}) } });
      await tx.$executeRawUnsafe('DELETE FROM registration_intents WHERE phone = ?', phone);
      return created;
    });
    return user ? { ok: true as const, user } : { ok: false as const, error: 'رقم الجوال مسجّل مسبقاً' };
  } catch { return { ok: false as const, error: 'تعذّر إتمام التسجيل. أعد المحاولة.' }; }
}
