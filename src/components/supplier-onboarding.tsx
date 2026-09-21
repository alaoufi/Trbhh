'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import { ONBOARDING_LABELS, maskedOnboardingValue } from '@/lib/suppliers/onboarding-fields';

export type OnboardingImportReport = {
  imported: number;
  corrected: { label: string; note: string }[];
  skipped: { label: string; note: string }[];
  needsReview: string[];
};
export type OnboardingUiState = {
  errors: string[];
  warnings: string[];
  report?: OnboardingImportReport;
  preview?: {
    token: string;
    filename: string;
    storeName: string;
    registrationNumber: string;
    supplierId: string | null;
    connected: boolean;
    changes: { key: string; label: string; before: string; after: string; kind: 'new' | 'changed' | 'unchanged' }[];
  };
  saved?: {
    supplierId: string;
    storeName: string;
    connected: boolean;
    status: 'pending' | 'ready' | 'failed';
    code?: string;
    sampleCount?: number;
  };
};

export type OnboardingAction = (prev: OnboardingUiState, form: FormData) => Promise<OnboardingUiState>;
export type SupplierOnboardingProps = {
  previewAction: OnboardingAction;
  saveAction: OnboardingAction;
  readinessAction?: OnboardingAction;
  connectAction?: (form: FormData) => void | Promise<void>;
  initialState?: OnboardingUiState;
  /** Visibly label isolated screenshot fixtures; omit for real supplier data. */
  exampleState?: boolean;
};

const emptyState: OnboardingUiState = { errors: [], warnings: [] };
const integrationsHref = '/admin/suppliers/integrations';
const primary = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-[#16294A] px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500';

export function SupplierOnboarding({ previewAction, saveAction, readinessAction, connectAction, initialState, exampleState = false }: SupplierOnboardingProps) {
  const [state, setState] = useState<OnboardingUiState>(initialState ?? emptyState);
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const [operation, setOperation] = useState<'preview' | 'save' | 'readiness' | null>(null);
  const busy = useRef(false);
  const checked = useRef(new Set<string>());
  const fileId = useId();
  const { preview, saved } = state;

  const invoke = useCallback((action: OnboardingAction, form: FormData, kind: 'preview' | 'save' | 'readiness', previous: OnboardingUiState) => {
    if (busy.current) return;
    busy.current = true;
    setOperation(kind);
    startTransition(async () => {
      try {
        const next = await action(previous, form);
        // A readiness error must not discard the saved supplier or offer another save.
        setState(kind === 'readiness' ? { ...next, saved: next.saved ?? previous.saved } : next);
        if (kind === 'save' && next.saved) setFile(null);
      } catch {
        setState({ ...previous, errors: ['تعذّر إكمال الطلب. تحقق من الاتصال ثم أعد المحاولة.'] });
      } finally {
        busy.current = false;
        setOperation(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!readinessAction || !saved?.connected || saved.status !== 'pending' || pending || checked.current.has(saved.supplierId)) return;
    checked.current.add(saved.supplierId);
    const form = new FormData();
    form.set('supplierId', saved.supplierId);
    invoke(readinessAction, form, 'readiness', state);
  }, [invoke, pending, readinessAction, saved, state]);

  const ready = saved?.connected && saved.status === 'ready';
  const stage = saved ? (ready ? 4 : 3) : preview ? 2 : 1;

  return (
    <section dir="rtl" aria-label="تهيئة مورد سلة" aria-busy={pending} className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 text-slate-900 shadow-sm">
      <header className="bg-[#16294A] px-5 py-7 text-white sm:px-8 sm:py-9">
        <p className="mb-3 text-xs font-bold tracking-wide text-[#F0B429]">الموردون / انضمام متجر سلة</p>
        <h1 className="text-2xl font-bold sm:text-3xl">من ملف واحد، إلى متجر جاهز</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">ارفع بيانات المتجر، راجع التغييرات، ثم احفظ واربط متجر سلة للتحقق من جاهزيته.</p>
        <ol className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="مراحل الإعداد">
          {['رفع الملف', 'مراجعة البيانات', 'الربط والفحص', 'نتيجة الجاهزية'].map((label, index) => (
            <li key={label} aria-current={stage === index + 1 ? 'step' : undefined} className={`flex items-center gap-2 rounded-xl border p-3 text-xs sm:text-sm ${stage === index + 1 ? 'border-[#F0B429] bg-white/10' : 'border-white/15 text-slate-300'}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${stage >= index + 1 ? 'bg-[#F0B429] text-[#16294A]' : 'bg-white/10'}`}>{index + 1}</span>{label}
            </li>
          ))}
        </ol>
      </header>

      <div className="space-y-6 p-4 sm:p-8">
        {exampleState && <p role="note" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-sm font-bold text-amber-950">حالة اختبار توضيحية — بيانات تجريبية للمعاينة، وليست اتصالًا فعليًا بمتجر سلة أو نتيجة فحص حقيقي.</p>}
        <div aria-live="polite" aria-atomic="true" className="space-y-3">
          {pending && <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">{operation === 'readiness' ? 'جارٍ فحص الاتصال وقراءة عينة المنتجات…' : operation === 'save' ? 'جارٍ حفظ بيانات المورد…' : 'جارٍ قراءة الملف والتحقق من البيانات…'}</p>}
          {state.errors.length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-bold">تعذّر إكمال الخطوة</p><ul className="mt-2 list-inside list-disc space-y-1">{state.errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}
          {state.warnings.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-bold">ملاحظات تحتاج مراجعتك</p><ul className="mt-2 list-inside list-disc space-y-1">{state.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div>}
          {state.report && (state.report.imported > 0 || state.report.corrected.length > 0 || state.report.skipped.length > 0 || state.report.needsReview.length > 0) && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <p className="font-bold">تقرير الاستيراد</p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                <li>✅ مقبولة كما هي: <b>{state.report.imported}</b></li>
                <li>🛠️ صُحّحت تلقائياً: <b>{state.report.corrected.length}</b></li>
                <li>⏭️ تُجوّزت (اختيارية): <b>{state.report.skipped.length}</b></li>
                <li>⚠️ تحتاج مراجعة: <b>{state.report.needsReview.length}</b></li>
              </ul>
              {state.report.corrected.length > 0 && <details className="mt-2"><summary className="cursor-pointer font-semibold text-emerald-800">التفاصيل: صُحّحت تلقائياً</summary><ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-600">{state.report.corrected.map((c, i) => <li key={i}><b>{c.label}</b> — {c.note}</li>)}</ul></details>}
              {state.report.skipped.length > 0 && <details className="mt-2"><summary className="cursor-pointer font-semibold text-slate-700">التفاصيل: تُجوّزت</summary><ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-600">{state.report.skipped.map((s, i) => <li key={i}><b>{s.label}</b> — {s.note}</li>)}</ul></details>}
            </div>
          )}
        </div>

        {!saved && <form onSubmit={event => {
          event.preventDefault();
          if (!file || busy.current) return;
          const form = new FormData();
          form.set('file', file);
          invoke(previewAction, form, 'preview', emptyState);
        }} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="text-lg font-bold">بيانات المتجر</h2><p className="mt-1 text-sm leading-6 text-slate-500">نزّل النموذج المعتمد واملأ بيانات متجر واحد.</p></div>
            <a href="/admin/suppliers/onboarding/template" download className={secondary}>تنزيل نموذج Excel</a>
          </div>
          <div className="mt-5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 sm:p-8">
            <label htmlFor={fileId} className="block font-bold">اختر ملف بيانات المتجر</label>
            <p id={`${fileId}-help`} className="mt-2 text-sm text-slate-500">ملف ‎.xlsx فقط، بحجم لا يتجاوز 2 ميجابايت.</p>
            <input id={fileId} name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={pending} aria-describedby={`${fileId}-help`} className="mt-4 block w-full min-w-0 text-sm file:me-3 file:rounded-lg file:border-0 file:bg-slate-200 file:px-4 file:py-3 file:font-semibold file:text-slate-800" onChange={event => {
              const selected = event.target.files?.[0] ?? null;
              const errors = selected && (!/\.xlsx$/i.test(selected.name) || selected.size > 2 * 1024 * 1024 || selected.size === 0) ? ['اختر ملف Excel صالحًا بصيغة .xlsx وبحجم لا يتجاوز 2 ميجابايت.'] : [];
              setFile(errors.length ? null : selected);
              setState({ errors, warnings: [] });
              if (errors.length) event.target.value = '';
            }} />
            {file && <p className="mt-3 break-all text-xs text-slate-600">{file.name} · {(file.size / 1024).toFixed(0)} كيلوبايت</p>}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4"><p className="max-w-xl text-xs leading-6 text-slate-500">لا تُدخل كلمة مرور سلة أو رموز التحقق أو مفاتيح الربط في الملف. يتم تفويض الاتصال عبر صفحة التكاملات.</p><button disabled={!file || pending} className={primary}>معاينة البيانات</button></div>
        </form>}

        {preview && !saved && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="معاينة بيانات المتجر">
          <div className="border-b border-slate-100 p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">مراجعة قبل الحفظ</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{preview.supplierId ? 'تحديث مورد موجود' : 'مورد جديد'}</span></div><p className="mt-3 font-semibold">{preview.storeName}</p><p className="mt-1 text-sm text-slate-500">السجل التجاري: <bdi>{preview.registrationNumber}</bdi></p><p className="mt-1 break-all text-xs text-slate-500">{preview.filename}</p></div>
          <div className="divide-y divide-slate-100">
            {preview.changes.map(change => <article key={change.key} className="grid gap-3 p-5 sm:grid-cols-[1fr_2fr] sm:px-6">
              <div><h3 className="text-sm font-semibold">{ONBOARDING_LABELS[change.key] ?? change.label}</h3><span className={`mt-2 inline-block rounded-full px-2 py-1 text-xs ${change.kind === 'new' ? 'bg-emerald-50 text-emerald-800' : change.kind === 'changed' ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-500'}`}>{change.kind === 'new' ? 'جديد' : change.kind === 'changed' ? 'سيتم تحديثه' : 'دون تغيير'}</span></div>
              <dl className="grid min-w-0 gap-3 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">القيمة الحالية</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-500"><bdi>{maskedOnboardingValue(change.key, change.before)}</bdi></dd></div><div><dt className="text-xs text-slate-500">بعد الحفظ</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium"><bdi>{maskedOnboardingValue(change.key, change.after)}</bdi></dd></div></dl>
            </article>)}
          </div>
          <form className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 bg-slate-50 p-5 sm:px-6" onSubmit={event => {
            event.preventDefault();
            if (!file || busy.current || state.errors.length) return;
            const form = new FormData(event.currentTarget);
            form.set('file', file);
            invoke(saveAction, form, 'save', state);
          }}><input type="hidden" name="token" value={preview.token} /><p className="text-xs leading-6 text-slate-500">{file ? 'راجع البيانات أعلاه قبل اعتماد الحفظ.' : 'اختر الملف الأصلي وأعد المعاينة للتمكن من الحفظ.'}</p><button className={primary} disabled={pending || !file || state.errors.length > 0}>حفظ بيانات المورد</button></form>
        </section>}

        {saved && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7" aria-label="حالة المورد">
          <p className="text-sm font-semibold text-slate-500">تم حفظ بيانات المورد</p><h2 className="mt-2 text-xl font-bold">{saved.storeName}</h2>
          <div role="status" className={`mt-5 rounded-xl border p-5 ${ready ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : saved.status === 'failed' ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
            <h3 className="font-bold">{ready ? 'اجتاز المتجر فحص الجاهزية' : !saved.connected ? 'بانتظار ربط متجر سلة' : saved.status === 'failed' ? 'لم يجتز المتجر فحص الجاهزية' : 'المتجر متصل — بانتظار نتيجة الفحص'}</h3>
            <p className="mt-2 text-sm leading-7">{ready ? 'يمكنك متابعة المنتجات من صفحة التكاملات والكتالوج.' : !saved.connected ? 'أكمل تفويض الاتصال بمتجر سلة، ثم تحقق من الجاهزية.' : 'حالة الاتصال وحدها لا تعني الجاهزية؛ يلزم نجاح الفحص الفعلي.'}</p>
            {saved.sampleCount !== undefined && <p className="mt-2 text-sm">عدد المنتجات في عينة الفحص: {saved.sampleCount}</p>}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {!saved.connected && (connectAction ? <form action={connectAction}><input type="hidden" name="supplierId" value={saved.supplierId} /><button disabled={pending} className={primary}>ربط متجر سلة</button></form> : <Link className={primary} href={integrationsHref}>ربط متجر سلة عبر التكاملات</Link>)}
            {saved.connected && readinessAction && <button className={primary} disabled={pending} onClick={() => { const form = new FormData(); form.set('supplierId', saved.supplierId); invoke(readinessAction, form, 'readiness', state); }}>{ready ? 'إعادة فحص الجاهزية' : 'فحص الجاهزية مجددًا'}</button>}
            <Link href={integrationsHref} className={secondary}>التكاملات وكتالوج المنتجات</Link>
          </div>
        </section>}
      </div>
    </section>
  );
}

export default SupplierOnboarding;
