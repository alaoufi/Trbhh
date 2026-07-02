import 'server-only';
import { randomInt } from 'node:crypto';
import { prisma } from './prisma';
import { hashPassword } from './auth';

const SMS_URL = process.env.SMS_URL || 'http://www.4jawaly.net/api/sendsms.php';
const SMS_USERNAME = process.env.SMS_USERNAME || '';
const SMS_PASSWORD = process.env.SMS_PASSWORD || '';
const SMS_SENDER = process.env.SMS_SENDER || 'SouqAlhafta';
const SMS_UNICODE = process.env.SMS_UNICODE || 'e';

/** Normalize a Saudi number to 9665XXXXXXXX (digits only). */
export function normalizeSaudi(phone: string): string {
  let p = (phone || '').replace(/\D/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('966')) return p;
  if (p.startsWith('0')) p = p.slice(1);
  if (p.length === 9 && p.startsWith('5')) return '966' + p;
  if (p.startsWith('5')) return '966' + p;
  return p.startsWith('966') ? p : '966' + p;
}

/** Send an SMS via the 4jawaly gateway. Returns true on apparent success. */
export async function sendSms(phone: string, message: string): Promise<boolean> {
  if (!SMS_USERNAME || !SMS_PASSWORD) return false;
  const body = new URLSearchParams({
    username: SMS_USERNAME,
    password: SMS_PASSWORD,
    message,
    numbers: normalizeSaudi(phone),
    sender: SMS_SENDER,
    unicode: SMS_UNICODE,
    Rmduplicated: '1',
    return: 'xml',
  }).toString();
  try {
    const res = await fetch(SMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) return false;
    // 4jawaly returns xml; a leading "1" / <code>1</code> means accepted
    if (/<code>\s*1\s*<\/code>/i.test(text)) return true;
    if (/error|invalid|fail|رصيد|غير صحيح/i.test(text)) return false;
    return true;
  } catch {
    return false;
  }
}

/* ---------------- Password-reset OTP ---------------- */
let otpEnsured = false;
async function ensureOtp() {
  if (otpEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS password_otps (
      phone VARCHAR(20) NOT NULL PRIMARY KEY,
      code VARCHAR(6) NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      last_sent DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `).catch(() => {});
  otpEnsured = true;
}

/** Whether a member is registered with this phone. */
export async function userExistsByPhone(phone: string): Promise<boolean> {
  const last9 = normalizeSaudi(phone).slice(-9);
  if (last9.length < 9) return false;
  const u = await prisma.users.findFirst({ where: { phoneNumber: { contains: last9 } }, select: { id: true } }).catch(() => null);
  return !!u;
}

/** Generate a 6-digit code, store it, and SMS it. Rate-limited to 1/60s. */
export async function createAndSendOtp(phone: string): Promise<{ ok: boolean; error?: string }> {
  await ensureOtp();
  const norm = normalizeSaudi(phone);
  const rows = await prisma.$queryRawUnsafe<{ secs: number | bigint }[]>(
    `SELECT TIMESTAMPDIFF(SECOND, last_sent, NOW()) secs FROM password_otps WHERE phone = ?`, norm,
  ).catch(() => [] as { secs: number }[]);
  const secs = rows[0] ? Number(rows[0].secs) : 999;
  if (secs < 60) return { ok: false, error: `انتظر ${60 - secs} ثانية قبل إعادة إرسال الرمز` };

  const code = String(randomInt(100000, 1000000));
  await prisma.$executeRawUnsafe(
    `INSERT INTO password_otps (phone, code, expires_at, attempts, last_sent)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0, NOW())
     ON DUPLICATE KEY UPDATE code = VALUES(code), expires_at = VALUES(expires_at), attempts = 0, last_sent = NOW()`,
    norm, code,
  );
  const sent = await sendSms(norm, `رمز استعادة كلمة المرور في تربح: ${code}`);
  if (!sent) return { ok: false, error: 'تعذّر إرسال الرسالة حالياً، حاول لاحقاً' };
  return { ok: true };
}

/** Validate a code (max 5 attempts, 10-minute window). */
export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  await ensureOtp();
  const norm = normalizeSaudi(phone);
  const rows = await prisma.$queryRawUnsafe<{ code: string; expired: number | bigint; attempts: number | bigint }[]>(
    `SELECT code, (expires_at < NOW()) expired, attempts FROM password_otps WHERE phone = ?`, norm,
  ).catch(() => [] as { code: string; expired: number; attempts: number }[]);
  const r = rows[0];
  if (!r) return false;
  if (Number(r.expired) === 1 || Number(r.attempts) >= 5) return false;
  await prisma.$executeRawUnsafe(`UPDATE password_otps SET attempts = attempts + 1 WHERE phone = ?`, norm);
  return String(r.code) === String(code).trim();
}

/** Set a new password for the member owning this phone. */
export async function resetPasswordByPhone(phone: string, newPassword: string): Promise<boolean> {
  const norm = normalizeSaudi(phone);
  const last9 = norm.slice(-9);
  const user = await prisma.users.findFirst({ where: { phoneNumber: { contains: last9 } }, select: { id: true } }).catch(() => null);
  if (!user) return false;
  const hash = await hashPassword(newPassword);
  await prisma.users.update({ where: { id: user.id }, data: { password: hash } });
  await prisma.$executeRawUnsafe(`DELETE FROM password_otps WHERE phone = ?`, norm).catch(() => {});
  return true;
}
