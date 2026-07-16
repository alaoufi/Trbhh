import type { Metadata, Viewport } from 'next';
import { Cairo } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
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

// عنوان ووصف مشاركة الموقع قابلان للتعديل من الإدارة ← النصوص ← عام
export async function generateMetadata(): Promise<Metadata> {
  const [shareTitle, shareDesc] = await Promise.all([
    import('@/lib/settings').then((m) => m.getSetting(m.SETTING_SITE_SHARE_TITLE, `${SITE.name} | ${SITE.tagline}`)),
    import('@/lib/settings').then((m) => m.getSetting(m.SETTING_SITE_SHARE_DESC, SITE.description)),
  ]).catch(() => [`${SITE.name} | ${SITE.tagline}`, SITE.description]);
  return {
    metadataBase: new URL(`https://${SITE.domain}`),
    title: { default: shareTitle, template: `%s | ${SITE.name}` },
    description: shareDesc,
    openGraph: {
      type: 'website',
      locale: 'ar_SA',
      siteName: SITE.name,
      title: shareTitle,
      description: shareDesc,
      images: [{ url: '/icon-512.png?v=2', width: 512, height: 512, alt: SITE.name }],
    },
    twitter: { card: 'summary', title: shareTitle, description: shareDesc, images: ['/icon-512.png?v=2'] },
    robots: { index: true, follow: true },
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, statusBarStyle: 'default', title: SITE.name },
    icons: { icon: '/icon.svg', apple: '/apple-icon.png?v=2' },
  };
}

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
  // اقرأ الكوكيز مرة واحدة، وشغّل الاستعلامات المستقلّة بالتوازي بدل التسلسل
  // (كانت ~٦ جولات متتابعة تُضاف لكل صفحة في الموقع لأنه التخطيط الجذري).
  const ck = await cookies();
  const theme = ck.get('theme')?.value || '';
  const design = ck.get('design')?.value || '';
  const [unread, isAdminUser, splashSeconds, debatesOn] = await Promise.all([
    session ? getMyStats(session.uid).then((s) => s.unread).catch(() => 0) : Promise.resolve(0),
    session ? import('@/lib/roles').then((m) => m.hasAnyAdmin(session.uid)).catch(() => false) : Promise.resolve(false),
    getClassifiedSplashSeconds().catch(() => 5),
    import('@/lib/settings').then((m) => m.debatesEnabled()).catch(() => true),
  ]);
  // شاشة المبوّبات الافتتاحية تُحجب كلياً عن أعضاء الإدارة (لا تعيقهم عن عملهم)
  let splashAds: Awaited<ReturnType<typeof getSplashClassifieds>> = [];
  if (!isAdminUser) {
    try {
      splashAds = await getSplashClassifieds(12);
    } catch {
      /* classified table may not be ready yet */
    }
  }
  const validThemes = ['desert', 'agri', 'spring', 'mint', 'lavender', 'sea', 'snow', 'mountain', 'sunset', 'night'];
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
          header={<Header />}
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
