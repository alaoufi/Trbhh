'use client';

import {useState} from 'react';

type InviteResult={url?:unknown;expiresAt?:unknown;error?:unknown};
const primary='inline-flex min-h-11 items-center justify-center rounded-xl bg-[#16294A] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50';
const secondary='inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700';

export function SupplierOwnerInviteButton({supplierId,supplierName}:{supplierId:string;supplierName:string}){
 const [url,setUrl]=useState(''),[expiresAt,setExpiresAt]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const issue=async()=>{
  if(pending)return;setPending(true);setError('');setCopied(false);
  try{
   const body=new FormData();body.set('supplierId',supplierId);
   const response=await fetch('/api/integrations/salla/invite',{method:'POST',body,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
   const result=await response.json() as InviteResult;
   if(!response.ok||typeof result.url!=='string'||typeof result.expiresAt!=='string')throw Error();
   const parsed=new URL(result.url);if(parsed.origin!==window.location.origin||parsed.pathname!=='/api/integrations/salla/authorize'||!parsed.searchParams.get('invite'))throw Error();
   setUrl(result.url);setExpiresAt(result.expiresAt);
  }catch{setError('تعذّر إنشاء الرابط الآن. تأكد أن المورد نشط أو أن اتصاله يحتاج إعادة تفويض ثم أعد المحاولة.');}
  finally{setPending(false);}
 };
 return <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4" aria-label={`تفويض متجر ${supplierName}`}>
  <h3 className="font-bold text-emerald-950">متابعة تفويض متجر سلة — {supplierName}</h3>
  <p className="mt-1 text-sm leading-6 text-emerald-900">أنشئ رابطًا مؤقتًا صالحًا 24 ساعة وأرسله لصاحب المتجر ليختار «متابعة التفويض في سلة». يمكن فتح الرابط والمحاولة أكثر من مرة خلال صلاحيته، ويمكنك إنشاء رابط جديد فور انتهاء السابق. التفويض الجديد مطلوب للسماح بحفظ العميل وإنشاء طلبه في سلة.</p>
  <button type="button" className={`${primary} mt-3`} disabled={pending} onClick={issue}>{pending?'جارٍ إنشاء الرابط…':'إنشاء/تجديد رابط تفويض سلة'}</button>
  {error&&<p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
  {url&&<div className="mt-3 space-y-3">
   <label className="block text-xs font-semibold text-emerald-950">رابط التفويض<input readOnly dir="ltr" value={url} className="mt-2 min-h-11 w-full rounded-lg border border-emerald-300 bg-white px-3 text-left text-xs"/></label>
   <div className="flex flex-wrap gap-2"><button type="button" className={primary} onClick={async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);}catch{setCopied(false);}}}>{copied?'تم نسخ الرابط':'نسخ الرابط'}</button><a href={url} target="_blank" rel="noreferrer" className={secondary}>متابعة التفويض في سلة</a></div>
   <p className="text-xs text-emerald-900">صالح لمدة 24 ساعة من إنشائه{expiresAt?`، وينتهي ${new Date(expiresAt).toLocaleString('ar-SA')}`:''}. يمكنك فتحه أكثر من مرة، وإنشاء رابط جديد يلغي الرابط السابق فقط.</p>
  </div>}
 </section>;
}
