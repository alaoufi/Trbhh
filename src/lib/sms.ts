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
    // اسم المرسِل يأتي من إعدادات الإدارة (يجب أن يكون معتمداً من 4jawaly). لا اسم
    // افتراضي مكتوب في الكود — يُضبط من لوحة «بوابات التحقق».
    getSetting(MSG_KEYS.smsSender, process.env.SMS_SENDER || ''),
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
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Trbhh/1.0' },
      // per 4jawaly v1: number_iso filters recipients by country; globals carry
      // the default sender/country for any transmission without its own.
      body: JSON.stringify({
        messages: [{ text: message, numbers: [normalizeSaudi(phone)], sender: cfg.smsSender, number_iso: 'SA' }],
        globals: { number_iso: 'SA', sender: cfg.smsSender },
      }),
      cache: 'no-store',
    });
    const text = await res.text().catch(() => '');
    if (res.status === 200 && /"(code|status)"\s*:\s*200|"job_id"|"total_success"\s*:\s*[1-9]|"inserted_numbers"\s*:\s*[1-9]/i.test(text)) return true;
    return false;
  } catch {
    return false;
  }
}

export type SmsDiag = { ok: boolean; steps: string[]; httpStatus?: number; body?: string };

/** Live gateway self-test: reads the saved config, sends ONE real test SMS, and
 *  returns 4jawaly's raw reply + a plain-Arabic diagnosis (admin tester). */
export async function smsDiagnose(phone: string): Promise<SmsDiag> {
  const cfg = await getMessagingConfig();
  const steps: string[] = [];
  if (!cfg.enabled) steps.push('⚠️ الخدمة غير مفعّلة — فعّل «تفعيل خدمة استعادة كلمة المرور».');
  if (!cfg.smsUser) steps.push('⚠️ «المفتاح (app_key)» غير مضبوط.');
  if (!cfg.smsPass) steps.push('⚠️ «السر (app_secret)» غير مضبوط.');
  if (!cfg.smsSender) steps.push('⚠️ «اسم المرسِل» غير مضبوط.');
  if (!cfg.smsUser || !cfg.smsPass || !cfg.smsSender) {
    steps.push('↩︎ أكمل الحقول الناقصة في الأعلى واحفظ، ثم أعد الاختبار.');
    return { ok: false, steps };
  }
  const auth = Buffer.from(`${cfg.smsUser}:${cfg.smsPass}`).toString('base64');
  try {
    const res = await fetch(cfg.smsUrl || JAWALY_V1_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Trbhh/1.0' },
      body: JSON.stringify({
        messages: [{ text: 'رسالة اختبار من منصة تربح', numbers: [normalizeSaudi(phone)], sender: cfg.smsSender, number_iso: 'SA' }],
        globals: { number_iso: 'SA', sender: cfg.smsSender },
      }),
      cache: 'no-store',
    });
    const body = (await res.text().catch(() => '')) || '';
    const ok = res.status === 200 && /"(code|status)"\s*:\s*200|"job_id"|"total_success"\s*:\s*[1-9]|"inserted_numbers"\s*:\s*[1-9]/i.test(body);
    if (ok) {
      steps.push('✅ قبِلت البوابة الرسالة — يجب أن تصلك خلال ثوانٍ. لو ظهر تنبيه أصفر في الموقع فالكود المحدَّث لم يُنشر بعد.');
    } else if (/is_token|"?token"?|منته|مفع|activat|expired|not.?active|disabled/i.test(body)) {
      steps.push('❌ تطبيق الـAPI في 4jawaly غير مُفعّل أو منتهٍ. ادخل 4jawaly ← تطبيقاتي/API، فعّل التطبيق (أو أنشئ تطبيقاً جديداً وفعّله)، وتأكّد أن وصول API مفعّل لحسابك، ثم انسخ المفتاح والسر الجديدين هنا.');
    } else if (res.status === 401 || res.status === 403 || /unauthenticated|unauthorized|invalid.?(auth|credential)/i.test(body)) {
      steps.push('❌ فشلت المصادقة — «المفتاح/السر» (app_key/app_secret) غير صحيحين. انسخهما من جديد من 4jawaly.');
    } else if (/sender|مرسِل|sender_?name/i.test(body)) {
      steps.push('❌ مشكلة في «اسم المرسِل» — تأكّد أنه معتمد ومفعّل في حساب 4jawaly (بالضبط كما هو).');
    } else if (/balance|رصيد|credit|insufficient/i.test(body)) {
      steps.push('❌ لا يوجد رصيد كافٍ في حساب 4jawaly — اشحن الرصيد.');
    } else if (res.status === 0 || res.status >= 500) {
      steps.push('❌ خطأ من خادم 4jawaly — أعد المحاولة بعد قليل.');
    } else {
      steps.push('❌ رفضت البوابة الرسالة — اطّلع على الرد الخام أدناه لمعرفة السبب.');
    }
    return { ok, steps, httpStatus: res.status, body: body.slice(0, 1000) };
  } catch {
    steps.push('❌ تعذّر الاتصال ببوابة 4jawaly — تحقّق من «رابط الـAPI» ومن اتصال الخادم بالإنترنت.');
    return { ok: false, steps };
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
  // credentials + an (approved) sender name are all required — set in admin.
  if (!cfg.smsUser || !cfg.smsPass || !cfg.smsSender) return false;
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

  // أمان: نُبقي عدّاد المحاولات عبر عمليات إعادة الإرسال داخل النافذة حتى لا
  // يُلتَفّ على حدّ المحاولات بطلب رمز جديد؛ ونحظر الرقم بعد تجاوز حدّ عام.
  const prevAttempts = otp && otp.expires_at.getTime() > Date.now() ? otp.attempts : 0;
  if (prevAttempts >= 10) return { ok: false, delivered: false, error: 'تجاوزت الحدّ المسموح للمحاولات — حاول بعد قليل' };

  const code = String(randomInt(1000, 10000)); // رمز تحقّق من ٤ خانات (1000–9999)
  const fresh = { code, expires_at: new Date(Date.now() + 10 * 60_000), attempts: prevAttempts, last_sent: new Date() };
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
  // أمان: طابق الرقم بصيغته الكاملة الدقيقة (لا «contains» على آخر ٩ أرقام الذي
  // قد يصادف حساباً آخر بصيغة دولية مختلفة)، وارفض إن تطابق أكثر من حساب.
  const digits = norm.replace(/\D/g, '');
  let sig = digits.startsWith('966') ? digits.slice(3) : digits;
  sig = sig.replace(/^0+/, '');
  if (sig.length < 8) return false;
  const forms = [sig, `0${sig}`, `966${sig}`, `00966${sig}`];
  const rows = await prisma.$queryRawUnsafe<{ id: bigint }[]>(
    `SELECT id FROM users
     WHERE REPLACE(REPLACE(REPLACE(IFNULL(phoneNumber,''),' ',''),'-','') , '+','') IN (?,?,?,?)`,
    forms[0], forms[1], forms[2], forms[3],
  ).catch(() => [] as { id: bigint }[]);
  const ids = [...new Set(rows.map((r) => r.id.toString()))];
  if (ids.length !== 1) return false; // لا تطابق أو تطابق متعدّد غامض
  const hash = await hashPassword(newPassword);
  await prisma.users.update({ where: { id: BigInt(ids[0]) }, data: { password: hash } });
  await prisma.password_otps.deleteMany({ where: { phone: norm } }).catch(() => {});
  return true;
}
