import {describe,expect,it} from 'vitest';
import {publicCategoryFieldTrust} from '@/lib/ad-categories/public-trust';

describe('public category field trust',()=>{
  it('suppresses product specifications when a service ad was placed in sanitary goods',()=>{
    expect(publicCategoryFieldTrust({templateKey:'sanitary',title:'مقاول شبوك ونخيل وتركيب أسوار',values:{item_kind:'أخرى'}}))
      .toEqual({trusted:false,reason:'service_in_goods_leaf'});
  });

  it('suppresses lifting specifications when title and selected equipment kind conflict',()=>{
    expect(publicCategoryFieldTrust({templateKey:'lifting',title:'سيزر لفت كهربائي للبيع',values:{equipment_kind:'رافعة'}}))
      .toEqual({trusted:false,reason:'lifting_kind_conflict'});
    expect(publicCategoryFieldTrust({templateKey:'lifting',title:'رافعة شوكية تويوتا',values:{equipment_kind:'رافعة شوكية'}}).trusted).toBe(true);
  });

  it('does not guess a replacement category or reject unrelated normal titles',()=>{
    expect(publicCategoryFieldTrust({templateKey:'contracting',title:'مقاول شبوك ونخيل',values:{trade:['أسوار وشبوك','أعمال نخيل']}}))
      .toEqual({trusted:true});
    expect(publicCategoryFieldTrust({templateKey:'lifting',title:'معدات رفع بحالة ممتازة',values:{equipment_kind:'رافعة'}}))
      .toEqual({trusted:true});
  });
});
