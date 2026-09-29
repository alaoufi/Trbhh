export const DEFAULT_SEARCH_SYNONYMS = [
  'جوال, موبايل, هاتف, جوالات',
  'سيارة, مركبة, موتر',
  'لابتوب, حاسوب محمول, كمبيوتر محمول',
  'مكيف, تكييف',
  'وظيفة, عمل, شاغر',
].join('\n');

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[آأإا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export type SearchSynonymMap = Map<string, string[]>;

/** سطر لكل مجموعة، والفواصل العربية والإنجليزية مقبولة. */
export function parseSearchSynonyms(value: string): SearchSynonymMap {
  const result: SearchSynonymMap = new Map();
  for (const line of value.split(/\r?\n|;/).slice(0, 100)) {
    const group = Array.from(new Set(line.split(/[,،|]/).map((item) => item.trim()).filter((item) => item.length >= 2))).slice(0, 12);
    if (group.length < 2) continue;
    for (const item of group) result.set(normalize(item), group);
  }
  return result;
}

export function expandSearchToken(token: string, groups: SearchSynonymMap): string[] {
  const group = groups.get(normalize(token)) || [];
  return Array.from(new Set([token, ...group].map((item) => item.trim()).filter(Boolean)));
}
