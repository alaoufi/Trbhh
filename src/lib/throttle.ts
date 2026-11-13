import 'server-only';
import { isIP } from 'node:net';
import { rateGet, rateHit } from './redis';

/** عنوان الطالب كما يمرّره الوكيل العكسي. يُستخدم للحدّ من الإساءة فقط، لا للتوثيق. */
export async function clientIp(): Promise<string | null> {
  try {
    const { headers } = await import('next/headers');
    const h = await headers();
    const candidate = (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || '').trim();
    return isIP(candidate) ? candidate : null;
  } catch { return null; }
}

/** يحتسب محاولة ويعيد false إن تجاوز المفتاح حدّه ضمن النافذة. */
export async function allowHit(key: string, limit: number, windowSec: number): Promise<boolean> {
  return (await rateHit(key, windowSec)) <= limit;
}

/** هل تجاوز المفتاح حدّه؟ (قراءة فقط بلا احتساب). */
export async function overLimit(key: string, limit: number): Promise<boolean> {
  return (await rateGet(key)) >= limit;
}

/**
 * حدود إرسال رموز التحقق: تمنع استنزاف رصيد الرسائل وتخمين الرمز بطلب رموز متتالية.
 * حدّ العنوان واسع عمداً لأن شبكات الجوال تشارك العنوان بين مشتركين كثر.
 */
export async function allowOtpSend(phone: string): Promise<boolean> {
  if (!(await allowHit(`rl:otp-send:p:${phone}`, 8, 86400))) return false;
  const ip = await clientIp();
  return ip ? allowHit(`rl:otp-send:ip:${ip}`, 20, 3600) : true;
}

/** حدّ يومي لمحاولات إدخال الرمز لكل رقم — يبقى عبر إعادة إصدار الرمز وانتهاء صلاحيته. */
export async function allowOtpGuess(phone: string): Promise<boolean> {
  return allowHit(`rl:otp-guess:${phone}`, 20, 86400);
}
