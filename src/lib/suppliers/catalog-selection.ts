/** Serializable administration DTOs. Keys are opaque UI state, never product labels. */
export const CATALOG_SELECTION_LIMIT = 50;
export const CATALOG_PAGE_SIZE = 20;

export type CatalogSelection = { key: string; revision: number };
export type CatalogProduct = CatalogSelection & {
  name: string;
  sku: string;
  supplierKey: string;
  supplierName: string;
  image: string | null;
  priceMinor: number;
  costMinor: number | null;
  sellingMinor: number | null;
  pricingPolicy: 'manual' | 'source' | 'fixed_discount' | 'percent_discount';
  minimumPriceMinor: number;
  minimumMarginMinor: number;
  quantity: number | null;
  available: boolean;
  hasOptions: boolean;
  status: 'imported' | 'added_hidden' | 'published' | 'unavailable' | 'disconnected';
  statusLabel: string;
  canSelect: boolean;
  canManage: boolean;
  active: boolean;
  visible: boolean;
  lastSyncAt: string | null;
};
export type CatalogDetail = CatalogProduct & {
  description: string;
  images: string[];
  brand: string;
  categories: string[];
  options: { name: string; values: string[] }[];
  variants: {
    name: string;
    sku: string;
    priceMinor: number | null;
    quantity: number | null;
    available: boolean;
    options: Record<string, string>;
  }[];
  sourceUpdatedAt: string | null;
};
export type CatalogSearch = { query: string; supplierKey: string; page: number };
export type CatalogPage = {
  products: CatalogProduct[];
  suppliers: { key: string; name: string }[];
  page: number;
  hasNext: boolean;
  query: string;
  supplierKey: string;
};
export type CatalogReview = { token: string; expiresAt: string; products: CatalogProduct[] };
export type CatalogApproval = {
  token: string;
  confirmed: boolean;
  products: (CatalogSelection & { cost: string; selling: string })[];
};
export type CatalogSaleUpdate = CatalogSelection & { mode: 'source' | 'manual'; selling: string };
export type CatalogRemoval = CatalogSelection & { confirmed: boolean };
export type CatalogActions = {
  search: (input: CatalogSearch) => Promise<{ data?: CatalogPage; error?: string }>;
  details: (key: string) => Promise<{ product?: CatalogDetail; error?: string }>;
  review: (selection: CatalogSelection[]) => Promise<{ review?: CatalogReview; error?: string }>;
  approve: (input: CatalogApproval) => Promise<{ added?: number; error?: string }>;
  updateSale: (input: CatalogSaleUpdate) => Promise<{ updated?: boolean; error?: string }>;
  hide: (input: CatalogSelection) => Promise<{ hidden?: boolean; error?: string }>;
  remove: (input: CatalogRemoval) => Promise<{ removed?: boolean; error?: string }>;
};
