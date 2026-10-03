'use client';
import { useActionState, useState } from 'react';
import type { ReportReason } from '@/lib/report-reasons';
import { Button } from '@/components/ui/button';
import { submitReportAction } from './actions';
export function ReportForm({ type, targetId, reasons }: { type: string; targetId: string; reasons: ReportReason[] }) {
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [state, action, pending] = useActionState(async (_previous: { error?: string }, form: FormData) => submitReportAction(form), {});
  return <form action={action} className="space-y-4 card-3d rounded-xl p-5">
    <input type="hidden" name="type" value={type} />
    <input type="hidden" name="targetId" value={targetId} />
    <div>
      <label htmlFor="report-reason" className="mb-1 block text-sm font-medium">سبب البلاغ (مطلوب)</label>
      <select id="report-reason" name="reasonId" required value={reason} onChange={e => setReason(e.target.value)} aria-describedby="report-status" className="h-11 w-full rounded-lg border bg-background px-3 text-sm">
        <option value="" disabled>اختر سبب البلاغ</option>
        {reasons.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
    </div>
    <div>
      <label htmlFor="report-message" className="mb-1 block text-sm font-medium">توضيح إضافي ({reason === 'other' ? 'مطلوب لسبب آخر' : 'اختياري'})</label>
      <textarea id="report-message" name="message" value={message} onChange={e => setMessage(e.target.value)} required={reason === 'other'} maxLength={2000} rows={4} aria-describedby="report-detail-help report-status" className="w-full rounded-lg border bg-background p-3 text-sm" placeholder="اكتب تفاصيل تساعد الإدارة على فهم المشكلة" />
      <p id="report-detail-help" className="text-xs text-muted-foreground">حتى 2000 حرف. التوضيح خاص بالإدارة ولا يظهر للمُبلّغ عنه.</p>
    </div>
    <div id="report-status" aria-live="polite">{state.error && <p role="alert" className="text-destructive">{state.error}</p>}</div>
    <Button disabled={pending}>{pending ? 'جارٍ إرسال البلاغ…' : 'إرسال البلاغ'}</Button>
  </form>;
}
