import type { Metadata, Viewport } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';
import { TopBar } from '@/components/top-bar';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { MobileNav } from '@/components/mobile-nav';
import { PwaRegister } from '@/components/pwa-register';
import { GeoPrompt } from '@/components/geo-prompt';
import { ClassifiedSplash } from '@/components/classified-splash';
import { getRandomClassified } from '@/lib/classified';
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

export const viewport: Viewport = {
  themeColor: '#3287da',
  width: 'device-width',
  initialScale: 1,
};

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
  let splashAd = null;
  try {
    splashAd = await getRandomClassified();
  } catch {
    /* classified table may not be ready yet */
  }
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="min-h-screen font-sans antialiased">
        <TopBar />
        <Header />
        <main className="container min-h-[60vh] pb-24 pt-3 md:pb-8">{children}</main>
        <Footer />
        <MobileNav unread={unread} />
        <GeoPrompt />
        <ClassifiedSplash ad={splashAd} />
        <PwaRegister />
      </body>
    </html>
  );
}
