'use server';
import { redirect } from 'next/navigation';
import { getSession, destroySession } from '@/lib/auth';
import { deleteAccountNow, requestAccountDeletion } from '@/lib/account-delete';

/** Logged-in member deletes their own account immediately. */
export async function deleteMyAccountAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect('/delete-account?error=login');
  if (!formData.get('confirm')) redirect('/delete-account?error=confirm');
  await deleteAccountNow(session!.uid);
  await destroySession();
  redirect('/delete-account?done=1');
}

/** Logged-out visitor files a deletion request (admin verifies & executes). */
export async function requestDeletionAction(formData: FormData) {
  const phone = String(formData.get('phone') || '');
  const name = String(formData.get('name') || '');
  const note = String(formData.get('note') || '');
  const ok = await requestAccountDeletion(phone, name, note);
  redirect(ok ? '/delete-account?requested=1' : '/delete-account?error=phone');
}
