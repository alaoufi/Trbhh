import type { ListingPolicy } from './listing-policy';
import type { CategoryField } from './validation';

export type StoredCategoryDefinition = {
  schemaVersion: 2;
  fields: CategoryField[];
  listingPolicy: ListingPolicy;
};

/** Accepts the original fields array and the v2 envelope without a database migration. */
export function decodeStoredCategoryDefinition(raw: unknown): { fields: unknown; listingPolicy?: unknown } {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (Array.isArray(parsed)) return { fields: parsed };
  if (parsed && typeof parsed === 'object' && 'fields' in parsed) {
    const value = parsed as { fields: unknown; listingPolicy?: unknown };
    return { fields: value.fields, listingPolicy: value.listingPolicy };
  }
  return { fields: parsed };
}

export function encodeStoredCategoryDefinition(fields: CategoryField[], listingPolicy: ListingPolicy): StoredCategoryDefinition {
  return { schemaVersion: 2, fields, listingPolicy };
}
