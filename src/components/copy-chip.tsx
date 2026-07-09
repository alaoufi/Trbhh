'use client';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/** زر نسخ صغير — يدعم الأجهزة بلا Clipboard API عبر execCommand. */
export function CopyChip({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    let ok = false;
    try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); ok = true; } } catch { /* fall through */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { /* ignore */ }
    }
    if (ok) { setDone(true); setTimeout(() => setDone(false), 1500); }
  }
  return (
    <button type="button" onClick={copy} className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${done ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-primary/30 bg-white text-primary hover:bg-primary/5'}`}>
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {done ? 'تم النسخ' : 'نسخ'}
    </button>
  );
}
