import Link from 'next/link';
import { Wallet, ArrowDownCircle, ArrowUpCircle, Info } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getBalance, listTxns } from '@/lib/wallet';
import { getPricing } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'محفظتي' };

function fmt(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export default async function WalletPage() {
  const session = await requireUser();
  const [balance, txns, pricing] = await Promise.all([getBalance(session.uid), listTxns(session.uid, 100), getPricing()]);
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-primary"><Wallet className="h-6 w-6" /> محفظتي</h1>

      <div className="card-3d rounded-2xl bg-gradient-to-l from-primary to-primary/80 p-5 text-white">
        <div className="text-sm opacity-90">الرصيد المتاح</div>
        <div className="mt-1 text-3xl font-extrabold">{balance} <span className="text-lg">ر.س</span></div>
        <p className="mt-2 text-xs opacity-90">لشحن الرصيد تواصل مع إدارة الموقع. يُخصم الرصيد تلقائياً عند الإعلانات المميّزة والمبوّبة ورسوم تكرار الإعلانات.</p>
      </div>

      {(pricing.featured > 0 || pricing.classified > 0 || pricing.duplicate > 0) && (
        <div className="card-3d rounded-xl p-3 text-sm">
          <div className="mb-1 flex items-center gap-1 font-bold text-primary"><Info className="h-4 w-4" /> التسعير الحالي</div>
          <ul className="space-y-0.5 text-muted-foreground">
            {pricing.featured > 0 && <li>• ترقية إعلان إلى مميّز: <b className="text-foreground">{pricing.featured} ر.س</b></li>}
            {pricing.classified > 0 && <li>• نشر إعلان مبوّب: <b className="text-foreground">{pricing.classified} ر.س</b></li>}
            {pricing.duplicate > 0 && <li>• رسوم تكرار إعلان (عادي/مبوّب): <b className="text-foreground">{pricing.duplicate} ر.س</b></li>}
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
