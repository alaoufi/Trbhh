'use client';
// Route-level error boundary: a render exception anywhere shows this friendly
// branded screen (with retry) instead of the bare "Application error" white page.
import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Home, TriangleAlert } from 'lucide-react';
import { reportClientErrorAction } from './error-actions';
import { reloadOnChunkError, isBenignBrowserError } from '@/lib/chunk-error';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // surfaced in the browser/server console for diagnosis
    console.error('App route error:', error);
    if (reloadOnChunkError(error)) return; // إصدار جديد من الموقع — تحديث كامل يحلّها تلقائياً
    if (isBenignBrowserError(error)) return; // تدخّل المتصفح (ترجمة/إضافة) لا كودنا — لا نُغرق السجل به
    // يُسجَّل أيضاً في سجل الأخطاء بالإدارة (/admin/errors) — نظام وقائي يكتشف الأعطال قبل أن يبلّغ عنها أحد
    reportClientErrorAction({
      message: error.message || 'خطأ غير معروف',
      digest: error.digest,
      stack: error.stack,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    }).catch(() => {});
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center px-5">
      <div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        {/* شريط ذهبي بهوية تربح */}
        <div className="h-1.5 w-full bg-[#f0b429]" />
        <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-header.png" alt="تربح" width={64} height={64} className="h-16 w-16 rounded-2xl object-cover shadow-sm" />
          <div className="grid h-14 w-14 place-items-center rounded-full bg-amber-50 ring-1 ring-amber-200">
            <TriangleAlert className="h-7 w-7 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-primary">حدث خلل مؤقت</h1>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              واجهنا مشكلة غير متوقعة في عرض هذه الصفحة. بياناتك محفوظة بأمان — جرّب إعادة المحاولة أو العودة للرئيسية.
            </p>
          </div>
          {error.digest && (
            <p className="rounded-lg bg-slate-50 px-3 py-1 text-[11px] text-slate-400" dir="ltr">رمز الخطأ: {error.digest}</p>
          )}
          <div className="mt-1 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <button onClick={() => reset()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white">
              <RefreshCw className="h-4 w-4" /> إعادة المحاولة
            </button>
            <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/25 px-5 py-2.5 text-sm font-bold text-primary">
              <Home className="h-4 w-4" /> الرئيسية
            </Link>
          </div>
          <p className="pt-2 text-[11px] text-slate-400">منصة تربح · trbhh.com</p>
        </div>
      </div>
    </div>
  );
}
