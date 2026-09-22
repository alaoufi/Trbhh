import { requireAdminPage } from '@/lib/access-control/guards';
import { redirect } from 'next/navigation';

/** انتقلت باقات عدد الإعلانات إلى تبويب «كل التسعير» الموحّد. */
export default async function AdminPackagesRedirect() {
  await requireAdminPage('/admin/packages');
  redirect('/admin/revenue?tab=packages');
}
