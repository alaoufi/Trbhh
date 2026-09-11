import { ListingPage } from '../../../components/buyer-pages';
import { listings } from '../../../lib/demo-data';

export function generateStaticParams() {
  return listings.map((listing) => ({ id: listing.id }));
}

export default async function AdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListingPage listingId={id} />;
}
