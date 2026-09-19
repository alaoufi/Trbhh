import { notFound } from 'next/navigation';
import { PreviewLocalSeller, PreviewSandboxSeller } from '@/components/preview-local-entry';
import { isPreviewSandbox } from '@/lib/preview-sandbox';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إعلاناتي المحلية' };
export default async function SellerPage() {
  if (isPreviewSandbox()) return <PreviewSandboxSeller />;
  if (process.env.PREVIEW_READ_ONLY !== 'true') notFound();
  return <PreviewLocalSeller />;
}
