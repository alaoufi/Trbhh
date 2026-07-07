'use client';

/**
 * Wraps a storefront contact link (WhatsApp/call) and records a conversion via
 * navigator.sendBeacon on click, then lets the default navigation proceed.
 * Beacon is fire-and-forget so it never blocks opening WhatsApp/the dialer.
 */
export function StoreContactLink({
  storeId, kind, href, className, target, children, style,
}: {
  storeId: number;
  kind: 'whatsapp' | 'call';
  href: string;
  className?: string;
  target?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  function track() {
    try {
      const data = JSON.stringify({ storeId, kind });
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/store-contact', new Blob([data], { type: 'application/json' }));
      } else {
        fetch('/api/store-contact', { method: 'POST', body: data, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
      }
    } catch {
      /* tracking is best-effort */
    }
  }
  return (
    <a href={href} onClick={track} className={className} style={style} {...(target ? { target, rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  );
}
