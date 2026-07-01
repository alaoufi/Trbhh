import { ShieldCheck, Check } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { trustUserAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'طلبات التوثيق' };

export default async function AdminVerifications() {
  const users = await prisma.users.findMany({ where: { step: { gt: 0 }, trusted: 0 }, orderBy: { id: 'desc' }, take: 100 });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold">طلبات التوثيق ({users.length})</h1></div>
      {users.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد طلبات توثيق معلّقة.</p>}
      <div className="space-y-2">
        {users.map((u) => (
          <div key={toInt(u.id)} className="flex items-center justify-between rounded-xl border bg-card p-3 shadow-sm">
            <div>
              <div className="font-medium">{u.name || u.userName || '—'}</div>
              <div className="text-xs text-muted-foreground" dir="ltr">{u.phoneNumber} · {timeAgo(u.created_at)}</div>
              <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                {u.national_identity ? <span>✓ هوية</span> : null}
                {u.commercial_register ? <span>✓ سجل تجاري</span> : null}
                {u.work_permit ? <span>✓ تصريح عمل</span> : null}
              </div>
            </div>
            <form action={trustUserAction}><input type="hidden" name="userId" value={toInt(u.id)} /><button className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"><Check className="h-4 w-4" /> اعتماد التوثيق</button></form>
          </div>
        ))}
      </div>
    </div>
  );
}
