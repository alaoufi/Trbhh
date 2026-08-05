import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Gavel, Timer, TrendingUp } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { auctionsEnabled, listAuctions, closeDueAuctions, type AuctionCard } from '@/lib/auctions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'المزادات', description: 'زايد على أفضل العروض في مزادات عقار تربح' };

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);

/** «متبقي …» حتى نهاية المزاد (تقريب لطيف بلا عدّاد حي). */
function timeLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'انتهى';
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `متبقي ${en(mins)} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `متبقي ${en(hours)} ساعة`;
  return `متبقي ${en(Math.ceil(hours / 24))} يوم`;
}

function AuctionRow({ a }: { a: AuctionCard }) {
  return (
    <Link href={`/auctions/${a.id}`} className="card-3d flex items-stretch gap-3 rounded-2xl p-3">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white">
        <Image src={a.image} alt={a.title} fill sizes="80px" className="object-cover" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug">{a.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="flex items-center gap-1 font-extrabold text-emerald-700"><TrendingUp className="h-3.5 w-3.5" /> {a.topBid > 0 ? `أعلى مزايدة: ${en(a.topBid)} ر.س` : `يبدأ من: ${en(a.startPrice)} ر.س`}</span>
          <span className="text-muted-foreground">{en(a.bidsCount)} مزايدة</span>
        </div>
        <span className={`mt-auto flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${a.closed ? 'bg-secondary text-muted-foreground' : 'bg-red-50 text-red-700'}`}>
          <Timer className="h-3 w-3" /> {a.closed ? (a.winnerBid ? `أُغلق — بيع بـ ${en(a.winnerBid)} ر.س` : 'أُغلق بلا مزايدات') : timeLeft(a.endsAt)}
        </span>
      </div>
    </Link>
  );
}

/** المزادات: يفتحها الأعضاء على إعلاناتهم (رسم من التحكم) ويزايد الآخرون حتى الإغلاق التلقائي. */
export default async function AuctionsPage() {
  if (!(await auctionsEnabled())) notFound();
  await closeDueAuctions().catch(() => {}); // إغلاق كسول للمستحق قبل العرض
  const session = await getSession().catch(() => null);
  const { open, closed } = await listAuctions();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 overflow-hidden rounded-2xl p-4 text-white shadow-md" style={{ backgroundImage: 'linear-gradient(110deg,#7c3aed,#5b21b6,#4c1d95)' }}>
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/20"><Gavel className="h-6 w-6" /></span>
          <div>
            <h1 className="text-lg font-extrabold drop-shadow">🔨 المزادات</h1>
            <p className="text-xs font-medium text-white/95">زايد على العروض المفتوحة — الأعلى عند الإغلاق يفوز ويتواصل مع البائع لإتمام الصفقة.</p>
          </div>
        </div>
        {session && <Link href="/auctions/new" className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-extrabold text-violet-700">+ افتح مزاداً</Link>}
      </div>

      <h2 className="text-base font-extrabold text-primary">المزادات المفتوحة ({en(open.length)})</h2>
      {open.length ? (
        <div className="space-y-3">{open.map((a) => <AuctionRow key={a.id} a={a} />)}</div>
      ) : (
        <p className="rounded-2xl bg-secondary/30 py-10 text-center text-sm text-muted-foreground">لا توجد مزادات مفتوحة حالياً{session ? ' — كن أول من يفتح مزاداً على إعلانه!' : '.'}</p>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="text-base font-extrabold text-muted-foreground">مزادات أُغلقت مؤخراً</h2>
          <div className="space-y-3 opacity-80">{closed.map((a) => <AuctionRow key={a.id} a={a} />)}</div>
        </>
      )}
    </div>
  );
}
