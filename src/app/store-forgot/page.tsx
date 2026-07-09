import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** بيانات الدخول موحّدة — استعادة كلمة المرور من صفحة الاستعادة الموحّدة. */
export default function StoreForgotPage() {
  redirect('/forgot');
}
