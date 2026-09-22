import { requireUser } from '@/lib/auth';
import { hasAccess } from '@/lib/access-control/guards';
import { getMfaCredential, mfaReadiness } from '@/lib/auth-security';
import { getAuthSecuritySettings } from '@/lib/settings';
import { SecurityForms } from './forms';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'أمان الحساب' };
export default async function SecurityPage() {
  const session = await requireUser();
  const [credential, manager, settings] = await Promise.all([getMfaCredential(session.uid), hasAccess(session.uid, 'security', 'manage_settings'), getAuthSecuritySettings()]);
  const readiness = manager ? await mfaReadiness() : [];
  return <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
    <h1 className="text-2xl font-bold">أمان الحساب</h1>
    <p>حالة تطبيق التحقق: {credential ? 'مفعّل' : 'لم يُربط بعد'}</p>
    <SecurityForms enrolled={!!credential} manager={manager} required={settings.requireAdminMfa} minimum={settings.passwordMinimum} />
    {manager && <section className="space-y-3 rounded-xl border p-4"><h2 className="font-bold">جاهزية حسابات الإدارة</h2>
      <p className="text-sm">يجب أن يربط كل إداري تطبيقه ويحفظ رموز الاسترداد ويجرب الدخول قبل تفعيل الإلزام العام. لتعيين إداري جديد بعد الإلزام، اطلب منه الربط أولاً من صفحة أمان الحساب.</p>
      <ul className="space-y-2">{readiness.map((r) => <li key={r.id}>{r.name} (#{r.id}) — {r.enrolled ? 'تم الربط' : 'بانتظار الربط'}</li>)}</ul>
    </section>}
  </main>;
}
