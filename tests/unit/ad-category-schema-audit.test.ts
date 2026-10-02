import {describe,expect,it} from 'vitest';
import {existsSync} from 'node:fs';
import {CATEGORY_SEED_TEMPLATES} from '@/lib/ad-categories/seed-templates';
import {buildPublicCategoryTaxonomy,CLASSIFIED_TAXONOMY_GROUPS} from '@/lib/ad-categories/taxonomy';
import {fieldApplies,fieldIsRequired,validateCategoryValues,validateDefinition,type CategoryField} from '@/lib/ad-categories/validation';
import type {CategoryOption,SubcategoryOption} from '@/lib/ad-categories/contracts';

const template=(key:string)=>CATEGORY_SEED_TEMPLATES.find(item=>item.key===key)!;
const field=(templateKey:string,fieldKey:string)=>template(templateKey).fields.find(item=>item.key===fieldKey)!;
const category=(id:number,name:string):CategoryOption=>({id,name,active:true,order:id});
const sub=(id:number,categoryId:number,name:string,templateKey:string):SubcategoryOption=>({
  id,categoryId,name,templateKey,active:true,order:id,version:1,kind:'goods',priceEnabled:true,goodsEnabled:true,fields:[],
});

function dependencyIssues(fields:CategoryField[],listingTypes:string[]){
  const byKey=new Map(fields.map(item=>[item.key,item]));
  return fields.flatMap(item=>{
    if(!item.dependsOn)return [];
    const expected=Array.isArray(item.dependencyValue)?item.dependencyValue:[item.dependencyValue];
    const allowed=item.dependsOn==='listing_type'?listingTypes:byKey.get(item.dependsOn)?.options;
    if(!allowed)return [`${item.key}:missing_dependency:${item.dependsOn}`];
    return expected.filter(value=>!allowed.includes(String(value))).map(value=>`${item.key}:unreachable:${String(value)}`);
  });
}

describe('category schema regression audit',()=>{
  it('locks the reviewed canonical taxonomy totals',()=>{
    const parents=[...new Set(CATEGORY_SEED_TEMPLATES.map(item=>item.categoryName))];
    const publicTaxonomy=buildPublicCategoryTaxonomy(
      parents.map((name,index)=>category(index+1,name)),
      CATEGORY_SEED_TEMPLATES.map((item,index)=>sub(index+1,parents.indexOf(item.categoryName)+1,item.name,item.key)),
    );
    expect(CLASSIFIED_TAXONOMY_GROUPS).toHaveLength(14);
    expect(parents).toHaveLength(24);
    expect(CATEGORY_SEED_TEMPLATES).toHaveLength(85);
    expect(publicTaxonomy.subcategories).toHaveLength(81);
  });
  it('keeps one exact generated manifest as the staging runtime source',async()=>{
    const source=await import('node:fs').then(fs=>fs.readFileSync('scripts/release/seed-staging-categories.cjs','utf8'));
    expect(source).toContain("/app/scripts/release/category-seeds.json");
    expect(source).not.toContain("/app/database/category-seeds.json");
    expect(existsSync('database/category-seeds.json')).toBe(false);
  });

  it('provides leaf ids for Main filtering when one persisted parent spans multiple groups',()=>{
    const result=buildPublicCategoryTaxonomy(
      [category(10,'اجهزة كهربائية')],
      [sub(101,10,'مكيفات وثلاجات','legacy_cooling'),sub(202,10,'مواطير ومولدات','legacy_motors_generators')],
    );
    expect(result.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({key:'home-kitchen',subcategoryIds:[101]}),
      expect.objectContaining({key:'vehicles-equipment',subcategoryIds:[202]}),
    ]));
  });

  it('has unique public leaf labels after canonical aliases collapse',()=>{
    const parents=[...new Set(CATEGORY_SEED_TEMPLATES.map(item=>item.categoryName))];
    const publicTaxonomy=buildPublicCategoryTaxonomy(
      parents.map((name,index)=>category(index+1,name)),
      CATEGORY_SEED_TEMPLATES.map((item,index)=>sub(index+1,parents.indexOf(item.categoryName)+1,item.name,item.key)),
    );
    const seen=new Map<string,string>();
    for(const item of publicTaxonomy.subcategories){
      const group=item.groupKey!;
      const normalized=item.name.normalize('NFKC').replace(/[أإآٱ]/g,'ا').replace(/\s+/g,' ').trim();
      const path=`${group}\0${normalized}`;
      expect(seen.get(path),`${item.templateKey} duplicates ${seen.get(path)}`).toBeUndefined();
      seen.set(path,item.templateKey!);
    }
  });

  it('keeps every dependency reachable from its controlling options',()=>{
    for(const item of CATEGORY_SEED_TEMPLATES){
      expect(dependencyIssues(item.fields,item.listingPolicy.types.map(type=>type.key)),item.key).toEqual([]);
    }
  });

  it.each([
    ['رافعة','crane_capacity_t'],['رافعة شوكية','forklift_capacity_t'],['مناولة تلسكوبية','telehandler_capacity_t'],
    ['رافعة مقصية','platform_capacity_kg'],['رافعة أشخاص','platform_capacity_kg'],
  ])('requires the defining lifting capacity for %s', (equipmentKind,fieldKey)=>{
    const definition=template('lifting');
    const target=field('lifting',fieldKey);
    const context={listingType:'sale',values:{equipment_kind:equipmentKind}};
    expect(fieldApplies(target,context)).toBe(true);
    expect(fieldIsRequired(target,context)).toBe(true);
    const validBase=Object.fromEntries(definition.fields.filter(item=>fieldIsRequired(item,context)&&item.key!==fieldKey).map(item=>[
      item.key,item.type==='select'?item.options[0]:item.type==='number'?(item.min??1):'قيمة',
    ]));
    expect(()=>validateCategoryValues(definition.fields,{...validBase,equipment_kind:equipmentKind},context)).toThrow();
  });

  it('separates fitness product fields from service fields',()=>{
    const productContext={listingType:'sale',values:{fitness_item_kind:'جهاز رياضي'}};
    const serviceContext={listingType:'service',values:{fitness_service_kind:'تدريب شخصي'}};
    for(const key of ['brand','condition','size_or_capacity','quantity']){
      expect(fieldApplies(field('legacy_fitness',key),productContext),key).toBe(true);
      expect(fieldApplies(field('legacy_fitness',key),serviceContext),key).toBe(false);
    }
    expect(fieldApplies(field('legacy_fitness','fitness_service_kind'),serviceContext)).toBe(true);
    expect(fieldIsRequired(field('legacy_fitness','fitness_service_kind'),serviceContext)).toBe(true);
  });

  it('shows horse biology only for a horse and item condition only for equipment',()=>{
    for(const key of ['breed','sex','age_months','health_notes']){
      expect(fieldApplies(field('legacy_horses',key),{values:{horse_listing_kind:'خيل'}}),key).toBe(true);
      expect(fieldApplies(field('legacy_horses',key),{values:{horse_listing_kind:'سرج'}}),key).toBe(false);
    }
    expect(fieldApplies(field('legacy_horses','item_state'),{values:{horse_listing_kind:'خيل'}})).toBe(false);
    expect(fieldApplies(field('legacy_horses','item_state'),{values:{horse_listing_kind:'سرج'}})).toBe(true);
  });

  it('rejects zero and fractions for required whole-unit counters',()=>{
    const counters=[
      ['villa','rooms'],['villa','bathrooms'],['apartment','rooms'],['apartment','bathrooms'],
      ['plants','quantity'],['sheep_goats','head_count'],['camels_cattle','head_count'],['poultry','head_count'],
      ['tableware','piece_count'],['legacy_nursery_plants','quantity'],['legacy_sheep','head_count'],
      ['legacy_camels','head_count'],['legacy_goats','head_count'],['legacy_birds','head_count'],
    ] as const;
    for(const [templateKey,fieldKey] of counters){
      const target=field(templateKey,fieldKey);
      expect(target.min,`${templateKey}/${fieldKey}`).toBeGreaterThanOrEqual(1);
      expect(target.step,`${templateKey}/${fieldKey}`).toBe(1);
    }
  });

  it('reports all 85 built-in leaf schemas as structurally and semantically passing',()=>{
    const passed=CATEGORY_SEED_TEMPLATES.filter(item=>{
      try{
        const fields=validateDefinition(item.fields);
        return dependencyIssues(fields,item.listingPolicy.types.map(type=>type.key)).length===0;
      }catch{return false;}
    });
    expect(CATEGORY_SEED_TEMPLATES).toHaveLength(85);
    expect(passed).toHaveLength(85);
  });
});
