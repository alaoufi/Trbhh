import type { MetadataRoute } from 'next';
import { primaryOrigin } from '@/lib/public-origin';
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  if (process.env.PREVIEW_READ_ONLY === 'true') return {rules:{userAgent:'*',disallow:'/'}};
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/account', '/admin', '/messages', '/api'] },
    sitemap: `${primaryOrigin}/sitemap.xml`,
  };
}
