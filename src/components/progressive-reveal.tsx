'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * يعرض أول دفعة فقط، ثم زر "عرض المزيد" يكشف الدفعة التالية من `chunks`
 * (كل عنصر فيها مُجهَّز سلفاً من الخادم — لا يُطلب أي شيء إضافي عند الضغط).
 */
export function ProgressiveReveal({ chunks }: { chunks: React.ReactNode[] }) {
  const [shown, setShown] = useState(1);
  return (
    <>
      {chunks.slice(0, shown)}
      {shown < chunks.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + 1)}
          className="card-3d flex w-full items-center justify-center gap-1.5 rounded-xl p-3 text-sm font-bold text-primary hover:bg-secondary/40"
        >
          عرض المزيد <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </>
  );
}
