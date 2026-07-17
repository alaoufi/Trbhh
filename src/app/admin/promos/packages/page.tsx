import { redirect } from 'next/navigation';

/** انتقلت باقات الإعلانات الترويجية (المدد والأسعار) إلى تبويب «كل التسعير» الموحّد. */
export default function AdminPromoPackagesRedirect() {
  redirect('/admin/revenue?tab=pricing#promo-packages');
}
