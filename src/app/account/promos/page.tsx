import Link from 'next/link';
import { Megaphone, Plus, Check, Clock } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getMyPromos } from '@/lib/promos';
import { PLACEMENT_LABEL, STATUS_LABEL } from '@/lib/promo-placements';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إعلاناتي الترويجية' };

const statusStyle: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-muted text-muted-foreground',
};

export default async function MyPromosPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const session = await requireUser();
  const [items, sp] = await Promise.all([getMyPromos(session.uid), searchParams]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-primary">إعلاناتي الترويجية ({items.length})</h1>
        </div>
        <Link href="/promote" className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" /> أعلن معنا</Link>
      </div>

      {sp.created === '1' && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <Clock className="h-4 w-4" /> تم إرسال إعلانك للمراجعة. سيظهر بعد موافقة الإدارة.
        </div>
      )}

      {items.length === 0 ? (
        <div className="card-3d rounded-2xl p-8 text-center">
          <p className="text-muted-foreground">لا توجد لديك إعلانات ترويجية بعد.</p>
          <Link href="/promote" className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">أنشئ إعلانك الترويجي</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <div key={p.id} className="flex gap-3 card-3d rounded-xl p-3">
              <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-800">
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
                {p.status === 'active' && p.endsAt && (
                  <span className="text-xs text-green-700"><Check className="mb-0.5 inline h-3 w-3" /> ينتهي: {new Date(p.endsAt).toLocaleDateString('ar')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
