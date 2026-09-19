import type { MetadataRoute } from 'next';
import { primaryOrigin } from '@/lib/public-origin';
import { isPreviewSandbox } from '@/lib/preview-sandbox';
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  if (process.env.PREVIEW_READ_ONLY === 'true' || isPreviewSandbox()) return {rules:{userAgent:'*',disallow:'/'}};
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/account', '/admin', '/messages', '/api'] },
    sitemap: `${primaryOrigin}/sitemap.xml`,
  };
}
