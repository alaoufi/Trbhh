import 'server-only';
import type { CategoryFormConfig } from './ad-categories/contracts';
import { searchAds, type AdCard } from './data';
import { opportunityCategories, selectHomeOpportunities, type HomeOpportunities } from './home-opportunities';

export async function getHomeOpportunities(config: CategoryFormConfig | null, seedAds: AdCard[], now = new Date()): Promise<HomeOpportunities> {
  const categories=opportunityCategories(config,seedAds,now);
  const inventory=await Promise.all(categories.map(async category=>({categoryId:category.id,ads:await searchAds({categoryId:category.id,take:3,skip:0}).catch(()=>[] as AdCard[])})));
  return selectHomeOpportunities(config,seedAds,inventory,now);
}
