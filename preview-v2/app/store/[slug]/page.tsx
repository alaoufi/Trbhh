import { StorePage } from '../../../components/buyer-pages';

export function generateStaticParams() {
  return ['dar', 'tech', 'equipment'].map((slug) => ({ slug }));
}

export default async function PublicStorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <StorePage storeSlug={slug} />;
}
