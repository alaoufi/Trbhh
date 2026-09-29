import { describe, expect, it } from 'vitest';
import { expandSearchToken, parseSearchSynonyms } from '@/lib/search-synonyms';
import { AUDIT_UX_FLAGS, AUDIT_UX_TEXTS } from '@/lib/ux-settings';
import { readFileSync } from 'node:fs';

describe('admin-managed Arabic search synonyms', () => {
  it('parses comma-separated groups and expands normalized equivalents', () => {
    const groups = parseSearchSynonyms('جوال، موبايل, هاتف\nسيارة, مركبة\nسطر غير صالح');
    expect(expandSearchToken('جوال', groups)).toEqual(expect.arrayContaining(['جوال', 'موبايل', 'هاتف']));
    expect(expandSearchToken('موبايل', groups)).toEqual(expect.arrayContaining(['جوال', 'موبايل', 'هاتف']));
    expect(expandSearchToken('مجهول', groups)).toEqual(['مجهول']);
  });

  it('exposes a feature switch and editable dictionary in current settings', () => {
    expect(AUDIT_UX_FLAGS.map(([key]) => key)).toContain('search_synonyms_on');
    expect(AUDIT_UX_TEXTS.map(([key]) => key)).toContain('search_synonyms');
    const data = readFileSync('src/lib/data.ts', 'utf8');
    expect(data).toContain("getSetting('search_synonyms_on', '1')");
    expect(data).toContain('expandSearchToken(t, synonymGroups)');
  });
});
