import type { Prisma } from '@prisma/client';
// Pure catalog data only: no profile settings, browser storage or title classifier.
import { catalog } from '../../preview-v2/lib/category-fields';

export const sandboxCatalogOptions = Object.entries(catalog).map(([name, children]) => ({name, subcategories:Object.keys(children)}));
export type SandboxCategory = { category?: string; subcategory?: string };
export function normalizeSandboxCategory(input: SandboxCategory): SandboxCategory {
  const {category, subcategory} = input;
  if (typeof category !== 'string' || !Object.hasOwn(catalog, category)) return {};
  return {category, ...(typeof subcategory === 'string' && Object.hasOwn(catalog[category], subcategory) ? {subcategory} : {})};
}

/** The fallback is a display/filter projection, never a mutation of legacy IDs. */
export function createSandboxCatalog(categories: {id:bigint;name:string}[], subcategories: {id:bigint;category_id:number;name:string}[]) {
  const names = new Map(categories.map(row => [row.id.toString(), row.name]));
  const pairs = subcategories.flatMap(row => {
    const category = names.get(String(row.category_id));
    const valid = normalizeSandboxCategory({category, subcategory:row.name});
    const subId = Number(row.id);
    return valid.category && valid.subcategory && Number.isSafeInteger(subId) && subId > 0
      ? [{category_id:BigInt(row.category_id), subcategory_id:subId, category:valid.category, subcategory:valid.subcategory}] : [];
  });
  const pairWhere = (pair: typeof pairs[number]) => ({category_id:pair.category_id, subcategory_id:pair.subcategory_id});
  const byId = new Map(pairs.map(pair => [`${pair.category_id}/${pair.subcategory_id}`, pair]));
  return {
    display(categoryId: bigint, subcategoryId: number | null | undefined) {
      const pair = byId.get(`${categoryId}/${subcategoryId}`);
      return {category:pair?.category || 'أخرى', subcategory:pair?.subcategory || 'أخرى'};
    },
    where(input: SandboxCategory): Prisma.adsWhereInput {
      const {category, subcategory} = normalizeSandboxCategory(input);
      if (!category) return {};
      const selected: Prisma.adsWhereInput[] = pairs.filter(pair => pair.category === category && (!subcategory || pair.subcategory === subcategory)).map(pairWhere);
      if (category === 'أخرى' && (!subcategory || subcategory === 'أخرى')) {
        if (!pairs.length) return {};
        // SQL NOT(pair) alone excludes NULL children; explicitly include them.
        selected.push({subcategory_id:null}, {NOT:{OR:pairs.map(pairWhere)}});
      }
      return selected.length ? {OR:selected} : {id:{in:[]}};
    },
  };
}
