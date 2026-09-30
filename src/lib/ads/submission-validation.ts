import { CategoryValidationError } from '@/lib/ad-categories/validation';
import type { NormalizedListingSubmission } from '@/lib/ad-categories/listing-policy';

export type AdPriceDetails = {
  oldPrice: number;
  discountPercent: number | null;
  warning: 'suspicious_discount' | null;
};

type LegacyListingInput = {
  adsType: unknown;
  priceType: unknown;
  rentPeriod?: unknown;
  price: unknown;
};

const LEGACY_RENT_PERIODS = new Set(['بالساعة', 'يومي', 'أسبوعي', 'شهري', 'سنوي']);

function currencyAmount(value: unknown, field: string, label: string): number {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new CategoryValidationError(field, `${label} غير صالح`);
  }
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0 || amount > 2_147_483_647) {
    throw new CategoryValidationError(field, `${label} غير صالح`);
  }
  return amount;
}

/** Strict compatibility path used only when the managed taxonomy is disabled. */
export function normalizeLegacyListingSubmission(input: LegacyListingInput): NormalizedListingSubmission {
  const adsType = String(input.adsType) === 'request' ? 'request' : 'offer';
  const rawPriceType = String(input.priceType ?? '');
  const priceType = adsType === 'offer' && ['sale', 'rent', 'som'].includes(rawPriceType)
    ? rawPriceType as 'sale' | 'rent' | 'som'
    : null;
  const listingType = adsType === 'request' ? 'wanted' : priceType === 'rent' ? 'rent' : 'sale';
  let price = currencyAmount(input.price, 'price', 'السعر');
  if (priceType === 'som') price = 0;
  if (adsType === 'offer' && priceType !== 'som' && price <= 0) {
    throw new CategoryValidationError('price', 'أدخل سعرًا أكبر من صفر');
  }
  const rawPeriod = String(input.rentPeriod ?? '').trim();
  const rentPeriod = priceType === 'rent'
    ? (LEGACY_RENT_PERIODS.has(rawPeriod) ? rawPeriod : 'شهري')
    : null;
  return { listingType, adsType, priceType, rentPeriod, price };
}

/**
 * The client never supplies a trusted discount percentage. We derive it from
 * the two validated prices and keep extreme-but-possible offers reviewable.
 */
export function normalizeAdPriceDetails(
  listing: NormalizedListingSubmission,
  rawOldPrice: unknown,
  oldPriceEnabled: boolean,
): AdPriceDetails {
  const discountEligible = oldPriceEnabled
    && listing.adsType === 'offer'
    && listing.priceType !== null
    && listing.priceType !== 'som'
    && listing.price > 0;

  if (!discountEligible) return { oldPrice: 0, discountPercent: null, warning: null };

  const oldPrice = currencyAmount(rawOldPrice, 'old_price', 'السعر السابق');
  if (oldPrice === 0) return { oldPrice: 0, discountPercent: null, warning: null };
  if (oldPrice <= listing.price) {
    throw new CategoryValidationError('old_price', 'يجب أن يكون السعر السابق أكبر من السعر الحالي');
  }

  const discountPercent = Math.round((1 - listing.price / oldPrice) * 100);
  return {
    oldPrice,
    discountPercent,
    warning: discountPercent >= 80 ? 'suspicious_discount' : null,
  };
}

export type SaudiLocationInput = {
  countryId?: unknown;
  regionId?: unknown;
  cityId?: unknown;
};

export type SaudiLocation = {
  countryId: number;
  regionId: number;
  cityId: number;
};

export type SaudiLocationLookup = {
  regionExists(regionId: number, countryId: number): Promise<boolean>;
  cityBelongs(cityId: number, regionId: number): Promise<boolean>;
};

function positiveId(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) return Number.NaN;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : Number.NaN;
}

/** Validates the existing Saudi hierarchy without creating a second dataset. */
export async function normalizeSaudiLocation(
  input: SaudiLocationInput,
  lookup: SaudiLocationLookup,
): Promise<SaudiLocation | null> {
  const countryId = positiveId(input.countryId);
  const regionId = positiveId(input.regionId);
  const cityId = positiveId(input.cityId);

  if (regionId === null && cityId === null) return null;
  if (regionId === null) throw new CategoryValidationError('city_id', 'اختر المنطقة أولًا');
  if (cityId === null) throw new CategoryValidationError('area_id', 'اختر المدينة');
  if (!Number.isFinite(regionId)) throw new CategoryValidationError('city_id', 'المنطقة غير صالحة');
  if (!Number.isFinite(cityId)) throw new CategoryValidationError('area_id', 'المدينة غير صالحة');
  if (countryId === null || !Number.isFinite(countryId)) throw new CategoryValidationError('country_id', 'الدولة غير صالحة');

  if (!await lookup.regionExists(regionId, countryId)) {
    throw new CategoryValidationError('city_id', 'المنطقة غير صالحة');
  }
  if (!await lookup.cityBelongs(cityId, regionId)) {
    throw new CategoryValidationError('area_id', 'المدينة لا تتبع المنطقة المختارة');
  }
  return { countryId, regionId, cityId };
}
