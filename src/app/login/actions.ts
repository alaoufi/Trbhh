'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { verifyPassword, hashPassword, createSession } from '@/lib/auth';
import { toInt } from '@/lib/utils';

export async function loginAction(_prev: unknown, formData: FormData) {
  const identifier = String(formData.get('identifier') || '').trim();
  const password = String(formData.get('password') || '');
  if (!identifier || !password) return { error: 'أدخل بيانات الدخول كاملة' };

  const user = await prisma.users.findFirst({
    where: {
      OR: [{ userName: identifier }, { email: identifier }, { phoneNumber: identifier }],
    },
  });
  if (!user || !(await verifyPassword(password, user.password))) {
    return { error: 'بيانات الدخول غير صحيحة' };
  }
  if (user.ban === 'checked') return { error: 'هذا الحساب محظور' };

  await createSession({ uid: toInt(user.id), name: user.name || user.userName || 'عضو', type: user.type });
  redirect('/');
}

export async function registerAction(_prev: unknown, formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const password = String(formData.get('password') || '');
  if (!name || !phone || password.length < 6) {
    return { error: 'أكمل البيانات (كلمة المرور 6 أحرف على الأقل)' };
  }
  const exists = await prisma.users.findFirst({ where: { phoneNumber: phone } });
  if (exists) return { error: 'رقم الجوال مسجّل مسبقاً' };

  const user = await prisma.users.create({
    data: {
      name,
      userName: phone,
      phoneNumber: phone,
      password: await hashPassword(password),
      type: 'user',
      ban: 'no',
      trusted: 0,
      allow_phone: 1,
      whatsapp: 1,
      step: 0,
      forget: 0,
      is_admin: 0,
    },
  });
  await createSession({ uid: toInt(user.id), name, type: 'user' });
  redirect('/');
}
