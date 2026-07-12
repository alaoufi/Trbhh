import Link from 'next/link';
import { Megaphone, Check, X, Trash2, Settings2, ExternalLink } from 'lucide-react';
import { requirePerm } from '@/lib/roles';
import { listPromos } from '@/lib/promos';
import { PLACEMENT_LABEL, STATUS_LABEL } from '@/lib/promo-placements';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { approvePromoAction, rejectPromoAction, deletePromoAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الإعلانات الترويجية' };

const statusStyle: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800', active: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700', expired: 'bg-muted text-muted-foreground',
};

export default async function AdminPromos() {
  await requirePerm('promos');
  const items = await listPromos();
  const pending = items.filter((p) => p.status === 'pending');
  const others = items.filter((p) => p.status !== 'pending');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-primary">الإعلانات الترويجية</h1>
        </div>
        <Link href="/admin/promos/packages" className="flex items-center gap-1 rounded-lg border border-primary/30 px-3 py-2 text-sm font-medium text-primary hover:bg-accent">
          <Settings2 className="h-4 w-4" /> باقات المدد والأسعار
        </Link>
      </div>

      <Section title={`بانتظار الموافقة (${pending.length})`} items={pending} />
      <Section title="إعلانات أخرى" items={others} />
    </div>
  );
}

function Card({ p }: { p: import('@/lib/promos').Promo }) {
  return (
    <div className="flex gap-3 rounded-xl border border-primary/20 bg-white p-3">
      <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-slate-800">
        {p.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.image} alt="" className="h-full w-full object-cover" />
          : <div className="grid h-full w-full place-items-center text-white/70"><Megaphone className="h-5 w-5" /></div>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="line-clamp-1 font-semibold">{p.title || p.body || 'إعلان ترويجي'}</span>
          <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${statusStyle[p.status]}`}>{STATUS_LABEL[p.status]}</span>
        </div>
        <span className="text-xs text-muted-foreground">{PLACEMENT_LABEL[p.placement]} · {p.days} يوم · {p.price === 0 ? 'مجاني' : `${p.price} ﷼`}</span>
        {p.body && <span className="line-clamp-1 text-xs text-muted-foreground">{p.body}</span>}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          {p.phone && <span dir="ltr" className="text-muted-foreground">📞 {p.phone}</span>}
          {p.whatsapp && <span dir="ltr" className="text-muted-foreground">🟢 {p.whatsapp}</span>}
          {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary"><ExternalLink className="h-3 w-3" /> الرابط</a>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.status !== 'active' && (
            <form action={approvePromoAction}><input type="hidden" name="id" value={p.id} /><button className="flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white"><Check className="h-3.5 w-3.5" /> موافقة ونشر</button></form>
          )}
          {p.status === 'pending' && (
            <form action={rejectPromoAction}><input type="hidden" name="id" value={p.id} /><button className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs"><X className="h-3.5 w-3.5" /> رفض</button></form>
          )}
          <form action={deletePromoAction}><input type="hidden" name="id" value={p.id} /><ConfirmSubmit msg="حذف هذا الإعلان الترويجي نهائياً؟ لا يمكن التراجع." className="flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1 text-xs text-destructive"><Trash2 className="h-3.5 w-3.5" /> حذف</ConfirmSubmit></form>
        </div>
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: import('@/lib/promos').Promo[] }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold text-primary">{title}</h2>
      {items.length === 0 ? <p className="py-3 text-center text-sm text-muted-foreground">لا يوجد.</p> : items.map((p) => <Card key={p.id} p={p} />)}
    </div>
  );
}
