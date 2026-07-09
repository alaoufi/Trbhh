import Image from 'next/image';
import { ShieldCheck, Check, FileText, ExternalLink, XCircle, Trash2 } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { mediaUrl } from '@/lib/media';
import { approveVerificationAction, rejectVerificationAction, deleteVerificationDocsAction } from '../actions';
import { requirePerm } from '@/lib/roles';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'طلبات التوثيق' };

export default async function AdminVerifications() {
  await requirePerm('verifications');
  // نجمع كل مسارات الطلب حتى لا يضيع أي طلب: رفع وثائق (uploads.type=verify_*)
  // أو step=1 (بانتظار المراجعة) أو أي عمود وثيقة معبّأ على حساب العضو.
  const verifyUploads = await prisma.uploads.findMany({
    where: { type: { in: ['verify_nid', 'verify_cr', 'verify_wp'] } },
    select: { user_id: true }, orderBy: { id: 'desc' }, take: 1000,
  }).catch(() => [] as { user_id: number | null }[]);
  const reqUids = [...new Set(verifyUploads.map((u) => Number(u.user_id)).filter((n) => Number.isInteger(n) && n > 0))];
  const all = await prisma.users.findMany({
    where: {
      NOT: { trusted: 1 },
      OR: [
        ...(reqUids.length ? [{ id: { in: reqUids.map((n) => BigInt(n)) } }] : []),
        { step: 1 },
        { national_identity: { gt: 0 } },
        { commercial_register: { gt: 0 } },
        { work_permit: { gt: 0 } },
      ],
    },
    orderBy: { id: 'desc' }, take: 200,
  }).catch(() => []);
  // المرفوضة (سبب محفوظ) تُعرض في قسمها الخاص ولا تعود لقائمة الانتظار
  const pending = all.filter((u) => u.step !== 2);
  const rejected = all.filter((u) => u.step === 2);

  // resolve every uploaded document id → file url so the admin can actually
  // review the documents before approving.
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold text-primary">طلبات التوثيق ({pending.length})</h1></div>
      <p className="text-xs text-muted-foreground">عند الموافقة يُفعَّل التوثيق فوراً وتصل العضوَ رسالة، وعند الرفض يُحفظ السبب وتصل العضو رسالة بالسبب. نصوص الرسائل تُعدَّل من «النصوص الظاهرة ← التوثيق».</p>
      {pending.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد طلبات توثيق معلّقة.</p>}

      {/* كل طلب في بطاقة منفصلة بفاصل واضح بين شخص وآخر */}
      <div className="space-y-6">
        {pending.map((u) => {
          const id = toInt(u.id);
          const docs = docsOf(u);
          return (
            <div key={id} className="card-3d overflow-hidden rounded-2xl border-2 border-primary/25">
              {/* رأس الطلب — فاصل بصري باسم صاحب الطلب */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-primary/15 bg-primary/5 px-4 py-3">
                <div>
                  <div className="font-extrabold text-primary">{u.name || u.userName || '—'}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{u.phoneNumber} · {timeAgo(u.created_at)}</div>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">بانتظار المراجعة</span>
              </div>

              <div className="space-y-3 p-4">
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

                {/* الإجراءات: موافقة / رفض بسبب / حذف الوثائق (بتأكيد) */}
                <div className="space-y-2 border-t border-primary/10 pt-3">
                  <form action={approveVerificationAction}>
                    <input type="hidden" name="userId" value={id} />
                    <button className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
                      <Check className="h-4 w-4" /> الموافقة على التوثيق (يُفعَّل فوراً + رسالة للعضو)
                    </button>
                  </form>

                  <form action={rejectVerificationAction} className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-amber-200 bg-amber-50/40 p-2">
                    <input type="hidden" name="userId" value={id} />
                    <input name="reason" required maxLength={300} placeholder="سبب الرفض (يُحفظ ويصل العضو)…" className="h-10 min-w-0 flex-1 rounded-lg border bg-white px-2 text-sm outline-none" />
                    <button className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white hover:bg-amber-700">
                      <XCircle className="h-4 w-4" /> رفض التوثيق
                    </button>
                  </form>

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
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* المرفوضة — السبب محفوظ ويبقى ظاهراً */}
      {rejected.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 border-t-2 border-primary/10 pt-4 font-bold text-destructive"><XCircle className="h-5 w-5" /> طلبات مرفوضة ({rejected.length})</h2>
          {rejected.map((u) => {
            const id = toInt(u.id);
            const docs = docsOf(u);
            return (
              <div key={id} className="rounded-2xl border-2 border-destructive/20 bg-destructive/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold">{u.name || u.userName || '—'}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{u.phoneNumber}</div>
                  </div>
                  <form action={approveVerificationAction}>
                    <input type="hidden" name="userId" value={id} />
                    <button className="flex items-center gap-1 rounded-lg border border-emerald-500 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><Check className="h-3.5 w-3.5" /> موافقة رغم الرفض</button>
                  </form>
                </div>
                <p className="mt-2 rounded-lg bg-white p-2 text-sm"><b className="text-destructive">سبب الرفض:</b> {u.verify_note || '—'}</p>
                {docs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {docs.map((d) => (
                      <a key={d.label} href={d.url!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg border bg-white px-2 py-1 text-xs font-bold text-primary"><FileText className="h-3.5 w-3.5" /> {d.label}</a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
