import {notFound} from 'next/navigation';
import {isPreviewSandbox} from '@/lib/preview-sandbox';
import {PreviewLogin} from '@/components/preview-login';
export const dynamic='force-dynamic';
export default function PreviewLoginPage() {
  if(!isPreviewSandbox())notFound();
  return <PreviewLogin />;
}
