import { describe, expect, it } from 'vitest';
import { CATEGORY_SEED_TEMPLATES } from '@/lib/ad-categories/seed-templates';
import { fieldApplies, validateCategoryValues, validateDefinition } from '@/lib/ad-categories/validation';
import {validateListingPolicy} from '@/lib/ad-categories/listing-policy';
describe('editable specialist subcategory seed templates', () => {
  it('has unique keys and valid domain-specific definitions for each requested group', () => {
    expect(new Set(CATEGORY_SEED_TEMPLATES.map(t => t.key)).size).toBe(CATEGORY_SEED_TEMPLATES.length);
    expect(CATEGORY_SEED_TEMPLATES.length).toBeGreaterThanOrEqual(24);
    for (const template of CATEGORY_SEED_TEMPLATES) {
      expect(validateDefinition(template.fields).length).toBeGreaterThanOrEqual(6);
      expect(validateListingPolicy(template.listingPolicy).types.length).toBeGreaterThan(0);
      expect(template.fields.some(field => field.required), `${template.key} needs required fields`).toBe(true);
      expect(template.fields.some(field => !field.required), `${template.key} needs optional fields`).toBe(true);
    }
  });
  it('separates transaction pricing from equipment attributes',()=>{
    for(const key of ['earthmoving','lifting','commercial_vehicles']){
      const template=CATEGORY_SEED_TEMPLATES.find(t=>t.key===key)!;
      expect(template.fields.map(f=>f.key)).not.toEqual(expect.arrayContaining(['offer_mode','rate_basis']));
      const sale=template.listingPolicy.types.find(type=>type.key==='sale')!;
      const rent=template.listingPolicy.types.find(type=>type.key==='rent')!;
      expect(sale.pricing).toEqual(['fixed','bidding']);
      expect(rent.pricing).toEqual(expect.arrayContaining(['day','month','project']));
      if(key!=='commercial_vehicles')expect(rent.pricing).toContain('hour');
    }
    for(const key of ['contracting','transport_service'])expect(CATEGORY_SEED_TEMPLATES.find(t=>t.key===key)!.fields.map(f=>f.key)).not.toEqual(expect.arrayContaining(['pricing_basis','rate_basis']));
  });
  it('keeps job-only requirements away from job seekers',()=>{
    const jobs=CATEGORY_SEED_TEMPLATES.find(t=>t.key==='job')!;
    const employer=jobs.fields.find(field=>field.key==='employer')!;
    expect(employer).toMatchObject({required:true,dependsOn:'listing_type',dependencyValue:'job'});
    expect(fieldApplies(employer,{listingType:'job_seeker'})).toBe(false);
    expect(()=>validateCategoryValues(jobs.fields,{job_title:'مصمم',contract:'عمل حر',workplace:'عن بُعد'},{listingType:'job_seeker'})).not.toThrow();
  });
  it('adds optional B2B supply controls only to supply-heavy goods',()=>{
    for(const key of ['plants','feed','tiles','building_materials']){
      const template=CATEGORY_SEED_TEMPLATES.find(item=>item.key===key)!;
      expect(template.fields.map(field=>field.key)).toEqual(expect.arrayContaining(['sale_channel','minimum_order','recurring_supply','supply_area']));
      expect(template.fields.find(field=>field.key==='minimum_order')?.required).toBe(false);
    }
    expect(CATEGORY_SEED_TEMPLATES.find(item=>item.key==='car')!.fields.map(field=>field.key)).not.toContain('minimum_order');
  });
  it('validates representative sale and rental scenarios without leaking hidden values',()=>{
    const car=CATEGORY_SEED_TEMPLATES.find(item=>item.key==='car')!;
    const fresh=validateCategoryValues(car.fields,{make:'تويوتا',model:'كامري',year:2026,condition:'جديد',odometer_km:15},{listingType:'sale'});
    expect(fresh).not.toHaveProperty('odometer_km');
    const lifting=CATEGORY_SEED_TEMPLATES.find(item=>item.key==='lifting')!;
    const base={equipment_kind:'رافعة شوكية',manufacturer:'تويوتا',model:'8FG',year:2022,condition:'مستعمل',power_source:'غاز',lift_height_m:4};
    expect(validateCategoryValues(lifting.fields,{...base,operator_included:true},{listingType:'sale'})).not.toHaveProperty('operator_included');
    expect(validateCategoryValues(lifting.fields,{...base,operator_included:true,transport_included:false,minimum_rental_period:1},{listingType:'rent'})).toMatchObject({operator_included:true,transport_included:false});
  });
  it('uses reusable conditions for used vehicles and rental equipment',()=>{
    const car=CATEGORY_SEED_TEMPLATES.find(t=>t.key==='car')!;
    expect(car.fields.find(f=>f.key==='odometer_km')).toMatchObject({dependsOn:'condition',dependencyOperator:'in',dependencyValue:['مستعمل','مجدد']});
    const lifting=CATEGORY_SEED_TEMPLATES.find(t=>t.key==='lifting')!;
    expect(lifting.fields.find(f=>f.key==='operator_included')).toMatchObject({dependsOn:'listing_type',dependencyValue:'rent'});
    expect(lifting.fields.map(f=>f.key)).toEqual(expect.arrayContaining(['power_source','capacity_t','lift_height_m','mast_stages','boom_length_m','platform_capacity_kg']));
  });
  it('does not duplicate property rental price and period inside attributes',()=>{
    for(const template of CATEGORY_SEED_TEMPLATES.filter(t=>t.kind==='property')){
      expect(template.fields.map(f=>f.key)).not.toEqual(expect.arrayContaining(['rent_amount','rent_period']));
      expect(template.listingPolicy.types.map(t=>t.key)).toEqual(expect.arrayContaining(['sale','rent','wanted','wanted_rent']));
    }
  });
  it('gives every subcategory its own precise field definition', () => {
    const fingerprints = CATEGORY_SEED_TEMPLATES.map(template => JSON.stringify(template.fields.map(field => ({
      key: field.key,
      label: field.label,
      type: field.type,
      options: field.options,
      required: field.required,
    }))));
    expect(new Set(fingerprints).size).toBe(CATEGORY_SEED_TEMPLATES.length);
  });
  it('never offers used/new or sale-price fields for jobs, livestock, feed or plants', () => {
    for (const template of CATEGORY_SEED_TEMPLATES.filter(t => ['jobs', 'livestock', 'plants'].includes(t.kind))) {
      expect(template.goodsEnabled).toBe(false);
      expect(template.fields.some(f => f.key === 'condition')).toBe(false);
      if (template.kind === 'jobs') expect(template.priceEnabled).toBe(false);
    }
  });
  it('includes deeper land, villa and car attributes instead of a generic product form', () => {
    const keys = (key: string) => CATEGORY_SEED_TEMPLATES.find(t => t.key === key)!.fields.map(f => f.key);
    expect(keys('land')).toEqual(expect.arrayContaining(['land_use', 'terrain', 'area_m2', 'north_boundary', 'south_boundary', 'east_boundary', 'west_boundary']));
    expect(keys('villa')).toEqual(expect.arrayContaining(['rooms', 'bathrooms', 'floors', 'finish']));
    expect(keys('car')).toEqual(expect.arrayContaining(['make', 'model', 'year', 'odometer_km', 'specification', 'accident_history']));
    expect(CATEGORY_SEED_TEMPLATES.find(t => t.key === 'apartment')!.fields.filter(f => f.required).map(f => f.key))
      .toEqual(expect.arrayContaining(['area_m2', 'rooms', 'bathrooms', 'floor_number']));
    expect(CATEGORY_SEED_TEMPLATES.find(t => t.key === 'commercial_property')!.fields.map(f => f.key))
      .toEqual(expect.arrayContaining(['property_use', 'frontage_m', 'ceiling_height_m', 'loading_access']));
  });
});
