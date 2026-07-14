import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRightLeft, User, Store, Shield } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { linkedUserIds, linkedAccounts } from '@/lib/account-links';
import { switchAccountAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تأكيد التبديل' };

export default async function SwitchConfirm({ searchParams }: { searchParams?: Promise<{ to?: string }> }) {
  const session = await requireUser();
  const sp = searchParams ? await searchParams : {};
  const target = Number(sp.to || 0);
  if (!target || target === session.uid) redirect('/account');
  const linked = await linkedUserIds(session.uid).catch(() => [session.uid]);
  if (!linked.includes(target)) redirect('/account?error=notlinked');
  const acct = (await linkedAccounts(session.uid).catch(() => [])).find((a) => a.id === target);
  if (!acct) redirect('/account');

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded-2xl border-2 border-primary/25 bg-card p-5 text-center">
        <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><ArrowRightLeft className="h-7 w-7" /></span>
        <h1 className="text-lg font-extrabold text-primary">تأكيد التبديل</h1>
        <p className="mt-1 text-sm text-muted-foreground">أنت على وشك الانتقال من حسابك الحالي «{session.name}» إلى الحساب التالي:</p>

        <div className="my-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center justify-center gap-2 font-bold text-foreground">
            <User className="h-4 w-4 text-primary" /> {acct.name}
          </div>
          <div className="mt-1.5 flex items-center justify-center gap-1">
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">عضو</span>
            {acct.hasStore && <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><Store className="h-3 w-3" />{acct.storeName || 'متجر'}</span>}
            {acct.isAdmin && <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700"><Shield className="h-3 w-3" />إدارة</span>}
          </div>
        </div>

        <p className="mb-4 text-[12px] text-muted-foreground">بعد التبديل يظهر نشرك ومراسلاتك باسم هذا الحساب. يمكنك العودة في أي وقت من نفس المبدّل.</p>

        <div className="flex items-center gap-2">
          <form action={switchAccountAction} className="flex-1">
            <input type="hidden" name="userId" value={target} />
            <input type="hidden" name="confirmed" value="1" />
            <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90">
              <ArrowRightLeft className="h-4 w-4" /> تأكيد والتبديل
            </button>
          </form>
          <Link href="/account" className="rounded-lg border border-primary/25 px-4 py-2.5 text-sm font-bold text-foreground hover:bg-accent">إلغاء</Link>
        </div>
      </div>
    </div>
  );
}
