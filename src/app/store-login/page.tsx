import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * بيانات الدخول موحّدة (رقم الجوال + كلمة المرور) لتربح والمتجر معاً —
 * لم يعد للمتجر دخول منفصل؛ أي رابط قديم يُحوَّل لصفحة الدخول الموحّدة،
 * وبعد الدخول تُفتح لوحة المتجر مباشرة.
 */
export default function StoreLoginPage() {
  redirect('/login?next=/store');
}
