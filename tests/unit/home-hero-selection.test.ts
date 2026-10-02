import { expect, it } from 'vitest';
import { parseHomeHeroIds } from '@/lib/home-hero-selection';

it('preserves explicit order, removes duplicates and supports Arabic digits', () => {
  expect(parseHomeHeroIds('٣، 1\n3 ٢')).toEqual([3, 1, 2]);
});
it('empty selection means no advertisement slides', () => {
  expect(parseHomeHeroIds('')).toEqual([]);
});
it.each(['-1', '1.2', 'abc', '0', '9007199254740992', Array.from({length:11},(_,i)=>i+1).join(',')])('rejects invalid selection %s', value => {
  expect(() => parseHomeHeroIds(value)).toThrow();
});
