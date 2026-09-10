import { requireUser } from '@/lib/auth';
import { getMyFavorites } from '@/lib/account';
import { AdGrid } from '@/components/ad-card';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'المفضلة' };

export default async function FavoritesPage() {
  const session = await requireUser();
  const ads = await getMyFavorites(session.uid);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">المفضلة ({ads.length})</h1>
      <AdGrid ads={ads} />
    </div>
  );
}
