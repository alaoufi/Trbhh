import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, Check, FileText, ExternalLink, XCircle, Trash2, BadgeCheck } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { mediaUrl } from '@/lib/media';
import { approveVerificationAction, rejectVerificationAction, deleteVerificationDocsAction, trustUserAction } from '../actions';
import { requirePerm } from '@/lib/roles';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'طلبات التوثيق' };

const TABS = [
  { k: 'all', l: 'الكل' },
  { k: 'pending', l: 'بانتظار الموافقة' },
  { k: 'approved', l: 'تمت الموافقة' },
  { k: 'rejected', l: 'مرفوض' },
] as const;
type Tab = typeof TABS[number]['k'];

export default async function AdminVerifications({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requirePerm('verifications');
  const { view } = await searchParams;
  const tab: Tab = (TABS.some((t) => t.k === view) ? view : 'pending') as Tab;

  // نجمع كل من له علاقة بالتوثيق: رفع وثائق (uploads.type=verify_*) أو step=1/2
  // أو أي عمود وثيقة معبّأ — ثم نصنّفهم (معلّق/موافَق/مرفوض) دون إسقاط أحد.
  const verifyUploads = await prisma.uploads.findMany({
    where: { type: { in: ['verify_nid', 'verify_cr', 'verify_wp'] } },
    select: { user_id: true }, orderBy: { id: 'desc' }, take: 1000,
  }).catch(() => [] as { user_id: number | null }[]);
  const reqUids = [...new Set(verifyUploads.map((u) => Number(u.user_id)).filter((n) => Number.isInteger(n) && n > 0))];
  const all = await prisma.users.findMany({
    where: {
      OR: [
        ...(reqUids.length ? [{ id: { in: reqUids.map((n) => BigInt(n)) } }] : []),
        { step: { in: [1, 2] } },
        { national_identity: { gt: 0 } },
        { commercial_register: { gt: 0 } },
        { work_permit: { gt: 0 } },
      ],
    },
    orderBy: { id: 'desc' }, take: 300,
  }).catch(() => []);

  const approved = all.filter((u) => u.trusted === 1);
  const rejected = all.filter((u) => u.trusted !== 1 && u.step === 2);
  const pending = all.filter((u) => u.trusted !== 1 && u.step !== 2);
  const list = tab === 'all' ? all : tab === 'approved' ? approved : tab === 'rejected' ? rejected : pending;

  // resolve every uploaded document id → file url so the admin can review them.
  const docIds = new Set<number>();
  for (const u of all) {
    for (const v of [u.national_identity, u.commercial_register, u.work_permit]) {
      const n = Number(v);
      if (Number.isInteger(n) && n > 0) docIds.add(n);
    }
  }
  const uploads = docIds.size
    ? await prisma.uploads.findMany({ where: { id: { in: [...docIds].map((n) => BigInt(n)) } }, select: { id: true, file_name: true } })
    : [];
  const urlById = new Map(uploads.map((up) => [toInt(up.id), mediaUrl(up.file_name)]));
  const docUrl = (v: number | null | undefined) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? urlById.get(n) ?? null : null;
  };
  const docsOf = (u: (typeof all)[number]) => [
    { label: 'الهوية الوطنية', url: docUrl(u.national_identity) },
    { label: 'السجل التجاري', url: docUrl(u.commercial_register) },
    { label: 'تصريح العمل', url: docUrl(u.work_permit) },
  ].filter((d) => d.url);

  const stateOf = (u: (typeof all)[number]) =>
    u.trusted === 1
      ? { key: 'approved' as const, label: 'تمت الموافقة ✓', cls: 'bg-emerald-100 text-emerald-800' }
      : u.step === 2
        ? { key: 'rejected' as const, label: 'مرفوض', cls: 'bg-red-100 text-red-700' }
        : { key: 'pending' as const, label: 'بانتظار المراجعة', cls: 'bg-amber-100 text-amber-800' };

  const counts: Record<Tab, number> = { all: all.length, pending: pending.length, approved: approved.length, rejected: rejected.length };
  const badgeCls: Record<Tab, string> = { all: 'bg-primary/80', pending: 'bg-amber-500', approved: 'bg-emerald-600', rejected: 'bg-red-500' };
  const tabCls = (t: Tab) => `rounded-lg border px-3 py-1.5 text-sm ${tab === t ? 'bg-primary text-white' : 'text-primary'}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold text-primary">طلبات التوثيق</h1></div>
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link key={t.k} href={`/admin/verifications${t.k === 'pending' ? '' : `?view=${t.k}`}`} className={tabCls(t.k)}>
              {t.l} {counts[t.k] > 0 && <span className={`mr-1 rounded-full px-1.5 text-xs text-white ${badgeCls[t.k]}`}>{counts[t.k]}</span>}
            </Link>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">عند الموافقة يُفعَّل التوثيق فوراً وتصل العضوَ رسالة، وعند الرفض يُحفظ السبب وتصل العضو رسالة بالسبب. نصوص الرسائل تُعدَّل من «النصوص الظاهرة ← التوثيق».</p>

      {list.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد طلبات في هذا التصنيف.</p>}

      {/* كل طلب في بطاقة منفصلة بفاصل واضح بين شخص وآخر */}
      <div className="space-y-6">
        {list.map((u) => {
          const id = toInt(u.id);
          const docs = docsOf(u);
          const st = stateOf(u);
          return (
            <div key={id} className="card-3d overflow-hidden rounded-2xl border-2 border-primary/25">
              {/* رأس الطلب — فاصل بصري باسم صاحب الطلب وحالته */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-primary/15 bg-primary/5 px-4 py-3">
                <div>
                  <div className="flex items-center gap-1 font-extrabold text-primary">{u.name || u.userName || '—'}{u.trusted === 1 && <BadgeCheck className="h-4 w-4" />}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{u.phoneNumber} · {timeAgo(u.created_at)}</div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${st.cls}`}>{st.label}</span>
              </div>

              <div className="space-y-3 p-4">
                {/* سبب الرفض المحفوظ — واضح وكبير */}
                {st.key === 'rejected' && (
                  <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3">
                    <div className="mb-1 flex items-center gap-1 text-sm font-extrabold text-red-700"><XCircle className="h-4 w-4" /> سبب الرفض (محفوظ)</div>
                    <p className="text-base font-medium leading-7 text-foreground/90">{u.verify_note || '—'}</p>
                  </div>
                )}

                {/* الوثائق المرفوعة */}
                {docs.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {docs.map((d) => (
                      <a key={d.label} href={d.url!} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-xl border-2 border-primary/15 bg-secondary/20">
                        <div className="relative aspect-[4/3] bg-muted">
                          <Image src={d.url!} alt={d.label} fill sizes="200px" className="object-cover transition group-hover:scale-105" />
                          <span className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 text-white"><ExternalLink className="h-3.5 w-3.5" /></span>
                        </div>
                        <div className="flex items-center gap-1 p-2 text-xs font-bold text-primary"><FileText className="h-3.5 w-3.5" /> {d.label}</div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-700">لم تُرفَق وثائق قابلة للعرض في هذا الطلب.</p>
                )}

                {/* الإجراءات حسب الحالة */}
                <div className="space-y-2 border-t border-primary/10 pt-3">
                  {st.key !== 'approved' ? (
                    <form action={approveVerificationAction}>
                      <input type="hidden" name="userId" value={id} />
                      <button className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
                        <Check className="h-4 w-4" /> {st.key === 'rejected' ? 'الموافقة رغم الرفض (تفعيل فوري + رسالة)' : 'الموافقة على التوثيق (يُفعَّل فوراً + رسالة للعضو)'}
                      </button>
                    </form>
                  ) : (
                    <form action={trustUserAction}>
                      <input type="hidden" name="userId" value={id} />
                      <button className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-4 py-2 text-sm font-bold text-destructive hover:bg-destructive/10">
                        <XCircle className="h-4 w-4" /> إلغاء التوثيق
                      </button>
                    </form>
                  )}

                  {st.key === 'pending' && (
                    <form action={rejectVerificationAction} className="space-y-2 rounded-xl border-2 border-amber-300 bg-amber-50/60 p-3">
                      <input type="hidden" name="userId" value={id} />
                      <label className="block text-sm font-extrabold text-amber-800">سبب الرفض — يُحفظ في السجل ويصل العضو برسالة</label>
                      <textarea
                        name="reason"
                        required
                        rows={2}
                        maxLength={300}
                        placeholder="اكتب سبب الرفض بوضوح، مثال: صورة الهوية غير واضحة — أعد رفع صورة أوضح…"
                        className="w-full rounded-lg border-2 border-amber-300 bg-white p-3 text-base leading-7 outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <button className="flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700">
                        <XCircle className="h-4 w-4" /> رفض التوثيق
                      </button>
                    </form>
                  )}

                  {docs.length > 0 && (
                    <details className="rounded-xl border border-destructive/30">
                      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-bold text-destructive">حذف الوثائق…</summary>
                      <form action={deleteVerificationDocsAction} className="flex flex-wrap items-center justify-between gap-2 border-t border-destructive/20 p-3">
                        <input type="hidden" name="userId" value={id} />
                        <span className="text-xs font-bold text-destructive">تأكيد: ستُحذف كل وثائق هذا الطلب نهائياً ولا يمكن التراجع. هل أنت متأكد؟</span>
                        <button className="flex shrink-0 items-center gap-1 rounded-lg bg-destructive px-3 py-2 text-sm font-bold text-white hover:bg-destructive/90">
                          <Trash2 className="h-4 w-4" /> نعم، احذف الوثائق
                        </button>
                      </form>
                    </details>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
