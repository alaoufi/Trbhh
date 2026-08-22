'use server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { createSession, hashPassword } from '@/lib/auth';
import { containsBannedName } from '@/lib/censor';
import { normalizeSaudiRegistrationPhone } from '@/lib/phone-registration';
import { consumeSaudiRegistrationIntent, startSaudiRegistrationIntent } from '@/lib/registration-otp';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from '@/lib/utils';

export type RegistrationState = { step?: 'otp'; phone?: string; error?: string; notice?: string } | null;
const v = (form: FormData, key: string) => String(form.get(key) || '').trim();

export async function startRegistrationAction(_previous: RegistrationState, form: FormData): Promise<RegistrationState> {
  const name = v(form, 'name'); const rawPhone = v(form, 'phone'); const password = String(form.get('password') || '');
  if (!name || !rawPhone || password.length < 4 || !form.get('agree')) return { error: 'أكمل البيانات ووافق على الشروط (كلمة المرور 4 خانات على الأقل).' };
  if (await containsBannedName(name)) return { error: 'الاسم يحتوي كلمة غير مسموحة — اختر اسماً آخر.' };
  const phone = normalizeSaudiRegistrationPhone(rawPhone);
  if (!phone) redirect(`/register/international?phone=${encodeURIComponent(rawPhone)}`);
  const refBy = Number((await cookies()).get('trbhh_ref')?.value || '') || undefined;
  const result = await startSaudiRegistrationIntent({ name, phone, password, refBy });
  return result.ok ? { step: 'otp', phone, notice: 'أرسلنا رمز التحقق إلى جوالك. لن يُنشأ الحساب قبل إدخاله.' } : { error: result.error };
}

export async function confirmSaudiRegistrationAction(_previous: RegistrationState, form: FormData): Promise<RegistrationState> {
  const phone = normalizeSaudiRegistrationPhone(v(form, 'phone')); const code = v(form, 'code');
  if (!phone || !code) return { step: 'otp', phone: phone || undefined, error: 'أدخل رمز التحقق.' };
  const result = await consumeSaudiRegistrationIntent(phone, code);
  if (!result.ok) return { step: 'otp', phone, error: result.error };
  import('@/lib/points').then((m) => m.grantWelcome(toInt(result.user.id))).catch(() => {});
  await createSession({ uid: toInt(result.user.id), name: result.user.name || phone, type: 'user' });
  redirect('/');
}

export async function submitInternationalRegistrationAction(_previous: RegistrationState, form: FormData): Promise<RegistrationState> {
  const country = v(form, 'country'); const name = v(form, 'name'); const phone = v(form, 'phone').replace(/\s+/g, '');
  const email = v(form, 'email').toLowerCase(); const reason = v(form, 'reason'); const password = String(form.get('password') || '');
  if (!country || !name || !phone || !email || !reason || password.length < 4 || !form.get('agree')) return { error: 'أكمل الدولة وبيانات التواصل والسبب وكلمة المرور ووافق على الشروط.' };
  if (normalizeSaudiRegistrationPhone(phone)) return { error: 'رقمك سعودي؛ استخدم التسجيل برمز التحقق.' };
  if (await containsBannedName(name)) return { error: 'الاسم يحتوي كلمة غير مسموحة — اختر اسماً آخر.' };
  await ensureSchema();
  const existing = await prisma.users.findFirst({ where: { OR: [{ phoneNumber: phone }, { email }] }, select: { id: true } });
  if (existing) return { error: 'بيانات التواصل مسجّلة مسبقاً.' };
  await prisma.$executeRawUnsafe('INSERT INTO international_registration_requests (country,name,phone,email,reason,password_hash,status) VALUES (?,?,?,?,?, ?,\'pending\')', country.slice(0, 100), name.slice(0, 120), phone.slice(0, 40), email.slice(0, 160), reason.slice(0, 500), await hashPassword(password));
  return { notice: 'تم استلام طلبك. ستراجعه الإدارة قبل إنشاء الحساب.' };
}
