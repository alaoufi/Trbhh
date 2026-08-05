import Link from 'next/link';
import { Link2, Users } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { listLinkGroups } from '@/lib/account-links';
import { AdminSearch } from '@/components/admin-search';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { linkAccountsAction, unlinkAccountAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ربط الأعضاء' };

/** تبويب مستقل: ربط حسابات الشخص الواحد المنفصلة في مجموعة واحدة (نفس المالك).
 *  الإدارة تُنشئ الرابط فقط — لا دمج بيانات ولا تدخّل في نشاط الحسابات. */
export default async function AdminLinksPage({ searchParams }: { searchParams: Promise<{ q?: string; picked?: string }> }) {
  await requireAction('users', 'edit');
  const { q: qRaw, picked: pickedRaw } = await searchParams;
  const q = (qRaw || '').trim();
  const picked = (pickedRaw || '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 10);

  const [results, groups, pickedUsers] = await Promise.all([
    q.length >= 2
      ? prisma.users.findMany({
          where: { OR: [{ name: { contains: q } }, { userName: { contains: q } }, { phoneNumber: { contains: q } }] },
          select: { id: true, name: true, userName: true, phoneNumber: true }, orderBy: { id: 'desc' }, take: 10,
        }).catch(() => [])
      : Promise.resolve([]),
    listLinkGroups().catch(() => []),
    picked.length
      ? prisma.users.findMany({ where: { id: { in: picked.map((i) => BigInt(i)) } }, select: { id: true, name: true, userName: true, phoneNumber: true } }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const pickHref = (ids: number[]) => `/admin/links${q ? `?q=${encodeURIComponent(q)}&` : '?'}picked=${ids.join(',')}`;
  const kindBadge = (m: { hasStore: boolean; isAdmin: boolean }) => (
    <>
      <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">عضو</span>
      {m.hasStore && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">متجر</span>}
      {m.isAdmin && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">إدارة</span>}
    </>
  );

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2"><Link2 className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold text-primary">ربط الأعضاء</h1></div>

      {/* ⓘ تعليمات مفصّلة: الفكرة والهدف والطريقة */}
      <details className="rounded-2xl border-2 border-sky-200 bg-sky-50/60 p-3" open>
        <summary className="cursor-pointer text-sm font-extrabold text-sky-800">ⓘ ما هذه الصفحة؟ — الفكرة والهدف والطريقة</summary>
        <div className="mt-2 space-y-2.5 text-[13px] leading-6 text-foreground/85">
          <div>
            <div className="font-bold text-sky-800">💡 الفكرة</div>
            بعض الأشخاص يملكون <b>أكثر من حساب</b> في عقار تربح (بأرقام جوال مختلفة) — مثلاً حساب شخصي وحساب لمتجر أو أكثر. هذه الصفحة تربط حسابات الشخص الواحد في <b>«مجموعة نفس المالك»</b>.
          </div>
          <div>
            <div className="font-bold text-sky-800">🎯 الهدف</div>
            <ul className="mr-4 list-disc space-y-0.5">
              <li>يعرف صاحبها أنها كلها له فينتقل بينها بسهولة من مبدّل «🎭 هوياتي» (دخول واحد).</li>
              <li>تراها الإدارة <b>كياناً واحداً</b> لوضوح النشاط ومنع الالتباس — دون دمج بياناتها.</li>
              <li>كل حساب يبقى مستقلاً: إعلاناته ومراسلاته ورصيده كما هي — <b>لا دمج ولا حذف</b>.</li>
            </ul>
          </div>
          <div>
            <div className="font-bold text-sky-800">🪜 الطريقة (خطوة بخطوة)</div>
            <ol className="mr-4 list-decimal space-y-0.5">
              <li><b>ابحث</b> في المربّع أدناه بالاسم أو الجوال عن الحساب الأول واضغط <b>«+ اختيار»</b>.</li>
              <li>كرّر البحث والاختيار لبقية حسابات <b>نفس الشخص</b> (حسابين على الأقل).</li>
              <li>راجع «المختارون للربط» ثم اضغط <b>«🔗 اربط الحسابات المختارة»</b>.</li>
              <li>تظهر المجموعة في «المجموعات المرتبطة» بالأسفل مع صفات كل حساب (عضو/متجر/إدارة) وزر مراسلة.</li>
              <li>لفصل حساب: اضغط <b>«فك»</b> بجانبه (لا يؤثر على بياناته).</li>
            </ol>
          </div>
          <div className="rounded-lg bg-amber-100/70 p-2 text-[12px] font-bold text-amber-800">
            ⚠️ تأكّد أن الحسابات <b>فعلاً لنفس الشخص</b> قبل الربط (تحقّق من جواله/هويته) — لأن الربط يتيح لصاحبها التنقّل بينها من دخول واحد.
          </div>
        </div>
      </details>

      {/* اختيار الحسابات وربطها */}
      <div className="card-3d space-y-3 rounded-2xl p-3">
        <div className="text-sm font-bold text-primary">① ابحث واختر الحسابات</div>
        <AdminSearch basePath="/admin/links" defaultValue={q} placeholder="ابحث بالاسم أو الجوال…" />
        {results.length > 0 && (
          <div className="space-y-1">
            {results.map((u) => {
              const id = toInt(u.id);
              const isPicked = picked.includes(id);
              const next = isPicked ? picked.filter((x) => x !== id) : [...picked, id];
              return (
                <div key={id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/30 px-2.5 py-1.5 text-sm">
                  <span><b>{u.name || u.userName}</b> <span className="text-xs text-muted-foreground" dir="ltr">{u.phoneNumber}</span></span>
                  <Link href={pickHref(next)} className={`rounded-md px-2 py-1 text-xs font-bold ${isPicked ? 'bg-red-100 text-red-700' : 'bg-primary text-white'}`}>{isPicked ? 'إزالة' : '+ اختيار'}</Link>
                </div>
              );
            })}
          </div>
        )}
        {picked.length > 0 && (
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-2.5">
            <div className="mb-1.5 text-xs font-bold text-primary">② المختارون للربط ({picked.length}):</div>
            <div className="flex flex-wrap gap-1.5">
              {pickedUsers.map((u) => <span key={toInt(u.id)} className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-primary shadow-sm">{u.name || u.userName}</span>)}
            </div>
            {picked.length >= 2 ? (
              <form action={linkAccountsAction} className="mt-2">
                <input type="hidden" name="userIds" value={picked.join(',')} />
                <ConfirmSubmit msg={`ربط هذه الحسابات (${picked.length}) في مجموعة «نفس المالك»؟`} className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">🔗 اربط الحسابات المختارة</ConfirmSubmit>
              </form>
            ) : <p className="mt-2 text-[11px] text-muted-foreground">اختر حسابين على الأقل.</p>}
          </div>
        )}
      </div>

      {/* المجموعات المرتبطة */}
      <div className="space-y-2">
        <div className="text-sm font-bold text-primary">المجموعات المرتبطة ({groups.length})</div>
        {groups.length === 0 && <p className="rounded-xl border border-primary/15 bg-accent/30 p-3 text-sm text-muted-foreground">لا توجد حسابات مرتبطة بعد.</p>}
        {groups.map((g) => (
          <div key={g.groupId} className="card-3d space-y-1.5 rounded-2xl p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-primary"><Users className="h-4 w-4" /> مجموعة #{g.groupId} — {g.members.length} حسابات</div>
            {g.members.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/30 px-2.5 py-1.5 text-sm">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Link href={`/admin/users?q=${encodeURIComponent(m.userName || m.name)}`} className="font-bold text-primary hover:underline">{m.name}</Link>
                  <span className="text-xs text-muted-foreground" dir="ltr">{m.phone}</span>
                  {kindBadge(m)}
                  {m.hasStore && <span className="text-[10px] text-muted-foreground">«{m.storeName}»</span>}
                </span>
                <span className="flex items-center gap-1.5">
                  <Link href={`/messages/${m.id}`} className="rounded-md border border-primary/30 px-2 py-1 text-[10px] font-bold text-primary hover:bg-accent">✉ مراسلة</Link>
                  <form action={unlinkAccountAction}>
                    <input type="hidden" name="userId" value={m.id} />
                    <ConfirmSubmit msg={`فك ربط «${m.name}» من هذه المجموعة؟`} className="rounded-md border border-red-300 px-2 py-1 text-[10px] font-bold text-red-600 hover:bg-red-50">فك</ConfirmSubmit>
                  </form>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
