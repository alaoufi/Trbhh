import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {AdCategoryFields} from '@/components/ad-category-fields';
import {AdListingPolicyFields} from '@/components/ad-listing-policy-fields';
import {CATEGORY_SEED_TEMPLATES} from '@/lib/ad-categories/seed-templates';
import {normalizeCategoryAttributeFilters} from '@/lib/search-filters';
import {
  fieldApplies,
  fieldIsRequired,
  validateCategoryValues,
  validateDefinition,
  type CategoryField,
  type CategoryValue,
  type CategoryValues,
} from '@/lib/ad-categories/validation';

function sampleValue(field: CategoryField): CategoryValue {
  switch (field.type) {
    case 'select': case 'radio': return field.options[0];
    case 'multiselect': return [field.options[0]];
    case 'boolean': return false;
    case 'number': case 'decimal': case 'year': return field.min ?? 1;
    case 'range': return {min: field.min ?? 1, max: field.min ?? 1};
    case 'date': return '2026-09-30';
    default: return 'قيمة اختبار';
  }
}

function sampleValues(fields: CategoryField[]): CategoryValues {
  return Object.fromEntries(fields.filter(field => field.visible).map(field => [field.key, sampleValue(field)]));
}

function filterParams(field: CategoryField) {
  const prefix = `attr_${field.key}`;
  if (['number','decimal','year','range'].includes(field.type)) return {[`${prefix}_min`]: String(field.min ?? 1)};
  if (field.type === 'boolean') return {[prefix]: '0'};
  if (['select','radio','multiselect'].includes(field.type)) return {[prefix]: field.options[0]};
  return {[prefix]: 'قيمة'};
}

describe('all classified-listing leaf category scenarios', () => {
  it('covers every current leaf with a unique, valid and grouped schema', () => {
    expect(CATEGORY_SEED_TEMPLATES.length).toBeGreaterThanOrEqual(85);
    for (const template of CATEGORY_SEED_TEMPLATES) {
      const fields = validateDefinition(template.fields);
      expect(fields.length, template.key).toBeGreaterThan(0);
      expect(new Set(fields.map(field => field.key)).size, template.key).toBe(fields.length);
      expect(fields.every(field => field.group.trim().length > 0), template.key).toBe(true);
      expect(template.listingPolicy.types.some(listing=>fields.some(field => fieldIsRequired(field, {listingType:listing.key}))), template.key).toBe(true);
      expect(fields.some(field => !fieldIsRequired(field, {})), template.key).toBe(true);
    }
  });

  it('renders and server-validates every listing type for every leaf', () => {
    for (const template of CATEGORY_SEED_TEMPLATES) {
      const fields = validateDefinition(template.fields);
      const values = sampleValues(fields);
      for (const listing of template.listingPolicy.types) {
        const context = {listingType: listing.key, values};
        const expectedKeys = fields.filter(field => fieldApplies(field, context)).map(field => field.key);
        const validated = validateCategoryValues(fields, values, context);
        expect(Object.keys(validated).sort(), `${template.key}/${listing.key}`).toEqual(expectedKeys.sort());
        const fieldsHtml = renderToStaticMarkup(React.createElement(AdCategoryFields, {fields, values, listingType: listing.key, onChange: () => {}}));
        const pricingHtml = renderToStaticMarkup(React.createElement(AdListingPolicyFields, {
          policy: template.listingPolicy,
          listingType: listing.key,
          pricingMode: listing.pricing[0],
          onListingType: () => {},
          onPricingMode: () => {},
          priceEnabled: template.priceEnabled,
        }));
        expect(fieldsHtml, `${template.key}/${listing.key}`).toContain('name="category_values"');
        expect(pricingHtml, `${template.key}/${listing.key}`).toContain(listing.label);
      }
    }
  });

  it('round-trips every active filterable field through the public search normalizer', () => {
    for (const template of CATEGORY_SEED_TEMPLATES) {
      const fields = validateDefinition(template.fields);
      const values = sampleValues(fields);
      for (const listing of template.listingPolicy.types) {
        for (const field of fields.filter(item => item.filterable && fieldApplies(item, {listingType: listing.key, values}))) {
          const normalized = normalizeCategoryAttributeFilters(fields, filterParams(field), listing.key, values as Record<string,string>);
          expect(normalized.filters.some(filter => filter.key === field.key), `${template.key}/${listing.key}/${field.key}`).toBe(true);
        }
      }
    }
  });
});
