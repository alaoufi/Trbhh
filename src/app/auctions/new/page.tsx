import { notFound, redirect } from 'next/navigation';
import { Gavel } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { auctionsEnabled } from '@/lib/auctions';
import { getAuctionConfig } from '@/lib/settings';
import { getMyAds } from '@/lib/account';
import { getBalance } from '@/lib/wallet';
import { createAuctionAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'افتح مزاداً' };

const field = 'h-11 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40';

/** فتح مزاد على أحد إعلانات العضو النشطة (إعلانات تربح فقط — لا منتجات المتاجر). */
export default async function NewAuctionPage({ searchParams }: { searchParams: Promise<{ ad?: string; error?: string }> }) {
  if (!(await auctionsEnabled())) notFound();
  const session = await requireUser();
  const { ad, error } = await searchParams;
  const [cfg, ads, balance] = await Promise.all([getAuctionConfig(), getMyAds(session.uid), getBalance(session.uid)]);
  const eligible = ads.filter((a) => a.status === 1 && !a.storeOnly);
  if (!eligible.length) redirect('/ads/new');
  const preselect = Number(ad || 0);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-primary"><Gavel className="h-6 w-6" /> افتح مزاداً على إعلانك</h1>
      {error === 'needcredit' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 رصيدك لا يكفي لرسم فتح المزاد ({cfg.fee} ر.س، ورصيدك {balance} ر.س) — <a href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك من هنا</a> ثم أعد المحاولة.</div>}
      {error && error !== 'needcredit' && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-700">{decodeURIComponent(error)}</div>}
      <p className="rounded-xl bg-secondary/30 p-3 text-xs leading-5 text-muted-foreground">
        حدد سعر البداية وأدنى زيادة ومدة المزاد (حتى {cfg.maxDays} أيام). عند الانتهاء يُغلق تلقائياً ويُعلن صاحب أعلى مزايدة فائزاً وتصلكما رسالة لإتمام الصفقة بينكما.
        {cfg.fee > 0 && <> رسم فتح المزاد: <b>{cfg.fee} ر.س</b> يُخصم من رصيدك.</>}
      </p>
      <form action={createAuctionAction} className="card-3d space-y-3 rounded-2xl p-4">
        <label className="block space-y-1">
          <span className="text-xs font-bold">الإعلان</span>
          <select name="adId" required defaultValue={eligible.some((a) => a.id === preselect) ? preselect : eligible[0].id} className={field}>
            {eligible.map((a) => <option key={a.id} value={a.id}>{a.title || `إعلان #${a.id}`}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs font-bold">سعر البداية (ر.س)</span>
            <input name="startPrice" type="number" min={0} required defaultValue={0} className={field} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold">أدنى زيادة (ر.س)</span>
            <input name="minStep" type="number" min={1} required defaultValue={10} className={field} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-bold">مدة المزاد (أيام — حتى {cfg.maxDays})</span>
          <input name="days" type="number" min={1} max={cfg.maxDays} required defaultValue={Math.min(3, cfg.maxDays)} className={field} />
        </label>
        <button className="btn-3d w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-extrabold text-white">
          فتح المزاد{cfg.fee > 0 ? ` (${cfg.fee} ر.س)` : ''}
        </button>
      </form>
    </div>
  );
}
