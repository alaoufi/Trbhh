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
    <section id="paynow" className="order-first overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* شريط ذهبي بهوية تربح — نفس أسلوب صفحة الدفع */}
      <div className="h-1.5 w-full bg-[#f0b429]" />
      <div className="space-y-3.5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black tracking-wide text-[#16294a]/60">شحن الرصيد</p>
            <h2 className="text-lg font-extrabold text-[#16294a]">اشحن رصيدك</h2>
          </div>
          <Image src="/payment-card-symbolic.webp" alt="بطاقة بنكية رمزية" width={180} height={112} priority className="h-auto w-20 shrink-0 drop-shadow-sm sm:w-24" />
        </div>

        {/* شعارات طرق الدفع — نفس أسلوب صفحة السلع */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-500">
          {methods.map((method) => <span key={method} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">{METHOD_LABEL[method] || method}</span>)}
        </div>

        <form action={action} className="space-y-2.5">
          <input type="hidden" name="amount" value={amount} />
          <p className="text-[13px] font-bold text-slate-700">اختر المبلغ (ر.س)</p>
          <div className="grid grid-cols-5 gap-1.5">
            {WALLET_TOPUP_QUICK_AMOUNTS.map((quickAmount) => (
              <button key={quickAmount} type="button" onClick={() => setAmount(quickAmount)} className={`rounded-lg border px-1 py-2 text-sm font-extrabold transition ${amount === quickAmount ? 'border-[#16294a] bg-[#16294a] text-white' : 'border-slate-300 bg-white text-[#16294a] hover:border-[#16294a]/50'}`}>{quickAmount}</button>
            ))}
          </div>
          <label className="block space-y-1"><span className="text-[13px] font-bold text-slate-700">مبلغ آخر (من {min} إلى {max})</span><input aria-label="مبلغ شحن آخر" type="number" min={min} max={max} step="1" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value === '' ? '' : Number(event.target.value))} placeholder={`مثال: ${min}`} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#16294a]" required /></label>
          <ConfirmSubmit msg="الانتقال إلى صفحة الدفع لإتمام شحن الرصيد؟" className="btn-3d flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#16294a] px-5 text-base font-extrabold text-white"><LockKeyhole className="h-5 w-5" />الدفع بالبطاقة</ConfirmSubmit>
        </form>
        {mode === 'test' && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">وضع تجريبي — لا تستخدم بطاقة حقيقية.</p>}
        <p className="text-[11px] leading-5 text-slate-500">تُدخل بطاقتك في بوابة البنك الآمنة — لا نحفظ أي بيانات بطاقة.</p>
      </div>
    </section>
  );
}
