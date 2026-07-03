import 'server-only';
import { randomInt } from 'node:crypto';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { hashPassword } from './auth';
import { getSetting } from './settings';

/* Setting keys (editable from the admin). */
export const MSG_KEYS = {
  smsProvider: 'sms_provider', smsUrl: 'sms_url', smsUser: 'sms_username', smsPass: 'sms_password', smsSender: 'sms_sender', smsUnicode: 'sms_unicode',
  waUrl: 'wa_url', waInstance: 'wa_instance', waToken: 'wa_token',
  channel: 'otp_channel', enabled: 'otp_enabled',
} as const;

/** jawaly_v1 = current REST API (app_key/app_secret, Basic auth + JSON).
 *  legacy    = old username/password form POST (deprecated on most gateways). */
export type SmsProvider = 'jawaly_v1' | 'legacy';
export const JAWALY_V1_URL = 'https://api-sms.4jawaly.com/api/v1/account/area/sms/send';

export type OtpChannel = 'sms' | 'whatsapp' | 'both';
export type MessagingConfig = {
  smsProvider: SmsProvider; smsUrl: string; smsUser: string; smsPass: string; smsSender: string; smsUnicode: string;
  waUrl: string; waInstance: string; waToken: string;
  channel: OtpChannel; enabled: boolean;
};

/** Load messaging config from the DB (editable in admin), falling back to env. */
export async function getMessagingConfig(): Promise<MessagingConfig> {
  const [smsProvider, smsUrl, smsUser, smsPass, smsSender, smsUnicode, waUrl, waInstance, waToken, channel, enabled] = await Promise.all([
    getSetting(MSG_KEYS.smsProvider, process.env.SMS_PROVIDER || 'jawaly_v1'),
    getSetting(MSG_KEYS.smsUrl, process.env.SMS_URL || JAWALY_V1_URL),
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
  const prov: SmsProvider = smsProvider === 'legacy' ? 'legacy' : 'jawaly_v1';
  return { smsProvider: prov, smsUrl, smsUser, smsPass, smsSender, smsUnicode, waUrl, waInstance, waToken, channel: ch, enabled: enabled !== '0' };
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

/** Canonical local Saudi format for storage/display: 05XXXXXXXX. */
export function toLocalSaudi(phone: string): string {
  const n = normalizeSaudi(phone);
  if (n.startsWith('966') && n.length === 12) return '0' + n.slice(3);
  return (phone || '').trim();
}

/** Send an SMS via the current 4jawaly REST API (app_key/app_secret). */
async function sendJawalyV1(phone: string, message: string, cfg: MessagingConfig): Promise<boolean> {
  const url = cfg.smsUrl || JAWALY_V1_URL;
  const auth = Buffer.from(`${cfg.smsUser}:${cfg.smsPass}`).toString('base64');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ messages: [{ text: message, numbers: [normalizeSaudi(phone)], sender: cfg.smsSender }] }),
      cache: 'no-store',
    });
    const text = await res.text().catch(() => '');
    if (res.status === 200 && /"(code|status)"\s*:\s*200|"job_id"|success|"total_success"/i.test(text)) return true;
    return false;
  } catch {
    return false;
  }
}

/** Send via a legacy username/password form gateway (deprecated). */
async function sendLegacyForm(phone: string, message: string, cfg: MessagingConfig): Promise<boolean> {
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
    if (/error|invalid|fail|رصيد|غير صحيح|<html|<!doctype/i.test(text)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Send an SMS via the configured provider. */
export async function sendSms(phone: string, message: string, c?: MessagingConfig): Promise<boolean> {
  const cfg = c || (await getMessagingConfig());
  if (!cfg.smsUser || !cfg.smsPass) return false;
  return cfg.smsProvider === 'legacy' ? sendLegacyForm(phone, message, cfg) : sendJawalyV1(phone, message, cfg);
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
const ensureOtp = ensureSchema;

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
  const otp = await prisma.password_otps.findUnique({ where: { phone: norm } }).catch(() => null);
  const secs = otp ? Math.floor((Date.now() - otp.last_sent.getTime()) / 1000) : 999;
  if (secs < 60) return { ok: false, delivered: false, error: `انتظر ${60 - secs} ثانية قبل إعادة إرسال الرمز` };

  const code = String(randomInt(100000, 1000000));
  const fresh = { code, expires_at: new Date(Date.now() + 10 * 60_000), attempts: 0, last_sent: new Date() };
  await prisma.password_otps.upsert({ where: { phone: norm }, create: { phone: norm, ...fresh }, update: fresh });
  const delivered = await sendVerification(norm, `رمز استعادة كلمة المرور في تربح: ${code}`);
  return { ok: true, delivered };
}

/** Admin action: set a fresh random password for a member and SMS it to them. */
export async function sendNewPasswordToUser(userId: number): Promise<{ ok: boolean; error?: string }> {
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { phoneNumber: true } }).catch(() => null);
  if (!u?.phoneNumber) return { ok: false, error: 'لا يوجد رقم جوال لهذا العضو' };
  const pass = String(randomInt(100000, 1000000));
  await prisma.users.update({ where: { id: BigInt(userId) }, data: { password: await hashPassword(pass) } });
  const sent = await sendVerification(u.phoneNumber, `كلمة مرورك الجديدة في تربح: ${pass}`);
  if (!sent) return { ok: false, error: 'حُدّثت كلمة المرور لكن تعذّر إرسال الرسالة (تحقّق من إعداد البوابة)' };
  return { ok: true };
}

/** Validate a code (max 5 attempts, 10-minute window). */
export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  await ensureOtp();
  const norm = normalizeSaudi(phone);
  const r = await prisma.password_otps.findUnique({ where: { phone: norm } }).catch(() => null);
  if (!r) return false;
  if (r.expires_at.getTime() < Date.now() || r.attempts >= 5) return false;
  await prisma.password_otps.update({ where: { phone: norm }, data: { attempts: { increment: 1 } } });
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
  await prisma.password_otps.deleteMany({ where: { phone: norm } }).catch(() => {});
  return true;
}
