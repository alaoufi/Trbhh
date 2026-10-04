import {describe,it,expect} from 'vitest';
import {searchGuide,guideGroup,guideHashIndex} from '@/lib/guide-book';
const sections=[{id:'category-definitions',title:'الأقسام والحقول',goal:'إدارة الحقول',steps:['حقل إلزامي أو اختياري']},{id:'wallet',title:'المحفظة',goal:'شحن الرصيد',steps:['اختر المبلغ ثم أرفق الإيصال']}];
describe('guide book navigation',()=>{
 it('searches Arabic titles and steps with normalized hamza/diacritics',()=>{
  expect(searchGuide(sections,'اقسام')).toEqual([0]);expect(searchGuide(sections,'اِيصال')).toEqual([1]);
 });
 it('matches all words, empty search and no results safely',()=>{
  expect(searchGuide(sections,'حقل اختياري')).toEqual([0]);expect(searchGuide(sections,'محفظة حقول')).toEqual([]);expect(searchGuide(sections,'')).toEqual([0,1]);
 });
 it('groups related chapters without changing their ids',()=>{
  expect(guideGroup(sections[0])).toBe('الأقسام والحقول');expect(guideGroup(sections[1])).toBe('الرصيد والباقات');
 });
 it('resolves existing deep links and tolerates malformed fragments',()=>{
  expect(guideHashIndex(sections,'#wallet')).toBe(1);expect(guideHashIndex(sections,'#bad')).toBe(-1);expect(guideHashIndex(sections,'#%E0%A4')).toBe(-1);
 });
});
