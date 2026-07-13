import type { Metadata, Viewport } from 'next';
import { Cairo } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { TopBar } from '@/components/top-bar';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { MobileNav } from '@/components/mobile-nav';
import { ChromeGate } from '@/components/chrome-gate';
import { PwaRegister } from '@/components/pwa-register';
import { GeoPrompt } from '@/components/geo-prompt';
import { ForceUpdateGate } from '@/components/force-update-gate';
import { InstallPrompt } from '@/components/install-prompt';
import { ClassifiedSplash } from '@/components/classified-splash';
import { getSplashClassifieds } from '@/lib/classified';
import { getClassifiedSplashSeconds } from '@/lib/settings';
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
  // شاشة المبوّبات الافتتاحية تُحجب كلياً عن أعضاء الإدارة (لا تعيقهم عن عملهم)
  const isAdminUser = session ? await import('@/lib/roles').then((m) => m.hasAnyAdmin(session.uid)).catch(() => false) : false;
  let splashAds: Awaited<ReturnType<typeof getSplashClassifieds>> = [];
  if (!isAdminUser) {
    try {
      splashAds = await getSplashClassifieds(12);
    } catch {
      /* classified table may not be ready yet */
    }
  }
  const splashSeconds = await getClassifiedSplashSeconds().catch(() => 5);
  const debatesOn = await import('@/lib/settings').then((m) => m.debatesEnabled()).catch(() => true);
  const theme = (await cookies()).get('theme')?.value || '';
  const validThemes = ['desert', 'agri', 'spring', 'mint', 'lavender', 'sea', 'snow', 'mountain', 'sunset', 'night'];
  const design = (await cookies()).get('design')?.value || '';
  const validDesigns = ['aurora', 'shop', 'list', 'flat', 'soft', 'sharp'];
  return (
    <html
      lang="ar"
      dir="rtl"
      className={cairo.variable}
      {...(validThemes.includes(theme) ? { 'data-theme': theme } : {})}
      {...(validDesigns.includes(design) ? { 'data-design': design } : {})}
    >
      <body className="min-h-screen font-sans antialiased">
        {/* Storefront (/companies/[id]) = fully independent site: ChromeGate hides
            the shared header/menu/footer, even across client-side navigation. */}
        <ChromeGate
          header={<><TopBar /><Header /></>}
          footer={<><Footer debatesOn={debatesOn} /><MobileNav unread={unread} isAuthed={!!session} debatesOn={debatesOn} /><ClassifiedSplash ads={splashAds} seconds={splashSeconds} /></>}
        >
          {children}
        </ChromeGate>
        {/* الثيم التلقائي: يتبع وضع الجهاز قبل الرسم الأول (بلا وميض) ويتابع تغيّره */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=document.cookie.match(/(?:^|; )theme=([^;]*)/);if(m&&m[1]==='auto'){var mq=window.matchMedia('(prefers-color-scheme: dark)');var ap=function(){if(mq.matches)document.documentElement.setAttribute('data-theme','night');else document.documentElement.removeAttribute('data-theme');};ap();if(mq.addEventListener)mq.addEventListener('change',ap);}}catch(e){}})();`,
          }}
        />
        {/* التقاط حدث التثبيت مبكراً (قد يُطلق قبل تحميل React) وحفظه على window */}
        <script
          dangerouslySetInnerHTML={{
            __html: "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bipEvent=e;try{window.dispatchEvent(new Event('bipready'))}catch(_){}});window.addEventListener('appinstalled',function(){window.__bipEvent=null;});",
          }}
        />
        <GeoPrompt />
        <ForceUpdateGate />
        <InstallPrompt />
        <PwaRegister />
      </body>
    </html>
  );
}
