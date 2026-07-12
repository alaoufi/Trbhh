import Link from 'next/link';
import Image from 'next/image';
import { UserPen, Check, XCircle, FileText, ExternalLink } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { mediaUrl } from '@/lib/media';
import { requirePerm } from '@/lib/roles';
import { approveNameRequestAction, rejectNameRequestAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'طلبات تغيير الاسم' };

const TABS = [
  { k: 'pending', l: 'بانتظار المراجعة' },
  { k: 'approved', l: 'تمت الموافقة' },
  { k: 'rejected', l: 'مرفوض' },
] as const;
type Tab = (typeof TABS)[number]['k'];
const STATUS_OF: Record<Tab, number> = { pending: 0, approved: 1, rejected: 2 };

export default async function AdminNameRequests({ searchParams }: { searchParams: Promise<{ view?: string; done?: string }> }) {
  await requirePerm('users');
  const { view, done } = await searchParams;
  const tab: Tab = (TABS.some((t) => t.k === view) ? view : 'pending') as Tab;

  const all = await prisma.name_requests.findMany({ orderBy: { id: 'desc' }, take: 300 }).catch(() => []);
  const counts: Record<Tab, number> = {
    pending: all.filter((r) => r.status === 0).length,
    approved: all.filter((r) => r.status === 1).length,
    rejected: all.filter((r) => r.status === 2).length,
  };
  const list = all.filter((r) => r.status === STATUS_OF[tab]);

  // بيانات الأعضاء + روابط المستندات
  const uids = [...new Set(list.map((r) => toInt(r.user_id)))];
  const users = uids.length
    ? await prisma.users.findMany({ where: { id: { in: uids.map((n) => BigInt(n)) } }, select: { id: true, name: true, userName: true, phoneNumber: true } }).catch(() => [])
    : [];
  const uById = new Map(users.map((u) => [toInt(u.id), u]));
  const docIds = list.map((r) => r.doc).filter((n) => n > 0);
  const uploads = docIds.length
    ? await prisma.uploads.findMany({ where: { id: { in: docIds.map((n) => BigInt(n)) } }, select: { id: true, file_name: true, extension: true } }).catch(() => [])
    : [];
  const docById = new Map(uploads.map((up) => [toInt(up.id), { url: mediaUrl(up.file_name), ext: (up.extension || '').toLowerCase() }]));

  const badgeCls: Record<Tab, string> = { pending: 'bg-amber-500', approved: 'bg-emerald-600', rejected: 'bg-red-500' };
  const tabCls = (t: Tab) => `rounded-lg border px-3 py-1.5 text-sm ${tab === t ? 'bg-primary text-white' : 'text-primary'}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><UserPen className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold text-primary">طلبات تغيير الاسم</h1></div>
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link key={t.k} href={`/admin/name-requests${t.k === 'pending' ? '' : `?view=${t.k}`}`} className={tabCls(t.k)}>
              {t.l} {counts[t.k] > 0 && <span className={`mr-1 rounded-full px-1.5 text-xs text-white ${badgeCls[t.k]}`}>{counts[t.k]}</span>}
            </Link>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">العضو لا يستطيع تغيير اسمه بنفسه — يرسل طلباً بالاسم الجديد والسبب ومستند إثبات. عند الموافقة يُطبَّق الاسم فوراً وتصل العضو رسالة، وعند الرفض يُحفظ السبب ويصل العضو برسالة.</p>

      {done === 'ok' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ تمت الموافقة وطُبّق الاسم الجديد وأُبلغ العضو.</div>}
      {done === 'rej' && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">تم رفض الطلب وإبلاغ العضو بالسبب.</div>}

      {list.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد طلبات في هذا التصنيف.</p>}

      <div className="space-y-6">
        {list.map((r) => {
          const u = uById.get(toInt(r.user_id));
          const doc = r.doc > 0 ? docById.get(r.doc) : null;
          const isImg = doc && !['pdf'].includes(doc.ext);
          return (
            <div key={toInt(r.id)} className="card-3d overflow-hidden rounded-2xl border-2 border-primary/25">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-primary/15 bg-primary/5 px-4 py-3">
                <div>
                  <Link href={`/admin/users/${toInt(r.user_id)}`} className="font-extrabold text-primary hover:underline">{u?.name || u?.userName || `عضو #${toInt(r.user_id)}`}</Link>
                  <div className="text-xs text-muted-foreground" dir="ltr">{u?.phoneNumber} · {timeAgo(r.created_at ? r.created_at.toISOString() : null)}</div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${r.kind === 'store' ? 'bg-teal-100 text-teal-800' : 'bg-primary/10 text-primary'}`}>{r.kind === 'store' ? '🏪 استثناء اسم متجر' : '👤 اسم عضو'}</span>
                {r.status === 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">بانتظار المراجعة</span>}
                {r.status === 1 && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">تمت الموافقة ✓</span>}
                {r.status === 2 && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">مرفوض</span>}
              </div>

              <div className="space-y-3 p-4">
                {/* الاسم القديم ← الجديد */}
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/40 p-3 text-sm font-bold">
                  <span className="rounded-lg bg-white px-3 py-1.5 shadow-sm ring-1 ring-black/5">{r.old_name || '—'}</span>
                  <span className="text-primary">←</span>
                  <span className="rounded-lg bg-primary px-3 py-1.5 text-white shadow-sm">{r.new_name}</span>
                </div>

                {/* السبب */}
                <div className="rounded-xl border border-primary/15 p-3">
                  <div className="mb-1 text-xs font-extrabold text-primary">سبب الطلب</div>
                  <p className="text-sm leading-6 text-foreground/90">{r.reason || '—'}</p>
                </div>

                {/* المستند */}
                {doc ? (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="group block max-w-xs overflow-hidden rounded-xl border-2 border-primary/15 bg-secondary/20">
                    {isImg ? (
                      <div className="relative aspect-[4/3] bg-muted">
                        <Image src={doc.url} alt="مستند الإثبات" fill sizes="300px" className="object-cover transition group-hover:scale-105" />
                        <span className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 text-white"><ExternalLink className="h-3.5 w-3.5" /></span>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-1 p-2 text-xs font-bold text-primary"><FileText className="h-3.5 w-3.5" /> مستند الإثبات {!isImg && '(PDF — اضغط للفتح)'}</div>
                  </a>
                ) : r.kind !== 'store' ? (
                  <p className="rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-700">لا يوجد مستند مرفق في هذا الطلب.</p>
                ) : null}

                {/* سبب الرفض المحفوظ */}
                {r.status === 2 && r.note && (
                  <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3">
                    <div className="mb-1 flex items-center gap-1 text-sm font-extrabold text-red-700"><XCircle className="h-4 w-4" /> سبب الرفض (محفوظ)</div>
                    <p className="text-sm font-medium leading-6 text-foreground/90">{r.note}</p>
                  </div>
                )}

                {/* الإجراءات */}
                {r.status === 0 && (
                  <div className="space-y-2 border-t border-primary/10 pt-3">
                    <form action={approveNameRequestAction}>
                      <input type="hidden" name="id" value={toInt(r.id)} />
                      <button className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
                        <Check className="h-4 w-4" /> الموافقة (يُطبَّق الاسم فوراً + رسالة للعضو)
                      </button>
                    </form>
                    <form action={rejectNameRequestAction} className="space-y-2 rounded-xl border-2 border-amber-300 bg-amber-50/60 p-3">
                      <input type="hidden" name="id" value={toInt(r.id)} />
                      <label className="block text-sm font-extrabold text-amber-800">سبب الرفض — يُحفظ ويصل العضو برسالة</label>
                      <textarea name="note" required rows={2} maxLength={250} placeholder="مثال: المستند لا يُظهر الاسم الجديد بوضوح — أرفق مستنداً أوضح…" className="w-full rounded-lg border-2 border-amber-300 bg-white p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-amber-400" />
                      <button className="flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700">
                        <XCircle className="h-4 w-4" /> رفض الطلب
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
