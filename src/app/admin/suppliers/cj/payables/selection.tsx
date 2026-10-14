'use client';
import {useState} from 'react';
import {useFormStatus} from 'react-dom';
import {prepareSettlement} from './actions';

export type PayableChoice = {id:string;commerceOrderId:string;cjOrderId:string|null;status:string;productUsdMinor:number;shippingUsdMinor:number;taxUsdMinor:number;totalUsdMinor:number;overdue:boolean};
const usd = (minor:number) => `$${(minor/100).toFixed(2)}`;
function Submit({disabled}:{disabled:boolean}) {
  const {pending} = useFormStatus();
  return <button disabled={pending||disabled} className="rounded-lg bg-primary px-4 py-2 font-bold text-white disabled:opacity-50">{pending?'جارٍ تسجيل الدفعة…':'تسجيل الدفعة المحددة — دون خصم'}</button>;
}
export function PayableSelection({rows,requestKey}:{rows:PayableChoice[];requestKey:string}) {
  const [selected,setSelected] = useState<string[]>([]);
  const [reviewed,setReviewed] = useState(false);
  const total = rows.filter(row=>selected.includes(row.id)).reduce((sum,row)=>sum+row.totalUsdMinor,0);
  function select(id:string) { setReviewed(false); setSelected(current=>current.includes(id)?current.filter(value=>value!==id):current.length<20?[...current,id]:current); }
  return <form action={prepareSettlement} className="space-y-3">
    <input type="hidden" name="requestKey" value={requestKey}/>
    <div className="flex flex-wrap gap-2"><button type="button" className="rounded border px-3 py-2" onClick={()=>{setSelected(rows.slice(0,10).map(row=>row.id));setReviewed(false);}}>أقدم 10 طلبات</button><button type="button" className="rounded border px-3 py-2" onClick={()=>{setSelected(rows.slice(0,20).map(row=>row.id));setReviewed(false);}}>أقدم 20 طلبًا</button><button type="button" className="rounded border px-3 py-2" onClick={()=>{setSelected([]);setReviewed(false);}}>مسح التحديد</button></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-sm"><thead><tr>{['تحديد','طلب تربح','طلب CJ','المنتج $','الشحن $','الضريبة $','المستحق $','الانتظار'].map(title=><th key={title} className="p-2">{title}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-t"><td className="p-2"><input aria-label={`تحديد طلب تربح ${row.commerceOrderId}`} type="checkbox" name="fulfillmentId" value={row.id} checked={selected.includes(row.id)} onChange={()=>select(row.id)} disabled={!selected.includes(row.id)&&selected.length>=20}/></td><td className="p-2">{row.commerceOrderId}</td><td className="p-2" dir="ltr">{row.cjOrderId}</td><td className="p-2" dir="ltr">{usd(row.productUsdMinor)}</td><td className="p-2" dir="ltr">{usd(row.shippingUsdMinor)}</td><td className="p-2" dir="ltr">{usd(row.taxUsdMinor)}</td><td className="p-2 font-bold" dir="ltr">{usd(row.totalUsdMinor)}</td><td className={`p-2 ${row.overdue?'font-bold text-red-700':''}`}>{row.overdue?'تجاوز مهلة الانتظار — سدّد الآن':'ضمن المهلة'}</td></tr>)}</tbody></table></div>
    <p aria-live="polite" className="font-bold">المحدد: {selected.length} / 20 · المستحق بالدولار: <span dir="ltr">{usd(total)}</span></p>
    <label className="flex items-center gap-2"><input type="checkbox" name="reviewed" value="1" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>راجعت المستحقات المحددة. تسجيل الدفعة لا يخصم مالاً ولا يؤكد السداد.</label>
    <Submit disabled={!selected.length||!reviewed}/>
  </form>;
}
