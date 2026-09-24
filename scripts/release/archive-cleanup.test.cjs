const test = require('node:test');
const assert = require('node:assert/strict');
const { isOldStandardAd } = require('./archive-cleanup.cjs');

const cutoff = Date.parse('2025-01-01T00:00:00Z');

test('includes a standard ad whose creation and last bump are both over one year old', () => {
  assert.equal(isOldStandardAd({
    store_only: 0,
    created_at: '2023-11-01T00:00:00Z',
    bumped_at: '2024-06-01T00:00:00Z',
  }, cutoff), true);
});

test('keeps an old ad that was renewed within the last year', () => {
  assert.equal(isOldStandardAd({
    store_only: 0,
    created_at: '2022-01-01T00:00:00Z',
    bumped_at: '2025-01-02T00:00:00Z',
  }, cutoff), false);
});

test('keeps store-only product listings even when they are old', () => {
  assert.equal(isOldStandardAd({
    store_only: 1,
    created_at: '2020-01-01T00:00:00Z',
    bumped_at: null,
  }, cutoff), false);
});

test('keeps records with no usable activity date and dates exactly at the cutoff', () => {
  assert.equal(isOldStandardAd({ store_only: 0, created_at: null, bumped_at: null }, cutoff), false);
  assert.equal(isOldStandardAd({ store_only: 0, created_at: '2025-01-01T00:00:00Z', bumped_at: null }, cutoff), false);
});
