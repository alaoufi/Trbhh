'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isInternalNavigationUrl } from '@/lib/navigation-progress';

/**
 * Global immediate feedback for App Router transitions. It observes every
 * ordinary same-tab internal anchor, including links rendered by server
 * components, without changing their navigation behaviour.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(false);
  }, [pathname, searchKey]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href');
      if (!href || !isInternalNavigationUrl(href, window.location.href)) return;
      setLoading(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // A blocked or cancelled client navigation must never leave a permanent bar.
  useEffect(() => {
    if (!loading) return;
    const timeout = window.setTimeout(() => setLoading(false), 15_000);
    return () => window.clearTimeout(timeout);
  }, [loading]);

  return (
    <div aria-live="polite" aria-label={loading ? 'جارٍ تحميل الصفحة' : undefined} className="pointer-events-none fixed inset-x-0 top-0 z-[100]">
      {loading && <div className="h-1 w-full origin-right animate-[navigation-progress_1.2s_ease-out_infinite] bg-[#f0b429] shadow-[0_1px_8px_rgba(240,180,41,0.9)]" />}
    </div>
  );
}
