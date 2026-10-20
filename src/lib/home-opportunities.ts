import type { CategoryFormConfig, CategoryOption } from './ad-categories/contracts';
import type { AdCard } from './data';

export type HomeOpportunityTile = { categoryId: number | null; categoryName: string; href: string; image: string | null; adId?: number; title?: string; featured?: boolean };
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
/** Only source promotion flags establish priority; never infer paid promotion. */
function featuredRank(ad: AdCard) {
  return ad.tier === 'gold' ? 3 : ad.tier === 'silver' ? 2 : ad.special ? 1 : 0;
}
/** Inputs must already be public-qualified by the existing feed/search services. */
export function selectHomeOpportunities(config: CategoryFormConfig | null, seedAds: AdCard[], inventory: HomeOpportunityInventory[], now = new Date()): HomeOpportunities {
  const categories=opportunityCategories(config,seedAds,now);
  const allActive=activeCategories(config);
  const seenIds=new Set<number>();const seenTitles=new Set<string>();
  const allowed=new Set(categories.map(category=>category.id));
  const candidates=[...inventory.filter(group=>allowed.has(group.categoryId)).flatMap(group=>group.ads),...seedAds];
  // Public seed records may fill empty placements from any real source category.
  const ranked=candidates.map((ad,index)=>({ad,index})).sort((a,b)=>featuredRank(b.ad)-featuredRank(a.ad)||a.index-b.index);
  const pool:AdCard[]=[];
  for(const {ad} of ranked) {
    const title=normalized(ad.title);
    if(seenIds.has(ad.id)||(title&&seenTitles.has(title)))continue;
    seenIds.add(ad.id);if(title)seenTitles.add(title);pool.push(ad);
  }
  const ads=pool.filter(ad=>featuredRank(ad)>0).slice(0,8);
  const sellers=new Set(ads.map(sellerIdentity).filter((key):key is string=>!!key));
  const groups=new Map<string,AdCard[]>();
  for(const ad of pool.filter(ad=>featuredRank(ad)===0)) {
    const category=categoryForAd(allActive,ad);
    const key=category?`category:${category.id}`:`source:${normalized(ad.categoryName||'')}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key)!.push(ad);
  }
  // After featured inventory, prefer distinct sellers and categories before filling.
  for (const group of groups.values()) {
    if(ads.length>=8)break;
    const index=group.findIndex(ad=>{const key=sellerIdentity(ad);return !key || !sellers.has(key);});
    if(index<0) continue;
    const [ad]=group.splice(index,1);ads.push(ad);const key=sellerIdentity(ad);if(key)sellers.add(key);
  }
  while(ads.length<8) {
    let added=false;
    for(const group of groups.values()) {if(ads.length>=8)break;const ad=group.shift();if(ad){ads.push(ad);added=true;}}
    if(!added)break;
  }
  const tiles=ads.slice(0,4).map(ad=>({adId:ad.id,categoryId:categoryForAd(allActive,ad)?.id??null,categoryName:ad.categoryName?.trim()||'إعلان من السوق',title:ad.title,href:ad.href??`/ads/${ad.id}`,image:ad.image||null,featured:featuredRank(ad)>0}));
  return {tiles,ads};
}
