import {expect,it} from 'vitest';
import {normalizeSearchParams} from '@/lib/search-filters';
import {readFileSync} from 'node:fs';
it('retains category in full-results queries, pagination and resubmission',()=>{
  expect(normalizeSearchParams({category:'90'})).toMatchObject({categoryId:90});
  expect(readFileSync('src/app/search/page.tsx','utf8')).toContain('category: query.categoryId?.toString()');
  expect(readFileSync('src/components/public-search-form.tsx','utf8')).toContain('name="category"');
});
it.each(['-1','NaN','1 OR 1=1','999999999999999999999'])('rejects malformed category %s',category=>{
  expect(normalizeSearchParams({category})).toMatchObject({categoryId:undefined});
});
