import Link from 'next/link';
import { requireAdminPage } from '@/lib/access-control/guards';
import { AccessBoundary } from '@/components/access-boundary';
import { createMemberAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إضافة عضو' };

const input = 'min-h-11 w-full rounded-lg border border-primary/25 bg-white px-3 text-sm';
const label = 'text-sm font-bold text-primary';

export default async function AdminNewUser({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdminPage('/admin/users');
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-primary">إضافة عضو</h1>
        <Link href="/admin/users" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">الأعضاء ←</Link>
      </div>
      {error && <p role="alert" className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-700">{decodeURIComponent(error)}</p>}
      <AccessBoundary module={'users'} action={'create'}>
        <form action={createMemberAction} className="card-3d space-y-3 rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">ينشئ حساب عضو مباشرةً (بجواله السعودي كاسم دخول). يمكنه الدخول بكلمة المرور التي تحددها، وتعديل بياناته لاحقاً من حسابه.</p>
          <label className="block space-y-1"><span className={label}>اسم العضو</span><input className={input} name="name" required maxLength={120} placeholder="الاسم الكامل" /></label>
          <label className="block space-y-1"><span className={label}>الجوال (اسم الدخول)</span><input className={input} name="phone" required inputMode="numeric" dir="ltr" placeholder="05XXXXXXXX" /></label>
          <label className="block space-y-1"><span className={label}>كلمة المرور</span><input className={input} name="password" required type="password" minLength={8} placeholder="كلمة مرور قوية" autoComplete="new-password" /></label>
          <button className="min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-extrabold text-white">إنشاء العضو</button>
        </form>
      </AccessBoundary>
    </div>
  );
}
