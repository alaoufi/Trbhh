'use client';
import {useState} from 'react';
import Link from 'next/link';
export function PreviewLogin() {
  const [error,setError]=useState(''); const [pending,setPending]=useState(false);
  return <div className="mx-auto max-w-sm px-4 py-8"><Link href="/">العودة للموقع التجريبي</Link><h1 className="my-4 text-xl font-bold">دخول حساب الاختبار</h1>
    <p className="mb-4 text-sm">استخدم حساب التجربة فقط، وليس بيانات حسابك في الموقع الفعلي.</p>
    <form onSubmit={async event=>{
      event.preventDefault(); if(pending)return;
      const data=new FormData(event.currentTarget);setPending(true);setError('');
      try {
        const result=await fetch('/api/preview-login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({identifier:data.get('identifier'),password:data.get('password')})});
        const body=await result.json();if(!result.ok)throw new Error(body.error || 'تعذر الدخول');
        const next=new URLSearchParams(location.search).get('next');
        location.assign(next && /^\/(?:ads\/new|seller|field-settings)\/?(?:\?[^\\]*)?$/.test(next) ? next : '/ads/new');
      } catch(error) {setError(error instanceof Error ? error.message : 'تعذر الدخول');setPending(false);}
    }}>
      <fieldset disabled={pending} className="grid gap-4">
        <label>اسم المستخدم<input name="identifier" autoComplete="username" required defaultValue="preview" className="block w-full rounded border p-2" /></label>
        <label>كلمة المرور<input name="password" type="password" autoComplete="current-password" required className="block w-full rounded border p-2" /></label>
        <button className="rounded bg-primary p-3 text-primary-foreground" type="submit">{pending?'جارٍ الدخول…':'دخول'}</button>
      </fieldset>
      <p role="alert" className="mt-3 text-red-700">{error}</p>
    </form></div>;
}
