import Link from 'next/link';
import { Wallet, ArrowDownCircle, ArrowUpCircle, Info, Copy } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getBalance, listTxns, getDupCredit } from '@/lib/wallet';
import { getServicePricing, serviceHasPrice, DURATIONS } from '@/lib/settings';
import { buyDupPackAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'محفظتي' };

function fmt(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ dup?: string; error?: string; price?: string; bal?: string }> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const [balance, txns, pricing, dupCredit] = await Promise.all([getBalance(session.uid), listTxns(session.uid, 100), getServicePricing(), getDupCredit(session.uid)]);
  const range = (p: Record<'w2' | 'm1' | 'y1', number>) => DURATIONS.filter((d) => p[d.key] > 0).map((d) => p[d.key]);
  const priceRange = (p: Record<'w2' | 'm1' | 'y1', number>) => { const r = range(p); return r.length ? `${Math.min(...r)}–${Math.max(...r)} ر.س` : ''; };
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-primary"><Wallet className="h-6 w-6" /> محفظتي</h1>

      <div className="card-3d rounded-2xl bg-gradient-to-l from-primary to-primary/80 p-5 text-white">
        <div className="text-sm opacity-90">الرصيد المتاح</div>
        <div className="mt-1 text-3xl font-extrabold">{balance} <span className="text-lg">ر.س</span></div>
        <p className="mt-2 text-xs opacity-90">لشحن الرصيد تواصل مع إدارة الموقع. يُخصم الرصيد تلقائياً عند الإعلانات المميّزة والمبوّبة وباقات التكرار.</p>
      </div>

      {sp.dup === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ تمت إضافة باقة التكرار وخُصمت الرسوم من رصيدك.</div>}
      {sp.error === 'needcredit' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 رصيدك لا يكفي{sp.price ? ` (المطلوب ${sp.price} ر.س)` : ''}. تواصل مع الإدارة لشحن الرصيد.</div>}

      {/* باقات التكرار — نشر الإعلان المكرّر عدداً من المرّات (السعر حسب المدّة) */}
      {(serviceHasPrice(pricing.dup3) || serviceHasPrice(pricing.dup5)) && (
        <div className="card-3d space-y-2 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-primary"><Copy className="h-5 w-5" /> باقات التكرار</div>
            <div className="text-sm font-bold">المتبقّي: <b className="text-primary">{dupCredit}</b> نشرة</div>
          </div>
          <p className="text-xs text-muted-foreground">تتيح نشر إعلان مكرّر عدداً من المرّات (تُخصم نشرة عند كل نشر مكرّر). اختر المدّة ثم اشترِ.</p>
          <div className="grid grid-cols-2 gap-2">
            {([['3', pricing.dup3], ['5', pricing.dup5]] as const).filter(([, p]) => serviceHasPrice(p)).map(([tier, p]) => (
              <form key={tier} action={buyDupPackAction} className="flex flex-col items-center gap-1 rounded-xl border p-3 text-center">
                <input type="hidden" name="tier" value={tier} />
                <div className="text-sm font-bold">مكرّر {tier} <span className="text-[11px] text-muted-foreground">({tier} نشرات)</span></div>
                <select name="duration" className="h-9 w-full rounded-lg border bg-background px-2 text-xs">
                  {DURATIONS.filter((d) => p[d.key] > 0).map((d) => <option key={d.key} value={d.key}>{d.label} — {p[d.key]} ر.س</option>)}
                </select>
                <button className="w-full rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white">شراء</button>
              </form>
            ))}
          </div>
        </div>
      )}

      {(serviceHasPrice(pricing.featured) || serviceHasPrice(pricing.classified) || serviceHasPrice(pricing.dup3) || serviceHasPrice(pricing.dup5)) && (
        <div className="card-3d rounded-xl p-3 text-sm">
          <div className="mb-1 flex items-center gap-1 font-bold text-primary"><Info className="h-4 w-4" /> التسعير الحالي (حسب المدّة)</div>
          <ul className="space-y-0.5 text-muted-foreground">
            {serviceHasPrice(pricing.featured) && <li>• تمييز الإعلان: <b className="text-foreground">{priceRange(pricing.featured)}</b></li>}
            {serviceHasPrice(pricing.classified) && <li>• نشر إعلان مبوّب: <b className="text-foreground">{priceRange(pricing.classified)}</b></li>}
            {serviceHasPrice(pricing.dup3) && <li>• باقة «مكرّر 3»: <b className="text-foreground">{priceRange(pricing.dup3)}</b></li>}
            {serviceHasPrice(pricing.dup5) && <li>• باقة «مكرّر 5»: <b className="text-foreground">{priceRange(pricing.dup5)}</b></li>}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-2 text-sm font-bold text-muted-foreground">سجلّ العمليات ({txns.length})</div>
        {txns.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد عمليات بعد.</p>}
        <div className="space-y-2">
          {txns.map((t) => {
            const credit = t.amount > 0;
            return (
              <div key={t.id} className="flex items-center gap-3 card-3d rounded-xl p-3">
                {credit ? <ArrowUpCircle className="h-6 w-6 shrink-0 text-emerald-600" /> : <ArrowDownCircle className="h-6 w-6 shrink-0 text-red-500" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{t.label}</div>
                  {t.note && <div className="truncate text-xs text-muted-foreground">{t.note}</div>}
                  <div className="text-[11px] text-muted-foreground">{fmt(t.at)}{t.byAdmin ? ' • بواسطة الإدارة' : ''}</div>
                </div>
                <div className="shrink-0 text-left">
                  <div className={`text-sm font-extrabold ${credit ? 'text-emerald-600' : 'text-red-500'}`}>{credit ? '+' : ''}{t.amount} ر.س</div>
                  <div className="text-[11px] text-muted-foreground">الرصيد: {t.balanceAfter}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Link href="/account" className="block text-center text-sm text-muted-foreground hover:text-primary">← لوحة التحكم</Link>
    </div>
  );
}
