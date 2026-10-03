import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { submitReportAction } from './actions';

export const metadata = { title: 'إبلاغ' };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string; error?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;
  const reasons = await prisma.report_resons.findMany({ orderBy: { id: 'asc' } });
  const fallback = [{ id: 0, reason: 'إعلان مخالف' }, { id: 0, reason: 'احتيال' }, { id: 0, reason: 'معلومات مضللة' }, { id: 0, reason: 'إساءة استخدام' }, { id: 0, reason: 'محتوى مكرر' }];
  const list = reasons.length ? reasons.map((r) => ({ id: toInt(r.id), reason: r.reason })) : fallback;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold">الإبلاغ عن {sp.type === 'ad' ? 'إعلان' : sp.type === 'member' ? 'عضو' : sp.type === 'site' ? 'الموقع' : 'محتوى'}</h1>
      <p className="text-sm text-muted-foreground">تستطيع متابعة ردود الإدارة والرد عليها أكثر من مرة من «حسابي ← بلاغاتي المرسلة». هويتك ومحادثتك لا تظهران للمُبلّغ عنه.</p>
      {sp.error && <p role="alert" className="text-destructive">تحقق من البلاغ وطول التفاصيل (حتى 200 حرف)، ثم حاول مجددًا.</p>}
      <form action={submitReportAction} className="space-y-4 card-3d rounded-xl p-5">
        <input type="hidden" name="type" value={sp.type || 'ad'} />
        <input type="hidden" name="targetId" value={sp.id || ''} />
        <div>
          <label htmlFor="report-reason" className="mb-1 block text-sm font-medium">سبب البلاغ</label>
          <select id="report-reason" name="reasonId" className="h-11 w-full rounded-lg border bg-background px-3 text-sm">
            {list.map((r, i) => <option key={i} value={r.id} data-reason={r.reason}>{r.reason}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="report-message" className="mb-1 block text-sm font-medium">تفاصيل إضافية (اختياري، حتى 200 حرف)</label>
          <textarea id="report-message" name="message" maxLength={200} rows={4} className="w-full rounded-lg border bg-background p-3 text-sm" placeholder="اشرح المشكلة ويمكنك إضافة التفاصيل في المتابعة" />
        </div>
        <Button>إرسال البلاغ</Button>
      </form>
    </div>
  );
}
