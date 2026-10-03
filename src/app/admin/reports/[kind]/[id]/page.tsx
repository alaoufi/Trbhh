import { ReportConversation } from '@/components/report-conversation';
import { requirePerm } from '@/lib/roles';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'متابعة البلاغ', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ kind: string; id: string }> }) {
  await requirePerm('reports');
  return <ReportConversation {...await params} admin />;
}
