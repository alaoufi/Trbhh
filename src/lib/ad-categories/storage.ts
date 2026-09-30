import type { ListingPolicy } from './listing-policy';
import type { CategoryField } from './validation';

export type StoredCategoryDefinition = {
  schemaVersion: 3;
  fields: CategoryField[];
  listingPolicy: ListingPolicy;
  templateKey?: string;
};

/** Accepts the original fields array and the v2 envelope without a database migration. */
export function decodeStoredCategoryDefinition(raw: unknown): { fields: unknown; listingPolicy?: unknown; templateKey?:string } {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (Array.isArray(parsed)) return { fields: parsed };
  if (parsed && typeof parsed === 'object' && 'fields' in parsed) {
    const value = parsed as { fields: unknown; listingPolicy?: unknown; templateKey?:unknown };
    return { fields: value.fields, listingPolicy: value.listingPolicy,templateKey:typeof value.templateKey==='string'?value.templateKey:undefined };
  }
  return { fields: parsed };
}

export function encodeStoredCategoryDefinition(fields: CategoryField[], listingPolicy: ListingPolicy,templateKey?:string): StoredCategoryDefinition {
  return { schemaVersion: 3, fields, listingPolicy,...(templateKey?{templateKey}:{}) };
}
