import type { CategoryFormConfig, CategoryOption } from './ad-categories/contracts';
import type { AdCard } from './data';

export type HomeOpportunityTile = { categoryId: number; categoryName: string; href: string; image: string | null };
export type HomeOpportunities = { tiles: HomeOpportunityTile[]; ads: AdCard[] };
export type HomeOpportunityInventory = { categoryId: number; ads: AdCard[] };
const normalized = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar');
function activeCategories(config: CategoryFormConfig | null): CategoryOption[] {
  if (!config?.enabled) return [];
  const seen = new Set<number>();
  return [...config.categories].sort((a,b) => a.order-b.order || a.id-b.id).filter(category => {
    if (!category.active || seen.has(category.id)) return false;
    seen.add(category.id); return true;
  });
}
function categoryForAd(categories: CategoryOption[], ad: AdCard) {
  if (!ad.categoryName?.trim()) return undefined;
  return categories.find(category => normalized(category.name) === normalized(ad.categoryName!));
}
/** Fixed UTC+3 Riyadh calendar day; no random sorting or popularity inference. */
export function opportunityCategories(config: CategoryFormConfig | null, seedAds: AdCard[], now = new Date()): CategoryOption[] {
  const categories = activeCategories(config);
  if (!categories.length) return [];
  const day = Math.floor((now.getTime() + 3*60*60*1000) / (24*60*60*1000));
  const offset = ((day % categories.length) + categories.length) % categories.length;
  const rotated = [...categories.slice(offset), ...categories.slice(0,offset)];
  const relevant = seedAds.flatMap(ad => {const category=categoryForAd(categories,ad);return category?[category]:[];});
  return [...new Map([...relevant,...rotated].map(category=>[category.id,category])).values()].slice(0,6);
}
function sellerIdentity(ad: AdCard): string | null {
  if (ad.storeId) return `store:${ad.storeId}`;
  const name=ad.storeName?.trim() || ad.sellerName?.trim();
  return name ? `name:${normalized(name)}` : null;
}
/** Inputs must already be public-qualified by the existing feed/search services. */
export function selectHomeOpportunities(config: CategoryFormConfig | null, seedAds: AdCard[], inventory: HomeOpportunityInventory[], now = new Date()): HomeOpportunities {
  const categories=opportunityCategories(config,seedAds,now);
  if (!categories.length) return {tiles:[],ads:[]};
  const allActive=activeCategories(config);
  const seenIds=new Set<number>();const seenTitles=new Set<string>();
  const groups=new Map(categories.map(category=>[category.id,[] as AdCard[]]));
  // Keep only records within the selected category scope, including public seed fallback.
  for (const {categoryId,ads} of [...inventory, ...seedAds.map(ad=>({categoryId:categoryForAd(allActive,ad)?.id ?? -1,ads:[ad]}))]) {
    const group=groups.get(categoryId); if (!group) continue;
    for (const ad of ads) {
      const title=normalized(ad.title);
      if (seenIds.has(ad.id) || (title && seenTitles.has(title))) continue;
      seenIds.add(ad.id);if(title) seenTitles.add(title);group.push(ad);
    }
  }
  const tiles=categories.slice(0,4).map(category=>({categoryId:category.id,categoryName:category.name,href:`/?category=${category.id}`,image:groups.get(category.id)?.find(ad=>ad.image)?.image || null}));
  const ads:AdCard[]=[];const sellers=new Set<string>();
  // First sweep gives distinct public seller identities priority across categories.
  for (const group of groups.values()) {
    const index=group.findIndex(ad=>{const key=sellerIdentity(ad);return !key || !sellers.has(key);});
    if(index<0) continue;
    const [ad]=group.splice(index,1);ads.push(ad);const key=sellerIdentity(ad);if(key)sellers.add(key);
  }
  while(ads.length<8) {
    let added=false;
    for(const group of groups.values()) {if(ads.length>=8)break;const ad=group.shift();if(ad){ads.push(ad);added=true;}}
    if(!added)break;
  }
  return {tiles,ads};
}
