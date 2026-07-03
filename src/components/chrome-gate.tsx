'use client';
import { usePathname } from 'next/navigation';

/**
 * Decides whether the main site chrome (top bar, header, footer, mobile nav)
 * is shown. A store storefront (/companies/[id]) is a fully INDEPENDENT site:
 * no shared header or menu — a complete separation. Because App Router layouts
 * persist across client-side navigation, this must run on the client (via
 * usePathname) so the chrome disappears even when you navigate into a store
 * from within the site — not only on a fresh page load.
 */
export function ChromeGate({ header, footer, children }: { header: React.ReactNode; footer: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const isStorefront = /^\/companies\/\d+/.test(pathname);
  if (isStorefront) {
    return <main className="min-h-screen">{children}</main>;
  }
  return (
    <>
      {header}
      <main className="container min-h-[60vh] pb-24 pt-3 md:pb-8">{children}</main>
      {footer}
    </>
  );
}
