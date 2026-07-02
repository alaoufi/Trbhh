'use server';
import { redirect } from 'next/navigation';
import { createAndSendOtp, verifyOtp, resetPasswordByPhone, userExistsByPhone } from '@/lib/sms';

const enc = encodeURIComponent;

export async function sendCodeAction(formData: FormData) {
  const phone = String(formData.get('phone') || '').trim();
  if (!phone) redirect('/forgot?error=' + enc('أدخل رقم الجوال'));

  if (!(await userExistsByPhone(phone))) {
    redirect('/forgot?error=' + enc('رقم الجوال غير مسجّل لدينا'));
  }
  const r = await createAndSendOtp(phone);
  if (!r.ok) redirect(`/forgot?phone=${enc(phone)}&error=${enc(r.error || 'تعذّر الإرسال')}`);
  redirect(`/forgot?phone=${enc(phone)}&sent=1`);
}

export async function resetAction(formData: FormData) {
  const phone = String(formData.get('phone') || '').trim();
  const code = String(formData.get('code') || '').trim();
  const password = String(formData.get('password') || '');
  const base = `/forgot?phone=${enc(phone)}&sent=1`;

  if (!phone || !code) redirect(`${base}&error=${enc('أدخل الرمز')}`);
  if (password.length < 6) redirect(`${base}&error=${enc('كلمة المرور 6 أحرف على الأقل')}`);

  if (!(await verifyOtp(phone, code))) {
    redirect(`${base}&error=${enc('الرمز غير صحيح أو منتهي الصلاحية')}`);
  }
  const ok = await resetPasswordByPhone(phone, password);
  if (!ok) redirect(`${base}&error=${enc('تعذّر تحديث كلمة المرور')}`);
  redirect('/login?reset=1');
}
