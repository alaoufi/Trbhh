import 'server-only';
import { randomInt } from 'node:crypto';
import { prisma } from './prisma';
import { hashPassword } from './auth';
import { getSetting } from './settings';

/* Setting keys (editable from the admin). */
export const MSG_KEYS = {
  smsUrl: 'sms_url', smsUser: 'sms_username', smsPass: 'sms_password', smsSender: 'sms_sender', smsUnicode: 'sms_unicode',
  waUrl: 'wa_url', waInstance: 'wa_instance', waToken: 'wa_token',
  channel: 'otp_channel', enabled: 'otp_enabled',
} as const;

export type OtpChannel = 'sms' | 'whatsapp' | 'both';
export type MessagingConfig = {
  smsUrl: string; smsUser: string; smsPass: string; smsSender: string; smsUnicode: string;
  waUrl: string; waInstance: string; waToken: string;
  channel: OtpChannel; enabled: boolean;
};

/** Load messaging config from the DB (editable in admin), falling back to env. */
export async function getMessagingConfig(): Promise<MessagingConfig> {
  const [smsUrl, smsUser, smsPass, smsSender, smsUnicode, waUrl, waInstance, waToken, channel, enabled] = await Promise.all([
    getSetting(MSG_KEYS.smsUrl, process.env.SMS_URL || 'http://www.4jawaly.net/api/sendsms.php'),
    getSetting(MSG_KEYS.smsUser, process.env.SMS_USERNAME || ''),
    getSetting(MSG_KEYS.smsPass, process.env.SMS_PASSWORD || ''),
    getSetting(MSG_KEYS.smsSender, process.env.SMS_SENDER || 'SouqAlhafta'),
    getSetting(MSG_KEYS.smsUnicode, process.env.SMS_UNICODE || 'e'),
    getSetting(MSG_KEYS.waUrl, process.env.WA_URL || 'https://user.4whats.net/api/sendMessage'),
    getSetting(MSG_KEYS.waInstance, process.env.WA_INSTANCE || ''),
    getSetting(MSG_KEYS.waToken, process.env.WA_TOKEN || ''),
    getSetting(MSG_KEYS.channel, 'sms'),
    getSetting(MSG_KEYS.enabled, '1'),
  ]);
  const ch: OtpChannel = channel === 'whatsapp' || channel === 'both' ? channel : 'sms';
  return { smsUrl, smsUser, smsPass, smsSender, smsUnicode, waUrl, waInstance, waToken, channel: ch, enabled: enabled !== '0' };
}

/** Normalize a Saudi number to 9665XXXXXXXX (digits only). */
export function normalizeSaudi(phone: string): string {
  let p = (phone || '').replace(/\D/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('966')) return p;
  if (p.startsWith('0')) p = p.slice(1);
  if (p.startsWith('5')) return '966' + p;
  return p.startsWith('966') ? p : '966' + p;
}

/** Send an SMS via the 4jawaly gateway. */
export async function sendSms(phone: string, message: string, c?: MessagingConfig): Promise<boolean> {
  const cfg = c || (await getMessagingConfig());
  if (!cfg.smsUser || !cfg.smsPass) return false;
  const body = new URLSearchParams({
    username: cfg.smsUser, password: cfg.smsPass, message,
    numbers: normalizeSaudi(phone), sender: cfg.smsSender,
    unicode: cfg.smsUnicode, Rmduplicated: '1', return: 'xml',
  }).toString();
  try {
    const res = await fetch(cfg.smsUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, cache: 'no-store' });
    if (!res.ok) return false;
    const text = await res.text().catch(() => '');
    if (/<code>\s*1\s*<\/code>/i.test(text)) return true;
    if (/error|invalid|fail|رصيد|غير صحيح/i.test(text)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Send a WhatsApp message via the 4whats.net gateway. */
export async function sendWhatsApp(phone: string, message: string, c?: MessagingConfig): Promise<boolean> {
  const cfg = c || (await getMessagingConfig());
  if (!cfg.waInstance || !cfg.waToken) return false;
  const url = `${cfg.waUrl}?instanceid=${encodeURIComponent(cfg.waInstance)}&token=${encodeURIComponent(cfg.waToken)}&phone=${encodeURIComponent(normalizeSaudi(phone))}&body=${encodeURIComponent(message)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return false;
    const text = await res.text().catch(() => '');
    return !/error|invalid|fail|not.?found/i.test(text);
  } catch {
    return false;
  }
}

/** Send a message through the currently configured channel(s). */
export async function sendVerification(phone: string, message: string): Promise<boolean> {
  const cfg = await getMessagingConfig();
  let ok = false;
  if (cfg.channel === 'sms' || cfg.channel === 'both') ok = (await sendSms(phone, message, cfg)) || ok;
  if (cfg.channel === 'whatsapp' || cfg.channel === 'both') ok = (await sendWhatsApp(phone, message, cfg)) || ok;
  return ok;
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

/** Generate a 6-digit code, store it, and send via the active channel(s).
 *  ok    = the code was created and the gateway is configured (advance to entry)
 *  delivered = the send call reported success (best-effort; detection can vary) */
export async function createAndSendOtp(phone: string): Promise<{ ok: boolean; delivered: boolean; error?: string }> {
  await ensureOtp();
  const cfg = await getMessagingConfig();
  if (!cfg.enabled) return { ok: false, delivered: false, error: 'خدمة استعادة كلمة المرور غير مفعّلة حالياً' };
  const smsReady = !!(cfg.smsUser && cfg.smsPass);
  const waReady = !!(cfg.waInstance && cfg.waToken);
  const configured = (cfg.channel === 'sms' && smsReady) || (cfg.channel === 'whatsapp' && waReady) || (cfg.channel === 'both' && (smsReady || waReady));
  if (!configured) return { ok: false, delivered: false, error: 'لم تُضبط بيانات بوابة الإرسال في الإدارة (بوابات التحقق)' };

  const norm = normalizeSaudi(phone);
  const rows = await prisma.$queryRawUnsafe<{ secs: number | bigint }[]>(
    `SELECT TIMESTAMPDIFF(SECOND, last_sent, NOW()) secs FROM password_otps WHERE phone = ?`, norm,
  ).catch(() => [] as { secs: number }[]);
  const secs = rows[0] ? Number(rows[0].secs) : 999;
  if (secs < 60) return { ok: false, delivered: false, error: `انتظر ${60 - secs} ثانية قبل إعادة إرسال الرمز` };

  const code = String(randomInt(100000, 1000000));
  await prisma.$executeRawUnsafe(
    `INSERT INTO password_otps (phone, code, expires_at, attempts, last_sent)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0, NOW())
     ON DUPLICATE KEY UPDATE code = VALUES(code), expires_at = VALUES(expires_at), attempts = 0, last_sent = NOW()`,
    norm, code,
  );
  const delivered = await sendVerification(norm, `رمز استعادة كلمة المرور في تربح: ${code}`);
  return { ok: true, delivered };
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
