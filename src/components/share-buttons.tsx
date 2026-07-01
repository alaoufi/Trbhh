'use client';
import { useState } from 'react';
import { Share2, Link2, QrCode, Check, X } from 'lucide-react';

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const wa = `https://wa.me/?text=${encodeURIComponent(title + ' - ' + url)}`;
  const tw = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title, url }); } catch {} } else copy();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={share} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary"><Share2 className="h-4 w-4" /> مشاركة</button>
      <button onClick={copy} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary">{copied ? <Check className="h-4 w-4 text-primary" /> : <Link2 className="h-4 w-4" />} {copied ? 'تم النسخ' : 'نسخ الرابط'}</button>
      <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary">واتساب</a>
      <a href={tw} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary">تويتر</a>
      <button onClick={() => setQr(true)} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary"><QrCode className="h-4 w-4" /> QR</button>
      {qr && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setQr(false)}>
          <div className="relative rounded-xl bg-card p-5 text-center shadow-lg" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setQr(false)} className="absolute left-3 top-3 text-muted-foreground"><X className="h-5 w-5" /></button>
            <p className="mb-3 text-sm font-semibold">امسح الرمز لفتح الإعلان</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="QR" width={220} height={220} className="rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
