'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';

export function CjProductImage({ src, alt, className = '' }: { src?: string | null; alt: string; className?: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // An SSR image can fail before React attaches onError during hydration.
    if (src && image.current?.complete && image.current.naturalWidth === 0) setFailedSource(src);
  }, [src]);
  if (!src || failedSource === src) return (
    <div role="img" aria-label={`الصورة غير متاحة: ${alt}`} className={`flex flex-col items-center justify-center gap-2 bg-slate-50 text-center text-xs text-slate-500 ${className}`}>
      <ImageOff className="h-7 w-7" aria-hidden="true" /><span>الصورة غير متاحة</span>
    </div>
  );
  // Provider URLs are proxied by the caller; never substitute another product's image.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={image} src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSource(src)} className={className} />;
}
