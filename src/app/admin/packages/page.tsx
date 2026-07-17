import { redirect } from 'next/navigation';

/** انتقلت باقات عدد الإعلانات إلى تبويب «كل التسعير» الموحّد. */
export default function AdminPackagesRedirect() {
  redirect('/admin/revenue?tab=pricing#packages');
}
