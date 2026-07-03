import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getPrimaryAdminId } from '@/lib/admin-inbox';

export const dynamic = 'force-dynamic';

// "مراسلة الإدارة" — opens a direct chat with the administration account.
export default async function ContactAdminPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const adminId = await getPrimaryAdminId();
  if (!adminId || adminId === session.uid) redirect('/messages');
  redirect(`/messages/${adminId}`);
}
