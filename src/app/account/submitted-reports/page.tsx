import Link from 'next/link';
import { SubmittedReportList } from '@/components/submitted-report-list';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'بلاغاتي المرسلة', robots: { index: false, follow: false } };
export default function Page() {
  return <div className="mx-auto max-w-2xl space-y-4"><h1 className="text-xl font-bold">بلاغاتي المرسلة</h1>
    <Link href="/report?type=site" className="inline-block rounded-lg bg-primary px-4 py-2 text-white">إرسال بلاغ عن الموقع</Link>
    <SubmittedReportList />
  </div>;
}
