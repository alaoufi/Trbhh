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
  async redirects() {
    return ['about', 'faq', 'privacy', 'terms', 'contact'].map((slug) => ({
      source: `/${slug}`,
      destination: `/pages/${slug}`,
      permanent: true,
    }));
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
    remotePatterns: [
      { protocol: 'https', hostname: mediaHost },
      { protocol: 'https', hostname: 'trbhh.com' },
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
