'use client';
// Route-level error boundary: a render exception anywhere shows this friendly
// screen (with retry) instead of the bare "Application error" white page.
import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Home } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // surfaced in the browser/server console for diagnosis
    console.error('App route error:', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-3xl">⚠️</div>
      <div>
        <h1 className="text-lg font-extrabold text-primary">حدث خطأ غير متوقع</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تعذّر عرض هذه الصفحة مؤقتاً. بياناتك محفوظة — أعد المحاولة أو عُد للرئيسية.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => reset()} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">
          <RefreshCw className="h-4 w-4" /> إعادة المحاولة
        </button>
        <Link href="/" className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold text-primary">
          <Home className="h-4 w-4" /> الرئيسية
        </Link>
      </div>
    </div>
  );
}
