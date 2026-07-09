'use server';
import { redirect } from 'next/navigation';
import { createSession } from '@/lib/auth';
import { verifyLogin } from '@/lib/login-core';

/**
 * دخول المتجر بالبيانات الموحّدة (رقم الجوال + كلمة المرور) — نفس حساب تربح
 * ونفس الجلسة: الدخول من هنا يفتح تربح أيضاً، والخروج يخرج من الاثنين.
 */
export async function storeLoginAction(formData: FormData) {
  const identifier = String(formData.get('identifier') || '').trim();
  const password = String(formData.get('password') || '');
  const s = String(formData.get('s') || '').trim();
  const back = `/store-login?error=1${s ? `&s=${encodeURIComponent(s)}` : ''}`;
  const r = await verifyLogin(identifier, password);
  if (!r.ok) redirect(back);
  await createSession({ uid: r.uid, name: r.name, type: r.type });
  redirect('/store');
}
