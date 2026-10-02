import { requireAction } from '@/lib/roles';
import { getSetting } from '@/lib/settings';
import { getHomeHeroAds, searchAds } from '@/lib/data';
import { HOME_HERO_AD_IDS, parseHomeHeroIds } from '@/lib/home-hero-selection';
import { isReadOnlyPreview } from '@/lib/read-only-preview';
import { HomeHeroPicker } from './picker';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إعلانات البانر المتحرك' };

export default async function HomeHeroAdmin() {
  await requireAction('users', 'edit');
  const raw = await getSetting(HOME_HERO_AD_IDS, '');
  let ids: number[] = [];
  try { ids = parseHomeHeroIds(raw); } catch { /* Invalid legacy setting never becomes a public selection. */ }
  const [selected, recent] = await Promise.all([getHomeHeroAds(ids), searchAds({ take: 100, skip: 0 })]);
  return <div className="max-w-3xl space-y-4">
    <h1 className="text-xl font-bold">إعلانات البانر المتحرك</h1>
    <p className="text-sm text-muted-foreground">تحدد الإدارة وحدها الإعلانات وترتيبها. لا يضاف إعلان تلقائيًا. حذف جميع الاختيارات يبقي مقدمة تربح فقط. الإعلان الذي يتوقف ظهوره للعامة يختفي من البانر تلقائيًا.</p>
    <HomeHeroPicker initial={ids.map(id => ({ id, title: selected.find(ad => ad.id === id)?.title || 'إعلان غير متاح — يرجى إزالته' }))} options={recent.map(ad => ({ id: ad.id, title: ad.title }))} readOnly={isReadOnlyPreview()} />
  </div>;
}
