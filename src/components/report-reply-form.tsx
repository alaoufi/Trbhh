'use client';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { reportReplyAction } from '@/app/account/submitted-reports/actions';

export function ReportReplyForm({ kind, id, admin, initialNonce }: { kind: string; id: string; admin: boolean; initialNonce: string }) {
  const [state, action, pending] = useActionState(reportReplyAction.bind(null, admin, kind, id), {});
  const [body, setBody] = useState('');
  const [nonce, setNonce] = useState(initialNonce);
  const router = useRouter();
  useEffect(() => {
    if (state.saved) { setBody(''); setNonce(crypto.randomUUID()); router.refresh(); }
  }, [state, router]);
  return <form action={action} className="space-y-2 rounded-xl border bg-secondary/30 p-3">
    <input type="hidden" name="nonce" value={nonce} />
    <label htmlFor="report-reply" className="block font-bold">رد أو استفسار جديد</label>
    <textarea id="report-reply" name="body" value={body} onChange={e => setBody(e.target.value)} required maxLength={2000} rows={3} className="w-full rounded-lg border bg-background p-3" aria-describedby="report-reply-status" />
    <div id="report-reply-status" aria-live="polite">{state.error && <p role="alert" className="text-destructive">{state.error}</p>}{state.saved && <p className="text-emerald-700">تم إرسال الرد.</p>}</div>
    <button disabled={pending} className="rounded-lg bg-primary px-4 py-2 font-bold text-white disabled:opacity-50">{pending ? 'جارٍ الإرسال…' : 'إرسال الرد'}</button>
  </form>;
}
