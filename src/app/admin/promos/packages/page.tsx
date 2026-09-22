import { requireAdminPage } from '@/lib/access-control/guards';
import { redirect } from 'next/navigation';

/** انتقلت باقات الإعلانات الترويجية (المدد والأسعار) إلى تبويب «كل التسعير» الموحّد. */
export default async function AdminPromoPackagesRedirect() {
  await requireAdminPage('/admin/promos/packages');
  redirect('/admin/revenue?tab=promo-packages');
}
