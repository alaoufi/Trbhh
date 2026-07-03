import type { Metadata, Viewport } from 'next';
import { Cairo } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import './globals.css';
import { TopBar } from '@/components/top-bar';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { MobileNav } from '@/components/mobile-nav';
import { PwaRegister } from '@/components/pwa-register';
import { GeoPrompt } from '@/components/geo-prompt';
import { ClassifiedSplash } from '@/components/classified-splash';
import { getSplashClassifieds } from '@/lib/classified';
import { SITE } from '@/lib/constants';
import { getSession } from '@/lib/auth';
import { getMyStats } from '@/lib/account';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(`https://${SITE.domain}`),
  title: { default: `${SITE.name} | ${SITE.tagline}`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  openGraph: {
    type: 'website',
    locale: 'ar_SA',
    siteName: SITE.name,
    title: `${SITE.name} | ${SITE.tagline}`,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: SITE.name },
  icons: { icon: '/icon.svg', apple: '/apple-icon.png' },
};

const THEME_BAR: Record<string, string> = {
  night: '#16213b', desert: '#c9a55c', agri: '#3f8f52', spring: '#e59ac0',
  mint: '#3fb8ad', lavender: '#8b7fd6', sea: '#2f9fd6', snow: '#6fb3e0',
  mountain: '#7a9464', sunset: '#e08a3c',
};

export async function generateViewport(): Promise<Viewport> {
  const theme = (await cookies()).get('theme')?.value || '';
  return {
    themeColor: THEME_BAR[theme] || '#3287da',
    width: 'device-width',
    initialScale: 1,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  let unread = 0;
  if (session) {
    try {
      unread = (await getMyStats(session.uid)).unread;
    } catch {
      /* ignore */
    }
  }
  let splashAds: Awaited<ReturnType<typeof getSplashClassifieds>> = [];
  try {
    splashAds = await getSplashClassifieds(12);
  } catch {
    /* classified table may not be ready yet */
  }
  const theme = (await cookies()).get('theme')?.value || '';
  const validThemes = ['desert', 'agri', 'spring', 'mint', 'lavender', 'sea', 'snow', 'mountain', 'sunset', 'night'];
  const design = (await cookies()).get('design')?.value || '';
  const validDesigns = ['aurora', 'shop', 'list', 'flat', 'soft', 'sharp'];
  // A store storefront (/companies/[id]) runs as an INDEPENDENT site: it hides the
  // main site chrome (top bar, header, footer, mobile nav) and provides its own.
  const pathname = (await headers()).get('x-pathname') || '';
  const isStorefront = /^\/companies\/\d+(\/|\?|$)/.test(pathname);
  return (
    <html
      lang="ar"
      dir="rtl"
      className={cairo.variable}
      {...(validThemes.includes(theme) ? { 'data-theme': theme } : {})}
      {...(validDesigns.includes(design) ? { 'data-design': design } : {})}
    >
      <body className="min-h-screen font-sans antialiased">
        {isStorefront ? (
          // Independent storefront shell — the page renders its own header + bottom nav.
          <main className="min-h-screen">{children}</main>
        ) : (
          <>
            <TopBar />
            <Header />
            <main className="container min-h-[60vh] pb-24 pt-3 md:pb-8">{children}</main>
            <Footer />
            <MobileNav unread={unread} />
            <ClassifiedSplash ads={splashAds} />
          </>
        )}
        <GeoPrompt />
        <PwaRegister />
      </body>
    </html>
  );
}
