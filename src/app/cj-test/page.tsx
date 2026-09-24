import { notFound } from 'next/navigation';
import CjStorePage from '@/app/cj/page';
import { cjStorefrontView } from '@/lib/cj/storefront';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'منطقة اختبار CJ — تربح',
  robots: { index: false, follow: false },
};

type Props = Parameters<typeof CjStorePage>[0];

export default async function CjTestCatalogPage(props: Props = {}) {
  if (!(await cjStorefrontView()).isStaff) notFound();
  return CjStorePage(props);
}
