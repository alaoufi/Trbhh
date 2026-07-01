import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/constants';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/account', '/admin', '/messages', '/api'] },
    sitemap: `https://${SITE.domain}/sitemap.xml`,
  };
}
