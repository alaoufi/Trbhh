'use client';

import { useState } from 'react';
import { CreditCard, LockKeyhole } from 'lucide-react';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { WALLET_TOPUP_QUICK_AMOUNTS } from '@/lib/wallet-topup-view';

const METHOD_LABEL: Record<string, string> = {
  mada: 'مدى',
  visa: 'فيزا',
  mastercard: 'ماستركارد',
  applepay: 'Apple Pay',
  stcpay: 'STC Pay',
};

export function WalletOnlineTopup({
  action,
  min,
  max,
  methods,
  mode,
}: {
  action: (formData: FormData) => void | Promise<void>;
  min: number;
  max: number;
  methods: string[];
  mode: 'test' | 'live';
}) {
  const [amount, setAmount] = useState<number | ''>('');

  return (
    <section id="paynow" className="card-3d space-y-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 p-4">
      <header className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><CreditCard className="h-5 w-5" /></span>
        <div className="min-w-0"><h2 className="font-extrabold text-emerald-900">الدفع الإلكتروني</h2><p className="mt-0.5 text-xs font-medium text-emerald-800">يُضاف الرصيد تلقائياً بعد تأكيد عملية الدفع.</p></div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {methods.map((method) => <span key={method} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">{METHOD_LABEL[method] || method}</span>)}
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="amount" value={amount} />
        <div className="grid grid-cols-5 gap-1.5">
          {WALLET_TOPUP_QUICK_AMOUNTS.map((quickAmount) => (
            <button key={quickAmount} type="button" onClick={() => setAmount(quickAmount)} className={`rounded-xl border-2 px-1 py-2 text-sm font-extrabold transition ${amount === quickAmount ? 'border-emerald-700 bg-emerald-600 text-white' : 'border-emerald-200 bg-white text-emerald-800 hover:border-emerald-500'}`}>{quickAmount}</button>
          ))}
        </div>
        <label className="block space-y-1"><span className="text-sm font-bold text-foreground">مبلغ آخر (ر.س) — من {min} إلى {max}</span><input aria-label="مبلغ شحن آخر" type="number" min={min} max={max} step="1" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value === '' ? '' : Number(event.target.value))} placeholder={`مثال: ${min}`} className="h-11 w-full rounded-xl border-2 border-emerald-200 bg-white px-3 text-sm outline-none focus:border-emerald-600" required /></label>
        <ConfirmSubmit msg="الانتقال إلى صفحة الدفع الآمنة لإتمام شحن الرصيد؟" className="btn-3d flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-extrabold text-white"><LockKeyhole className="h-4 w-4" />الدفع الآمن الآن</ConfirmSubmit>
      </form>
      {mode === 'test' && <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">وضع تجريبي — لا تستخدم بطاقة حقيقية.</p>}
      <p className="text-[11px] font-medium text-muted-foreground">يتم الدفع في صفحة البوابة المستضافة؛ لا تُخزَّن بيانات بطاقتك في تربح.</p>
    </section>
  );
}
