import { describe, expect, it } from 'vitest';
import { CATEGORY_SEED_TEMPLATES, categorySeedDefinition, findCategorySeedTemplate } from '@/lib/ad-categories/seed-templates';
import { fieldApplies, validateCategoryValues, validateDefinition } from '@/lib/ad-categories/validation';
import {validateListingPolicy} from '@/lib/ad-categories/listing-policy';

const LEGACY_ACTIVE_SUBCATEGORIES = [
  ['الصحة واللياقة', 'اجهزة طبية'],
  ['نقليات سيارات معدات', 'سيارات'],
  ['ملابس وعطورات', 'ملابس رجالية'],
  ['الخدمات العامة والتعقيب', 'تعقيب مراجعات'],
  ['المزارع و منتجاتها', 'خضار وفواكه'],
  ['الكترونيات', 'جوالات'],
  ['المشاتل ومستلزماتها', 'شتلات'],
  ['المشاتل ومستلزماتها', 'ادوات الحدائق'],
  ['الأسر المنتجة', 'اطعمة ومأكولات'],
  ['ملابس وعطورات', 'ملابس اطفال'],
  ['نقليات سيارات معدات', 'معدات'],
  ['المواشي والحيوانات ومستلزماتها', 'ضأن'],
  ['اثاث مفروشات ديكورات', 'مفروشات'],
  ['المزارع و منتجاتها', 'اعلاف'],
  ['مشاغل نسائية وتجميل', 'مشاغل نسائية'],
  ['اجهزة كهربائية', 'مكيفات وثلاجات'],
  ['برمجة وتصميم', 'برمجه'],
  ['دعاية واعلان', 'رسم وتصميم'],
  ['المواشي والحيوانات ومستلزماتها', 'ابل'],
  ['الصحة واللياقة', 'مستشفيات وعيادات'],
  ['الكترونيات', 'تلفزيونات'],
  ['الكترونيات', 'العاب الكترونية'],
  ['ملابس وعطورات', 'ملابس نسائية'],
  ['ملابس وعطورات', 'اكسسوارات'],
  ['الخدمات العامة والتعقيب', 'محاماة'],
  ['الكترونيات', 'كمبيوتر ولابتوب'],
  ['الأسر المنتجة', 'عصائر ومشروبات'],
  ['الكترونيات', 'تابلت'],
  ['اثاث مفروشات ديكورات', 'ديكورات'],
  ['المواشي والحيوانات ومستلزماتها', 'ماعز'],
  ['ملابس وعطورات', 'عطورات'],
  ['المواشي والحيوانات ومستلزماتها', 'خيول ومستلزماتها'],
  ['المواشي والحيوانات ومستلزماتها', 'طيور'],
  ['نقليات سيارات معدات', 'تأجير'],
  ['الصحة واللياقة', 'رياضة ولياقة'],
  ['دعاية واعلان', 'حملات اعلانية'],
  ['الكترونيات', 'صيانة اجهزة'],
  ['برمجة وتصميم', 'تصميم'],
  ['مشاغل نسائية وتجميل', 'ادوات تجميل'],
  ['مقاولات مواد بناء', 'ادوات بناء'],
  ['ملابس وعطورات', 'ادوات تجميل'],
  ['الصحة واللياقة', 'مراكز اللياقة والتدريب'],
  ['اجهزة كهربائية', 'اجهزة مطبخ'],
  ['دعاية واعلان', 'اعلانات'],
  ['ملابس وعطورات', 'احذية وشنط'],
  ['مقاولات مواد بناء', 'بلاط سيراميك رخام'],
  ['مشاغل نسائية وتجميل', 'عيادات التجميل'],
  ['الصحة واللياقة', 'بصريات نظارات عدسات'],
  ['الكترونيات', 'سماعات وساعات'],
  ['الأسر المنتجة', 'مشغولات ومنسوجات'],
  ['اجهزة كهربائية', 'مواطير ومولدات'],
  ['ملابس وعطورات', 'ملابس داخلية'],
  ['المواشي والحيوانات ومستلزماتها', 'حيوانات اليفة'],
  ['دعاية واعلان', 'خطاط'],
  ['دعاية واعلان', 'تصميم واخراج'],
] as const;
describe('editable specialist subcategory seed templates', () => {
  it('covers every active legacy database subcategory explicitly', () => {
    const pairs = new Set(CATEGORY_SEED_TEMPLATES.map(template => `${template.categoryName}\u0000${template.name}`));
    expect(LEGACY_ACTIVE_SUBCATEGORIES).toHaveLength(55);
    for (const [categoryName, subcategoryName] of LEGACY_ACTIVE_SUBCATEGORIES) {
      expect(pairs.has(`${categoryName}\u0000${subcategoryName}`), `${categoryName} / ${subcategoryName}`).toBe(true);
    }
    expect(CATEGORY_SEED_TEMPLATES.length).toBeGreaterThanOrEqual(85);
  });
  it('resolves an exact built-in definition without requiring a database seed row', () => {
    const template = findCategorySeedTemplate('الكترونيات', 'جوالات');
    expect(template?.key).toBe('legacy_phones');
    expect(categorySeedDefinition(template!)).toMatchObject({version: 1, kind: 'goods', goodsEnabled: true});
    expect(findCategorySeedTemplate('الكترونيات', 'قسم غير معروف')).toBeUndefined();
  });
  it('has unique keys and valid domain-specific definitions for each requested group', () => {
    expect(new Set(CATEGORY_SEED_TEMPLATES.map(t => t.key)).size).toBe(CATEGORY_SEED_TEMPLATES.length);
    expect(CATEGORY_SEED_TEMPLATES.length).toBeGreaterThanOrEqual(24);
    for (const template of CATEGORY_SEED_TEMPLATES) {
      expect(() => validateDefinition(template.fields), template.key).not.toThrow();
      expect(template.fields.length, template.key).toBeGreaterThanOrEqual(6);
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
