import {describe, expect, it} from 'vitest';
import {
  defaultListingPolicy,
  normalizeListingSubmission,
  validateListingPolicy,
  type ListingPolicy,
} from '@/lib/ad-categories/listing-policy';
import {fieldApplies, validateCategoryValues, type CategoryField} from '@/lib/ad-categories/validation';

const forkliftPolicy: ListingPolicy = {
  types: [
    {key:'sale',label:'للبيع',pricing:['fixed','bidding']},
    {key:'rent',label:'للإيجار',pricing:['hour','day','week','month','project']},
    {key:'wanted',label:'مطلوب شراء',pricing:['budget_optional']},
    {key:'wanted_rent',label:'مطلوب للإيجار',pricing:['budget_optional']},
  ],
};

describe('subcategory listing type and pricing policy',()=>{
  it('keeps sale pricing separate from rental time units',()=>{
    const policy=validateListingPolicy(forkliftPolicy);
    expect(policy.types.find(type=>type.key==='sale')?.pricing).toEqual(['fixed','bidding']);
    expect(policy.types.find(type=>type.key==='rent')?.pricing).toEqual(['hour','day','week','month','project']);
    expect(()=>validateListingPolicy({types:[{key:'sale',label:'للبيع',pricing:['hour']}]})).toThrow();
  });

  it('normalizes fixed sale, bidding and rental to legacy ad columns',()=>{
    expect(normalizeListingSubmission(forkliftPolicy,{listingType:'sale',pricingMode:'fixed',price:'125000'})).toEqual({listingType:'sale',adsType:'offer',priceType:'sale',rentPeriod:null,price:125000});
    expect(normalizeListingSubmission(forkliftPolicy,{listingType:'sale',pricingMode:'bidding',price:'999'})).toEqual({listingType:'sale',adsType:'offer',priceType:'som',rentPeriod:null,price:0});
    expect(normalizeListingSubmission(forkliftPolicy,{listingType:'rent',pricingMode:'hour',price:'450'})).toEqual({listingType:'rent',adsType:'offer',priceType:'rent',rentPeriod:'بالساعة',price:450});
  });

  it('requires a positive amount for fixed sale and rental but not for bidding or requests',()=>{
    expect(()=>normalizeListingSubmission(forkliftPolicy,{listingType:'sale',pricingMode:'fixed',price:''})).toThrow();
    expect(()=>normalizeListingSubmission(forkliftPolicy,{listingType:'rent',pricingMode:'day',price:'0'})).toThrow();
    expect(normalizeListingSubmission(forkliftPolicy,{listingType:'sale',pricingMode:'bidding',price:''}).price).toBe(0);
    expect(normalizeListingSubmission(forkliftPolicy,{listingType:'wanted',pricingMode:'budget_optional',price:''})).toMatchObject({adsType:'request',price:0,priceType:null});
  });

  it('provides explicit conservative policies for every category kind',()=>{
    expect(defaultListingPolicy('goods').types.map(type=>type.key)).toEqual(['sale','wanted']);
    expect(defaultListingPolicy('property').types.map(type=>type.key)).toEqual(['sale','rent','wanted','wanted_rent']);
    expect(defaultListingPolicy('service').types.map(type=>type.key)).toEqual(['service','service_request']);
    expect(defaultListingPolicy('jobs').types.map(type=>type.key)).toEqual(['job','job_seeker']);
  });
});

describe('conditional category fields',()=>{
  const base:CategoryField={key:'operator_included',label:'يشمل المشغل',type:'boolean',group:'الإيجار',required:true,visible:true,order:1,options:[],dependsOn:'listing_type',dependencyOperator:'equals',dependencyValue:'rent'};
  it('shows and requires a rental-only field only for rental listings',()=>{
    expect(fieldApplies(base,{listingType:'rent',values:{}})).toBe(true);
    expect(fieldApplies(base,{listingType:'sale',values:{}})).toBe(false);
    expect(validateCategoryValues([base],{}, {listingType:'sale'})).toEqual({});
    expect(()=>validateCategoryValues([base],{}, {listingType:'rent'})).toThrow();
    expect(validateCategoryValues([base],{operator_included:false},{listingType:'rent'})).toEqual({operator_included:false});
  });

  it('supports dependencies on another field and drops hidden stale values',()=>{
    const mileage:CategoryField={...base,key:'odometer_km',label:'الممشى',type:'number',required:false,dependsOn:'condition',dependencyOperator:'in',dependencyValue:['مستعمل','مجدد']};
    expect(fieldApplies(mileage,{listingType:'sale',values:{condition:'مستعمل'}})).toBe(true);
    expect(fieldApplies(mileage,{listingType:'sale',values:{condition:'جديد'}})).toBe(false);
    expect(validateCategoryValues([mileage],{odometer_km:100},{listingType:'sale',values:{condition:'جديد'}})).toEqual({});
  });
});
