import {describe,expect,it} from 'vitest';
import {CATEGORY_SEED_TEMPLATES} from '@/lib/ad-categories/seed-templates';
import {buildPublicCategoryTaxonomy,CLASSIFIED_TAXONOMY_GROUPS,templateTaxonomyGroup} from '@/lib/ad-categories/taxonomy';
import type {CategoryOption,SubcategoryOption} from '@/lib/ad-categories/contracts';

const category=(id:number,name:string):CategoryOption=>({id,name,active:true,order:id});
const sub=(id:number,categoryId:number,name:string,templateKey?:string):SubcategoryOption=>({
  id,categoryId,name,templateKey,active:true,order:id,version:1,kind:'goods',priceEnabled:true,goodsEnabled:true,fields:[],
});

describe('public classified taxonomy',()=>{
  it('assigns every built-in leaf template to one stable public group',()=>{
    expect(new Set(CATEGORY_SEED_TEMPLATES.map(item=>item.key)).size).toBe(CATEGORY_SEED_TEMPLATES.length);
    for(const template of CATEGORY_SEED_TEMPLATES){
      const groupKey=templateTaxonomyGroup(template.key);
      expect(groupKey,template.key).toBeTruthy();
      expect(CLASSIFIED_TAXONOMY_GROUPS.some(group=>group.key===groupKey),template.key).toBe(true);
    }
  });

  it('merges overlapping parent categories without changing persisted ids',()=>{
    const result=buildPublicCategoryTaxonomy(
      [category(10,'نقليات ومعدات ثقيلة'),category(20,'نقليات سيارات معدات')],
      [sub(101,10,'معدات حفر وتحميل','earthmoving'),sub(201,20,'معدات','legacy_heavy_equipment')],
    );
    expect(result.groups).toEqual([expect.objectContaining({key:'vehicles-equipment',categoryIds:[10,20]})]);
    expect(result.subcategories.map(item=>[item.id,item.categoryId,item.groupKey])).toEqual([
      [101,10,'vehicles-equipment'],[201,20,'vehicles-equipment'],
    ]);
  });

  it('offers one canonical leaf for exact legacy duplicates and keeps their ids searchable',()=>{
    const result=buildPublicCategoryTaxonomy(
      [category(1,'سيارات ومستلزماتها'),category(2,'نقليات سيارات معدات')],
      [sub(11,1,'سيارات','car'),sub(22,2,'سيارات','legacy_vehicles')],
    );
    expect(result.subcategories).toHaveLength(1);
    expect(result.subcategories[0]).toEqual(expect.objectContaining({id:11,categoryId:1,sourceSubcategoryIds:[11,22]}));
  });

  it('keeps the legacy leaf when its canonical replacement is unavailable',()=>{
    const result=buildPublicCategoryTaxonomy([category(2,'نقليات سيارات معدات')],[sub(22,2,'سيارات','legacy_vehicles')]);
    expect(result.subcategories).toEqual([expect.objectContaining({id:22,sourceSubcategoryIds:[22]})]);
  });

  it('keeps administrator-created definitions in an isolated stable fallback group',()=>{
    const result=buildPublicCategoryTaxonomy([category(77,'قسم مخصص')],[sub(88,77,'فرع مخصص')]);
    expect(result.groups).toEqual([expect.objectContaining({key:'category-77',name:'قسم مخصص',categoryIds:[77]})]);
    expect(result.subcategories[0]).toEqual(expect.objectContaining({groupKey:'category-77',sourceSubcategoryIds:[88]}));
  });
});
