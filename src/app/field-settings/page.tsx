import { notFound } from 'next/navigation';
import { isPreviewSandbox } from '@/lib/preview-sandbox';
import { PreviewSandboxFields } from '@/components/preview-local-entry';
export const dynamic = 'force-dynamic';
export const metadata = {title:'إعدادات الحقول التجريبية'};
export default function SandboxFieldsPage() {
  if (!isPreviewSandbox()) notFound();
  return <PreviewSandboxFields />;
}
