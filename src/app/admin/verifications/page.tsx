import Image from 'next/image';
import { ShieldCheck, Check, FileText, ExternalLink } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { mediaUrl } from '@/lib/media';
import { trustUserAction } from '../actions';
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
  const users = await prisma.users.findMany({
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

  // resolve every uploaded document id → file url so the admin can actually
  // review the documents before approving (previously only a ✓ was shown).
  const docIds = new Set<number>();
  for (const u of users) {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold text-primary">طلبات التوثيق ({users.length})</h1></div>
      {users.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد طلبات توثيق معلّقة.</p>}
      <div className="space-y-3">
        {users.map((u) => {
          const docs = [
            { label: 'الهوية الوطنية', url: docUrl(u.national_identity) },
            { label: 'السجل التجاري', url: docUrl(u.commercial_register) },
            { label: 'تصريح العمل', url: docUrl(u.work_permit) },
          ].filter((d) => d.url);
          return (
            <div key={toInt(u.id)} className="card-3d space-y-3 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold">{u.name || u.userName || '—'}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{u.phoneNumber} · {timeAgo(u.created_at)}</div>
                </div>
                <form action={trustUserAction}><input type="hidden" name="userId" value={toInt(u.id)} /><button className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"><Check className="h-4 w-4" /> اعتماد التوثيق</button></form>
              </div>

              {/* الوثائق المرفوعة — تظهر للإدارة للاطّلاع والموافقة */}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
