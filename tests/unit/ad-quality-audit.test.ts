import {describe, expect, it} from 'vitest';
import {auditAdQuality, summarizeAdQualityAudit} from '@/lib/ad-quality/audit';
import type {CategoryField} from '@/lib/ad-categories/validation';

const liftingFields:CategoryField[]=[
  {key:'capacity_t',label:'حمولة الرفع المقننة',type:'decimal',group:'المواصفات',required:false,visible:true,order:1,options:[],min:0.1,max:2000,step:0.1,unit:'طن'},
];

describe('legacy ad quality audit',()=>{
  it('classifies impossible stored values without mutating them',()=>{
    const values={capacity_t:6400};
    const issues=auditAdQuality({
      id:3420,categoryId:1,subcategoryId:2,categoryValid:true,subcategoryValid:true,
      regionId:1,cityId:10,locationValid:true,title:'كرين للإيجار',price:68,oldPrice:800,
      listingType:'sale',priceType:'rent',rentPeriod:'شهري',fields:liftingFields,values,
    });
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'impossible_field_range',classification:'INVALID_BUT_PRESERVE',fieldKey:'capacity_t'}),
      expect.objectContaining({code:'listing_price_mismatch',classification:'NEEDS_REVIEW'}),
      expect.objectContaining({code:'suspicious_discount',classification:'NEEDS_REVIEW'}),
    ]));
    expect(values).toEqual({capacity_t:6400});
  });

  it('separates safe normalization from manual review and preserved invalid data',()=>{
    const rows=[
      {id:1,categoryId:1,subcategoryId:2,categoryValid:true,subcategoryValid:true,regionId:1,cityId:10,locationValid:true,title:'سليم',price:100,oldPrice:0,listingType:'sale',priceType:'sale',rentPeriod:null,fields:[],values:{}},
      {id:2,categoryId:1,subcategoryId:2,categoryValid:true,subcategoryValid:true,regionId:1,cityId:null,locationValid:false,title:'موقع ناقص',price:100,oldPrice:0,listingType:'sale',priceType:'sale',rentPeriod:null,fields:[],values:{}},
      {id:3,categoryId:null,subcategoryId:null,categoryValid:false,subcategoryValid:false,regionId:1,cityId:10,locationValid:true,title:'بلا قسم',price:100,oldPrice:0,listingType:'sale',priceType:'sale',rentPeriod:null,fields:[],values:{}},
    ];
    expect(summarizeAdQualityAudit(rows)).toMatchObject({records:3,clean:1,AUTO_FIX_SAFE:0,NEEDS_REVIEW:1,INVALID_BUT_PRESERVE:1});
  });
});
