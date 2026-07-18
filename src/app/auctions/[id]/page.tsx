import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Gavel, Timer, User } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { auctionsEnabled, getAuctionDetail, closeDueAuctions } from '@/lib/auctions';
import { timeAgo } from '@/lib/utils';
import { placeBidAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مزاد' };

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);

export default async function AuctionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ bid?: string; opened?: string; error?: string; min?: string }> }) {
  if (!(await auctionsEnabled())) notFound();
  await closeDueAuctions().catch(() => {});
  const { id } = await params;
  const sp = await searchParams;
  const detail = await getAuctionDetail(Number(id));
  if (!detail) notFound();
  const { card: a, bids } = detail;
  const session = await getSession().catch(() => null);
  const isSeller = !!session && session.uid === a.sellerId;
  const minBid = a.topBid > 0 ? a.topBid + a.minStep : Math.max(a.startPrice, 1);
  const endsAt = new Date(a.endsAt);
  const fmt = new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="mx-auto max-w-lg space-y-4">
      {sp.opened === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ فُتح مزادك — شارك الرابط ليزايد المهتمون.</div>}
      {sp.bid === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ سُجّلت مزايدتك — أنت الأعلى الآن!</div>}
      {sp.error === 'low' && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">المبلغ أقل من الحد الأدنى — أدنى مزايدة مقبولة: {sp.min} ر.س.</div>}
      {sp.error && sp.error !== 'low' && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-700">{decodeURIComponent(sp.error)}</div>}

      <div className="card-3d overflow-hidden rounded-2xl">
        <Link href={`/ads/${a.adId}`} className="relative block aspect-[16/9] w-full bg-white">
          <Image src={a.image} alt={a.title} fill sizes="(max-width:640px) 100vw, 512px" className="object-cover" />
          <span className={`absolute right-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-extrabold text-white shadow ${a.closed ? 'bg-slate-600' : 'bg-red-600 animate-pulse'}`}>
            {a.closed ? 'مزاد مغلق' : '🔴 مزاد مفتوح'}
          </span>
        </Link>
        <div className="space-y-2 p-4">
          <h1 className="text-lg font-extrabold text-primary">{a.title}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> البائع: {a.sellerName}</span>
            <span className="flex items-center gap-1"><Timer className="h-3.5 w-3.5" /> {a.closed ? 'انتهى' : 'ينتهي'}: {fmt.format(endsAt)}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-secondary/40 p-2"><div className="text-sm font-extrabold text-primary">{en(a.startPrice)}</div><div className="text-[10px] text-muted-foreground">سعر البداية</div></div>
            <div className="rounded-xl bg-emerald-50 p-2"><div className="text-sm font-extrabold text-emerald-700">{a.topBid > 0 ? en(a.topBid) : '—'}</div><div className="text-[10px] text-muted-foreground">أعلى مزايدة</div></div>
            <div className="rounded-xl bg-secondary/40 p-2"><div className="text-sm font-extrabold text-primary">{en(a.bidsCount)}</div><div className="text-[10px] text-muted-foreground">مزايدة</div></div>
          </div>
          <Link href={`/ads/${a.adId}`} className="block text-center text-xs font-bold text-primary hover:underline">عرض تفاصيل الإعلان كاملة ←</Link>
        </div>
      </div>

      {a.closed ? (
        <div className={`rounded-2xl p-4 text-center text-sm font-bold ${a.winnerBid ? 'bg-emerald-50 text-emerald-800' : 'bg-secondary/40 text-muted-foreground'}`}>
          {a.winnerBid ? <>🏆 أُغلق المزاد — الفائز بأعلى مزايدة {en(a.winnerBid)} ر.س. وصلت رسالة للفائز والبائع لإتمام الصفقة.</> : 'أُغلق المزاد دون مزايدات.'}
        </div>
      ) : isSeller ? (
        <div className="rounded-2xl bg-secondary/40 p-4 text-center text-sm font-bold text-muted-foreground">هذا مزادك — شارك رابط الصفحة ليزايد المهتمون. يُغلق تلقائياً في موعده.</div>
      ) : session ? (
        <form action={placeBidAction} className="card-3d space-y-2 rounded-2xl p-4">
          <input type="hidden" name="auctionId" value={a.id} />
          <div className="flex items-center gap-2 font-bold text-primary"><Gavel className="h-5 w-5" /> زايد الآن</div>
          <p className="text-[11px] text-muted-foreground">أدنى مزايدة مقبولة: <b>{en(minBid)} ر.س</b> (أعلى مزايدة + {en(a.minStep)}). المزايدة التزام جاد بالشراء عند الفوز.</p>
          <div className="flex gap-2">
            <input name="amount" type="number" min={minBid} required defaultValue={minBid} className="h-11 min-w-0 flex-1 rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/40" />
            <button className="btn-3d shrink-0 rounded-lg bg-primary px-4 text-sm font-extrabold text-white">مزايدة</button>
          </div>
        </form>
      ) : (
        <Link href="/login" className="block rounded-2xl bg-primary p-4 text-center text-sm font-extrabold text-white">سجّل الدخول للمزايدة ←</Link>
      )}

      {bids.length > 0 && (
        <div className="card-3d space-y-2 rounded-2xl p-4">
          <div className="text-sm font-bold text-primary">سجل المزايدات ({en(bids.length)})</div>
          <ul className="space-y-1.5">
            {bids.map((b, i) => (
              <li key={b.id} className={`flex items-center justify-between gap-2 rounded-xl border p-2 text-sm ${i === 0 ? 'border-emerald-300 bg-emerald-50' : ''}`}>
                <span className="flex items-center gap-1.5 font-bold">{i === 0 && '🏅'} {b.name}</span>
                <span className="flex items-center gap-2"><b className={i === 0 ? 'text-emerald-700' : ''}>{en(b.amount)} ر.س</b><span className="text-[10px] text-muted-foreground">{timeAgo(b.at)}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
