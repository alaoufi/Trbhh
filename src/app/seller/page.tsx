import { notFound } from 'next/navigation';
import { PreviewLocalSeller } from '@/components/preview-local-entry';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إعلاناتي المحلية' };
export default async function SellerPage() {
  if (process.env.PREVIEW_READ_ONLY !== 'true') notFound();
  return <PreviewLocalSeller />;
}
