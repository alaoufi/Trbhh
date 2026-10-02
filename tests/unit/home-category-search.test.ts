import {expect,it} from 'vitest';
import {normalizeSearchParams} from '@/lib/search-filters';
import {readFileSync} from 'node:fs';
it('retains category in full-results queries, pagination and resubmission',()=>{
  expect(normalizeSearchParams({category:'90'})).toMatchObject({categoryId:90});
  const searchPage=readFileSync('src/app/search/page.tsx','utf8');
  const homePage=readFileSync('src/app/page.tsx','utf8');
  expect(searchPage).toContain('category:selectedGroup?.key');
  expect(searchPage).toContain('categoryIds:undefined');
  expect(searchPage).toContain('subcategoryIds:selectedSubcategory?.sourceSubcategoryIds||selectedGroup?.subcategoryIds||[]');
  expect(homePage).toContain('{ subcategoryIds: selectedCategory.subcategoryIds }');
  expect(homePage).toContain(': { categoryIds: selectedCategory.categoryIds }');
  expect(readFileSync('src/components/public-search-form.tsx','utf8')).toContain('name="category"');
});
it.each(['-1','NaN','1 OR 1=1','999999999999999999999'])('rejects malformed category %s',category=>{
  expect(normalizeSearchParams({category})).toMatchObject({categoryId:undefined});
});
