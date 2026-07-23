'use client';
import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

/**
 * Shows a store's direct link with a one-tap copy button (and an open button).
 * Clear and shareable — the merchant can copy their storefront URL instantly.
 */
export function CopyLink({ url, label = 'رابط متجرك المباشر' }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // fallback for insecure contexts
      try {
        const ta = document.createElement('textarea');
        ta.value = url; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch { /* ignore */ }
        document.body.removeChild(ta);
      } catch { /* ignore */ }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="card-3d rounded-xl p-3">
      <div className="mb-2 text-sm font-bold text-primary">{label}</div>
      <div className="flex items-center gap-2">
        <input readOnly value={url} dir="ltr" onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-lg border bg-muted/40 px-3 text-xs text-foreground outline-none" />
        <button type="button" onClick={copy}
          className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-white transition ${copied ? 'bg-emerald-600' : 'bg-primary hover:bg-primary/90'}`}>
          {copied ? <><Check className="h-4 w-4" /> تم النسخ</> : <><Copy className="h-4 w-4" /> نسخ</>}
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label="فتح المتجر"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2 border-primary/30 text-primary hover:bg-accent">
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
