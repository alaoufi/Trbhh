'use client';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useAutomaticPrompt } from '@/components/use-automatic-prompt';

/** A quiet welcome after discovery; dismissal survives subsequent visits. */
export function WelcomePopup({ storageKey, autoHideMs = 4000, children }: { storageKey: string; autoHideMs?: number; children: React.ReactNode }) {
  const { open, dismiss } = useAutomaticPrompt(storageKey, autoHideMs > 0, 12000);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(dismiss, Math.max(4000, autoHideMs));
    return () => clearTimeout(timer);
  }, [open, dismiss, autoHideMs]);
  if (!open) return null;
  return <aside role="status" className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-sm rounded-2xl border bg-card p-4 pt-10 shadow-lg md:bottom-4">
    <button type="button" aria-label="إغلاق الترحيب" onClick={dismiss} className="absolute left-1 top-1 grid h-10 w-10 place-items-center rounded-full text-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
    <div className="text-center" onClickCapture={(event) => { if ((event.target as HTMLElement).closest('a')) dismiss(); }}>{children}</div>
  </aside>;
}
