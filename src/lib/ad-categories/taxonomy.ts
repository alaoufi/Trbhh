import type {CategoryGroupOption,CategoryOption,SubcategoryOption} from './contracts';

export const CLASSIFIED_TAXONOMY_GROUPS = [
  {key:'real-estate',name:'عقارات',order:10},
  {key:'vehicles-equipment',name:'سيارات ونقليات ومعدات',order:20},
  {key:'jobs-business',name:'وظائف وأعمال',order:30},
  {key:'agriculture',name:'زراعة ومشاتل وأعلاف',order:40},
  {key:'livestock',name:'مواشي وحيوانات ومستلزماتها',order:50},
  {key:'home-kitchen',name:'أوانٍ وأجهزة منزلية',order:60},
  {key:'furniture-decor',name:'أثاث وديكور',order:70},
  {key:'construction',name:'بناء ومقاولات',order:80},
  {key:'electronics',name:'إلكترونيات',order:90},
  {key:'apparel-beauty',name:'ملابس وعطور وتجميل',order:100},
  {key:'health-fitness',name:'صحة ولياقة',order:110},
  {key:'home-business-food',name:'أسر منتجة وأغذية',order:120},
  {key:'professional-services',name:'خدمات عامة ومهنية',order:130},
  {key:'digital-marketing',name:'تقنية وتصميم وإعلان',order:140},
] as const;

const TEMPLATE_GROUPS:Record<string,string>={
  land:'real-estate',villa:'real-estate',apartment:'real-estate',commercial_property:'real-estate',
  car:'vehicles-equipment',car_parts:'vehicles-equipment',earthmoving:'vehicles-equipment',lifting:'vehicles-equipment',commercial_vehicles:'vehicles-equipment',transport_service:'vehicles-equipment',legacy_vehicles:'vehicles-equipment',legacy_heavy_equipment:'vehicles-equipment',legacy_equipment_rental:'vehicles-equipment',legacy_motors_generators:'vehicles-equipment',
  job:'jobs-business',
  plants:'agriculture',feed:'agriculture',irrigation:'agriculture',garden_service:'agriculture',legacy_produce:'agriculture',legacy_nursery_plants:'agriculture',legacy_garden_tools:'agriculture',legacy_farm_feed:'agriculture',
  sheep_goats:'livestock',camels_cattle:'livestock',poultry:'livestock',livestock_equipment:'livestock',legacy_sheep:'livestock',legacy_camels:'livestock',legacy_goats:'livestock',legacy_horses:'livestock',legacy_birds:'livestock',legacy_pets:'livestock',
  cookware:'home-kitchen',tableware:'home-kitchen',storage:'home-kitchen',legacy_cooling:'home-kitchen',legacy_kitchen_appliances:'home-kitchen',
  rugs:'furniture-decor',curtains:'furniture-decor',wall_decor:'furniture-decor',decor_service:'furniture-decor',legacy_furniture:'furniture-decor',legacy_decor:'furniture-decor',
  tiles:'construction',building_materials:'construction',sanitary:'construction',contracting:'construction',legacy_building_tools:'construction',legacy_tiles:'construction',
  legacy_phones:'electronics',legacy_televisions:'electronics',legacy_gaming:'electronics',legacy_computers:'electronics',legacy_tablets:'electronics',legacy_device_repair:'electronics',legacy_audio_wearables:'electronics',
  legacy_menswear:'apparel-beauty',legacy_childrenswear:'apparel-beauty',legacy_womenswear:'apparel-beauty',legacy_accessories:'apparel-beauty',legacy_perfumes:'apparel-beauty',legacy_shoes_bags:'apparel-beauty',legacy_underwear:'apparel-beauty',legacy_womens_salon:'apparel-beauty',legacy_beauty_tools_salon:'apparel-beauty',legacy_beauty_tools_apparel:'apparel-beauty',legacy_beauty_clinics:'apparel-beauty',
  legacy_medical_devices:'health-fitness',legacy_hospitals:'health-fitness',legacy_fitness:'health-fitness',legacy_training_centers:'health-fitness',legacy_optics:'health-fitness',
  legacy_home_food:'home-business-food',legacy_drinks:'home-business-food',legacy_handmade_textiles:'home-business-food',
  legacy_government_services:'professional-services',legacy_legal:'professional-services',
  legacy_programming:'digital-marketing',legacy_graphic_design:'digital-marketing',legacy_ad_campaigns:'digital-marketing',legacy_design:'digital-marketing',legacy_ads:'digital-marketing',legacy_calligraphy:'digital-marketing',legacy_art_direction:'digital-marketing',
};

/** Exact old leaves are hidden for new ads only when the modern replacement exists. */
const EXACT_LEAF_ALIASES:Record<string,string>={
  legacy_vehicles:'car',
  legacy_nursery_plants:'plants',
  legacy_farm_feed:'feed',
  legacy_tiles:'tiles',
};

export function templateTaxonomyGroup(templateKey:string){return TEMPLATE_GROUPS[templateKey];}

export function buildPublicCategoryTaxonomy(categories:readonly CategoryOption[],subcategories:readonly SubcategoryOption[]):{groups:CategoryGroupOption[];subcategories:SubcategoryOption[]}{
  const activeCategories=new Map(categories.filter(item=>item.active).map(item=>[item.id,item]));
  const eligible=subcategories.filter(item=>item.active&&item.version>0&&activeCategories.has(item.categoryId));
  const presentTemplateKeys=new Set(eligible.map(item=>item.templateKey).filter((key):key is string=>Boolean(key)));
  const aliasesByCanonical=new Map<string,number[]>();
  for(const item of eligible){
    const canonical=item.templateKey&&EXACT_LEAF_ALIASES[item.templateKey];
    if(canonical&&presentTemplateKeys.has(canonical)) aliasesByCanonical.set(canonical,[...(aliasesByCanonical.get(canonical)||[]),item.id]);
  }
  const publicSubcategories=eligible.flatMap(item=>{
    const aliasTarget=item.templateKey&&EXACT_LEAF_ALIASES[item.templateKey];
    if(aliasTarget&&presentTemplateKeys.has(aliasTarget)) return [];
    const groupKey=(item.templateKey&&templateTaxonomyGroup(item.templateKey))||`category-${item.categoryId}`;
    return [{...item,groupKey,sourceSubcategoryIds:[item.id,...(item.templateKey?aliasesByCanonical.get(item.templateKey)||[]:[])]}];
  });
  const groupByKey=new Map<string,CategoryGroupOption>();
  const knownGroups=new Map<string,(typeof CLASSIFIED_TAXONOMY_GROUPS)[number]>(CLASSIFIED_TAXONOMY_GROUPS.map(item=>[item.key,item]));
  for(const item of publicSubcategories){
    const category=activeCategories.get(item.categoryId)!;
    const known=knownGroups.get(item.groupKey!);
    const current=groupByKey.get(item.groupKey!);
    const categoryIds=new Set([...(current?.categoryIds||[]),item.categoryId]);
    groupByKey.set(item.groupKey!,{
      key:item.groupKey!,name:known?.name||category.name,order:known?.order??1000+category.order,categoryIds:[...categoryIds],
    });
  }
  const groups=[...groupByKey.values()].sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'ar'));
  const rank=new Map(groups.map((group,index)=>[group.key,index]));
  publicSubcategories.sort((a,b)=>(rank.get(a.groupKey!)??999)-(rank.get(b.groupKey!)??999)||a.order-b.order||a.name.localeCompare(b.name,'ar'));
  return {groups,subcategories:publicSubcategories};
}
