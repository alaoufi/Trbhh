'use client';

import Image from 'next/image';
import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
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
    <section id="paynow" className="card-3d order-first space-y-5 rounded-2xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 shadow-lg shadow-emerald-900/10">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0"><div className="mb-1 text-[11px] font-black tracking-wide text-emerald-700">الدفع الإلكتروني</div><h2 className="text-lg font-extrabold text-emerald-900">اشحن رصيدك الآن</h2><p className="mt-0.5 text-xs font-medium text-emerald-800">ادفع بمدى أو Apple Pay أو STC Pay، ويُضاف الرصيد تلقائياً بعد تأكيد الدفع.</p></div>
        <Image src="/payment-card-symbolic.webp" alt="بطاقة صراف الراجحي مدى رمزية" width={180} height={112} priority className="h-auto w-24 shrink-0 drop-shadow-sm sm:w-32" />
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
        <ConfirmSubmit msg="الانتقال إلى صفحة الدفع لإتمام شحن الرصيد؟" className="btn-3d flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-base font-extrabold text-white shadow-lg shadow-emerald-700/30"><LockKeyhole className="h-5 w-5" />إتمام الدفع وشحن الرصيد</ConfirmSubmit>
      </form>
      {mode === 'test' && <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">وضع تجريبي — لا تستخدم بطاقة حقيقية.</p>}
      <p className="text-[11px] font-medium text-muted-foreground">يتم الدفع في صفحة البوابة المستضافة؛ لا تُخزَّن بيانات بطاقتك في تربح.</p>
    </section>
  );
}
