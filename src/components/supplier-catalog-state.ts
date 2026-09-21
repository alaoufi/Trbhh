import {formatSar, parseSar} from '@/lib/commerce/money';
import {CATALOG_SELECTION_LIMIT, type CatalogProduct, type CatalogSelection} from '@/lib/suppliers/catalog-selection';

export type PriceDraft = {cost: string; selling: string};
export type PriceDrafts = Record<string, PriceDraft>;

/** Existing choices survive filtering/pagination; only selectable new products may be added. */
export function changeCatalogSelection(current: CatalogProduct[], products: CatalogProduct[], checked: boolean): CatalogProduct[] {
  const keys = new Set(products.map(product => product.key));
  if (!checked) return current.filter(product => !keys.has(product.key));
  const selected = new Map(current.map(product => [product.key, product]));
  for (const product of products) {
    if (product.canSelect && !selected.has(product.key) && selected.size < CATALOG_SELECTION_LIMIT) selected.set(product.key, product);
  }
  return [...selected.values()];
}

export const catalogSelections = (products: CatalogProduct[]): CatalogSelection[] => products.map(({key, revision}) => ({key, revision}));

export function catalogPriceDrafts(products: CatalogProduct[]): PriceDrafts {
  return Object.fromEntries(products.map(product => [product.key, {
    // The source retail price is never a supplier cost agreement.
    cost: product.costMinor === null ? '' : formatSar(product.costMinor),
    selling: formatSar(product.sellingMinor ?? product.priceMinor),
  }]));
}

export const normalizeCatalogPrice = (value: string) => value.trim().replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0)).replace(/٫/g, '.');

export function catalogPriceErrors(products: CatalogProduct[], drafts: PriceDrafts): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const product of products) {
    const draft = drafts[product.key];
    if (!draft?.cost.trim()) {errors[product.key] = 'أدخل تكلفة التوريد المتفق عليها؛ سعر سلة لا يمثل التكلفة.'; continue;}
    let cost: number, selling: number;
    try {cost = parseSar(normalizeCatalogPrice(draft.cost));} catch {errors[product.key] = 'أدخل تكلفة صحيحة بالريال، بخانتين عشريتين كحد أقصى.'; continue;}
    try {selling = parseSar(normalizeCatalogPrice(draft.selling));} catch {errors[product.key] = 'أدخل سعر بيع صحيحًا بالريال، بخانتين عشريتين كحد أقصى.'; continue;}
    if (selling === 0) {errors[product.key] = 'يجب أن يكون سعر البيع أكبر من صفر.'; continue;}
    if (selling < product.minimumPriceMinor) errors[product.key] = `سعر البيع أقل من الحد الأدنى: ${formatSar(product.minimumPriceMinor)} ر.س.`;
    else if (selling - cost < product.minimumMarginMinor) errors[product.key] = `راجع التكلفة وسعر البيع؛ الحد الأدنى للربح ${formatSar(product.minimumMarginMinor)} ر.س.`;
  }
  return errors;
}
