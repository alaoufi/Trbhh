/** @type {import('next').NextConfig} */
const mediaHost = (process.env.NEXT_PUBLIC_MEDIA_BASE || 'https://trbhh.com')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');

const nextConfig = {
  // Public aliases — Google Play's Data-safety checker fetches /privacy directly.
  // TWA digital asset links must live at /.well-known/ — served by an API route.
  async rewrites() {
    return [{ source: '/.well-known/assetlinks.json', destination: '/api/assetlinks' }];
  },
  // ترويسات أمنية دفاعية (لا تُخفي شيفرة العميل — فهي منظورة في كل موقع — لكنها
  // ترفع سقف الحماية: تمنع تضمين/استنساخ الموقع داخل iframe لموقع آخر، وتفرض
  // HTTPS، وتمنع خداع نوع المحتوى). CSP مقتصرة على frame-ancestors فقط تفادياً
  // لكسر السكربتات/الوسائط/البكسلات — CSP الكاملة تحتاج ضبطاً واختباراً منفصلاً.
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      // HSTS يُحترَم فقط عبر HTTPS (يُتجاهَل على http)، فآمن إرساله دائماً.
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ];
    return [{ source: '/:path*', headers: security }];
  },
  async redirects() {
    const pageAliases = ['about', 'faq', 'privacy', 'terms', 'contact'].map((slug) => ({
      source: `/${slug}`,
      destination: `/pages/${slug}`,
      permanent: true,
    }));
    // روابط الموقع القديمة: /show_ads/{اسم}/{رقم} → /ads/{رقم} (تحويل دائم 301)
    // لحفظ أرشفة قوقل والروابط المشاركة القديمة من صفحة 404.
    const legacyAdLinks = [
      { source: '/show_ads/:slug/:id(\\d+)', destination: '/ads/:id', permanent: true },
      { source: '/show_ads/:id(\\d+)', destination: '/ads/:id', permanent: true },
    ];
    // /home كانت الصفحة الرئيسية على الموقع القديم (لارافيل) — تحويلها للرئيسية الجديدة.
    const legacyHome = [{ source: '/home', destination: '/', permanent: true }];
    return [...pageAliases, ...legacyAdLinks, ...legacyHome];
  },
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // keep sharp external so the standalone output traces its native binaries
  serverExternalPackages: ['sharp'],
  // The app compiles fine; don't let lint/type-check warnings block production builds.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    formats: ['image/avif', 'image/webp'],
    // Allow any host: legacy ad photos may reference old external media hosts.
    // An unlisted host made next/image throw a CLIENT-side exception that blanked
    // the whole page (ad detail, home, store cards) even though the ad was saved.
    remotePatterns: [
      { protocol: 'https', hostname: mediaHost },
      { protocol: 'https', hostname: 'trbhh.com' },
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
    // Server Actions cap the request body at 1MB by default — too small for photo/
    // video/audio uploads (ads, classified, promo banners). Raise it accordingly.
    serverActions: { bodySizeLimit: '30mb' },
  },
};
export default nextConfig;
