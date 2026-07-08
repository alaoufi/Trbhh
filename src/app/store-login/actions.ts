'use server';
import { redirect } from 'next/navigation';
import { createSession } from '@/lib/auth';
import { storeLogin } from '@/lib/merchant';

/** Independent store login: handle + dedicated store password → store dashboard. */
export async function storeLoginAction(formData: FormData) {
  const handle = String(formData.get('handle') || '').trim();
  const password = String(formData.get('password') || '');
  const s = String(formData.get('s') || '').trim();
  const back = `/store-login?error=1${s ? `&s=${encodeURIComponent(s)}` : ''}`;
  if (!handle || !password) redirect(back);
  const owner = await storeLogin(handle, password);
  if (!owner) redirect(back);
  await createSession({ uid: owner.uid, name: owner.name, type: 'user', scope: 'store' });
  redirect('/store');
}
