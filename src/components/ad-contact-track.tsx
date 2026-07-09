'use client';

/** رابط تواصل يُسجَّل ضغطه (واتساب/اتصال) عبر beacon — لا يؤخّر فتح الرابط. */
export function TrackedContact({ adId, kind, href, target, className, children }: {
  adId: number; kind: 'whatsapp' | 'call'; href: string; target?: string; className?: string; children: React.ReactNode;
}) {
  const fire = () => {
    try {
      const data = JSON.stringify({ adId, kind });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/ad-contact', new Blob([data], { type: 'application/json' }));
      else fetch('/api/ad-contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: data, keepalive: true }).catch(() => {});
    } catch { /* ignore */ }
  };
  return (
    <a href={href} target={target} rel={target ? 'noopener noreferrer' : undefined} className={className} onClick={fire}>
      {children}
    </a>
  );
}
