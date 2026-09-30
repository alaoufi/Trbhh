export type DealPricingInput = {
  currentPrice: number;
  oldPrice: number;
  adsType: string;
  priceType: string | null;
};

/** Returns a server-derived percentage only for a structurally safe deal. */
export function safeDealDiscount(input: DealPricingInput): number | null {
  if (input.adsType !== 'offer' || (input.priceType !== 'sale' && input.priceType !== 'rent')) return null;
  if (!Number.isFinite(input.currentPrice) || !Number.isFinite(input.oldPrice)) return null;
  if (input.currentPrice <= 0 || input.oldPrice <= input.currentPrice) return null;
  const discount = Math.round((1 - input.currentPrice / input.oldPrice) * 100);
  return discount > 0 && discount < 80 ? discount : null;
}
