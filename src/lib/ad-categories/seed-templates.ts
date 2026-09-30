import type { CategoryField, CategoryFieldType } from './validation';
import type {ListingPolicy,ListingTypeKey,PricingModeKey} from './listing-policy';

export type CategorySeedTemplate = {
  key: string; categoryName: string; name: string;
  kind: 'goods' | 'property' | 'jobs' | 'service' | 'livestock' | 'plants';
  priceEnabled: boolean; goodsEnabled: boolean; fields: CategoryField[]; listingPolicy:ListingPolicy;
};
type SeedField = Omit<CategoryField, 'order'>;
const f = (key: string, label: string, type: CategoryFieldType = 'text', options: string[] = [], group = 'المواصفات', unit?: string): SeedField =>
  ({ key, label, type, options, group, unit, required: false, visible: true, ...(type === 'number' ? { min: 0 } : {}) });
const n = (key: string, label: string, unit?: string, group?: string) => f(key, label, 'number', [], group, unit);
const s = (key: string, label: string, options: string[], group?: string) => f(key, label, 'select', options, group);
const m = (key: string, label: string, options: string[], group?: string) => f(key, label, 'multiselect', options, group);
const yes = (key: string, label: string, group?: string) => f(key, label, 'boolean', [], group);
const when=(dependsOn:string,dependencyValue:string|string[])=>({dependsOn,dependencyOperator:Array.isArray(dependencyValue)?'in' as const:'equals' as const,dependencyValue});
const condition = s('condition', 'الحالة', ['جديد', 'مستعمل', 'مجدد']);
const dimensions = [n('length_cm', 'الطول', 'سم'), n('width_cm', 'العرض', 'سم'), n('height_cm', 'الارتفاع', 'سم')];
const delivery = [yes('delivery_available', 'التوصيل متاح', 'التوريد'), n('lead_time_days', 'مدة التجهيز', 'يوم', 'التوريد')];
const b2bSupply = [
  s('sale_channel','نمط البيع',['تجزئة','جملة','تجزئة وجملة'],'التجارة والتوريد'),
  n('minimum_order','الحد الأدنى للطلب',undefined,'التجارة والتوريد'),
  yes('recurring_supply','إمكانية التوريد الدوري','التجارة والتوريد'),
  f('supply_area','منطقة التوريد','text',[],'التجارة والتوريد'),
];
const boundaries = ['north', 'south', 'east', 'west'].map((direction, index) =>
  f(`${direction}_boundary`, `الحد ${['الشمالي', 'الجنوبي', 'الشرقي', 'الغربي'][index]} وطوله`, 'text', [], 'الحدود والواجهات'));
const land = [
  { ...n('area_m2', 'مساحة الأرض', 'م²', 'المساحة والاستخدام'), required: true, min: 0.01 },
  s('land_use', 'الاستخدام', ['سكني', 'تجاري', 'سكني تجاري', 'زراعي', 'صناعي', 'استثماري', 'غير محدد'], 'المساحة والاستخدام'),
  s('terrain', 'طبيعة الأرض', ['مستوية', 'منحدرة', 'جبلية', 'تحتاج تسوية', 'غير معروف'], 'المساحة والاستخدام'),
  ...boundaries, m('facades', 'الواجهات', ['شمال', 'جنوب', 'شرق', 'غرب'], 'الحدود والواجهات'),
  n('street_width_m', 'عرض الشارع', 'متر', 'الحدود والواجهات'),
  s('ownership_document', 'وثيقة الملكية', ['صك إلكتروني', 'صك ورقي', 'عقد انتفاع', 'أخرى'], 'الخدمات والملكية'),
  f('plan_number', 'رقم المخطط', 'text', [], 'الخدمات والملكية'), f('plot_number', 'رقم القطعة', 'text', [], 'الخدمات والملكية'),
  m('utilities', 'الخدمات المتاحة', ['كهرباء', 'ماء', 'صرف صحي', 'ألياف بصرية', 'شارع مسفلت'], 'الخدمات والملكية'),
];
const propertyRooms = [
  n('built_area_m2', 'مساحة البناء', 'م²', 'تفاصيل البناء'), n('rooms', 'الغرف', 'غرفة', 'تفاصيل البناء'),
  n('bathrooms', 'دورات المياه', 'دورة', 'تفاصيل البناء'), n('floors', 'عدد الأدوار', 'دور', 'تفاصيل البناء'),
  n('building_age_years', 'عمر البناء', 'سنة', 'تفاصيل البناء'),
  s('finish', 'التشطيب', ['عظم', 'نصف تشطيب', 'اقتصادي', 'جيد', 'فاخر', 'فاخر جدًا', 'يحتاج تجديد'], 'تفاصيل البناء'),
  s('furnished', 'التأثيث', ['مفروش', 'غير مفروش', 'مفروش جزئيًا'], 'التجهيزات'),
  m('amenities', 'المرافق', ['مصعد', 'مواقف', 'حديقة', 'مسبح', 'غرفة سائق', 'غرفة عاملة', 'مستودع', 'مدخل مستقل'], 'التجهيزات'),
];
const vehicle = [
  { ...f('make', 'الشركة المصنعة'), required: true }, { ...f('model', 'الطراز'), required: true },
  { ...n('year', 'سنة الصنع', 'ميلادي'), min: 1900, max: 2100 }, condition,
  { ...n('odometer_km', 'المسافة المقطوعة', 'كم'), ...when('condition',['مستعمل','مجدد']) }, s('specification', 'المواصفات الإقليمية', ['سعودي', 'خليجي', 'أمريكي', 'أوروبي', 'ياباني', 'كوري', 'أخرى']),
  s('transmission', 'ناقل الحركة', ['أوتوماتيك', 'يدوي', 'CVT']), s('fuel', 'الوقود', ['بنزين', 'ديزل', 'هجين', 'كهرباء']),
  s('drive', 'نظام الدفع', ['أمامي', 'خلفي', 'رباعي', 'كلي']),
  f('color', 'اللون الخارجي'), n('engine_l', 'سعة المحرك', 'لتر'), n('cylinders', 'الأسطوانات'),
  s('accident_history', 'الحوادث بحسب إفادة المعلن', ['بدون حوادث معلنة', 'حادث سابق', 'غير معروف'], 'الحالة والسجل'),
  s('paint', 'الدهان', ['وكالة بحسب المعلن', 'رش جزئي', 'رش كامل', 'غير معروف'], 'الحالة والسجل'),
  yes('service_history', 'سجل صيانة متاح', 'الحالة والسجل'), yes('inspection_available', 'تقرير فحص متاح', 'الحالة والسجل'),
];
const animal = [f('breed', 'السلالة'), s('sex', 'الجنس', ['ذكر', 'أنثى', 'مجموعة مختلطة']),
  n('head_count', 'عدد الرؤوس', 'رأس'), n('age_months', 'العمر التقريبي', 'شهر'), n('average_weight_kg', 'متوسط الوزن', 'كجم/رأس'),
  s('sale_basis', 'أساس البيع', ['بالرأس', 'بالمجموعة', 'بالوزن الحي']),
  s('purpose', 'الغرض', ['تربية', 'تسمين', 'إنتاج حليب', 'إنتاج بيض']), f('health_notes', 'الحالة الصحية بحسب إفادة المعلن', 'textarea'), ...delivery];
const home = [f('brand', 'العلامة التجارية'), condition,
  m('material', 'المادة', ['ستانلس', 'ألمنيوم', 'حديد زهر', 'زجاج', 'سيراميك', 'بلاستيك', 'خشب', 'أخرى']),
  n('piece_count', 'عدد القطع', 'قطعة'), ...dimensions, ...delivery];
const decor = [condition, m('material', 'المادة', ['صوف', 'قطن', 'ألياف صناعية', 'خشب', 'معدن', 'زجاج', 'أخرى']),
  f('color', 'اللون'), s('style', 'الطراز', ['عصري', 'كلاسيكي', 'تراثي', 'بسيط', 'أخرى']), ...dimensions,
  s('placement', 'مكان الاستخدام', ['داخلي', 'خارجي', 'كلاهما']), ...delivery];
const equipment = [f('manufacturer', 'المصنع'), f('model', 'الطراز'), { ...n('year', 'سنة الصنع'), min: 1900, max: 2100 }, condition,
  n('operating_hours', 'ساعات التشغيل', 'ساعة'), n('engine_power_kw', 'قدرة المحرك', 'كيلوواط'),
  n('operating_weight_t', 'الوزن التشغيلي', 'طن'), s('power_source', 'مصدر الطاقة', ['ديزل','بنزين','غاز','كهرباء','هجين','أخرى']),
  s('drive','نظام الحركة',['دفع ثنائي','دفع رباعي','مجنزرة','أخرى'],'المواصفات الفنية'),f('origin_country','بلد المنشأ','text',[],'المواصفات الفنية'),
  {...yes('operator_included', 'يشمل المشغل','الإيجار'),...when('listing_type','rent')},
  {...yes('transport_included','يشمل نقل المعدة','الإيجار'),...when('listing_type','rent')},
  {...n('minimum_rental_period','الحد الأدنى لمدة الإيجار',undefined,'الإيجار'),...when('listing_type','rent')}, ...delivery];

const pricing=(key:ListingTypeKey,label:string,modes:PricingModeKey[])=>({key,label,pricing:modes});
const policy=(...types:ReturnType<typeof pricing>[]):ListingPolicy=>({types});
const sale=()=>pricing('sale','للبيع',['fixed','bidding']);
const wanted=()=>pricing('wanted','مطلوب شراء',['budget_optional']);
const rent=(modes:PricingModeKey[]=['hour','day','week','month','year','project'])=>pricing('rent','للإيجار',modes);
const wantedRent=()=>pricing('wanted_rent','مطلوب للإيجار',['budget_optional']);
const service=(modes:PricingModeKey[]=['fixed','hour','day','project','quote'])=>pricing('service','تقديم خدمة',modes);
const serviceRequest=()=>pricing('service_request','طلب خدمة',['budget_optional']);
const TEMPLATE_LISTING_POLICIES:Record<string,ListingPolicy>={
  land:policy(sale(),rent(['month','year','project']),wanted(),wantedRent()),villa:policy(sale(),rent(['day','month','year']),wanted(),wantedRent()),
  apartment:policy(sale(),rent(['day','month','year']),wanted(),wantedRent()),commercial_property:policy(sale(),rent(['month','year','project']),wanted(),wantedRent()),
  car:policy(sale(),wanted(),pricing('transfer','للتنازل',['fixed','bidding','quote'])),car_parts:policy(sale(),wanted()),
  job:policy(pricing('job','وظيفة',['salary_optional']),pricing('job_seeker','باحث عن عمل',['salary_optional'])),
  plants:policy(sale(),wanted()),feed:policy(sale(),wanted()),irrigation:policy(sale(),wanted()),garden_service:policy(service(),serviceRequest()),
  sheep_goats:policy(sale(),wanted()),camels_cattle:policy(sale(),wanted()),poultry:policy(sale(),wanted()),livestock_equipment:policy(sale(),wanted()),
  cookware:policy(sale(),wanted()),tableware:policy(sale(),wanted()),storage:policy(sale(),wanted()),rugs:policy(sale(),wanted()),curtains:policy(sale(),wanted()),wall_decor:policy(sale(),wanted()),decor_service:policy(service(),serviceRequest()),
  tiles:policy(sale(),wanted()),building_materials:policy(sale(),wanted()),sanitary:policy(sale(),wanted()),contracting:policy(service(['fixed','day','project','quote']),serviceRequest()),
  earthmoving:policy(sale(),rent(),wanted(),wantedRent()),lifting:policy(sale(),rent(),wanted(),wantedRent()),commercial_vehicles:policy(sale(),rent(['day','week','month','year','project']),wanted(),wantedRent()),
  transport_service:policy(service(['fixed','hour','day','month','trip','project','quote']),serviceRequest()),
};
const SEARCHABLE_KEYS=new Set(['manufacturer','brand','make','model','part_number','compatible_make','compatible_model','breed','job_title','employer','specialty']);
const FILTERABLE_KEYS=new Set(['condition','year','fuel','power_source','equipment_kind','truck_type','property_use','land_use','rooms','bathrooms','area_m2','capacity_t','lift_height_m','operating_hours','service_kind','contract','workplace','species','feed_kind','material_kind','sale_channel','supply_unit','brand','make','manufacturer','model']);
const CARD_KEYS=new Set(['condition','year','make','manufacturer','model','area_m2','rooms','capacity_t','lift_height_m','equipment_kind','service_kind','head_count']);
const COMPARABLE_KEYS=new Set([...FILTERABLE_KEYS,'engine_power_kw','operating_weight_t','odometer_km','building_age_years','quantity','minimum_order']);
function template(
  key: string,
  categoryName: string,
  name: string,
  kind: CategorySeedTemplate['kind'],
  fields: SeedField[],
  requiredKeys: string[],
  policyOverride?: ListingPolicy,
): CategorySeedTemplate {
  const required = new Set(requiredKeys);
  const listingPolicy=policyOverride??TEMPLATE_LISTING_POLICIES[key];if(!listingPolicy)throw new Error(`missing_listing_policy:${key}`);
  return { key, categoryName, name, kind, priceEnabled: kind !== 'jobs', goodsEnabled: kind === 'goods', listingPolicy,
    fields: fields.map((field, order) => {
      const primaryFacet=order===0&&['select','radio'].includes(field.type);
      return { ...field, required: field.required || required.has(field.key), order,
        searchable:field.searchable??SEARCHABLE_KEYS.has(field.key),
        filterable:field.filterable??(FILTERABLE_KEYS.has(field.key)||primaryFacet),
        comparable:field.comparable??(COMPARABLE_KEYS.has(field.key)||primaryFacet),
        showInCard:field.showInCard??(CARD_KEYS.has(field.key)||primaryFacet),showInDetails:field.showInDetails??true };
    }) };
}

/** Optional administrator-applied seeds, NOT startup migrations or automatic ad classification.
 * Source observations and Saudi adaptations: docs/CATEGORY_FIELD_RESEARCH.md.
 * Labels/options/required/visibility/groups remain editable after applying.
 */
const CORE_CATEGORY_SEED_TEMPLATES: CategorySeedTemplate[] = [
  template('land', 'عقارات', 'أراضٍ', 'property', land, ['area_m2', 'land_use']),
  template('villa', 'عقارات', 'فلل', 'property', [...land, ...propertyRooms], ['area_m2', 'land_use', 'built_area_m2', 'rooms', 'bathrooms']),
  template('apartment', 'عقارات', 'شقق وأدوار', 'property', [
    n('area_m2', 'المساحة', 'م²', 'تفاصيل العقار'), n('floor_number', 'الدور', undefined, 'تفاصيل العقار'),
    n('rooms', 'الغرف', 'غرفة', 'تفاصيل العقار'), n('bathrooms', 'دورات المياه', 'دورة', 'تفاصيل العقار'),
    n('building_age_years', 'عمر البناء', 'سنة', 'تفاصيل العقار'),
    s('finish', 'التشطيب', ['عظم', 'نصف تشطيب', 'اقتصادي', 'جيد', 'فاخر', 'فاخر جدًا', 'يحتاج تجديد'], 'تفاصيل العقار'),
    s('furnished', 'التأثيث', ['مفروش', 'غير مفروش', 'مفروش جزئيًا'], 'التجهيزات'),
    m('amenities', 'المرافق', ['مصعد', 'مواقف', 'سطح', 'مدخل مستقل', 'غرفة سائق', 'غرفة عاملة', 'مستودع'], 'التجهيزات'),
    s('ownership_document', 'وثيقة الملكية', ['صك إلكتروني', 'صك ورقي', 'عقد انتفاع', 'أخرى'], 'الملكية والعرض'),
  ], ['area_m2', 'floor_number', 'rooms', 'bathrooms']),
  template('commercial_property', 'عقارات', 'محلات ومكاتب ومستودعات', 'property', [
    n('area_m2', 'المساحة', 'م²', 'المساحة والاستخدام'),
    s('property_use', 'النشاط المناسب', ['تجاري', 'مكاتب', 'تخزين', 'صناعي'], 'المساحة والاستخدام'),
    n('frontage_m', 'طول الواجهة', 'متر', 'المساحة والاستخدام'), n('ceiling_height_m', 'ارتفاع السقف', 'متر', 'المساحة والاستخدام'),
    n('floor_number', 'الدور', undefined, 'التجهيزات'), n('bathrooms', 'دورات المياه', 'دورة', 'التجهيزات'),
    yes('loading_access', 'مدخل تحميل وتنزيل', 'التجهيزات'), yes('parking_available', 'مواقف متاحة', 'التجهيزات'),
    s('finish', 'التشطيب', ['عظم', 'نصف تشطيب', 'اقتصادي', 'جيد', 'فاخر', 'يحتاج تجديد'], 'التجهيزات'),
    n('electric_power_amp', 'قدرة الكهرباء', 'أمبير', 'الخدمات'), m('utilities', 'الخدمات المتاحة', ['كهرباء', 'ماء', 'صرف صحي', 'ألياف بصرية'], 'الخدمات'),
  ], ['area_m2', 'property_use']),
  template('car', 'سيارات ومستلزماتها', 'سيارات', 'goods', [...vehicle, s('body_type', 'شكل الهيكل', ['سيدان', 'دفع رباعي', 'هاتشباك', 'كوبيه', 'بيك أب', 'فان', 'أخرى']), n('seats', 'المقاعد')], ['make', 'model', 'year', 'condition']),
  template('car_parts', 'سيارات ومستلزماتها', 'قطع غيار وإكسسوارات', 'goods', [f('part_kind', 'نوع القطعة'), f('part_number', 'رقم القطعة'), f('compatible_make', 'الشركة المتوافقة'), f('compatible_model', 'الطراز المتوافق'), f('compatible_years', 'السنوات المتوافقة'), condition, s('origin', 'تصنيف القطعة', ['أصلية', 'بديلة', 'تجارية', 'غير معروف']), ...delivery], ['part_kind', 'compatible_make', 'condition']),
  template('job', 'وظائف', 'فرص عمل', 'jobs', [
    { ...f('job_title', 'المسمى الوظيفي', 'text', [], 'الوظيفة'), required: true }, {...f('employer', 'جهة العمل', 'text', [], 'الوظيفة'),...when('listing_type','job')},
    s('contract', 'نوع العقد', ['دوام كامل', 'دوام جزئي', 'مؤقت', 'تدريب', 'عمل حر'], 'الوظيفة'), s('workplace', 'نمط العمل', ['حضوري', 'عن بُعد', 'هجين'], 'الوظيفة'),
    n('salary_min', 'الراتب من', 'ر.س', 'الأجر والمزايا'), n('salary_max', 'الراتب إلى', 'ر.س', 'الأجر والمزايا'),
    s('salary_period', 'دورية الأجر', ['شهري', 'أسبوعي', 'يومي', 'بالساعة', 'للمشروع'], 'الأجر والمزايا'),
    {...m('benefits', 'المزايا', ['تأمين طبي', 'سكن', 'نقل', 'عمولات', 'تدريب'], 'الأجر والمزايا'),...when('listing_type','job')},
    n('experience_years', 'سنوات الخبرة', 'سنة', 'المتطلبات'), s('education', 'المؤهل', ['لا يشترط', 'ثانوي', 'دبلوم', 'بكالوريوس', 'دراسات عليا'], 'المتطلبات'),
    f('skills', 'المهارات المطلوبة', 'textarea', [], 'المتطلبات'), f('languages', 'اللغات المطلوبة', 'text', [], 'المتطلبات'),
    m('shift', 'الدوام', ['صباحي', 'مسائي', 'ليلي', 'مرن', 'مناوبات'], 'التقديم'), {...f('deadline', 'آخر موعد للتقديم', 'date', [], 'التقديم'),...when('listing_type','job')},
  ], ['job_title', 'employer', 'contract', 'workplace']),
  template('plants', 'زراعة ومشاتل وأعلاف', 'شتلات ونباتات', 'plants', [s('plant_kind', 'نوع النبات', ['شجرة مثمرة', 'شجرة ظل', 'زينة', 'شتلة خضار']), f('variety', 'الصنف'), n('plant_height_cm', 'ارتفاع النبات الحالي', 'سم'), n('pot_volume_l', 'حجم الأصيص', 'لتر'), s('sun_exposure', 'الإضاءة', ['شمس مباشرة', 'ظل جزئي', 'ظل']), n('quantity', 'العدد المتاح', 'شتلة'), ...b2bSupply,...delivery], ['plant_kind', 'variety', 'quantity']),
  template('feed', 'زراعة ومشاتل وأعلاف', 'أعلاف', 'plants', [s('feed_kind', 'نوع العلف', ['برسيم', 'تبن', 'شعير', 'علف مركب', 'أخرى']), m('target_animals', 'الحيوانات المستهدفة', ['أغنام', 'ماعز', 'إبل', 'أبقار', 'خيل', 'دواجن']), s('feed_form', 'شكل العلف', ['بالات', 'حبوب', 'مجروش', 'حبيبات']), n('package_weight_kg', 'وزن العبوة أو البالة', 'كجم'), { ...n('protein_pct', 'نسبة البروتين من بطاقة المنتج', '%'), max: 100 }, f('expiry_date', 'تاريخ الانتهاء إن وجد', 'date'), s('supply_unit', 'وحدة التوريد', ['كيس', 'بالة', 'كجم', 'طن']), ...b2bSupply,...delivery], ['feed_kind', 'feed_form', 'package_weight_kg', 'supply_unit']),
  template('irrigation', 'زراعة ومشاتل وأعلاف', 'مستلزمات ري', 'goods', [s('irrigation_kind', 'نوع المستلزم', ['تنقيط', 'رشاش', 'خرطوم', 'مضخة']), f('brand', 'العلامة'), condition, n('diameter_mm', 'القطر', 'مم'), n('length_m', 'الطول', 'متر'), n('flow_l_min', 'التدفق', 'لتر/دقيقة'), n('power_kw', 'القدرة', 'كيلوواط'), ...delivery], ['irrigation_kind', 'condition']),
  template('garden_service', 'زراعة ومشاتل وأعلاف', 'خدمات زراعة وحدائق', 'service', [m('service_scope', 'الأعمال', ['زراعة', 'تقليم', 'صيانة', 'تركيب ري', 'تنسيق حدائق']), n('service_area_m2', 'مساحة العمل', 'م²'), s('materials_included', 'المواد', ['شامل المواد', 'عمل فقط', 'حسب الاتفاق']), s('frequency', 'التكرار', ['مرة واحدة', 'أسبوعي', 'شهري']), f('service_coverage', 'نطاق الخدمة'), n('lead_time_days', 'مدة التنفيذ', 'يوم'), f('experience', 'الخبرة')], ['service_scope', 'materials_included', 'service_coverage']),
  template('sheep_goats', 'مواشي ومستلزماتها', 'أغنام وماعز', 'livestock', [s('species', 'النوع', ['غنم', 'ماعز']), ...animal, s('reproduction_status', 'الحالة الإنتاجية', ['فطيم', 'حامل', 'مرضعة', 'فحل', 'غير محدد'], 'تفاصيل القطيع')], ['species', 'breed', 'head_count', 'sale_basis']),
  template('camels_cattle', 'مواشي ومستلزماتها', 'إبل وأبقار', 'livestock', [s('species', 'النوع', ['إبل', 'أبقار']), ...animal, f('identification_tag', 'رقم الوسم أو التعريف', 'text', [], 'التعريف'), s('production_status', 'الحالة الإنتاجية', ['حلّاب', 'للتسمين', 'للتربية', 'فحل', 'غير محدد'], 'التعريف')], ['species', 'breed', 'head_count', 'sale_basis']),
  template('poultry', 'مواشي ومستلزماتها', 'دواجن', 'livestock', [s('species', 'النوع', ['دجاج', 'بط', 'سمان', 'أخرى']), n('age_days', 'العمر', 'يوم'), ...animal.filter(field => field.key !== 'age_months'), s('vaccination_status', 'حالة التحصين', ['محصنة', 'غير محصنة', 'غير معروف'], 'الصحة')], ['species', 'head_count', 'age_days', 'sale_basis']),
  template('livestock_equipment', 'مواشي ومستلزماتها', 'معالف وسقايات وتجهيزات', 'goods', [s('equipment_kind', 'نوع التجهيز', ['معلف', 'سقاية', 'حظيرة متنقلة', 'سياج']), s('equipment_material', 'المادة', ['معدن مجلفن', 'ستانلس', 'بلاستيك', 'أخرى']), n('capacity_value', 'السعة'), s('capacity_unit', 'وحدة السعة', ['لتر', 'كجم', 'رأس']), condition, ...dimensions, ...delivery], ['equipment_kind', 'equipment_material', 'condition']),
  template('cookware', 'أوانٍ منزلية', 'أواني طبخ', 'goods', [s('item_kind', 'نوع الإناء', ['قدر', 'مقلاة', 'صينية', 'طقم']), ...home, n('capacity_l', 'السعة', 'لتر'), n('diameter_cm', 'القطر', 'سم'), m('compatibility', 'الاستخدام المتوافق حسب المنتج', ['غاز', 'كهرباء', 'حث', 'فرن', 'ميكروويف']), m('care_features', 'العناية', ['غسالة أطباق', 'غسل يدوي', 'قابل للتكديس'])], ['item_kind', 'condition', 'material']),
  template('tableware', 'أوانٍ منزلية', 'تقديم ومائدة', 'goods', [f('item_kind', 'نوع الطقم'), ...home, n('persons', 'عدد الأشخاص'), m('care_features', 'العناية', ['غسالة أطباق', 'غسل يدوي'])], ['item_kind', 'condition', 'piece_count']),
  template('storage', 'أوانٍ منزلية', 'حفظ وتنظيم', 'goods', [f('item_kind', 'نوع الحافظة أو المنظم'), ...home, n('capacity_l', 'السعة', 'لتر'), yes('airtight', 'محكم الإغلاق')], ['item_kind', 'condition', 'material']),
  template('rugs', 'ديكورات منزلية', 'سجاد', 'goods', [...decor, s('shape', 'الشكل', ['مستطيل', 'مربع', 'دائري', 'بيضاوي']), s('weave', 'نوع النسيج', ['يدوي', 'آلي', 'مسطح', 'وبر', 'غير معروف'])], ['condition', 'material', 'shape']),
  template('curtains', 'ديكورات منزلية', 'ستائر', 'goods', [...decor, s('opacity', 'نفاذية الضوء', ['شفافة', 'ترشيح ضوء', 'تعتيم']), s('mounting', 'طريقة التركيب', ['حلقات', 'سكة', 'رول', 'أخرى'])], ['condition', 'material', 'opacity']),
  template('wall_decor', 'ديكورات منزلية', 'مرايا ولوحات', 'goods', [s('item_kind', 'نوع القطعة', ['مرآة', 'لوحة', 'إطار', 'زينة حائط']), ...decor], ['item_kind', 'condition', 'material']),
  template('decor_service', 'ديكورات منزلية', 'تفصيل وتركيب ديكور', 'service', [m('service_scope', 'الخدمات', ['قياس', 'تفصيل', 'تركيب', 'فك ونقل', 'تصميم']), f('specialty', 'التخصص'), n('work_area_m2', 'المساحة', 'م²'), s('materials_included', 'المواد', ['شامل المواد', 'عمل فقط', 'حسب الاتفاق']), n('lead_time_days', 'مدة التنفيذ', 'يوم'), f('service_coverage', 'نطاق التغطية'), f('warranty', 'ضمان العمل إن وجد')], ['service_scope', 'specialty', 'materials_included']),
  template('tiles', 'مواد بناء ومقاولات', 'بلاط وأرضيات', 'goods', [s('material_kind', 'نوع البلاط', ['سيراميك', 'بورسلين', 'رخام', 'جرانيت', 'أخرى']), f('brand', 'المصنع'), m('application', 'الاستخدام', ['أرضيات', 'جدران', 'واجهات', 'داخلي', 'خارجي']), n('length_mm', 'الطول', 'مم'), n('width_mm', 'العرض', 'مم'), n('thickness_mm', 'السماكة', 'مم'), s('finish', 'التشطيب', ['مطفي', 'لامع', 'محبب']), n('quantity_m2', 'الكمية', 'م²'), ...b2bSupply,...delivery], ['material_kind', 'application', 'quantity_m2']),
  template('building_materials', 'مواد بناء ومقاولات', 'مواد بناء أساسية', 'goods', [s('material_kind', 'نوع المادة', ['أسمنت', 'بلوك', 'طوب', 'حديد', 'رمل', 'حصى', 'أخرى']), f('brand', 'المصنع'), f('grade_spec', 'الدرجة أو المواصفة من المصنع'), n('quantity', 'الكمية'), s('supply_unit', 'وحدة التوريد', ['م²', 'م³', 'كيس', 'طن', 'قطعة', 'متر طولي']), f('dimensions_spec', 'الأبعاد أو المقاس'), ...b2bSupply,...delivery], ['material_kind', 'quantity', 'supply_unit']),
  template('sanitary', 'مواد بناء ومقاولات', 'أدوات صحية', 'goods', [s('item_kind', 'نوع الأداة', ['مغسلة', 'خلاط', 'مرحاض', 'دش', 'أخرى']), ...home, f('connection_size', 'مقاس التوصيل'), f('installation', 'طريقة التركيب')], ['item_kind', 'condition']),
  template('contracting', 'مواد بناء ومقاولات', 'مقاولات وتشطيبات', 'service', [m('trade', 'التخصص', ['عظم', 'تشطيب', 'بلاط', 'دهان', 'سباكة', 'كهرباء', 'عزل']), n('work_area_m2', 'مساحة الأعمال', 'م²'), s('contract_scope', 'نطاق التعاقد', ['عمل فقط', 'مواد وعمل', 'توريد فقط']), n('duration_days', 'مدة التنفيذ', 'يوم'), f('service_coverage', 'نطاق التغطية'), f('warranty', 'ضمان العمل')], ['trade', 'contract_scope']),
  template('earthmoving', 'نقليات ومعدات ثقيلة', 'معدات حفر وتحميل', 'goods', [s('equipment_kind', 'نوع المعدة', ['حفار', 'شيول', 'بلدوزر', 'أخرى']), ...equipment, m('attachments', 'الملحقات', ['باكت', 'مطرقة', 'شوك', 'أخرى']), {...n('bucket_m3', 'سعة الباكت', 'م³'),...when('equipment_kind',['حفار','شيول'])},{...n('blade_width_m','عرض الشفرة','متر'),...when('equipment_kind','بلدوزر')}], ['equipment_kind', 'manufacturer', 'model', 'year', 'condition','power_source']),
  template('lifting', 'نقليات ومعدات ثقيلة', 'رافعات ومناولة', 'goods', [s('equipment_kind', 'نوع المعدة', ['رافعة', 'رافعة شوكية', 'مناولة تلسكوبية','رافعة مقصية','رافعة أشخاص']), ...equipment,
    {...n('capacity_t', 'حمولة الرفع المقننة', 'طن'),...when('equipment_kind',['رافعة','رافعة شوكية','مناولة تلسكوبية'])},
    n('lift_height_m', 'ارتفاع الرفع أو العمل', 'متر'),
    {...n('mast_stages','عدد مراحل السارية','مرحلة'),...when('equipment_kind','رافعة شوكية')},
    {...n('boom_length_m','طول الذراع','متر'),...when('equipment_kind',['رافعة','مناولة تلسكوبية'])},
    {...n('platform_capacity_kg','حمولة المنصة','كجم'),...when('equipment_kind',['رافعة مقصية','رافعة أشخاص'])}], ['equipment_kind', 'manufacturer', 'model', 'year', 'condition','power_source','lift_height_m']),
  template('commercial_vehicles', 'نقليات ومعدات ثقيلة', 'شاحنات ومقطورات', 'goods', [...vehicle, s('truck_type', 'النوع', ['قلاب', 'سطحة', 'قاطرة', 'مقطورة', 'براد', 'صهريج', 'أخرى']), n('capacity_t', 'الحمولة', 'طن'), n('axles', 'عدد المحاور')], ['make', 'model', 'year', 'condition', 'truck_type']),
  template('transport_service', 'نقليات ومعدات ثقيلة', 'خدمات نقل وتشغيل', 'service', [s('service_kind', 'الخدمة', ['نقل بضائع', 'نقل معدات', 'نقل أثاث', 'تشغيل معدات']), f('service_route', 'مسار النقل'), n('capacity_t', 'الحمولة', 'طن'), yes('operator_included', 'يشمل المشغل'), yes('loading_included', 'يشمل التحميل والتنزيل'), f('availability', 'مواعيد التوفر')], ['service_kind', 'service_route']),
];

const goodsPolicy=policy(sale(),wanted());
const rentableGoodsPolicy=policy(sale(),rent(),wanted(),wantedRent());
const servicesPolicy=policy(service(),serviceRequest());
const apparel=[f('brand','العلامة التجارية'),condition,f('size','المقاس'),f('color','اللون'),
  m('material','الخامة',['قطن','صوف','جلد','بوليستر','مخلوط','أخرى']),n('quantity','الكمية المتاحة','قطعة'),...delivery];
const electronics=[f('brand','العلامة التجارية'),f('model','الموديل'),condition,
  f('specification','المواصفات الأساسية','textarea'),f('warranty','الضمان إن وجد'),
  m('included_accessories','الملحقات المرفقة',['الشاحن','الكرتون','الريموت','الحامل','كابلات','أخرى']),...delivery];
const appliance=[f('brand','العلامة التجارية'),f('model','الموديل'),condition,n('capacity_value','السعة'),
  s('energy_source','مصدر الطاقة',['كهرباء','غاز','ديزل','أخرى']),f('warranty','الضمان إن وجد'),...delivery];
const serviceFields=[f('service_scope','وصف نطاق الخدمة','textarea'),n('experience_years','سنوات الخبرة','سنة'),
  f('service_coverage','نطاق التغطية'),f('availability','مواعيد التوفر'),n('lead_time_days','مدة التنفيذ المتوقعة','يوم'),
  s('materials_included','المواد أو المستلزمات',['شاملة','عمل فقط','حسب الاتفاق'])];
const foodSupply=[f('brand','الاسم التجاري إن وجد'),n('quantity','الكمية المتاحة'),
  s('supply_unit','وحدة البيع',['قطعة','علبة','كرتون','كجم','لتر','طلب']),f('production_date','تاريخ الإنتاج','date'),
  f('expiry_date','تاريخ الانتهاء','date'),f('ingredients','المكونات أو مسببات الحساسية','textarea'),...b2bSupply,...delivery];
const beautyGoods=[f('brand','العلامة التجارية'),condition,f('usage','الاستخدام المناسب'),
  f('size_or_volume','الحجم أو السعة'),f('expiry_date','تاريخ الانتهاء إن وجد','date'),n('quantity','الكمية المتاحة'),...delivery];
const furniture=[s('furniture_kind','نوع القطعة',['كنب','سرير','طاولة','خزانة','كرسي','مجلس','أخرى']),condition,
  m('material','الخامة',['خشب','معدن','قماش','جلد','زجاج','أخرى']),f('color','اللون'),...dimensions,...delivery];

const LEGACY_CATEGORY_SEED_TEMPLATES:CategorySeedTemplate[]=[
  template('legacy_medical_devices','الصحة واللياقة','اجهزة طبية','goods',[
    s('medical_device_kind','نوع الجهاز',['قياس ومراقبة','تنفس','حركة وتأهيل','مختبر','مستهلك طبي','أخرى']),f('brand','العلامة'),f('model','الموديل'),condition,
    s('intended_use','الاستخدام',['منزلي','عيادة','مستشفى','مختبر']),f('regulatory_status','بيانات التسجيل أو الترخيص إن وجدت'),n('quantity','الكمية المتاحة'),...delivery,
  ],['medical_device_kind','condition'],goodsPolicy),
  template('legacy_vehicles','نقليات سيارات معدات','سيارات','goods',[s('vehicle_type','نوع المركبة',['سيدان','دفع رباعي','بيك أب','فان','شاحنة خفيفة','أخرى']),...vehicle],['vehicle_type','make','model','year','condition'],policy(sale(),wanted(),pricing('transfer','للتنازل',['fixed','bidding','quote']))),
  template('legacy_menswear','ملابس وعطورات','ملابس رجالية','goods',[s('menswear_kind','نوع الملابس',['ثوب','شماغ وغترة','جاكيت','قميص','بنطال','ملابس رياضية','أخرى']),...apparel],['menswear_kind','condition','size'],goodsPolicy),
  template('legacy_government_services','الخدمات العامة والتعقيب','تعقيب مراجعات','service',[s('transaction_kind','نوع المعاملة',['تعقيب','مراجعات حكومية','استخراج تصاريح','تجديد وثائق','خدمات أعمال','أخرى']),...serviceFields],['transaction_kind','service_scope','service_coverage'],servicesPolicy),
  template('legacy_produce','المزارع و منتجاتها','خضار وفواكه','plants',[s('produce_kind','نوع المنتج',['خضار','فواكه','تمور','أعشاب','أخرى']),f('variety','الصنف'),s('grade','الدرجة',['ممتاز','أولى','ثانية','مختلط']),f('harvest_date','تاريخ الحصاد','date'),n('quantity','الكمية المتاحة'),s('supply_unit','وحدة البيع',['كجم','صندوق','سلة','طن']),...b2bSupply,...delivery],['produce_kind','variety','quantity','supply_unit'],goodsPolicy),
  template('legacy_phones','الكترونيات','جوالات','goods',[s('phone_kind','نوع الجهاز',['هاتف ذكي','هاتف عادي','هاتف قابل للطي','أخرى']),...electronics,n('storage_gb','سعة التخزين','جيجابايت'),s('sim','شرائح الاتصال',['شريحة','شريحتان','eSIM','أخرى'])],['phone_kind','brand','model','condition','storage_gb'],goodsPolicy),
  template('legacy_nursery_plants','المشاتل ومستلزماتها','شتلات','plants',[s('nursery_plant_kind','نوع الشتلة',['مثمر','زينة','ظل','خضار','نخيل','أخرى']),f('variety','الصنف'),n('plant_height_cm','ارتفاع الشتلة','سم'),n('pot_volume_l','حجم الأصيص','لتر'),s('sun_exposure','الإضاءة',['شمس','ظل جزئي','ظل']),n('quantity','الكمية المتاحة','شتلة'),...delivery],['nursery_plant_kind','variety','quantity'],goodsPolicy),
  template('legacy_garden_tools','المشاتل ومستلزماتها','ادوات الحدائق','goods',[s('garden_tool_kind','نوع الأداة',['أداة يدوية','آلة قص','رشاش','مضخة','خرطوم وري','أصيص','أخرى']),f('brand','العلامة'),condition,s('power_source','مصدر الطاقة',['يدوي','كهرباء','بطارية','بنزين','أخرى']),f('size_spec','المقاس أو المواصفة'),n('quantity','الكمية'),...delivery],['garden_tool_kind','condition'],goodsPolicy),
  template('legacy_home_food','الأسر المنتجة','اطعمة ومأكولات','goods',[s('food_kind','نوع المنتج',['وجبات','حلويات','مخبوزات','تمور','مخللات','أخرى']),...foodSupply],['food_kind','supply_unit'],goodsPolicy),
  template('legacy_childrenswear','ملابس وعطورات','ملابس اطفال','goods',[s('childrenswear_kind','نوع الملابس',['مواليد','أطفال','مدرسي','مناسبات','رياضي','أخرى']),s('age_group','الفئة العمرية',['مواليد','1-3 سنوات','4-6 سنوات','7-12 سنة','13-16 سنة']),...apparel],['childrenswear_kind','age_group','condition','size'],goodsPolicy),
  template('legacy_heavy_equipment','نقليات سيارات معدات','معدات','goods',[s('legacy_equipment_kind','نوع المعدة',['حفار','شيول','بلدوزر','رافعة','رافعة شوكية','مولد','أخرى']),...equipment,n('capacity_t','الحمولة','طن'),n('lift_height_m','ارتفاع العمل','متر')],['legacy_equipment_kind','manufacturer','model','year','condition','power_source'],rentableGoodsPolicy),
  template('legacy_sheep','المواشي والحيوانات ومستلزماتها','ضأن','livestock',[s('sheep_kind','نوع الضأن',['نعيمي','نجدي','حري','سواكني','بربري','أخرى']),...animal],['sheep_kind','breed','head_count','sale_basis'],goodsPolicy),
  template('legacy_furniture','اثاث مفروشات ديكورات','مفروشات','goods',[...furniture,f('style','الطراز')],['furniture_kind','condition','material'],goodsPolicy),
  template('legacy_farm_feed','المزارع و منتجاتها','اعلاف','plants',[s('farm_feed_kind','نوع العلف',['برسيم','تبن','شعير','مركب','أخرى']),m('target_animals','الحيوانات المستهدفة',['أغنام','ماعز','إبل','أبقار','خيل','دواجن']),n('package_weight_kg','وزن العبوة أو البالة','كجم'),n('quantity','الكمية'),s('supply_unit','وحدة البيع',['كيس','بالة','كجم','طن']),...b2bSupply,...delivery],['farm_feed_kind','package_weight_kg','quantity','supply_unit'],goodsPolicy),
  template('legacy_womens_salon','مشاغل نسائية وتجميل','مشاغل نسائية','service',[s('salon_service_kind','نوع الخدمة',['شعر','مكياج','عناية بالبشرة','أظافر','خدمة منزلية','أخرى']),...serviceFields,s('appointment_mode','طريقة الخدمة',['في المشغل','منزلية','كلاهما'])],['salon_service_kind','service_scope','service_coverage'],servicesPolicy),
  template('legacy_cooling','اجهزة كهربائية','مكيفات وثلاجات','goods',[s('cooling_appliance_kind','نوع الجهاز',['مكيف سبليت','مكيف شباك','مكيف مركزي','ثلاجة','فريزر','برادة','أخرى']),...appliance,n('cooling_capacity','سعة التبريد','وحدة'),s('installation','التركيب',['مشمول','غير مشمول','حسب الاتفاق'])],['cooling_appliance_kind','brand','model','condition'],goodsPolicy),
  template('legacy_programming','برمجة وتصميم','برمجه','service',[s('programming_kind','نوع البرمجة',['مواقع','تطبيقات جوال','أنظمة أعمال','متاجر إلكترونية','تكامل API','أخرى']),...serviceFields,m('technology','التقنيات',['ويب','iOS','Android','قواعد بيانات','سحابة','أخرى'])],['programming_kind','service_scope'],servicesPolicy),
  template('legacy_graphic_design','دعاية واعلان','رسم وتصميم','service',[s('graphic_design_kind','نوع العمل',['شعار وهوية','رسم رقمي','مطبوعات','تصميم إعلانات','واجهات','أخرى']),...serviceFields,f('deliverables','المخرجات المطلوبة')],['graphic_design_kind','service_scope'],servicesPolicy),
  template('legacy_camels','المواشي والحيوانات ومستلزماتها','ابل','livestock',[s('camel_kind','نوع الإبل',['مجاهيم','مغاتير','حمر','صفر','وضح','أخرى']),...animal,f('identification_tag','رقم الوسم أو التعريف')],['camel_kind','breed','head_count','sale_basis'],goodsPolicy),
  template('legacy_hospitals','الصحة واللياقة','مستشفيات وعيادات','service',[s('health_facility_kind','نوع المنشأة أو الخدمة',['مستشفى','عيادة','مجمع طبي','مختبر','رعاية منزلية','أخرى']),f('specialty','التخصص'),...serviceFields,f('license_reference','بيانات الترخيص إن وجدت')],['health_facility_kind','specialty','service_scope'],servicesPolicy),
  template('legacy_televisions','الكترونيات','تلفزيونات','goods',[s('television_kind','نوع الشاشة',['LED','OLED','QLED','بروجكتر','أخرى']),...electronics,n('screen_size_in','مقاس الشاشة','بوصة'),s('resolution','الدقة',['HD','Full HD','4K','8K','أخرى'])],['television_kind','brand','model','condition','screen_size_in'],goodsPolicy),
  template('legacy_gaming','الكترونيات','العاب الكترونية','goods',[s('gaming_kind','نوع المنتج',['جهاز ألعاب','لعبة','يد تحكم','ملحق','حساب أو كود نظامي','أخرى']),...electronics,s('platform','المنصة',['PlayStation','Xbox','Nintendo','PC','جوال','أخرى'])],['gaming_kind','brand','model','condition'],goodsPolicy),
  template('legacy_womenswear','ملابس وعطورات','ملابس نسائية','goods',[s('womenswear_kind','نوع الملابس',['عباية','فستان','جلابية','طقم','ملابس رياضية','أخرى']),...apparel],['womenswear_kind','condition','size'],goodsPolicy),
  template('legacy_accessories','ملابس وعطورات','اكسسوارات','goods',[s('accessory_kind','نوع الإكسسوار',['ساعة','حقيبة','حزام','نظارة','إكسسوار شعر','مجوهرات تقليدية','أخرى']),f('brand','العلامة'),condition,m('material','الخامة',['معدن','جلد','قماش','بلاستيك','خشب','أخرى']),f('color','اللون'),n('quantity','الكمية'),...delivery],['accessory_kind','condition'],goodsPolicy),
  template('legacy_legal','الخدمات العامة والتعقيب','محاماة','service',[s('legal_service_kind','نوع الخدمة',['استشارة','صياغة عقود','قضايا','تحكيم','تأسيس شركات','أخرى']),...serviceFields,f('specialty','التخصص القانوني')],['legal_service_kind','service_scope'],servicesPolicy),
  template('legacy_computers','الكترونيات','كمبيوتر ولابتوب','goods',[s('computer_kind','نوع الجهاز',['لابتوب','مكتبي','خادم','قطعة كمبيوتر','ملحق','أخرى']),...electronics,f('processor','المعالج'),n('memory_gb','الذاكرة','جيجابايت'),n('storage_gb','التخزين','جيجابايت')],['computer_kind','brand','model','condition'],goodsPolicy),
  template('legacy_drinks','الأسر المنتجة','عصائر ومشروبات','goods',[s('drink_kind','نوع المشروب',['عصير طازج','مشروب ساخن','قهوة','شاي','شراب مركز','أخرى']),...foodSupply,s('packaging','نوع العبوة',['كوب','زجاجة','عبوة','كرتون','أخرى'])],['drink_kind','supply_unit'],goodsPolicy),
  template('legacy_tablets','الكترونيات','تابلت','goods',[s('tablet_kind','نوع الجهاز',['تابلت','قارئ إلكتروني','جهاز تعليمي','أخرى']),...electronics,n('storage_gb','سعة التخزين','جيجابايت'),s('connectivity','الاتصال',['Wi‑Fi','شريحة وWi‑Fi','أخرى'])],['tablet_kind','brand','model','condition','storage_gb'],goodsPolicy),
  template('legacy_decor','اثاث مفروشات ديكورات','ديكورات','goods',[s('decor_kind','نوع الديكور',['لوحة','مرآة','إضاءة','تحفة','ستارة','سجاد','أخرى']),...decor],['decor_kind','condition','material'],goodsPolicy),
  template('legacy_goats','المواشي والحيوانات ومستلزماتها','ماعز','livestock',[s('goat_kind','نوع الماعز',['عارضي','شامي','هولندي','قزم','أخرى']),...animal],['goat_kind','breed','head_count','sale_basis'],goodsPolicy),
  template('legacy_perfumes','ملابس وعطورات','عطورات','goods',[s('perfume_kind','نوع العطر',['عطر','دهن عود','بخور','مسك','معطر منزلي','أخرى']),f('brand','العلامة'),condition,n('volume_ml','السعة','مل'),s('concentration','التركيز',['بارفان','أو دو بارفان','أو دو تواليت','زيتي','أخرى']),n('quantity','الكمية'),...delivery],['perfume_kind','condition','volume_ml'],goodsPolicy),
  template('legacy_horses','المواشي والحيوانات ومستلزماتها','خيول ومستلزماتها','livestock',[s('horse_listing_kind','نوع المعروض',['خيل','سرج','لجام','عناية وتغذية','معدات إسطبل','أخرى']),f('breed','السلالة أو العلامة'),s('item_state','حالة المعروض',['جديد','مستعمل','لا ينطبق']),s('sex','الجنس',['ذكر','أنثى','لا ينطبق']),n('age_months','العمر','شهر'),f('health_notes','الحالة أو الملاحظات','textarea'),...delivery],['horse_listing_kind','item_state'],goodsPolicy),
  template('legacy_birds','المواشي والحيوانات ومستلزماتها','طيور','livestock',[s('bird_kind','نوع الطيور',['دواجن','حمام','طيور زينة','صقور','أخرى']),f('breed','السلالة'),s('sex','الجنس',['ذكر','أنثى','مجموعة مختلطة']),n('head_count','العدد','طائر'),n('age_months','العمر','شهر'),f('health_notes','الحالة الصحية بحسب إفادة المعلن','textarea'),...delivery],['bird_kind','breed','head_count'],goodsPolicy),
  template('legacy_equipment_rental','نقليات سيارات معدات','تأجير','service',[s('rental_equipment_kind','نوع المعدة المؤجرة',['رافعة','رافعة شوكية','حفار','شيول','مولد','شاحنة','أخرى']),f('brand','العلامة أو المصنع'),f('model','الموديل'),n('year','سنة الصنع'),n('capacity_t','الحمولة','طن'),n('work_height_m','ارتفاع العمل','متر'),yes('operator_included','يشمل المشغل'),yes('transport_included','يشمل النقل')],['rental_equipment_kind'],policy(service(['hour','day','week','month','project','quote']),serviceRequest())),
  template('legacy_fitness','الصحة واللياقة','رياضة ولياقة','goods',[s('fitness_item_kind','نوع المعروض',['جهاز رياضي','أوزان','ملابس رياضية','اشتراك','خدمة تدريب','أخرى']),f('brand','العلامة'),condition,f('size_or_capacity','المقاس أو السعة'),f('usage_notes','الاستخدام أو الحالة','textarea'),n('quantity','الكمية'),...delivery],['fitness_item_kind','condition'],policy(sale(),wanted(),service(),serviceRequest())),
  template('legacy_ad_campaigns','دعاية واعلان','حملات اعلانية','service',[s('campaign_kind','نوع الحملة',['رقمية','شبكات اجتماعية','بحث','ميدانية','إطلاق منتج','أخرى']),...serviceFields,f('target_audience','الجمهور المستهدف'),f('campaign_channels','القنوات المطلوبة')],['campaign_kind','service_scope'],servicesPolicy),
  template('legacy_device_repair','الكترونيات','صيانة اجهزة','service',[s('repair_device_kind','نوع الجهاز',['جوال','تابلت','كمبيوتر','تلفزيون','جهاز منزلي','أخرى']),...serviceFields,m('service_kind','الخدمة',['فحص','إصلاح','تركيب','برمجة','استبدال قطع'])],['repair_device_kind','service_scope'],servicesPolicy),
  template('legacy_design','برمجة وتصميم','تصميم','service',[s('digital_design_kind','نوع التصميم',['هوية بصرية','واجهات وتجربة مستخدم','مطبوعات','ثلاثي الأبعاد','موشن','أخرى']),...serviceFields,f('deliverables','المخرجات المطلوبة')],['digital_design_kind','service_scope'],servicesPolicy),
  template('legacy_beauty_tools_salon','مشاغل نسائية وتجميل','ادوات تجميل','goods',[s('salon_beauty_tool_kind','نوع الأداة',['شعر','بشرة','أظافر','تعقيم','أثاث مشغل','أخرى']),...beautyGoods],['salon_beauty_tool_kind','condition'],goodsPolicy),
  template('legacy_building_tools','مقاولات مواد بناء','ادوات بناء','goods',[s('building_tool_kind','نوع الأداة',['يدوية','كهربائية','قياس','سلامة','سقالات','أخرى']),f('brand','العلامة'),f('model','الموديل'),condition,s('power_source','مصدر الطاقة',['يدوي','كهرباء','بطارية','بنزين','هواء','أخرى']),n('quantity','الكمية'),...delivery],['building_tool_kind','condition'],goodsPolicy),
  template('legacy_beauty_tools_apparel','ملابس وعطورات','ادوات تجميل','goods',[s('personal_beauty_tool_kind','نوع أداة التجميل',['مكياج','فرش','شعر','عناية بالبشرة','أظافر','أخرى']),...beautyGoods],['personal_beauty_tool_kind','condition'],goodsPolicy),
  template('legacy_training_centers','الصحة واللياقة','مراكز اللياقة والتدريب','service',[s('training_kind','نوع التدريب',['لياقة','سباحة','فنون قتالية','تأهيل','تدريب شخصي','أخرى']),...serviceFields,s('attendance_mode','الحضور',['حضوري','عن بعد','كلاهما'])],['training_kind','service_scope','service_coverage'],servicesPolicy),
  template('legacy_kitchen_appliances','اجهزة كهربائية','اجهزة مطبخ','goods',[s('kitchen_appliance_kind','نوع الجهاز',['فرن','موقد','غسالة صحون','خلاط','قلاية','ماكينة قهوة','أخرى']),...appliance,n('capacity_l','السعة','لتر')],['kitchen_appliance_kind','brand','model','condition'],goodsPolicy),
  template('legacy_ads','دعاية واعلان','اعلانات','service',[s('advertising_service_kind','نوع الإعلان',['رقمي','لوحات خارجية','صحف ومجلات','إذاعة وتلفزيون','توزيع','أخرى']),...serviceFields,f('target_audience','الجمهور المستهدف')],['advertising_service_kind','service_scope'],servicesPolicy),
  template('legacy_shoes_bags','ملابس وعطورات','احذية وشنط','goods',[s('shoes_bags_kind','نوع المنتج',['حذاء','شنطة','محفظة','حزام','أخرى']),f('brand','العلامة'),condition,f('size','المقاس'),f('color','اللون'),m('material','الخامة',['جلد طبيعي','جلد صناعي','قماش','مطاط','أخرى']),n('quantity','الكمية'),...delivery],['shoes_bags_kind','condition','size'],goodsPolicy),
  template('legacy_tiles','مقاولات مواد بناء','بلاط سيراميك رخام','goods',[s('legacy_tile_kind','نوع المادة',['سيراميك','بورسلين','رخام','جرانيت','حجر','أخرى']),f('brand','المصنع'),m('application','الاستخدام',['أرضيات','جدران','واجهات','داخلي','خارجي']),n('length_mm','الطول','مم'),n('width_mm','العرض','مم'),n('thickness_mm','السماكة','مم'),n('quantity_m2','الكمية','م²'),...b2bSupply,...delivery],['legacy_tile_kind','application','quantity_m2'],goodsPolicy),
  template('legacy_beauty_clinics','مشاغل نسائية وتجميل','عيادات التجميل','service',[s('beauty_clinic_service_kind','نوع الخدمة',['جلدية','ليزر','أسنان تجميلي','حقن تجميلية','عناية بالبشرة','أخرى']),f('specialty','التخصص'),...serviceFields,f('license_reference','بيانات الترخيص إن وجدت')],['beauty_clinic_service_kind','specialty','service_scope'],servicesPolicy),
  template('legacy_optics','الصحة واللياقة','بصريات نظارات عدسات','goods',[s('optical_item_kind','نوع المنتج',['نظارة طبية','نظارة شمسية','عدسات لاصقة','إطار','ملحق','أخرى']),f('brand','العلامة'),condition,f('lens_spec','مواصفات العدسة أو المقاس'),f('frame_material','خامة الإطار'),n('quantity','الكمية'),...delivery],['optical_item_kind','condition'],goodsPolicy),
  template('legacy_audio_wearables','الكترونيات','سماعات وساعات','goods',[s('wearable_audio_kind','نوع المنتج',['سماعات رأس','سماعات أذن','مكبر صوت','ساعة ذكية','سوار ذكي','أخرى']),...electronics,s('connectivity','الاتصال',['Bluetooth','سلكي','Wi‑Fi','خلوي','أخرى'])],['wearable_audio_kind','brand','model','condition'],goodsPolicy),
  template('legacy_handmade_textiles','الأسر المنتجة','مشغولات ومنسوجات','goods',[s('handmade_kind','نوع المنتج',['تطريز','كروشيه','نسيج','خياطة','هدايا','أخرى']),f('material','الخامة'),f('dimensions_spec','المقاس أو الأبعاد'),s('made_to_order','التنفيذ',['جاهز','حسب الطلب','كلاهما']),n('quantity','الكمية'),...delivery],['handmade_kind','material'],goodsPolicy),
  template('legacy_motors_generators','اجهزة كهربائية','مواطير ومولدات','goods',[s('motor_generator_kind','نوع الجهاز',['مولد كهربائي','محرك كهربائي','مضخة','كمبروسر','أخرى']),...appliance,n('power_kw','القدرة','كيلوواط'),n('voltage_v','الجهد','فولت'),s('phase','الأطوار',['أحادي','ثلاثي','غير محدد'])],['motor_generator_kind','brand','model','condition','power_kw'],rentableGoodsPolicy),
  template('legacy_underwear','ملابس وعطورات','ملابس داخلية','goods',[s('underwear_kind','نوع الملابس',['رجالي','نسائي','أطفال','رياضي','أخرى']),...apparel,s('packaging','التغليف',['مفرد','طقم','عبوة'])],['underwear_kind','condition','size'],goodsPolicy),
  template('legacy_pets','المواشي والحيوانات ومستلزماتها','حيوانات اليفة','livestock',[s('pet_kind','نوع الحيوان',['قطط','كلاب','أرانب','أسماك','زواحف','أخرى']),f('breed','السلالة'),s('sex','الجنس',['ذكر','أنثى','غير محدد']),n('age_months','العمر','شهر'),s('vaccination_status','التحصين',['مكتمل بحسب المعلن','جزئي','غير محصن','غير معروف']),f('health_notes','الحالة الصحية بحسب إفادة المعلن','textarea'),...delivery],['pet_kind','breed','age_months'],goodsPolicy),
  template('legacy_calligraphy','دعاية واعلان','خطاط','service',[s('calligraphy_kind','نوع الخط أو العمل',['عربي','لاتيني','لوحات','مناسبات','نقش','أخرى']),...serviceFields,f('deliverables','الخامة أو المخرج المطلوب')],['calligraphy_kind','service_scope'],servicesPolicy),
  template('legacy_art_direction','دعاية واعلان','تصميم واخراج','service',[s('art_direction_kind','نوع العمل',['إخراج مطبوع','إخراج رقمي','فيديو','عرض تقديمي','هوية حملة','أخرى']),...serviceFields,f('deliverables','المخرجات المطلوبة')],['art_direction_kind','service_scope'],servicesPolicy),
];

export const CATEGORY_SEED_TEMPLATES: CategorySeedTemplate[] = [
  ...CORE_CATEGORY_SEED_TEMPLATES,
  ...LEGACY_CATEGORY_SEED_TEMPLATES,
];

const CATEGORY_SEED_TEMPLATE_BY_PATH = new Map(
  CATEGORY_SEED_TEMPLATES.map(template => [`${template.categoryName}\u0000${template.name}`, template] as const),
);

export function findCategorySeedTemplate(categoryName: string, subcategoryName: string) {
  return CATEGORY_SEED_TEMPLATE_BY_PATH.get(`${categoryName}\u0000${subcategoryName}`);
}

export function categorySeedDefinition(template: CategorySeedTemplate) {
  return {
    version: 1,
    kind: template.kind,
    priceEnabled: template.priceEnabled,
    goodsEnabled: template.goodsEnabled,
    fields: template.fields.map(field => ({ ...field, options: [...field.options] })),
    listingPolicy: {
      types: template.listingPolicy.types.map(type => ({ ...type, pricing: [...type.pricing] })),
    },
    upgradedFromBuiltInV1: false,
  };
}
