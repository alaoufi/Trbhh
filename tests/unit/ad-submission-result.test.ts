import {describe,it,expect} from 'vitest';
import {CategoryValidationError} from '@/lib/ad-categories/validation';
import {adValidationFailure,publicationDestination} from '@/lib/ad-submission-result';

describe('ad submission feedback',()=>{
  it('keeps the exact field and safe validation message in a serializable reply',()=>{
    const result=adValidationFailure(new CategoryValidationError('capacity','أكمل طرفي النطاق'));
    expect(JSON.parse(JSON.stringify(result))).toEqual({error:{fieldKey:'capacity',message:'أكمل طرفي النطاق'}});
  });
  it('uses public publishing unless the store was explicitly selected',()=>{
    for(const value of [undefined,null,'','personal','invalid']) expect(publicationDestination(value)).toBe('personal');
    expect(publicationDestination('store')).toBe('store');
  });
});
