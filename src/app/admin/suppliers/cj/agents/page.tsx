import Link from 'next/link';
import { AccessBoundary } from '@/components/access-boundary';
import { requireAccess } from '@/lib/access-control/guards';
import { prisma } from '@/lib/prisma';
import { listAgents, defaultAgentWeeklyQuota } from '@/lib/cj/agents';
import { saveAgentQuota, saveAgent, toggleAgent } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'وكلاء CJ', robots: { index: false, follow: false } };

const card = 'card-3d rounded-xl p-4 space-y-2';
const btn = 'rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white';
const input = 'mt-1 min-h-10 w-full rounded-lg border border-primary/25 bg-white px-3 text-sm';

export default async function CjAgentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccess('integrations', 'manage_settings');
  const sp = await searchParams;
  const [agents, quota] = await Promise.all([listAgents(), defaultAgentWeeklyQuota()]);
  const ids = agents.map((a) => a.user_id);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [users, totals, weekly] = await Promise.all([
    ids.length ? prisma.users.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, userName: true, phoneNumber: true } }).catch(() => []) : Promise.resolve([]),
    ids.length ? prisma.cj_products.groupBy({ by: ['agent_user_id'], where: { agent_user_id: { in: ids } }, _count: { agent_user_id: true } }).catch(() => []) : Promise.resolve([]),
    ids.length ? prisma.cj_products.groupBy({ by: ['agent_user_id'], where: { agent_user_id: { in: ids }, agent_claimed_at: { gte: weekAgo } }, _count: { agent_user_id: true } }).catch(() => []) : Promise.resolve([]),
  ]);
  const userMap = new Map(users.map((u) => [String(u.id), u]));
  const totalMap = new Map(totals.map((t) => [String(t.agent_user_id), t._count.agent_user_id]));
  const weekMap = new Map(weekly.map((t) => [String(t.agent_user_id), t._count.agent_user_id]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">وكلاء المنصّة</h1>
        <Link href="/admin/suppliers/cj/browse" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">تصفّح/استيراد ←</Link>
      </div>
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        الوكيل عضو يُمنح دور «وكيل» بجواله وواتسه، فيختار سلعاً ضمن حصّته الأسبوعية ويصبح المسؤول عن التواصل ومتابعة الشحن وإتمام البيع لسلعه. المورد يبقى مخفيّاً عن العميل — الوكيل هو جهة التواصل الظاهرة.
      </p>
      {sp.saved && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم الحفظ.</p>}
      {sp.err === 'not_found' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">لا يوجد عضو مطابق للمعرّف.</p>}

      {/* الحصّة الافتراضية */}
      <div className={card}>
        <h2 className="font-bold">الحصّة الأسبوعية الافتراضية</h2>
        <form action={saveAgentQuota} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">عدد السلع/أسبوع<input className={`${input} ms-2 w-24`} name="weeklyQuota" type="number" min={0} max={1000} defaultValue={quota} /></label>
          <button className={btn}>حفظ</button>
          <span className="text-xs text-muted-foreground">تُطبَّق على الوكلاء الجدد ما لم تُحدَّد لكل وكيل قيمة خاصّة.</span>
        </form>
      </div>

      {/* منح وكيل */}
      <div className={card}>
        <h2 className="font-bold">منح عضو دور وكيل</h2>
        <form action={saveAgent} className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">العضو (بريد/جوال/اسم دخول)<input className={input} name="ident" required placeholder="alaoufi@gmail.com أو 05xxxxxxxx" /></label>
          <label className="text-sm">جوال التواصل<input className={input} name="phone" inputMode="tel" placeholder="يُترك فارغاً = جوال حسابه" /></label>
          <label className="text-sm">واتساب<input className={input} name="whatsapp" inputMode="tel" placeholder="يُترك فارغاً = جوال التواصل" /></label>
          <label className="text-sm">حصّة أسبوعية خاصّة<input className={input} name="weeklyQuota" type="number" min={0} max={1000} placeholder={`الافتراضي ${quota}`} /></label>
          <label className="text-sm sm:col-span-2">ملاحظة<input className={input} name="notes" maxLength={500} /></label>
          <div className="sm:col-span-2"><button className={btn}>حفظ الوكيل</button></div>
        </form>
      </div>

      {/* قائمة الوكلاء */}
      <div className={card}>
        <h2 className="font-bold">الوكلاء ({agents.length})</h2>
        {!agents.length ? <p className="text-sm text-muted-foreground">لا وكلاء بعد.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-right text-xs"><thead className="bg-primary/5"><tr>{['الوكيل', 'الجوال', 'واتساب', 'الحصّة', 'هذا الأسبوع', 'سلعه', 'الحالة', ''].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
            {agents.map((a) => {
              const u = userMap.get(String(a.user_id));
              const used = weekMap.get(String(a.user_id)) ?? 0;
              const total = totalMap.get(String(a.user_id)) ?? 0;
              return (
                <tr key={String(a.user_id)} className="border-t">
                  <td className="p-2">{u?.name || u?.userName || `#${String(a.user_id)}`}</td>
                  <td className="p-2" dir="ltr">{a.phone || '—'}</td>
                  <td className="p-2" dir="ltr">{a.whatsapp || '—'}</td>
                  <td className="p-2">{a.weekly_quota}</td>
                  <td className="p-2">{used}/{a.weekly_quota}</td>
                  <td className="p-2">{total}</td>
                  <td className="p-2">{a.active === 1 ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800">نشط</span> : <span className="rounded bg-slate-200 px-1.5 py-0.5 font-bold text-slate-700">موقوف</span>}</td>
                  <td className="p-2">
                    <AccessBoundary module={'integrations'} action={'manage_settings'}>
                      <form action={toggleAgent}><input type="hidden" name="userId" value={String(a.user_id)} /><input type="hidden" name="active" value={a.active === 1 ? '0' : '1'} /><button className="rounded-lg border border-primary/30 px-2 py-1 text-xs font-bold text-primary">{a.active === 1 ? 'إيقاف' : 'تفعيل'}</button></form>
                    </AccessBoundary>
                  </td>
                </tr>
              );
            })}
          </tbody></table></div>
        )}
      </div>
    </div>
  );
}
