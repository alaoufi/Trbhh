import type {CategoryValues} from './validation';

export type PublicCategoryTrustReason='service_in_goods_leaf'|'lifting_kind_conflict';
export type PublicCategoryTrust={trusted:true}|{trusted:false;reason:PublicCategoryTrustReason};

function normalized(value:string){
  return value.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/\s+/g,' ').trim().toLowerCase();
}

const includesAny=(value:string,needles:readonly string[])=>needles.some(needle=>value.includes(needle));

/**
 * Conservative public-display guard only. It never changes an ad classification.
 * A conflict suppresses structured specifications until an editor reviews the raw legacy data.
 */
export function publicCategoryFieldTrust(input:{templateKey?:string;title:string;values:CategoryValues}):PublicCategoryTrust{
  const title=normalized(input.title),templateKey=input.templateKey||'';
  if(['sanitary','legacy_building_tools'].includes(templateKey)
    &&includesAny(title,['مقاول','مقاولات','تركيب شبوك','تركيب شبك','اعمال نخيل','تنسيق حدائق','صيانه'])){
    return {trusted:false,reason:'service_in_goods_leaf'};
  }
  if(templateKey==='lifting'){
    const selected=normalized(String(input.values.equipment_kind||''));
    const expected=includesAny(title,['سيزر لفت','سيزرلفت','رافعة مقصيه','منصه مقصيه'])?'رافعة مقصية'
      :includesAny(title,['رافعة شوكي','فوركلفت','فورك لفت'])?'رافعة شوكية'
        :includesAny(title,['تلسكوبي','تلسكوبيه','تلي هاندلر'])?'مناولة تلسكوبية':'';
    if(expected&&selected!==normalized(expected))return {trusted:false,reason:'lifting_kind_conflict'};
  }
  return {trusted:true};
}
