'use server';
import { createAndSendOtp, verifyOtp, userExistsByPhone } from '@/lib/sms';
import { resetStoreCredentialsByPhone } from '@/lib/merchant';

export type ForgotState =
  | { step: 'phone'; error?: string }
  | { step: 'code'; phone: string; note?: string; error?: string }
  | { step: 'done'; username: string; password: string };

/** Step 1: send an SMS code to the store owner's registered phone. */
export async function sendStoreOtpAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const phone = String(formData.get('phone') || '').trim();
  if (!phone) return { step: 'phone', error: 'أدخل رقم الجوال المسجّل.' };
  if (!(await userExistsByPhone(phone))) return { step: 'phone', error: 'لا يوجد حساب بهذا الجوال.' };
  const r = await createAndSendOtp(phone);
  if (!r.ok) return { step: 'phone', error: r.error || 'تعذّر إرسال الرمز.' };
  return { step: 'code', phone, note: r.delivered ? undefined : 'إن لم يصلك الرمز خلال دقيقة تحقّق من إعداد البوابة.' };
}

/** Step 2: verify the code, reset the store password, and reveal the login identifier + new password. */
export async function verifyStoreOtpAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const phone = String(formData.get('phone') || '').trim();
  const code = String(formData.get('code') || '').trim();
  if (!phone || !code) return { step: 'code', phone, error: 'أدخل الرمز.' };
  if (!(await verifyOtp(phone, code))) return { step: 'code', phone, error: 'الرمز غير صحيح أو منتهي الصلاحية.' };
  const creds = await resetStoreCredentialsByPhone(phone);
  if (!creds) return { step: 'code', phone, error: 'لا يوجد متجر مرتبط بهذا الجوال.' };
  return { step: 'done', username: creds.username, password: creds.password };
}
