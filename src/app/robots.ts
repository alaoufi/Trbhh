import type { MetadataRoute } from 'next';
import { primaryOrigin } from '@/lib/public-origin';
import { isPreviewDeployment } from '@/lib/read-only-preview';

export default function robots(): MetadataRoute.Robots {
  if(isPreviewDeployment())return {rules:{userAgent:'*',disallow:'/'}};
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/account', '/admin', '/messages', '/api'] },
    sitemap: `${primaryOrigin}/sitemap.xml`,
  };
}
