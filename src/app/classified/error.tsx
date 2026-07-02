'use client';
import Link from 'next/link';
import { RefreshCw, ArrowRight } from 'lucide-react';

export default function ClassifiedError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-10 text-center">
      <p className="text-lg font-bold text-primary">تعذّر عرض هذا الإعلان</p>
      <p className="text-sm text-muted-foreground">حدث خطأ مؤقّت. حاول مرة أخرى أو ارجع لقائمة الإعلانات المبوّبة.</p>
      <div className="flex justify-center gap-2">
        <button onClick={reset} className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">
          <RefreshCw className="h-4 w-4" /> إعادة المحاولة
        </button>
        <Link href="/classified" className="inline-flex items-center gap-1 rounded-lg border border-primary/30 px-4 py-2 text-sm font-medium text-primary">
          <ArrowRight className="h-4 w-4" /> الإعلانات المبوّبة
        </Link>
      </div>
    </div>
  );
}
