import Link from 'next/link';
import { BadgeCheck, Ban, Check, ShieldCheck } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { requirePerm, getUserRole, ROLE_LABELS } from '@/lib/roles';
import { getPackages, getUserPackageMap } from '@/lib/packages';
import { AdminSearch } from '@/components/admin-search';
import { banUserAction, trustUserAction, assignUserPackageAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة المستخدمين' };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePerm('users');
  const { q } = await searchParams;
  const term = (q || '').trim();
  type Row = { id: bigint; name: string | null; userName: string | null; phoneNumber: string | null; trusted: number | null; ban: string | null; is_admin: number | null; created_at: Date | null };
  let users: Row[];
  if (term) {
    const like = `%${term}%`;
    const digits = term.replace(/\D/g, '');
    // reduce to the significant local part so it matches 05.., 5.., 9665.. formats
    let sig = digits.startsWith('966') ? digits.slice(3) : digits;
    sig = sig.replace(/^0+/, '');
    const phoneLike = `%${sig || digits || term}%`;
    users = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, name, userName, phoneNumber, trusted, ban, is_admin, created_at
       FROM users
       WHERE name LIKE ? OR userName LIKE ? OR email LIKE ?
          OR REPLACE(REPLACE(REPLACE(IFNULL(phoneNumber,''),'+',''),' ',''),'-','') LIKE ?
       ORDER BY id DESC LIMIT 50`,
      like, like, like, phoneLike,
    ).catch(() => [] as Row[]);
  } else {
    users = (await prisma.users.findMany({
      orderBy: { id: 'desc' }, take: 50,
      select: { id: true, name: true, userName: true, phoneNumber: true, trusted: true, ban: true, is_admin: true, created_at: true },
    })) as unknown as Row[];
  }
  const ids = users.map((u) => toInt(u.id));
  const [packages, pkgMap, roleLabels] = await Promise.all([
    getPackages(),
    getUserPackageMap(ids),
    Promise.all(ids.map((id) => getUserRole(id))),
  ]);
  const roleById = new Map(ids.map((id, i) => [id, roleLabels[i]]));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-primary">المستخدمون</h1>
      <AdminSearch basePath="/admin/users" defaultValue={q} placeholder="بحث فوري بالاسم أو اسم المستخدم أو الجوال…" />
      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-secondary/50 text-right"><tr><th className="p-3">الاسم</th><th className="p-3">الجوال</th><th className="p-3">الحالة</th><th className="p-3">الصلاحيات</th><th className="p-3">الباقة</th><th className="p-3">إجراءات</th></tr></thead>
          <tbody>
            {users.map((u) => {
              const id = toInt(u.id);
              const role = roleById.get(id);
              const label = role ? ROLE_LABELS[role] : (u.is_admin === 1 ? 'مدير' : null);
              return (
              <tr key={id} className="border-b last:border-0">
                <td className="p-3"><Link href={`/admin/users/${id}`} className="flex items-center gap-1 font-medium text-primary hover:underline">{u.name || u.userName || '—'}{u.trusted === 1 && <BadgeCheck className="h-4 w-4 text-primary" />}</Link><div className="text-xs text-muted-foreground">{timeAgo(u.created_at)}</div></td>
                <td className="p-3" dir="ltr">{u.phoneNumber || '—'}</td>
                <td className="p-3">{u.ban === 'checked' ? <Badge variant="muted">محظور</Badge> : <Badge variant="trusted">نشط</Badge>}</td>
                <td className="p-3">
                  <Link href={`/admin/users/${id}/permissions`} className="inline-flex items-center gap-1 rounded-md border border-primary/30 px-2 py-1 text-xs text-primary hover:bg-accent">
                    <ShieldCheck className="h-3.5 w-3.5" /> {label || 'الصلاحيات'}
                  </Link>
                </td>
                <td className="p-3">
                  <form action={assignUserPackageAction} className="flex items-center gap-1">
                    <input type="hidden" name="userId" value={id} />
                    <select name="packageId" defaultValue={pkgMap.get(id) ?? 0} className="rounded-md border bg-background px-1.5 py-1 text-xs">
                      <option value={0}>—</option>
                      {packages.map((p) => <option key={p.id} value={p.id}>{p.name}{p.price === 0 ? ' (مجانية)' : ` (${p.price})`}</option>)}
                    </select>
                    <input name="days" type="number" min={0} placeholder="أيام" title="مدة الاشتراك بالأيام (0 = دائم)" className="w-14 rounded-md border bg-background px-1.5 py-1 text-xs" />
                    <button className="rounded-md border px-2 py-1 text-xs hover:bg-secondary">حفظ</button>
                  </form>
                </td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <form action={trustUserAction}><input type="hidden" name="userId" value={id} /><button className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary"><Check className="h-3 w-3" />{u.trusted === 1 ? 'إلغاء التوثيق' : 'توثيق'}</button></form>
                    <form action={banUserAction}><input type="hidden" name="userId" value={id} /><button className="flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"><Ban className="h-3 w-3" />{u.ban === 'checked' ? 'رفع الحظر' : 'حظر'}</button></form>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
