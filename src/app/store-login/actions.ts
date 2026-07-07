'use server';
import { redirect } from 'next/navigation';
import { createSession } from '@/lib/auth';
import { storeLogin } from '@/lib/merchant';

/** Independent store login: handle + dedicated store password → store dashboard. */
export async function storeLoginAction(formData: FormData) {
  const handle = String(formData.get('handle') || '').trim();
  const password = String(formData.get('password') || '');
  if (!handle || !password) redirect('/store-login?error=1');
  const owner = await storeLogin(handle, password);
  if (!owner) redirect('/store-login?error=1');
  await createSession({ uid: owner.uid, name: owner.name, type: 'user', scope: 'store' });
  redirect('/store');
}
