import { redirect } from 'next/navigation';

/** انتقل سجل التجاوزات (الرصد الآلي) إلى تبويب «بلاغات الرصد الآلي» داخل صفحة «البلاغات» الموحّدة. */
export default function AdminModerationRedirect() {
  redirect('/admin/reports?tab=auto');
}
