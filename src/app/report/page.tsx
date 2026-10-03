import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getReportReasons } from '@/lib/report-reasons';
import { ReportForm } from './report-form';

export const metadata = { title: 'إبلاغ' };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string; error?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;
  const reasons = await getReportReasons();
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold">الإبلاغ عن {sp.type === 'ad' ? 'إعلان' : sp.type === 'member' ? 'عضو' : sp.type === 'site' ? 'الموقع' : 'محتوى'}</h1>
      <p className="text-sm text-muted-foreground">تستطيع متابعة ردود الإدارة والرد عليها أكثر من مرة من «حسابي ← بلاغاتي المرسلة». هويتك ومحادثتك لا تظهران للمُبلّغ عنه.</p>
      <ReportForm type={sp.type || 'ad'} targetId={sp.id || ''} reasons={reasons} />
    </div>
  );
}
