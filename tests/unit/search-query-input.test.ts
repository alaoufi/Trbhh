import {describe,expect,it} from 'vitest';
import {singleSearchParams} from '@/lib/search-filters';
describe('page query input boundary',()=>{
  it('rejects all array-valued parameters including singleton arrays',()=>{
    expect(singleSearchParams({q:['one','two'],category:['أخرى'],subcategory:['كتب'],page:['2'],city:['1'],sort:['newest'],published:['7']})).toEqual({});
  });
  it('preserves strings without joining or choosing among repeated values',()=>{
    expect(singleSearchParams({q:'one',category:'أخرى',subcategory:'كتب',page:'2',missing:undefined})).toEqual({q:'one',category:'أخرى',subcategory:'كتب',page:'2'});
  });
});
