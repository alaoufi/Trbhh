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
import { banUserAction, unbanUserAction, trustUserAction, untrustUserAction, assignUserPackageAction, executeDeletionRequestAction, dismissDeletionRequestAction } from '../actions';
import { listDeletionRequests } from '@/lib/account-delete';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { memberSearchSql, maskMemberPhone } from '@/lib/member-admin-search';
import { linkedAccountCounts } from '@/lib/account-links';
import { ensureSchema } from '@/data/schema-sync';

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
const fmtDateTime = (d: Date | null) => (d ? new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(d) : '');
const PAGE_SIZE = 30;

// خامل = غير محظور، حسابه أقدم من سنة، ولم يضف أي إعلان خلال آخر سنة
const IDLE_COND = `(ban IS NULL OR ban <> 'checked')
  AND users.created_at < (NOW() - INTERVAL 1 YEAR)
  AND NOT EXISTS (SELECT 1 FROM ads a WHERE a.user_id = users.id AND a.created_at > (NOW() - INTERVAL 1 YEAR))`;

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string; page?: string; banerr?: string }> }) {
  await requirePerm('users');
  await ensureSchema();
  const { q, filter: filterRaw, page: pageRaw, banerr } = await searchParams;
  const term = (q || '').trim();
  const filter: Filter = (FILTERS.some((f) => f.k === filterRaw) ? filterRaw : 'all') as Filter;
  const page = Math.max(1, parseInt(pageRaw || '1', 10) || 1);
  await liftExpiredBans(); // so ban='checked' reflects only still-active bans
  const deletionRequests = await listDeletionRequests().catch(() => []);

  type Row = { id: bigint; name: string | null; userName: string | null; phoneNumber: string | null; trusted: number | null; ban: string | null; is_admin: number | null; created_at: Date | null };

  // بحث + تصنيف + ترقيم صفحات — استعلام موحّد
  // الحسابات المحذوفة (مموَّهة باسم deleted_<id>) تُستبعد من القائمة الحيّة — تُراجَع من الأرشيف
  const conds: string[] = [`(userName IS NULL OR userName NOT LIKE 'deleted\\_%')`, 'archived_at IS NULL'];
  const args: unknown[] = [];
  if (term) {
    const search = memberSearchSql(term);
    conds.push(`(${search.sql})`);
    args.push(...search.args);
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
  // صفات كل عضو للإدارة (مشاهدة فقط): هل يملك متجراً؟ — لعرض هوياته بلا تدخّل
  const storeByUser = new Map<number, { id: number; name: string; status: number }>();
  if (ids.length) {
    const srows = await prisma.stores.findMany({ where: { user_id: { in: ids } }, select: { id: true, user_id: true, store_name: true, status: true } }).catch(() => []);
    for (const s of srows) storeByUser.set(s.user_id, { id: toInt(s.id), name: s.store_name || 'متجر', status: s.status });
  }
  const [packages, pkgMap, roleById, banMap, pendingVerify, pendingNames, linkedCounts] = await Promise.all([
    getPackages(),
    getUserPackageMap(ids),
    getUserRolesMap(ids),
    getBanMap(ids),
    // نفس تعريف «بانتظار الموافقة» في صفحة التوثيق — المرفوض (step=2) لا يُعدّ معلقاً
    prisma.users.count({ where: { trusted: { not: 1 }, step: { not: 2 }, OR: [{ step: 1 }, { national_identity: { gt: 0 } }, { commercial_register: { gt: 0 } }, { work_permit: { gt: 0 } }] } }).catch(() => 0),
    prisma.name_requests.count({ where: { status: 0 } }).catch(() => 0),
    linkedAccountCounts(ids),
  ]);

  return (
    <div className="space-y-4">
      {banerr && (
        <div className="rounded-lg border-2 border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-bold text-destructive">
          {banerr === 'reason' ? '⛔ لم يُحفظ الحظر: يجب كتابة سبب الحظر.' : '⛔ لم يُحفظ الحظر: يجب تحديد مدة الحظر (عدد الأيام، أو اختر «دائم»).'}
        </div>
      )}
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
                  <ConfirmSubmit msg={`تأكيد: حذف حساب صاحب الرقم ${r.phone} وجميع بياناته نهائياً؟ لا يمكن التراجع.`} className="rounded-md bg-destructive px-3 py-1 text-xs font-bold text-white">تنفيذ الحذف</ConfirmSubmit>
                </form>
                <form action={dismissDeletionRequestAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmSubmit msg="تجاهل طلب حذف الحساب هذا؟ يُزال من القائمة دون حذف الحساب." className="rounded-md border px-3 py-1 text-xs font-bold text-muted-foreground hover:bg-secondary">تجاهل</ConfirmSubmit>
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

      <div className="grid gap-3 md:grid-cols-2">
            {users.map((u) => {
              const id = toInt(u.id);
              const role = roleById.get(id);
              const label = role ? ROLE_LABELS[role] : (u.is_admin === 1 ? 'مدير' : null);
              const banned = u.ban === 'checked';
              const banInfo = banMap.get(id) ?? null; // تفاصيل الحظر: المدة + السبب + تاريخ/وقت التنفيذ
              const until = banInfo?.until ?? null; // Date = temporary, null (while banned) = permanent
              return (
              <article key={id} className="card-3d space-y-3 rounded-2xl p-4">
                <div>
                  <Link href={`/admin/users/${id}`} className="flex items-center gap-1 font-medium text-primary hover:underline">{u.name || u.userName || '—'}{u.trusted === 1 && <BadgeCheck className="h-4 w-4 text-primary" />}</Link>
                  <div className="text-xs text-muted-foreground">عضو #{id} · {timeAgo(u.created_at)}</div>
                  {/* 🎭 صفات العضو (مشاهدة فقط للإدارة — لا تدخّل): عضو دائماً، متجر إن ملك، إدارة إن كان مشرفاً + مراسلة */}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">عضو</span>
                    {storeByUser.get(id) && (
                      <Link href={`/admin/stores?q=${encodeURIComponent(storeByUser.get(id)!.name)}`} className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-200">🏬 متجر «{storeByUser.get(id)!.name}»{storeByUser.get(id)!.status !== 1 && ' (موقوف)'}</Link>
                    )}
                    {(roleById.get(id) || u.is_admin === 1) && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">إدارة</span>
                    )}
                    <Link href={`/messages/${id}`} className="rounded-full border border-primary/30 px-1.5 py-0.5 text-[10px] font-bold text-primary hover:bg-accent">✉ مراسلة</Link>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs"><span dir="ltr">{maskMemberPhone(u.phoneNumber)}</span><span>الحسابات الموحدة: {linkedCounts.get(id) ?? 1}</span></div>
                <div>
                  {banned
                    ? <div className="flex max-w-[180px] flex-col gap-0.5">
                        <Badge variant="muted">محظور</Badge>
                        <span className="text-[10px] font-bold text-muted-foreground">{until ? `المدة: حتى ${fmtDate(until)}` : 'المدة: دائم'}</span>
                        {banInfo?.at && <span className="text-[10px] text-muted-foreground">🕐 {fmtDateTime(banInfo.at)}</span>}
                        <span className="text-[10px] leading-4 text-red-700">📝 السبب: {banInfo?.reason || 'غير مسجّل (حظر قديم)'}</span>
                      </div>
                    : <Badge variant="trusted">نشط</Badge>}
                </div>
                <div>
                  <Link href={`/admin/users/${id}/permissions`} className="inline-flex items-center gap-1 rounded-md border border-primary/30 px-2 py-1 text-xs text-primary hover:bg-accent">
                    <ShieldCheck className="h-3.5 w-3.5" /> {label || 'الصلاحيات'}
                  </Link>
                </div>
                <div>
                  <form action={assignUserPackageAction} className="flex items-center gap-1">
                    <input type="hidden" name="userId" value={id} />
                    <select name="packageId" defaultValue={pkgMap.get(id) ?? 0} className="rounded-md border bg-background px-1.5 py-1 text-xs">
                      <option value={0}>—</option>
                      {packages.map((p) => <option key={p.id} value={p.id}>{p.name}{p.price === 0 ? ' (مجانية)' : ` (${p.price})`}</option>)}
                    </select>
                    <input name="days" type="number" min={0} placeholder="أيام" title="مدة الاشتراك بالأيام (0 = دائم)" className="w-14 rounded-md border bg-background px-1.5 py-1 text-xs" />
                    <ConfirmSubmit msg="تأكيد تغيير باقة هذا العضو بالاختيار والمدة المحددين؟" className="rounded-md border px-2 py-1 text-xs hover:bg-secondary">حفظ</ConfirmSubmit>
                  </form>
                </div>
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Link href={`/admin/users/${id}`} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">فتح ملف العضو</Link>
                  <Link href={`/admin/users/${id}#wallet`} className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-bold text-primary">فتح المحفظة</Link>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-1">
                    {u.trusted === 1 ? (
                      <form action={untrustUserAction} className="flex items-center gap-1 rounded-md border border-slate-300 p-0.5">
                        <input type="hidden" name="userId" value={id} />
                        <input name="reason" required maxLength={300} placeholder="سبب الإلغاء" title="سبب إلغاء التوثيق — إلزامي، يُحفظ ويصل العضو" className="w-24 rounded bg-background px-1.5 py-1 text-xs" />
                        <ConfirmSubmit msg="تأكيد إلغاء التوثيق بالسبب المكتوب؟ تُسحب الشارة فوراً ويصل العضو السبب — والمدفوع يُسترد له غير المستخدم." className="flex items-center gap-1 rounded bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700">إلغاء التوثيق</ConfirmSubmit>
                      </form>
                    ) : (
                      <form action={trustUserAction}><input type="hidden" name="userId" value={id} /><ConfirmSubmit msg="توثيق هذا العضو؟ تظهر شارة موثّق فوراً." className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary"><Check className="h-3 w-3" /> توثيق</ConfirmSubmit></form>
                    )}
                    {banned ? (
                      <form action={unbanUserAction}><input type="hidden" name="userId" value={id} /><ConfirmSubmit msg="رفع الحظر عن هذا العضو؟ تعود إعلاناته للظهور فوراً." className="flex items-center gap-1 rounded-md border border-emerald-400 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><Ban className="h-3 w-3" /> رفع الحظر</ConfirmSubmit></form>
                    ) : (
                      // حظر يدوي: يلزم سبب مكتوب + مدة (أيام للمؤقت أو زر «دائم») — بلا سبب لا يُحفظ.
                      <form action={banUserAction} className="flex flex-wrap items-center gap-1 rounded-md border border-destructive/30 p-1">
                        <input type="hidden" name="userId" value={id} />
                        <input name="reason" required maxLength={300} placeholder="سبب الحظر (إلزامي)" title="سبب الحظر — إلزامي، يُحفظ ويُعرض مع تاريخ ووقت الحظر" className="w-32 rounded bg-background px-1.5 py-1 text-xs" />
                        <input name="days" type="number" min={1} placeholder="أيام" title="مدة الحظر بالأيام (للحظر المؤقت)" className="w-14 rounded bg-background px-1.5 py-1 text-xs" />
                        <ConfirmSubmit msg="تأكيد حظر هذا العضو للمدة المدخلة بالسبب المكتوب؟ ستختفي كل إعلاناته طوال الحظر." className="flex items-center gap-1 rounded bg-destructive/10 px-2 py-1 text-xs font-bold text-destructive"><Ban className="h-3 w-3" /> حظر مؤقت</ConfirmSubmit>
                        <ConfirmSubmit name="permanent" value="1" msg="تأكيد الحظر الدائم لهذا العضو بالسبب المكتوب؟ ستختفي كل إعلاناته حتى رفع الحظر." className="rounded-md border border-destructive/40 px-2 py-1 text-xs font-bold text-destructive hover:bg-destructive/10">دائم</ConfirmSubmit>
                      </form>
                    )}
                  </div>
                </div>
              </article>
              );
            })}
      </div>

      <AdminPager basePath="/admin/users" page={cur} pages={pages} total={total} params={{ q: term || undefined, filter: filter !== 'all' ? filter : undefined }} />
    </div>
  );
}
