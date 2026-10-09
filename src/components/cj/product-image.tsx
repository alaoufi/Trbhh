'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';

export function CjProductImage({ src, alt, className = '' }: { src?: string | null; alt: string; className?: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [bust, setBust] = useState(0); // لإعادة جلب الصورة بالنقر عند الفشل
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // An SSR image can fail before React attaches onError during hydration.
    if (src && image.current?.complete && image.current.naturalWidth === 0) setFailedSource(src);
  }, [src]);
  // الصورة التي تعذّر عرضها: زر قابل للنقر يعيد محاولة الجلب (cache-bust) بدل حالة نهائية.
  if (!src || failedSource === src) return (
    <button type="button" onClick={() => { if (src) { setFailedSource(null); setBust((n) => n + 1); } }} disabled={!src}
      aria-label={src ? `إعادة تحميل الصورة: ${alt}` : `الصورة غير متاحة: ${alt}`}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 bg-slate-50 text-center text-xs text-slate-500 ${className}`}>
      <ImageOff className="h-7 w-7" aria-hidden="true" /><span>{src ? 'اضغط لإعادة تحميل الصورة' : 'الصورة غير متاحة'}</span>
    </button>
  );
  // Provider URLs are proxied by the caller; never substitute another product's image.
  const finalSrc = bust > 0 ? `${src}${src.includes('?') ? '&' : '?'}r=${bust}` : src;
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={image} src={finalSrc} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSource(src)} className={className} />;
}
