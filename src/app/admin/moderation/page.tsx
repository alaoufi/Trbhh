import { requireAdminPage } from '@/lib/access-control/guards';
import { redirect } from 'next/navigation';

/** انتقل سجل التجاوزات (الرصد الآلي) إلى تبويب «بلاغات الرصد الآلي» داخل صفحة «البلاغات» الموحّدة. */
export default async function AdminModerationRedirect() {
  await requireAdminPage('/admin/moderation');
  redirect('/admin/reports?tab=auto');
}
