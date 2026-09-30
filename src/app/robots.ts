import type { MetadataRoute } from 'next';
import { primaryOrigin } from '@/lib/public-origin';
import { isReadOnlyPreview } from '@/lib/read-only-preview';

export default function robots(): MetadataRoute.Robots {
  if(isReadOnlyPreview())return {rules:{userAgent:'*',disallow:'/'}};
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/account', '/admin', '/messages', '/api'] },
    sitemap: `${primaryOrigin}/sitemap.xml`,
  };
}
