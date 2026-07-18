'use client';
import { useState } from 'react';
import { Share2, Link2, QrCode, Check, X, MessageCircle, Facebook, Send } from 'lucide-react';
import { ShareCardButton, type ShareCardData } from '@/components/share-card';

export function ShareButtons({ url, title, text, compact, card, iconOnly }: { url: string; title: string; text?: string; compact?: boolean; card?: ShareCardData; iconOnly?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const [menu, setMenu] = useState(false);
  // نص المشاركة: العنوان + أول الإعلان (إن مُرّر) — والرابط يُلحق دائماً في النهاية
  const msg = (text || title).trim();
  const wa = `https://wa.me/?text=${encodeURIComponent(msg + '\n' + url)}`;
  const tw = `https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}&url=${encodeURIComponent(url)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(msg)}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
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

  // تيك توك لا يقبل روابط مشاركة من الويب: ننسخ الرابط ثم نفتح التطبيق
  // (يُلصق في وصف الفيديو أو التعليق). إن كان التطبيق مثبتاً يفتح مباشرة.
  const tiktok = async () => {
    await copy();
    window.open('https://www.tiktok.com/', '_blank', 'noopener');
  };

  // أيقونة تيك توك (لا توجد في lucide)
  const TikTokIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M19.32 5.56a5.1 5.1 0 0 1-3.05-2.61 5 5 0 0 1-.44-1.45h-3.1v12.62a2.94 2.94 0 1 1-2.94-2.94c.3 0 .58.05.85.13V8.14a6.1 6.1 0 0 0-.85-.06 6.09 6.09 0 1 0 6.09 6.09V9.5a8.1 8.1 0 0 0 4.44 1.32V7.71a5.06 5.06 0 0 1-1-.15z" />
    </svg>
  );

  // المشاركة: مشاركة النظام إن توفّرت، وإلا قائمة بدائل تعمل دائماً.
  // في الوضع المضغوط (compact) مع بطاقة (card) نفتح القائمة بدل المشاركة المباشرة
  // (القائمة تعرض خيار «مشاركة كصورة بطاقة» إضافياً) — لكن الوضع غير المضغوط لا
  // يعرض أي قائمة إطلاقاً، فيجب أن يستدعي المشاركة المباشرة دائماً وإلا يصبح الزر بلا أثر.
  const share = async () => {
    if ((!card || !compact) && typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title, text: msg, url }); } catch { /* أُلغيت */ }
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
      <div className={`relative ${iconOnly ? 'h-full w-full' : ''}`}>
        <button type="button" onClick={share} aria-label="مشاركة" className={iconOnly ? 'grid h-full w-full place-items-center' : 'flex flex-col items-center gap-1 text-sm font-medium text-primary'}>
          <Share2 className="h-5 w-5" />{!iconOnly && ' مشاركة'}
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="absolute bottom-full left-1/2 z-50 mb-2 w-48 -translate-x-1/2 rounded-xl border bg-card p-1.5 shadow-xl">
              {card && typeof navigator !== 'undefined' && 'share' in navigator && (
                <button type="button" onClick={() => { navigator.share({ title, text: msg, url }).catch(() => {}); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"><Share2 className="h-4 w-4 text-primary" /> مشاركة الرابط</button>
              )}
              <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"><MessageCircle className="h-4 w-4 text-[#25D366]" /> واتساب</a>
              <a href={tg} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"><Send className="h-4 w-4 text-[#229ED9]" /> تيليجرام</a>
              <a href={fb} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"><Facebook className="h-4 w-4 text-[#1877F2]" /> فيسبوك</a>
              <a href={tw} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"><Share2 className="h-4 w-4" /> تويتر / X</a>
              <button type="button" onClick={() => { tiktok(); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"><TikTokIcon className="h-4 w-4" /> تيك توك <span className="text-[10px] text-muted-foreground">(يُنسخ الرابط)</span></button>
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
      <a href={tg} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary">تيليجرام</a>
      <a href={fb} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary">فيسبوك</a>
      <a href={tw} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary">تويتر</a>
      <button type="button" onClick={tiktok} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary" title="يُنسخ الرابط ويُفتح تيك توك — الصقه في وصف فيديوك"><TikTokIcon className="h-4 w-4" /> تيك توك</button>
      <button type="button" onClick={() => setQr(true)} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary"><QrCode className="h-4 w-4" /> QR</button>
      {card && <ShareCardButton data={card} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary" />}
      {qrModal}
    </div>
  );
}
