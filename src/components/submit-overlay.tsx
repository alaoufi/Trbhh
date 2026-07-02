'use client';
import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

/**
 * Full-screen working indicator shown while a form's Server Action is pending.
 * Must be rendered INSIDE the <form>. Shows a live elapsed-seconds counter so
 * the user can tell the upload is still working (not frozen).
 */
export function SubmitOverlay({ label = 'جارٍ الرفع والنشر…' }: { label?: string }) {
  const { pending } = useFormStatus();
  const [sec, setSec] = useState(0);

  useEffect(() => {
    if (!pending) { setSec(0); return; }
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-4 bg-black/75 p-6 backdrop-blur-sm">
      <Loader2 className="h-12 w-12 animate-spin text-white" />
      <div className="progress-indeterminate h-2 w-64 max-w-[80vw] rounded-full bg-white/20" />
      <div className="text-center text-white">
        <div className="font-bold">{label}</div>
        <div className="mt-1 text-sm opacity-80">مضى {sec} ثانية… يرجى الانتظار وعدم إغلاق الصفحة</div>
      </div>
    </div>
  );
}
