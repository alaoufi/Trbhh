export type SupplierTrustInput = {
  supplierVerified: boolean;
  connected: boolean;
  featured: boolean;
  available: boolean;
};

export type SupplierTrustBadge = {
  key: 'verified-supplier' | 'connected-source' | 'featured-product' | 'available-now';
  label: string;
};

/**
 * Builds only evidence-backed badges. Callers must derive supplierVerified
 * from an explicit administrative verification state; no badge is inferred
 * from a name, price, or imported record alone.
 */
export function supplierTrustBadges(input: SupplierTrustInput): SupplierTrustBadge[] {
  const badges: SupplierTrustBadge[] = [];
  if (input.supplierVerified) badges.push({key: 'verified-supplier', label: 'مورد موثق'});
  if (input.connected) badges.push({key: 'connected-source', label: 'مصدر متصل'});
  if (input.featured) badges.push({key: 'featured-product', label: 'منتج معتمد'});
  if (input.available) badges.push({key: 'available-now', label: 'متوفر الآن'});
  return badges;
}
