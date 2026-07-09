'use client';
import { useState } from 'react';
import { Share2, Link2, QrCode, Check, X, MessageCircle } from 'lucide-react';
import { ShareCardButton, type ShareCardData } from '@/components/share-card';

export function ShareButtons({ url, title, compact, card }: { url: string; title: string; compact?: boolean; card?: ShareCardData }) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const [menu, setMenu] = useState(false);
  const wa = `https://wa.me/?text=${encodeURIComponent(title + ' - ' + url)}`;
  const tw = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;

  // نسخ الرابط مع بديل يعمل على المتصفحات/الأجهزة التي لا تدعم Clipboard API
  // (الاتصال عبر HTTP أو داخل تطبيقات الويب المدمجة).
  const copy = async () => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); ok = true; }
    } catch { /* fall through */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = url; ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        ta.setSelectionRange(0, ta.value.length);
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { /* ignore */ }
    }
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };

  // المشاركة: مشاركة النظام إن توفّرت، وإلا قائمة بدائل تعمل دائماً.
  const share = async () => {
    if (!card && typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title, url }); } catch { /* أُلغيت */ }
      return;
    }
    setMenu((m) => !m);
  };

  const qrModal = qr ? (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/50 p-4" onClick={() => setQr(false)}>
      <div className="relative rounded-xl bg-card p-5 text-center shadow-lg" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setQr(false)} className="absolute left-3 top-3 text-muted-foreground" aria-label="إغلاق"><X className="h-5 w-5" /></button>
        <p className="mb-3 text-sm font-semibold">امسح الرمز للفتح</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrSrc} alt="QR" width={220} height={220} className="mx-auto rounded-lg" />
        <p dir="ltr" className="mx-auto mt-3 max-w-[220px] break-all text-[11px] text-muted-foreground">{url}</p>
      </div>
    </div>
  ) : null;

  if (compact) {
    return (
      <div className="relative">
        <button type="button" onClick={share} className="flex flex-col items-center gap-1 text-sm font-medium text-primary">
          <Share2 className="h-5 w-5" /> مشاركة
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="absolute bottom-full left-1/2 z-50 mb-2 w-48 -translate-x-1/2 rounded-xl border bg-card p-1.5 shadow-xl">
              {card && typeof navigator !== 'undefined' && 'share' in navigator && (
                <button type="button" onClick={() => { navigator.share({ title, url }).catch(() => {}); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"><Share2 className="h-4 w-4 text-primary" /> مشاركة الرابط</button>
              )}
              <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"><MessageCircle className="h-4 w-4 text-[#25D366]" /> واتساب</a>
              <a href={tw} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"><Share2 className="h-4 w-4" /> تويتر / X</a>
              <button type="button" onClick={() => { copy(); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary">{copied ? <Check className="h-4 w-4 text-primary" /> : <Link2 className="h-4 w-4" />} نسخ الرابط</button>
              <button type="button" onClick={() => { setQr(true); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"><QrCode className="h-4 w-4" /> رمز QR</button>
              {card && <ShareCardButton data={card} />}
            </div>
          </>
        )}
        {qrModal}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button type="button" onClick={share} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary"><Share2 className="h-4 w-4" /> مشاركة</button>
      )}
      <button type="button" onClick={copy} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary">{copied ? <Check className="h-4 w-4 text-primary" /> : <Link2 className="h-4 w-4" />} {copied ? 'تم النسخ' : 'نسخ الرابط'}</button>
      <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary">واتساب</a>
      <a href={tw} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary">تويتر</a>
      <button type="button" onClick={() => setQr(true)} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary"><QrCode className="h-4 w-4" /> QR</button>
      {card && <ShareCardButton data={card} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary" />}
      {qrModal}
    </div>
  );
}
