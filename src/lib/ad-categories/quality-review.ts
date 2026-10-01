export type TemplateQualityStatus='PASS'|'NEEDS_FIELD_CHANGE'|'NEEDS_REQUIRED_CHANGE'|'NEEDS_OPTIONAL_CHANGE'|'NEEDS_CONDITIONAL_CHANGE'|'NEEDS_INPUT_TYPE_CHANGE';
export type TemplateQualityReview={status:TemplateQualityStatus;reason:string};
type ReviewableField={key:string;required:boolean;dependsOn?:string;dependencyValue?:unknown;type:string;unit?:string;min?:number;max?:number};
type ReviewableTemplate={key:string;kind:string;fields:readonly ReviewableField[]};

const PASS_REASON:Record<string,string>={
  property:'حقول المساحة والاستخدام والبناء والخدمات مفصولة عن التسعير ومناسبة لقرار العقار.',
  goods:'الهوية والحالة والمواصفات والتوريد مفصولة، مع حقول مطلوبة واختيارية مناسبة لقرار شراء السلعة.',
  jobs:'حقول الوظيفة والعقد ومكان العمل والمتطلبات تفصل العرض عن الباحث عن عمل بشروط واضحة.',
  service:'نطاق الخدمة والتغطية والمواد والمدة منفصل عن التسعير ومناسب لطلب أو تقديم الخدمة.',
  livestock:'النوع والسلالة والعدد والعمر والصحة وأساس البيع تغطي قرار شراء المواشي دون حقول سلع مضللة.',
  plants:'الصنف والكمية ووحدة التوريد وخصائص الزراعة تغطي قرار الشراء والتوريد الزراعي.',
};

/** سجل مراجعة مهني قابل لإعادة التشغيل؛ الاستثناءات تبقى ظاهرة حتى إصلاحها واختبارها. */
export function templateQualityReview(template:ReviewableTemplate):TemplateQualityReview{
  if(template.key==='legacy_heavy_equipment'||template.key==='legacy_equipment_rental'){
    const selector=template.key==='legacy_heavy_equipment'?'legacy_equipment_kind':'rental_equipment_kind';
    const expected=[
      ['crane_capacity_t','طن','رافعة'],['forklift_capacity_t','طن','رافعة شوكية'],
      ['telehandler_capacity_t','طن','مناولة تلسكوبية'],['platform_capacity_kg','كجم',['رافعة مقصية','رافعة أشخاص']],
      ['work_height_m','متر',['رافعة مقصية','رافعة أشخاص']],['generator_power_kva','ك.ف.أ','مولد'],
    ] as const;
    const complete=expected.every(([key,unit,value])=>{
      const field=template.fields.find(item=>item.key===key);
      return field?.required===true&&field.dependsOn===selector&&field.unit===unit&&field.min!==undefined&&field.max!==undefined
        &&JSON.stringify(field.dependencyValue)===JSON.stringify(value);
    })&&!template.fields.some(field=>field.key==='capacity_t');
    if(!complete)return {status:'NEEDS_CONDITIONAL_CHANGE',reason:'حقول السعة والارتفاع والطاقة العامة لم تُفصل بعد حسب نوع المعدة مع حدود ووحدات إلزامية.'};
  }
  const conditional=template.fields.some(field=>field.dependsOn);
  const required=template.fields.some(field=>field.required);
  const optional=template.fields.some(field=>!field.required);
  if(!required)return {status:'NEEDS_REQUIRED_CHANGE',reason:'لا يوجد حقل مهني مطلوب يضمن الحد الأدنى من جودة الإعلان لهذا النوع.'};
  if(!optional)return {status:'NEEDS_OPTIONAL_CHANGE',reason:'كل الحقول مطلوبة؛ يلزم تخفيف الحقول الثانوية حتى لا يصبح الإدخال مرهقًا.'};
  const reason=PASS_REASON[template.kind]||'تعريف متخصص ذو حقول مطلوبة واختيارية وأنواع إدخال مناسبة للغرض المعلن.';
  return {status:'PASS',reason:`${reason}${conditional?' وتطبق الحقول المشروطة عند اختلاف نوع العرض.':''}`};
}
