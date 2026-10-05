import type { CategoryFormConfig,CategoryGroupOption } from './ad-categories/contracts';

/** Change presentation only; preserve ranking, identities and the original input. */
export function splitHomeFeed<T>(ads: readonly T[]): {before:T[];strip:T[];after:T[]} {
  if(ads.length<12)return {before:[...ads],strip:[],after:[]};
  const end=6+Math.min(12,ads.length-10);
  return {before:ads.slice(0,6),strip:ads.slice(6,end),after:ads.slice(end)};
}

export type SelectedHomeCategory=CategoryGroupOption&{id?:number};

export function publicCategoryGroups(config:CategoryFormConfig):CategoryGroupOption[]{
  if(config.groups?.length)return config.groups;
  return config.categories.filter(item=>item.active).map(item=>({
    key:String(item.id),name:item.name,order:item.order,categoryIds:[item.id],
    subcategoryIds:config.subcategories
      .filter(subcategory=>subcategory.active&&subcategory.categoryId===item.id)
      .flatMap(subcategory=>subcategory.sourceSubcategoryIds?.length?subcategory.sourceSubcategoryIds:[subcategory.id]),
  }));
}

/** Browsing includes legacy active categories without configured form fields. */
export function selectedHomeCategory(config: CategoryFormConfig | null, value?: string | string[]):SelectedHomeCategory|undefined {
  if (!config?.enabled || typeof value !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(value)) return undefined;
  const groups=publicCategoryGroups(config);
  const direct=groups.find(group=>group.key===value);
  if(direct)return config.groups?.length?direct:{...direct,id:Number(value)};
  if(!/^\d+$/.test(value))return undefined;
  const legacyId=Number(value);
  if(String(legacyId)!==value)return undefined;
  const group=groups.find(item=>item.categoryIds.includes(legacyId));
  return group?{...group,...(!config.groups?.length?{id:legacyId}:{})}:undefined;
}

/** One continuous grid: priority groups first, each advertisement only once. */
export function mergeHomeAds<T extends { id: number | string }>(...groups: readonly T[][]): T[] {
  const seen = new Set<T['id']>();
  return groups.flat().filter(ad => {
    if (seen.has(ad.id)) return false;
    seen.add(ad.id);
    return true;
  });
}
