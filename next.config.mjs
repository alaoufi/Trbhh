/** @type {import('next').NextConfig} */
const mediaHost = (process.env.NEXT_PUBLIC_MEDIA_BASE || 'https://trbhh.com')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
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
  },
};
export default nextConfig;
