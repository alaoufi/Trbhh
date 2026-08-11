import type { MetadataRoute } from 'next';
import { primaryOrigin } from '@/lib/public-origin';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/account', '/admin', '/messages', '/api'] },
    sitemap: `${primaryOrigin}/sitemap.xml`,
  };
}
