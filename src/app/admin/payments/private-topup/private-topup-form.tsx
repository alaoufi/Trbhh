'use client';

import { useFormStatus } from 'react-dom';

export const PRIVATE_ALRAJHI_DEFAULT_AMOUNT = 50;
export const PRIVATE_ALRAJHI_AMOUNT_INPUT_LANGUAGE = 'en';
export const PRIVATE_ALRAJHI_PENDING_MESSAGE = 'جاري إنشاء العملية الآمنة... لا تغلق الصفحة أو تعِد تحميلها.';

function PrivateTopupFields({ min, max, ready }: { min: number; max: number; ready: boolean }) {
  const { pending } = useFormStatus();
  const disabled = pending || !ready;

  return <>
    <label className="block text-sm font-bold">مبلغ الشحن (ر.س)
      <input name="amount" type="text" inputMode="decimal" lang={PRIVATE_ALRAJHI_AMOUNT_INPUT_LANGUAGE} dir="ltr" pattern="[0-9]+([.][0-9]+)?" required disabled={disabled} defaultValue={PRIVATE_ALRAJHI_DEFAULT_AMOUNT} placeholder={`${min} - ${max}`} className="mt-1 h-11 w-full rounded-lg border px-3 text-left disabled:cursor-wait disabled:bg-muted" style={{ direction: 'ltr', unicodeBidi: 'plaintext' }} />
    </label>
    <p aria-live="polite" className="text-xs text-muted-foreground">
      {pending ? <span className="inline-flex items-center gap-2 font-bold text-primary"><span aria-hidden="true" className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />{PRIVATE_ALRAJHI_PENDING_MESSAGE}</span> : 'مبلغ مفتوح ضمن حدود الحماية. عند فشل الدفع لا يضاف أي رصيد، وعند نجاحه يُضاف تلقائياً إلى محفظة الحساب الإداري المسجّل.'}
    </p>
    <button disabled={disabled} aria-busy={pending} className="btn-3d rounded-lg bg-primary px-4 py-2 font-bold text-white disabled:cursor-wait disabled:opacity-50">
      {pending ? 'جاري الانتقال إلى الدفع الآمن...' : 'الانتقال إلى الدفع الآمن'}
    </button>
  </>;
}

export function PrivateAlrajhiTopupForm({ action, min, max, ready }: { action: (formData: FormData) => void | Promise<void>; min: number; max: number; ready: boolean }) {
  return <form action={action} className="space-y-3 rounded-2xl border bg-card p-4">
    <PrivateTopupFields min={min} max={max} ready={ready} />
  </form>;
}
