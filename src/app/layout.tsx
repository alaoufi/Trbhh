import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import Link from 'next/link';
import { Cairo } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import './v2-design.css';
import { getSiteDesignConfig } from '@/lib/site-design-server';
import { resolveSiteDesign } from '@/lib/site-design';
import { SiteDesignProvider } from '@/components/site-design-provider';
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
import { primaryOrigin } from '@/lib/public-origin';
import { getSession } from '@/lib/auth';
import { getMyStats } from '@/lib/account';
import { AdPixels } from '@/components/ad-pixels';
import { VerifySeal } from '@/components/verify-seal';
import { SealReposition } from '@/components/seal-reposition';
import { NavigationProgress } from '@/components/navigation-progress';
import { isPreviewSandbox } from '@/lib/preview-sandbox';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' });

// عنوان ووصف مشاركة الموقع قابلان للتعديل من الإدارة ← النصوص ← عام
export async function generateMetadata(): Promise<Metadata> {
  const [shareTitle, shareDesc] = await Promise.all([
    import('@/lib/settings').then((m) => m.getSetting(m.SETTING_SITE_SHARE_TITLE, `${SITE.name} | ${SITE.tagline}`)),
    import('@/lib/settings').then((m) => m.getSetting(m.SETTING_SITE_SHARE_DESC, SITE.description)),
  ]).catch(() => [`${SITE.name} | ${SITE.tagline}`, SITE.description]);
  return {
    metadataBase: new URL(primaryOrigin),
    alternates: { canonical: '/' },
    title: { default: shareTitle, template: `%s | ${SITE.name}` },
    description: shareDesc,
    openGraph: {
      type: 'website',
      locale: 'ar_SA',
      siteName: SITE.name,
      title: shareTitle,
      description: shareDesc,
      images: [{ url: '/icon-512.png?v=3', width: 512, height: 512, alt: SITE.name }],
    },
    twitter: { card: 'summary', title: shareTitle, description: shareDesc, images: ['/icon-512.png?v=3'] },
    robots: { index: process.env.PREVIEW_READ_ONLY !== 'true' && !isPreviewSandbox(), follow: process.env.PREVIEW_READ_ONLY !== 'true' && !isPreviewSandbox() },
    ...(process.env.PREVIEW_READ_ONLY === 'true' || isPreviewSandbox() ? {} : {
      manifest: '/manifest.webmanifest',
      appleWebApp: { capable: true, statusBarStyle: 'default' as const, title: SITE.name },
    }),
    icons: { icon: '/icon-192.png?v=3', apple: '/apple-icon.png?v=3' },
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
  const sandbox = isPreviewSandbox();
  const preview = process.env.PREVIEW_READ_ONLY === 'true' || sandbox;
  const session = await getSession();
  // اقرأ الكوكيز مرة واحدة، وشغّل الاستعلامات المستقلّة بالتوازي بدل التسلسل
  // (كانت ~٦ جولات متتابعة تُضاف لكل صفحة في الموقع لأنه التخطيط الجذري).
  const ck = await cookies();
  const theme = ck.get('theme')?.value || '';
  const designConfig = await getSiteDesignConfig();
  const design = resolveSiteDesign(ck.get('design')?.value, designConfig.enabled);
  const [unread, isAdminUser, splashSeconds] = await Promise.all([
    session ? getMyStats(session.uid).then((s) => s.unread).catch(() => 0) : Promise.resolve(0),
    session ? import('@/lib/roles').then((m) => m.hasAnyAdmin(session.uid)).catch(() => false) : Promise.resolve(false),
    getClassifiedSplashSeconds().catch(() => 5),
  ]);
  // شاشة المبوّبات الافتتاحية تُحجب كلياً عن أعضاء الإدارة (لا تعيقهم عن عملهم)
  let splashAds: Awaited<ReturnType<typeof getSplashClassifieds>> = [];
  if (!preview && !isAdminUser) {
    try {
      splashAds = await getSplashClassifieds(12);
    } catch {
      /* classified table may not be ready yet */
    }
  }
  const validThemes = ['desert', 'agri', 'spring', 'mint', 'lavender', 'sea', 'snow', 'mountain', 'sunset', 'night'];
  // بيانات منظَّمة (JSON-LD) لمحركات البحث: تعرّف جوجل بهوية الموقع ونوعه
  // وتفعّل صندوق البحث المباشر ضمن نتائج البحث (Sitelinks Search Box).
  const base = primaryOrigin;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: SITE.name,
        alternateName: SITE.nameEn,
        url: base,
        logo: `${base}/icon-512.png`,
        description: SITE.description,
      },
      {
        '@type': 'WebSite',
        name: SITE.name,
        url: base,
        inLanguage: 'ar',
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${base}/search?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };
  return (
    <html
      lang="ar"
      dir="rtl"
      className={cairo.variable}
      {...(validThemes.includes(theme) ? { 'data-theme': theme } : {})}
      {...(design ? { 'data-design': design } : {})}
    >
      <body className="min-h-screen font-sans antialiased">
        <NavigationProgress />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {/* بيكسلات التتبع الإعلاني (Meta/Google Ads/TikTok/Snapchat) — لا تعمل
            إطلاقاً إلا بعد ضبط معرّفاتها الحقيقية في متغيرات البيئة على الخادم. */}
        {!preview && <AdPixels />}
        {preview && <aside className="border-b bg-amber-50 p-2 text-center text-sm text-slate-900">{sandbox ? <>بيئة اختبار مستقلة — الإعلانات العامة نسخة مؤرخة وليست اتصالًا حيًا. الحفظ التجريبي منفصل عن الموقع الأصلي. لا دفع ولا تواصل حقيقي. <Link href="/ads/new">إضافة إعلان</Link> · <Link href="/seller">إعلانات التجربة</Link> · <Link href="/field-settings">إعدادات الحقول التجريبية</Link></> : 'معاينة مستقلة — عرض البيانات العامة الحية فقط. إضافة الإعلانات وتعديلها محفوظان في هذا المتصفح ولا يغيّران الموقع الأصلي.'}</aside>}
        {/* Storefront (/companies/[id]) = fully independent site: ChromeGate hides
            the shared header/menu/footer, even across client-side navigation. */}
        <SiteDesignProvider config={designConfig} selected={design}>
          <ChromeGate
            header={<Header />}
            footer={<><VerifySeal /><Footer /><MobileNav unread={unread} isAuthed={!!session} /><ClassifiedSplash ads={splashAds} seconds={splashSeconds} /></>}
          >
            {children}
          </ChromeGate>
        </SiteDesignProvider>
        {/* الثيم التلقائي: يتبع وضع الجهاز قبل الرسم الأول (بلا وميض) ويتابع تغيّره */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=document.cookie.match(/(?:^|; )theme=([^;]*)/);if(m&&m[1]==='auto'){var mq=window.matchMedia('(prefers-color-scheme: dark)');var ap=function(){if(mq.matches)document.documentElement.setAttribute('data-theme','night');else document.documentElement.removeAttribute('data-theme');};ap();if(mq.addEventListener)mq.addEventListener('change',ap);}}catch(e){}})();`,
          }}
        />
        {/* التقاط حدث التثبيت مبكراً (قد يُطلق قبل تحميل React) وحفظه على window */}
        {!preview && <script
          dangerouslySetInnerHTML={{
            __html: "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bipEvent=e;try{window.dispatchEvent(new Event('bipready'))}catch(_){}});window.addEventListener('appinstalled',function(){window.__bipEvent=null;});",
          }}
        />}
        {!preview && <><GeoPrompt /><ForceUpdateGate /><InstallPrompt /><PwaRegister /></>}
        {/* ختم التوثيق «متجر موثّق» (المركز السعودي للأعمال) — شارة عائمة تُثبَّت أسفل يسار
            الصفحة. نسخة واحدة على مستوى الموقع، والسكربت الرسمي يُحمَّل async بعد رسم الصفحة
            ليجد العنصر (المُصيَّر من الخادم) ويرسم الشارة — مطابقةً لكود التضمين الرسمي. */}

        {!preview && <><Script src="https://eauthenticate.saudibusiness.gov.sa/EAuthSealApi/seal.js" strategy="afterInteractive" /><SealReposition /></>}
      </body>
    </html>
  );
}
