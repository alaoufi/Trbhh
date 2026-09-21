import {describe, expect, it} from 'vitest';
import {catalogPriceDrafts, catalogPriceErrors, catalogSelections, changeCatalogSelection, normalizeCatalogPrice} from '@/components/supplier-catalog-state';
import {CATALOG_SELECTION_LIMIT, type CatalogProduct} from '@/lib/suppliers/catalog-selection';

const product = (key: string, overrides: Partial<CatalogProduct> = {}): CatalogProduct => ({
  key, revision: 3, name: `منتج ${key}`, sku: '', supplierKey: 's_1', supplierName: 'مورد سلة', image: null,
  priceMinor: 12500, costMinor: null, sellingMinor: null, minimumPriceMinor: 0, minimumMarginMinor: 0,
  quantity: 10, available: true, hasOptions: false, status: 'imported', statusLabel: 'مستورد', canSelect: true, lastSyncAt: null, ...overrides,
});

describe('catalog selection across searches and pages', () => {
  it('preserves earlier-page selections while adding the current page once', () => {
    const first = product('page-1');
    const next = product('page-2');
    const selection = changeCatalogSelection([first], [next, next], true);
    expect(selection).toEqual([first, next]);
    expect(changeCatalogSelection(selection, [product('filtered-result')], true).map(item => item.key)).toEqual(['page-1', 'page-2', 'filtered-result']);
  });
  it('never selects disconnected/published ineligible products and never silently replaces a selected revision', () => {
    const original = product('chosen', {revision: 1});
    const selection = changeCatalogSelection([original], [product('chosen', {revision: 2}), product('disconnected', {canSelect: false, status: 'disconnected'})], true);
    expect(selection).toEqual([original]);
  });
  it('caps bulk selection at 50 while preserving all existing choices', () => {
    const previous = Array.from({length: 48}, (_, index) => product(`existing-${index}`));
    const page = Array.from({length: 20}, (_, index) => product(`page-${index}`));
    const next = changeCatalogSelection(previous, page, true);
    expect(next).toHaveLength(CATALOG_SELECTION_LIMIT);
    expect(next.slice(0, previous.length)).toEqual(previous);
    expect(next.slice(48).map(item => item.key)).toEqual(['page-0', 'page-1']);
  });
  it('can remove a formerly eligible product without losing unrelated selections', () => {
    const first = product('keep'), second = product('remove');
    expect(changeCatalogSelection([first, second], [product('remove', {canSelect: false})], false)).toEqual([first]);
  });
  it('passes only opaque keys and captured revisions to fresh server review', () => {
    expect(catalogSelections([product('opaque-selection')])).toEqual([{key: 'opaque-selection', revision: 3}]);
  });
});

describe('explicit negotiated cost in review', () => {
  it('leaves missing cost empty while defaulting selling price to the source price', () => {
    expect(catalogPriceDrafts([product('new')])).toEqual({new: {cost: '', selling: '125.00'}});
    expect(catalogPriceErrors([product('new')], {new: {cost: '', selling: '125.00'}}).new).toContain('سعر سلة لا يمثل التكلفة');
  });
  it('retains existing explicit cost and selling price, including an explicitly zero cost', () => {
    expect(catalogPriceDrafts([product('existing', {costMinor: 0, sellingMinor: 15000})])).toEqual({existing: {cost: '0.00', selling: '150.00'}});
  });
  it('accepts Arabic or Persian decimal digits without silently removing separators', () => {
    expect(normalizeCatalogPrice(' ٧٥٫٥٠ ')).toBe('75.50');
    expect(normalizeCatalogPrice('۱۲۵.۰۰')).toBe('125.00');
    expect(catalogPriceErrors([product('new')], {new: {cost: '٧٥٫٥٠', selling: '۱۲۵.۰۰'}})).toEqual({});
    expect(catalogPriceErrors([product('new')], {new: {cost: '75,50', selling: '125'}}).new).toContain('تكلفة صحيحة');
  });
  it.each(['-1', '1e2', '1.234', 'NaN', '99999999999'])('rejects invalid cost %s', cost => {
    expect(catalogPriceErrors([product('new')], {new: {cost, selling: '125'}}).new).toContain('تكلفة صحيحة');
  });
  it('validates minimum selling price and minimum margin independently', () => {
    const products = [product('floor', {minimumPriceMinor: 13000}), product('margin', {minimumMarginMinor: 3000})];
    const errors = catalogPriceErrors(products, {floor: {cost: '50', selling: '125'}, margin: {cost: '110', selling: '125'}});
    expect(errors.floor).toContain('الحد الأدنى');
    expect(errors.margin).toContain('الحد الأدنى للربح');
  });
  it('does not allow a blank or malformed selling price to reach approval', () => {
    expect(catalogPriceErrors([product('new')], {new: {cost: '50', selling: ''}}).new).toContain('سعر بيع صحيح');
  });
  it.each(['0', '0.00', '٠٫٠٠'])('rejects zero selling price even with zero cost and no minima (%s)', selling => {
    expect(catalogPriceErrors([product('free-cost', {costMinor: 0})], {'free-cost': {cost: '0', selling}})['free-cost']).toBe('يجب أن يكون سعر البيع أكبر من صفر.');
  });
});
