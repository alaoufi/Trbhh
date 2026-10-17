'use client';
import {useState} from 'react';
export function ProductReference({id,pid,sku}:{id:string|number;pid?:string|null;sku?:string|null}){
 const [copied,setCopied]=useState(false);
 const reference=String(id);
 async function copy(){try{await navigator.clipboard.writeText(reference);setCopied(true);}catch{setCopied(false);}}
 return <section aria-label="مرجع المنتج" className="min-w-0 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm">
 <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-primary">رقم المنتج: <b className="select-all text-xl" dir="ltr">{reference}</b></p><button type="button" onClick={copy} className="min-h-11 rounded-lg border border-primary/25 bg-white px-3 text-xs font-bold" aria-label={`نسخ رقم المنتج ${reference}`}>{copied?'تم نسخ الرقم':'نسخ الرقم'}</button></div>
 <p className="text-xs leading-5 text-slate-600">استخدم هذا الرقم عند الاستفسار أو الإبلاغ عن اختلاف، وأرفق رقم الطلب بعد الشراء.</p>
 {(pid||sku)&&<details className="mt-1"><summary className="cursor-pointer text-xs text-slate-500">تفاصيل المرجع</summary><dl className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">{pid&&<div className="min-w-0 break-all"><dt className="inline">معرّف المصدر: </dt><dd className="inline font-semibold" dir="ltr">{pid}</dd></div>}{sku&&<div className="min-w-0 break-all"><dt className="inline">رمز الصنف: </dt><dd className="inline font-semibold" dir="ltr">{sku}</dd></div>}</dl></details>}
 <span role="status" className="sr-only">{copied?'تم نسخ رقم المنتج':''}</span>
 </section>;
}
