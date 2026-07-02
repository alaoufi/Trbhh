import { requireUser } from '@/lib/auth';
import { getMyFavorites } from '@/lib/account';
import { AdGrid } from '@/components/ad-card';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'المفضلة' };

export default async function FavoritesPage() {
  const session = await requireUser();
  const favs = await getMyFavorites(session.uid);
  const ads = favs.map((f) => ({
    ...f, image: f.image, cityName: null, categoryName: null, special: false, views: 0,
    sellerName: null, sellerTrusted: false,
  }));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">المفضلة ({ads.length})</h1>
      <AdGrid ads={ads} />
    </div>
  );
}
