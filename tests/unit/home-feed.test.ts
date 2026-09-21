import { describe, expect, it } from 'vitest';
import { mergeHomeAds, selectedHomeCategory } from '@/lib/home-feed';
import { CATEGORY_LABELS } from '@/lib/ad-categories/contracts';
import { readFileSync } from 'node:fs';

describe('continuous home feed', () => {
  const config = {enabled:true, labels:CATEGORY_LABELS, categories:[{id:90,name:'Other',active:true,order:0},{id:91,name:'Hidden',active:false,order:1}],subcategories:[]};
  it('allows active legacy Other without requiring configured subcategories', () => {
    expect(selectedHomeCategory(config,'90')?.id).toBe(90);
  });
  it.each(['91','999','-1','090',['90','91'],undefined])('defaults invalid selections %j', value => {
    expect(selectedHomeCategory(config,value)).toBeUndefined();
  });
  it('defaults disabled or unavailable configuration', () => {
    expect(selectedHomeCategory({...config,enabled:false},'90')).toBeUndefined();
    expect(selectedHomeCategory(null,'90')).toBeUndefined();
  });
  it('wires a bounded selected-only grid and suppresses unrelated recommendations', () => {
    const page=readFileSync('src/app/page.tsx','utf8');
    expect(page).toContain('searchAds({ categoryId: selectedCategory.id, take: 24, skip: 0 })');
    expect(page).toMatch(/<AdGrid\s+ads=\{feedAds\}(?:\s+appearance="marketplace")?\s*\/>/);
    expect(page).toContain('!selectedCategory && personalizedAds.length');
    expect(page).toContain('category=${selectedCategory.id}');
  });
  it('places featured first and removes duplicates without mutating sources', () => {
    const featured = [{ id: 2 }, { id: 1 }];
    const latest = [{ id: 3 }, { id: 2 }, { id: 4 }];
    expect(mergeHomeAds(featured, latest).map(ad => ad.id)).toEqual([2, 1, 3, 4]);
    expect(latest.map(ad => ad.id)).toEqual([3, 2, 4]);
  });
  it('handles empty groups without placeholder entries', () => {
    expect(mergeHomeAds([], [{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(mergeHomeAds([], [])).toEqual([]);
  });
});
