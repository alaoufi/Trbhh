import { ReportConversation } from '@/components/report-conversation';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'متابعة بلاغي', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ kind: string; id: string }> }) {
  return <ReportConversation {...await params} />;
}
