import { notFound } from 'next/navigation';
import CjStoreProductPage from '@/app/cj/[id]/page';
import { cjStorefrontView } from '@/lib/cj/storefront';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'معاينة منتج CJ الخاصة — تربح',
  robots: { index: false, follow: false },
};

type Props = Parameters<typeof CjStoreProductPage>[0];

export default async function CjTestProductPage(props: Props) {
  if (!(await cjStorefrontView()).isStaff) notFound();
  return CjStoreProductPage(props);
}
