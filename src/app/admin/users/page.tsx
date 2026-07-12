import Link from 'next/link';
import { BadgeCheck, Ban, Check, ShieldCheck, UserPen } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { requirePerm, getUserRolesMap, ROLE_LABELS } from '@/lib/roles';
import { getPackages, getUserPackageMap } from '@/lib/packages';
import { liftExpiredBans, getBanMap } from '@/lib/moderation';
import { AdminSearch } from '@/components/admin-search';
import { AdminPager } from '@/components/admin-pager';
import { banUserAction, unbanUserAction, trustUserAction, assignUserPackageAction, executeDeletionRequestAction, dismissDeletionRequestAction } from '../actions';
import { listDeletionRequests } from '@/lib/account-delete';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة الأعضاء' };

const FILTERS = [
  { k: 'all', l: 'الكل' },
  { k: 'active', l: 'نشط' },
  { k: 'idle', l: 'خامل' },
  { k: 'banned', l: 'محظور' },
] as const;
type Filter = typeof FILTERS[number]['k'];
const fmtDate = (d: Date | null) => (d ? new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(d) : '');
const PAGE_SIZE = 30;

// خامل = غير محظور، حسابه أقدم من سنة، ولم يضف أي إعلان خلال آخر سنة
const IDLE_COND = `(ban IS NULL OR ban <> 'checked')
  AND users.created_at < (NOW() - INTERVAL 1 YEAR)
  AND NOT EXISTS (SELECT 1 FROM ads a WHERE a.user_id = users.id AND a.created_at > (NOW() - INTERVAL 1 YEAR))`;

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; page?: string }> }) {
  await requirePerm('users');
  const { q, filter: filterRaw, page: pageRaw } = await searchParams;
  const term = (q || '').trim();
  const filter: Filter = (FILTERS.some((f) => f.k === filterRaw) ? filterRaw : 'all') as Filter;
  const page = Math.max(1, parseInt(pageRaw || '1', 10) || 1);
  await liftExpiredBans(); // so ban='checked' reflects only still-active bans
  const deletionRequests = await listDeletionRequests().catch(() => []);

  type Row = { id: bigint; name: string | null; userName: string | null; phoneNumber: string | null; trusted: number | null; ban: string | null; is_admin: number | null; created_at: Date | null };

  // بحث + تصنيف + ترقيم صفحات — استعلام موحّد
  const conds: string[] = [];
  const args: unknown[] = [];
  if (term) {
    const like = `%${term}%`;
    const digits = term.replace(/\D/g, '');
    let sig = digits.startsWith('966') ? digits.slice(3) : digits;
    sig = sig.replace(/^0+/, '');
    const phoneLike = `%${sig || digits || term}%`;
    conds.push(`(name LIKE ? OR userName LIKE ? OR email LIKE ?
      OR REPLACE(REPLACE(REPLACE(IFNULL(phoneNumber,''),'+',''),' ',''),'-','') LIKE ?)`);
    args.push(like, like, like, phoneLike);
  }
  if (filter === 'banned') conds.push(`ban = 'checked'`);
  else if (filter === 'idle') conds.push(IDLE_COND);
  else if (filter === 'active') conds.push(`(ban IS NULL OR ban <> 'checked') AND NOT (${IDLE_COND})`);
  const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const countRows = await prisma.$queryRawUnsafe<{ c: bigint }[]>(`SELECT COUNT(*) AS c FROM users ${whereSql}`, ...args).catch(() => [{ c: 0n }]);
  const total = Number(countRows[0]?.c ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const users = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT id, name, userName, phoneNumber, trusted, ban, is_admin, created_at
     FROM users ${whereSql}
     ORDER BY id DESC LIMIT ${PAGE_SIZE} OFFSET ${(cur - 1) * PAGE_SIZE}`,
    ...args,
  ).catch(() => [] as Row[]);
  const ids = users.map((u) => toInt(u.id));
  const [packages, pkgMap, roleById, banMap, pendingVerify, pendingNames] = await Promise.all([
    getPackages(),
    getUserPackageMap(ids),
    getUserRolesMap(ids),
    getBanMap(ids),
    // نفس تعريف «بانتظار الموافقة» في صفحة التوثيق — المرفوض (step=2) لا يُعدّ معلقاً
    prisma.users.count({ where: { trusted: { not: 1 }, step: { not: 2 }, OR: [{ step: 1 }, { national_identity: { gt: 0 } }, { commercial_register: { gt: 0 } }, { work_permit: { gt: 0 } }] } }).catch(() => 0),
    prisma.name_requests.count({ where: { status: 0 } }).catch(() => 0),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-primary">الأعضاء</h1>
        {/* طلبات الأعضاء المعلّقة — وصول مباشر من نفس الصفحة */}
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/verifications" className={`flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm font-bold ${pendingVerify > 0 ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-primary/25 text-primary hover:bg-secondary'}`}>
            <ShieldCheck className="h-4 w-4" /> طلبات التوثيق
            {pendingVerify > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-xs text-white">{pendingVerify}</span>}
          </Link>
          <Link href="/admin/name-requests" className={`flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm font-bold ${pendingNames > 0 ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-primary/25 text-primary hover:bg-secondary'}`}>
            <UserPen className="h-4 w-4" /> طلبات تغيير الاسم
            {pendingNames > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-xs text-white">{pendingNames}</span>}
          </Link>
        </div>
      </div>

      {/* طلبات حذف الحسابات (متطلب Google Play) */}
      {deletionRequests.length > 0 && (
        <div className="card-3d space-y-2 rounded-2xl border-2 border-red-200 p-4">
          <div className="font-bold text-red-700">🗑️ طلبات حذف حسابات ({deletionRequests.length}) — تحقق من ملكية الرقم قبل التنفيذ</div>
          {deletionRequests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-red-50/50 p-2 text-sm">
              <span dir="ltr" className="font-bold">{r.phone}</span>
              {r.name && <span className="text-muted-foreground">{r.name}</span>}
              {r.note && <span className="text-xs text-muted-foreground">— {r.note}</span>}
              <span className="text-xs text-muted-foreground">{timeAgo(r.at)}</span>
              <span className="mr-auto flex gap-1">
                <form action={executeDeletionRequestAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="phone" value={r.phone} />
                  <button className="rounded-md bg-destructive px-3 py-1 text-xs font-bold text-white">تنفيذ الحذف</button>
                </form>
                <form action={dismissDeletionRequestAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="rounded-md border px-3 py-1 text-xs font-bold text-muted-foreground hover:bg-secondary">تجاهل</button>
                </form>
              </span>
            </div>
          ))}
        </div>
      )}
      <AdminSearch basePath="/admin/users" defaultValue={q} placeholder="بحث فوري بالاسم أو اسم الدخول أو الجوال…" />

      {/* تصنيف: الكل / نشط / محظور */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const params = new URLSearchParams();
          if (term) params.set('q', term);
          if (f.k !== 'all') params.set('filter', f.k);
          const qs = params.toString();
          const on = filter === f.k;
          return (
            <Link key={f.k} href={`/admin/users${qs ? `?${qs}` : ''}`}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${on ? 'bg-primary text-white shadow' : 'card-3d text-primary hover:border-primary/40'}`}>
              {f.l}
            </Link>
          );
        })}
      </div>

      {users.length === 0 && <p className="py-8 text-center text-muted-foreground">لا يوجد مستخدمون في هذا التصنيف.</p>}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-secondary/50 text-right"><tr><th className="p-3">الاسم</th><th className="p-3">الجوال</th><th className="p-3">الحالة</th><th className="p-3">الصلاحيات</th><th className="p-3">الباقة</th><th className="p-3">إجراءات</th></tr></thead>
          <tbody>
            {users.map((u) => {
              const id = toInt(u.id);
              const role = roleById.get(id);
              const label = role ? ROLE_LABELS[role] : (u.is_admin === 1 ? 'مدير' : null);
              const banned = u.ban === 'checked';
              const until = banMap.get(id) ?? null; // Date = temporary, null (while banned) = permanent
              return (
              <tr key={id} className="border-b last:border-0">
                <td className="p-3"><Link href={`/admin/users/${id}`} className="flex items-center gap-1 font-medium text-primary hover:underline">{u.name || u.userName || '—'}{u.trusted === 1 && <BadgeCheck className="h-4 w-4 text-primary" />}</Link><div className="text-xs text-muted-foreground">{timeAgo(u.created_at)}</div></td>
                <td className="p-3" dir="ltr">{u.phoneNumber || '—'}</td>
                <td className="p-3">
                  {banned
                    ? <div className="flex flex-col gap-0.5"><Badge variant="muted">محظور</Badge><span className="text-[10px] text-muted-foreground">{until ? `حتى ${fmtDate(until)}` : 'دائم'}</span></div>
                    : <Badge variant="trusted">نشط</Badge>}
                </td>
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
                  <div className="flex flex-wrap items-center gap-1">
                    <form action={trustUserAction}><input type="hidden" name="userId" value={id} /><button className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary"><Check className="h-3 w-3" />{u.trusted === 1 ? 'إلغاء التوثيق' : 'توثيق'}</button></form>
                    {banned ? (
                      <form action={unbanUserAction}><input type="hidden" name="userId" value={id} /><button className="flex items-center gap-1 rounded-md border border-emerald-400 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><Ban className="h-3 w-3" /> رفع الحظر</button></form>
                    ) : (
                      <>
                        <form action={banUserAction} className="flex items-center gap-1 rounded-md border border-destructive/30 p-0.5">
                          <input type="hidden" name="userId" value={id} />
                          <input name="days" type="number" min={1} placeholder="أيام" title="مدة الحظر بالأيام" className="w-14 rounded bg-background px-1.5 py-1 text-xs" />
                          <button className="flex items-center gap-1 rounded bg-destructive/10 px-2 py-1 text-xs font-bold text-destructive"><Ban className="h-3 w-3" /> حظر</button>
                        </form>
                        <form action={banUserAction}><input type="hidden" name="userId" value={id} /><input type="hidden" name="permanent" value="1" /><button className="rounded-md border border-destructive/40 px-2 py-1 text-xs font-bold text-destructive hover:bg-destructive/10">دائم</button></form>
                      </>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AdminPager basePath="/admin/users" page={cur} pages={pages} total={total} params={{ q: term || undefined, filter: filter !== 'all' ? filter : undefined }} />
    </div>
  );
}
