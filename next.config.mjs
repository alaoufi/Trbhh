/** @type {import('next').NextConfig} */
const mediaHost = (process.env.NEXT_PUBLIC_MEDIA_BASE || 'https://trbhh.com')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');

const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'self'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; object-src 'none'; img-src 'self' data: blob: https: http:; media-src 'self' blob: https: http:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline'; font-src 'self' data: https:; connect-src 'self' https: wss:" },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
  // Public aliases — Google Play's Data-safety checker fetches /privacy directly.
  // TWA digital asset links must live at /.well-known/ — served by an API route.
  async rewrites() {
    return [{ source: '/.well-known/assetlinks.json', destination: '/api/assetlinks' }];
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
  // Deployment is blocked by TypeScript errors; ESLint runs as a separate CI step.
  typescript: { ignoreBuildErrors: false },
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
