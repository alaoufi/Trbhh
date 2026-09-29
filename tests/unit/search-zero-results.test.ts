import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('public search zero-result recovery', () => {
  it('uses the existing search suggestion switch and renders relaxed matches', () => {
    const page = readFileSync('src/app/search/page.tsx', 'utf8');
    expect(page).toContain('searchSuggestEnabled()');
    expect(page).toContain('searchAdsRelaxed(query)');
    expect(page).toContain('نتائج قريبة بعد تخفيف الفلاتر');
  });
});
