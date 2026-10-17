'use client';
import {useState} from 'react';
import {delegateMessage,delegateWhatsappUrl,type DelegateIssue} from '@/lib/cj/delegate-message';
export function DelegateMessage({issue}:{issue:DelegateIssue}){
 const [problem,setProblem]=useState(issue.problem),[requested,setRequested]=useState(issue.requested),[notice,setNotice]=useState('');
 const message=delegateMessage({...issue,problem,requested});
 return <details className="min-w-0 rounded-xl border p-3 text-sm">
  <summary className="cursor-pointer font-bold text-primary">مراسلة المفوض</summary>
  <div className="mt-3 space-y-3">
   <label className="block">وصف المشكلة بالإنجليزية<textarea className="mt-1 w-full rounded border p-2" rows={2} maxLength={1200} value={problem} onChange={e=>setProblem(e.target.value)}/></label>
   <label className="block">الإجراء المطلوب بالإنجليزية<textarea className="mt-1 w-full rounded border p-2" rows={2} maxLength={1200} value={requested} onChange={e=>setRequested(e.target.value)}/></label>
   <p>راجع الرسالة واختر المفوض في واتساب. لا تضف بيانات العميل أو مفاتيح الاتصال.</p>
   <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 font-sans" dir="ltr" lang="en">{message}</pre>
   <div className="flex flex-wrap gap-2">
    <button type="button" className="rounded border px-3 py-2" onClick={async()=>{try{await navigator.clipboard.writeText(message);setNotice('تم نسخ الرسالة');}catch{setNotice('تعذر النسخ؛ حدد نص الرسالة وانسخه يدويًا');}}}>نسخ الرسالة</button>
    <a href={delegateWhatsappUrl(message)} target="_blank" rel="noopener noreferrer" className="rounded bg-primary px-3 py-2 text-white">فتح واتساب واختيار المفوض</a>
   </div><p role="status" aria-live="polite">{notice}</p>
  </div>
 </details>;
}
