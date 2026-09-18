import { getProfile } from './category-fields.ts';
export type Target = {category:string;subcategory:string};
export type Classified = Target & {review:boolean;source:'existing'|'auto'|'manual'|'fallback'};
export type Classifiable = {id?:string;title:string;category?:string;subcategory?:string;classificationReview?:boolean};
export const CLASSIFICATION_KEY='classifications-v1';
export const FALLBACK: Classified={category:'أخرى',subcategory:'أخرى',review:true,source:'fallback'};
const rules: [RegExp,string,string][]=[
  [/قطع غيار|كمبروسر|رديتر/,'سيارات','قطع غيار'],
  [/سيارة|سياره|سيارات|دفع رباعي/,'سيارات','سيارات'],
  [/دراجة نارية|دباب/,'سيارات','دراجات نارية'],
  [/شقة|شقه/,'عقارات','شقق'],[/فيلا|فله|فيلا|فلل/,'عقارات','فلل ومنازل'],
  [/أرض|ارض/,'عقارات','أراضٍ'],
  [/حفار|معدات حفر|شيول|بلدوزر|سيزر لفت|سيزر ليفت|سيزرلفت|سيزرات لفت|رافعة مقصية|رافعات مقصية|بوم لفت|بوم ليفت|Scissor Lift|Boom Lift/,'معدات وآليات','معدات ثقيلة'],
  [/فوركلفت|رافعة شوكية|رافعات شوكية|رفعات شوكية|forklift/,'معدات وآليات','رافعات شوكية'],
  [/لابتوب|كمبيوتر/,'إلكترونيات','كمبيوتر ولابتوب'],
  [/كاميرا/,'إلكترونيات','كاميرات'],[/جوال|ايفون|آيفون/,'إلكترونيات','جوالات'],
  [/كنبة|كنبه|كنب|سرير/,'منزل وأثاث','أثاث منزلي'],
  [/كرسي مكتب|أثاث مكتب|اثاث مكتب/,'منزل وأثاث','أثاث مكتبي'],
  [/دراجة للمدينة|دراجة هوائية|دراجه هوائيه/,'أخرى','رياضة وهوايات'],
  [/شتلات|شتلة|شتله/,'مواشي وزراعة','شتلات ونباتات'],
  [/أعلاف|اعلاف|علف/,'مواشي وزراعة','أعلاف'],
  [/دوام كامل/,'وظائف','دوام كامل'],[/دوام جزئي/,'وظائف','دوام جزئي'],
];
export function validTarget(value: unknown): value is Target {
  if(!value || typeof value!=='object') return false;
  const v=value as Target;
  return typeof v.category==='string' && typeof v.subcategory==='string' && Boolean(getProfile(v.category,v.subcategory));
}
export function classify(ad:Classifiable):Classified {
  if(validTarget(ad)) return {category:ad.category!,subcategory:ad.subcategory!,review:ad.classificationReview===true || (ad.category==='أخرى' && ad.subcategory==='أخرى'),source:'existing'};
  // Use only the title; incidental words in descriptions must not silently move ads.
  const matches=rules.filter(([pattern])=>new RegExp('(?:^|[^\\p{L}\\p{N}])(?:'+pattern.source+')(?=$|[^\\p{L}\\p{N}])','iu').test(ad.title));
  const targets=[...new Map(matches.map(([,category,subcategory])=>[category+'/'+subcategory,{category,subcategory}])).values()];
  return targets.length===1 ? {...targets[0],review:false,source:'auto'} : {...FALLBACK};
}
export function assign<T extends Classifiable & {id:string;details?:unknown;classificationArchive?:unknown[]}>(ads:T[],ids:string[],target:Target):T[] {
  if(!validTarget(target)) throw new Error('اختر قسماً وفرعاً صالحين.');
  const selected=new Set(ids);
  return ads.map(ad=>{
    if(!selected.has(ad.id)) return ad;
    const changed=ad.category!==target.category || ad.subcategory!==target.subcategory;
    return {...ad,...target,classificationReview:target.category==='أخرى' && target.subcategory==='أخرى',
      ...(changed && ad.details ? {details:{},classificationArchive:[...(ad.classificationArchive || []),{category:ad.category,subcategory:ad.subcategory,details:ad.details}]} : {})};
  });
}
