import { BadgeCheck, Ban, Check } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { banUserAction, trustUserAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة المستخدمين' };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const users = await prisma.users.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { phoneNumber: { contains: q } }, { userName: { contains: q } }] } : {},
    orderBy: { id: 'desc' },
    take: 50,
  });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-primary">المستخدمون</h1>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="بحث بالاسم أو الجوال" className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm" /><button className="rounded-lg bg-primary px-4 text-sm text-primary-foreground">بحث</button></form>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-secondary/50 text-right"><tr><th className="p-3">الاسم</th><th className="p-3">الجوال</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={toInt(u.id)} className="border-b last:border-0">
                <td className="p-3"><div className="flex items-center gap-1 font-medium">{u.name || u.userName || '—'}{u.trusted === 1 && <BadgeCheck className="h-4 w-4 text-primary" />}</div><div className="text-xs text-muted-foreground">{timeAgo(u.created_at)}</div></td>
                <td className="p-3" dir="ltr">{u.phoneNumber || '—'}</td>
                <td className="p-3">{u.ban === 'checked' ? <Badge variant="muted">محظور</Badge> : <Badge variant="trusted">نشط</Badge>}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <form action={trustUserAction}><input type="hidden" name="userId" value={toInt(u.id)} /><button className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary"><Check className="h-3 w-3" />{u.trusted === 1 ? 'إلغاء التوثيق' : 'توثيق'}</button></form>
                    <form action={banUserAction}><input type="hidden" name="userId" value={toInt(u.id)} /><button className="flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"><Ban className="h-3 w-3" />{u.ban === 'checked' ? 'رفع الحظر' : 'حظر'}</button></form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
