'use client';
import { useActionState, useState } from 'react';
import { RegionCityPicker } from '@/components/region-city-picker';
import { createCommerceOrder } from '@/app/shop/actions';
import {calculateFiscalLinesV2} from '@/lib/finance/fiscal-v2';
import {checkedMoney,formatSar} from '@/lib/commerce/money';
import type {FiscalPriceBasis} from '@/lib/finance/types';

export function CommerceCheckoutForm({ id, requestKey, memberName, maximum, regions, areas, submitLabel, fiscalQuote }: {
  id: string; requestKey: string; memberName: string; maximum: number; submitLabel: string;
  regions: { id: number; name: string }[]; areas: { id: number; name: string; cityId: number }[];
  fiscalQuote:{unitPriceMinor:number;priceBasis:FiscalPriceBasis;vatBps:number;shippingFeeMinor:number;shippingPriceBasis:FiscalPriceBasis;shippingVatBps:number;vatEnabled?:boolean};
}) {
  const [state, action, pending] = useActionState(createCommerceOrder, null);
  const [fields, setFields] = useState({ quantity: '1', name: memberName, phone: '', postalCode: '', address: '' });
  const input = 'mt-1 min-h-10 w-full rounded-lg border border-primary/25 px-3 text-sm';
  const change = (key: keyof typeof fields, value: string) => setFields(previous => ({ ...previous, [key]: value }));
  const vatOff=fiscalQuote.vatEnabled===false;
  let quote:ReturnType<typeof calculateFiscalLinesV2>|null=null;
  try{if(/^[1-9]\d{0,3}$/.test(fields.quantity)&&Number(fields.quantity)<=maximum)quote=calculateFiscalLinesV2([
    {key:id,title:'المنتج',quantity:Number(fields.quantity),unitPriceMinor:fiscalQuote.unitPriceMinor,discountMinor:0,priceBasis:fiscalQuote.priceBasis,vatBps:fiscalQuote.vatBps,component:'product'},
    {key:'shipping',title:'الشحن',quantity:1,unitPriceMinor:fiscalQuote.shippingFeeMinor,discountMinor:0,priceBasis:fiscalQuote.shippingPriceBasis,vatBps:fiscalQuote.shippingVatBps,component:'shipping'},
  ]);if(quote)checkedMoney(quote.totalMinor);}catch{quote=null;/* Invalid quantity or overflow never renders an invented payable amount. */}
  return <form action={action} className="grid gap-3 sm:grid-cols-2">
    <input type="hidden" name="productId" value={id} /><input type="hidden" name="requestKey" value={requestKey} />
    <label>الكمية<input className={input} name="quantity" type="number" min={1} max={maximum} value={fields.quantity} onChange={e => change('quantity', e.target.value)} required /></label>
    <label>اسم المستلم<input className={input} name="name" value={fields.name} onChange={e => change('name', e.target.value)} maxLength={100} required /></label>
    <label>جوال المستلم<input className={input} name="phone" type="tel" value={fields.phone} onChange={e => change('phone', e.target.value)} maxLength={20} required /></label>
    <label>الرمز البريدي<input className={input} name="postalCode" value={fields.postalCode} onChange={e => change('postalCode', e.target.value)} inputMode="numeric" pattern="[0-9]{5}" required /></label>
    <div className="sm:col-span-2"><RegionCityPicker regions={regions} areas={areas} /></div>
    <label className="sm:col-span-2">العنوان الوطني / الشارع والمبنى<input className={input} name="address" value={fields.address} onChange={e => change('address', e.target.value)} maxLength={300} required /></label>
    <label className="text-sm sm:col-span-2"><input type="checkbox" name="terms" value="1" required /> أوافق على شروط التوصيل، وأراجع إجمالي الطلب قبل الدفع.</label>
    {quote&&<dl className="rounded-lg border border-primary/20 p-3 sm:col-span-2" aria-live="polite"><div>{vatOff?'القيمة':'القيمة قبل الضريبة'}: {formatSar(quote.netMinor)} ر.س</div>{vatOff?<div>ضريبة القيمة المضافة غير مضافة</div>:<div>الضريبة: {formatSar(quote.vatMinor)} ر.س</div>}<div>{vatOff?'الشحن':'الشحن شامل ضريبته'}: {formatSar(quote.lines[1].grossMinor)} ر.س</div><div className="font-bold">{vatOff?'إجمالي الطلب شامل الشحن':'إجمالي الطلب شامل الشحن والضريبة'}: {formatSar(quote.totalMinor)} ر.س</div><p className="text-sm">تراجع القيم النهائية المحفوظة في صفحة الطلب قبل بدء الدفع.</p></dl>}
    {state?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">{state.error}</p>}
    <button disabled={pending||!quote} className="rounded-lg bg-primary px-4 py-2 font-bold text-white disabled:opacity-50">{submitLabel}</button>
  </form>;
}
