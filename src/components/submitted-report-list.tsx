import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { requirePerm } from '@/lib/roles';

export async function SubmittedReportList({ admin = false }: { admin?: boolean }) {
  const session = admin ? await requirePerm('reports') : await requireUser();
  const [ads, general] = await Promise.all([
    prisma.repord_ads.findMany({ where: admin ? {} : { user_id: session.uid }, orderBy: { id: 'desc' }, take: 100 }),
    prisma.reports.findMany({ where: admin ? {} : { user_id: BigInt(session.uid) }, orderBy: { id: 'desc' }, take: 100 }),
  ]);
  const items = [
    ...ads.map(r => ({ kind: 'ad', id: String(r.id), text: `بلاغ على إعلان #${r.ads_id}`, at: r.created_at })),
    ...general.map(r => ({ kind: 'general', id: String(r.id), text: r.message, at: r.created_at })),
  ].sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0));
  return <div className="space-y-2">
    <p className="text-sm text-muted-foreground">آخر 100 بلاغ إعلاني وآخر 100 بلاغ عام. اختر البلاغ للاطلاع على ردوده وإرسال متابعة.</p>
    {items.length === 0 && <p>لا توجد بلاغات مرسلة.</p>}
    {items.map(item => <Link key={`${item.kind}:${item.id}`} href={`${admin ? '/admin/reports' : '/account/submitted-reports'}/${item.kind}/${item.id}`} className="block rounded-xl border p-3 hover:bg-secondary/50">
      <span className="font-bold">#{item.id} — </span><span className="break-words">{item.text}</span><span className="mt-1 block text-sm text-primary">متابعة البلاغ والردود ←</span>
    </Link>)}
  </div>;
}
