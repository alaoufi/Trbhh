'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { hashPassword, createSession } from '@/lib/auth';
import { toLocalSaudi, userExistsByPhone, createAndSendOtp, verifyOtp } from '@/lib/sms';
import { registerOtpEnabled } from '@/lib/settings';
import { verifyLogin } from '@/lib/login-core';
import { toInt } from '@/lib/utils';

export type RegisterState =
  | null
  | { step?: 'code'; name?: string; phone?: string; password?: string; error?: string; notice?: string };

export async function loginAction(_prev: unknown, formData: FormData) {
  const identifier = String(formData.get('identifier') || '').trim();
  const password = String(formData.get('password') || '');
  const r = await verifyLogin(identifier, password);
  if (!r.ok) return { error: r.error };

  await createSession({ uid: r.uid, name: r.name, type: r.type });
  const next = String(formData.get('next') || '');
  // مسار داخلي فقط: يبدأ بـ / وليس // أو /\ (خدعة إعادة توجيه لموقع خارجي)
  if (next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')) redirect(next);
  // بيانات الدخول موحّدة: نفس الجلسة تفتح تربح وإدارة متجر العضو (إن كان له متجر).
  redirect('/');
}

export async function registerAction(_prev: unknown, formData: FormData): Promise<RegisterState> {
  const name = String(formData.get('name') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const password = String(formData.get('password') || '');
  const code = String(formData.get('code') || '').trim();
  if (!name || !phone || password.length < 4) {
    return { error: 'أكمل البيانات (كلمة المرور 4 خانات على الأقل)', name, phone };
  }
  if (!formData.get('agree')) {
    return { error: 'يجب الموافقة على الشروط والأحكام وسياسة الخصوصية.', name, phone, password };
  }
  // الأسماء المخالفة (كلمات/جمل مرفوضة) لا تُقبل إلا من الإدارة
  const { containsBannedName } = await import('@/lib/censor');
  if (await containsBannedName(name)) {
    return { error: 'الاسم يحتوي كلمة غير مسموحة — اختر اسماً آخر.', name, phone, password };
  }
  const phoneLocal = toLocalSaudi(phone); // store canonical 05XXXXXXXX
  if (await userExistsByPhone(phone)) return { error: 'رقم الجوال مسجّل مسبقاً', name, phone };

  // تحقّق ملكية الجوال (إن فُعّل من الإدارة): يمنع التسجيل بجوال غير مملوك.
  if (await registerOtpEnabled()) {
    if (!code) {
      const r = await createAndSendOtp(phone);
      if (!r.ok) return { error: r.error || 'تعذّر إرسال رمز التحقق', name, phone, password };
      return { step: 'code', name, phone, password, notice: r.delivered ? 'أرسلنا رمز تحقق إلى جوالك.' : 'أُرسل رمز التحقق (قد يتأخر قليلاً).' };
    }
    if (!(await verifyOtp(phone, code))) {
      return { step: 'code', name, phone, password, error: 'الرمز غير صحيح أو منتهي الصلاحية.' };
    }
    // استهلاك الرمز بعد نجاحه (منع إعادة الاستخدام)
    await prisma.password_otps.deleteMany({ where: { phone: phoneLocal } }).catch(() => {});
  }

  // الإحالة: كوكي ref يوضع من رابط الدعوة /r/<id>
  const { cookies } = await import('next/headers');
  const refRaw = (await cookies()).get('trbhh_ref')?.value || '';
  const refBy = Number(refRaw) || 0;

  const user = await prisma.users.create({
    data: {
      name,
      userName: phoneLocal,
      phoneNumber: phoneLocal,
      password: await hashPassword(password),
      type: 'user',
      ban: 'no',
      trusted: 0,
      allow_phone: 1,
      whatsapp: 1,
      step: 0,
      forget: 0,
      is_admin: 0,
      ...(refBy > 0 ? { ref_by: refBy } : {}),
    },
  });
  // رصيد ترحيبي (إن فُعّل) — لا يعطّل التسجيل بأي حال
  import('@/lib/points').then((m) => m.grantWelcome(toInt(user.id))).catch(() => {});
  await createSession({ uid: toInt(user.id), name, type: 'user' });
  redirect('/');
}
