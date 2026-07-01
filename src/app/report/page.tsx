import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { submitReportAction } from './actions';

export const metadata = { title: 'إبلاغ' };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;
  const reasons = await prisma.report_resons.findMany({ orderBy: { id: 'asc' } });
  const fallback = [{ id: 0, reason: 'إعلان مخالف' }, { id: 0, reason: 'احتيال' }, { id: 0, reason: 'معلومات مضللة' }, { id: 0, reason: 'إساءة استخدام' }, { id: 0, reason: 'محتوى مكرر' }];
  const list = reasons.length ? reasons.map((r) => ({ id: toInt(r.id), reason: r.reason })) : fallback;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold">الإبلاغ عن {sp.type === 'ad' ? 'إعلان' : 'محتوى'}</h1>
      <form action={submitReportAction} className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
        <input type="hidden" name="type" value={sp.type || 'ad'} />
        <input type="hidden" name="targetId" value={sp.id || ''} />
        <div>
          <label className="mb-1 block text-sm font-medium">سبب البلاغ</label>
          <select name="reasonId" className="h-11 w-full rounded-lg border bg-background px-3 text-sm">
            {list.map((r, i) => <option key={i} value={r.id} data-reason={r.reason}>{r.reason}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">تفاصيل إضافية (اختياري)</label>
          <textarea name="message" rows={4} className="w-full rounded-lg border bg-background p-3 text-sm" placeholder="اشرح المشكلة" />
        </div>
        <Button>إرسال البلاغ</Button>
      </form>
    </div>
  );
}
