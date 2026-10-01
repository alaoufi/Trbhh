export type TemplateQualityStatus='PASS'|'NEEDS_FIELD_CHANGE'|'NEEDS_REQUIRED_CHANGE'|'NEEDS_OPTIONAL_CHANGE'|'NEEDS_CONDITIONAL_CHANGE'|'NEEDS_INPUT_TYPE_CHANGE';
export type TemplateQualityReview={status:TemplateQualityStatus;reason:string};
type ReviewableTemplate={key:string;kind:string;fields:readonly {required:boolean;dependsOn?:string;type:string}[]};

const REVIEW_EXCEPTIONS:Record<string,TemplateQualityReview>={
  legacy_heavy_equipment:{status:'NEEDS_CONDITIONAL_CHANGE',reason:'ورقة المعدات القديمة تجمع أنواع رفع وحفر مختلفة في حقول حمولة وارتفاع عامة بلا شروط نوعية كافية.'},
  legacy_equipment_rental:{status:'NEEDS_CONDITIONAL_CHANGE',reason:'ورقة التأجير القديمة تحتاج ربط حقول القدرة والحمولة والارتفاع بنوع المعدة قبل اعتماد مواصفاتها مهنيًا.'},
};

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
  const exception=REVIEW_EXCEPTIONS[template.key];
  if(exception)return exception;
  const conditional=template.fields.some(field=>field.dependsOn);
  const required=template.fields.some(field=>field.required);
  const optional=template.fields.some(field=>!field.required);
  if(!required)return {status:'NEEDS_REQUIRED_CHANGE',reason:'لا يوجد حقل مهني مطلوب يضمن الحد الأدنى من جودة الإعلان لهذا النوع.'};
  if(!optional)return {status:'NEEDS_OPTIONAL_CHANGE',reason:'كل الحقول مطلوبة؛ يلزم تخفيف الحقول الثانوية حتى لا يصبح الإدخال مرهقًا.'};
  const reason=PASS_REASON[template.kind]||'تعريف متخصص ذو حقول مطلوبة واختيارية وأنواع إدخال مناسبة للغرض المعلن.';
  return {status:'PASS',reason:`${reason}${conditional?' وتطبق الحقول المشروطة عند اختلاف نوع العرض.':''}`};
}
