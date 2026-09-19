import type { CategoryField, CategoryFieldType } from './validation';

export type CategorySeedTemplate = {
  key: string; categoryName: string; name: string;
  kind: 'goods' | 'property' | 'jobs' | 'service' | 'livestock' | 'plants';
  priceEnabled: boolean; goodsEnabled: boolean; fields: CategoryField[];
};
type SeedField = Omit<CategoryField, 'order'>;
const f = (key: string, label: string, type: CategoryFieldType = 'text', options: string[] = [], group = 'المواصفات', unit?: string): SeedField =>
  ({ key, label, type, options, group, unit, required: false, visible: true, ...(type === 'number' ? { min: 0 } : {}) });
const n = (key: string, label: string, unit?: string, group?: string) => f(key, label, 'number', [], group, unit);
const s = (key: string, label: string, options: string[], group?: string) => f(key, label, 'select', options, group);
const m = (key: string, label: string, options: string[], group?: string) => f(key, label, 'multiselect', options, group);
const yes = (key: string, label: string, group?: string) => f(key, label, 'boolean', [], group);
const condition = s('condition', 'الحالة', ['جديد', 'مستعمل', 'مجدد']);
const dimensions = [n('length_cm', 'الطول', 'سم'), n('width_cm', 'العرض', 'سم'), n('height_cm', 'الارتفاع', 'سم')];
const delivery = [yes('delivery_available', 'التوصيل متاح', 'التوريد'), n('lead_time_days', 'مدة التجهيز', 'يوم', 'التوريد')];
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
  n('rent_amount', 'قيمة الإيجار إن كان متاحًا', 'ر.س', 'العرض والإيجار'),
  s('rent_period', 'فترة الإيجار', ['شهري', 'سنوي', 'يومي'], 'العرض والإيجار'),
];
const vehicle = [
  { ...f('make', 'الشركة المصنعة'), required: true }, { ...f('model', 'الطراز'), required: true },
  { ...n('year', 'سنة الصنع', 'ميلادي'), min: 1900, max: 2100 }, condition,
  n('odometer_km', 'المسافة المقطوعة', 'كم'), s('specification', 'المواصفات الإقليمية', ['سعودي', 'خليجي', 'أمريكي', 'أوروبي', 'ياباني', 'كوري', 'أخرى']),
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
  n('operating_weight_t', 'الوزن التشغيلي', 'طن'), s('offer_mode', 'طبيعة العرض', ['بيع', 'تأجير']),
  yes('operator_included', 'يشمل المشغل'), s('rate_basis', 'أساس السعر', ['كامل المعدة', 'ساعة', 'يوم', 'شهر']), ...delivery];
function template(key: string, categoryName: string, name: string, kind: CategorySeedTemplate['kind'], fields: SeedField[]): CategorySeedTemplate {
  return { key, categoryName, name, kind, priceEnabled: kind !== 'jobs', goodsEnabled: kind === 'goods',
    fields: fields.map((field, order) => ({ ...field, order })) };
}

/** Optional administrator-applied seeds, NOT startup migrations or automatic ad classification.
 * Source observations and Saudi adaptations: docs/CATEGORY_FIELD_RESEARCH.md.
 * Labels/options/required/visibility/groups remain editable after applying.
 */
export const CATEGORY_SEED_TEMPLATES: CategorySeedTemplate[] = [
  template('land', 'عقارات', 'أراضٍ', 'property', land),
  template('villa', 'عقارات', 'فلل', 'property', [...land, ...propertyRooms]),
  template('apartment', 'عقارات', 'شقق وأدوار', 'property', [n('area_m2', 'المساحة', 'م²'), n('floor_number', 'الدور'), ...propertyRooms]),
  template('commercial_property', 'عقارات', 'محلات ومكاتب ومستودعات', 'property', [n('area_m2', 'المساحة', 'م²'), s('property_use', 'النشاط المناسب', ['تجاري', 'مكاتب', 'تخزين', 'صناعي']), ...propertyRooms]),
  template('car', 'سيارات ومستلزماتها', 'سيارات', 'goods', [...vehicle, s('body_type', 'شكل الهيكل', ['سيدان', 'دفع رباعي', 'هاتشباك', 'كوبيه', 'بيك أب', 'فان', 'أخرى']), n('seats', 'المقاعد')]),
  template('car_parts', 'سيارات ومستلزماتها', 'قطع غيار وإكسسوارات', 'goods', [f('part_kind', 'نوع القطعة'), f('part_number', 'رقم القطعة'), f('compatible_make', 'الشركة المتوافقة'), f('compatible_model', 'الطراز المتوافق'), f('compatible_years', 'السنوات المتوافقة'), condition, s('origin', 'تصنيف القطعة', ['أصلية', 'بديلة', 'تجارية', 'غير معروف']), ...delivery]),
  template('job', 'وظائف', 'فرص عمل', 'jobs', [
    { ...f('job_title', 'المسمى الوظيفي', 'text', [], 'الوظيفة'), required: true }, f('employer', 'جهة العمل', 'text', [], 'الوظيفة'),
    s('contract', 'نوع العقد', ['دوام كامل', 'دوام جزئي', 'مؤقت', 'تدريب', 'عمل حر'], 'الوظيفة'), s('workplace', 'نمط العمل', ['حضوري', 'عن بُعد', 'هجين'], 'الوظيفة'),
    n('salary_min', 'الراتب من', 'ر.س', 'الأجر والمزايا'), n('salary_max', 'الراتب إلى', 'ر.س', 'الأجر والمزايا'),
    s('salary_period', 'دورية الأجر', ['شهري', 'أسبوعي', 'يومي', 'بالساعة', 'للمشروع'], 'الأجر والمزايا'),
    m('benefits', 'المزايا', ['تأمين طبي', 'سكن', 'نقل', 'عمولات', 'تدريب'], 'الأجر والمزايا'),
    n('experience_years', 'الخبرة المطلوبة', 'سنة', 'المتطلبات'), s('education', 'المؤهل', ['لا يشترط', 'ثانوي', 'دبلوم', 'بكالوريوس', 'دراسات عليا'], 'المتطلبات'),
    f('skills', 'المهارات المطلوبة', 'textarea', [], 'المتطلبات'), f('languages', 'اللغات المطلوبة', 'text', [], 'المتطلبات'),
    m('shift', 'الدوام', ['صباحي', 'مسائي', 'ليلي', 'مرن', 'مناوبات'], 'التقديم'), f('deadline', 'آخر موعد للتقديم', 'date', [], 'التقديم'),
  ]),
  template('plants', 'زراعة ومشاتل وأعلاف', 'شتلات ونباتات', 'plants', [s('plant_kind', 'نوع النبات', ['شجرة مثمرة', 'شجرة ظل', 'زينة', 'شتلة خضار']), f('variety', 'الصنف'), n('plant_height_cm', 'ارتفاع النبات الحالي', 'سم'), n('pot_volume_l', 'حجم الأصيص', 'لتر'), s('sun_exposure', 'الإضاءة', ['شمس مباشرة', 'ظل جزئي', 'ظل']), n('quantity', 'العدد المتاح', 'شتلة'), ...delivery]),
  template('feed', 'زراعة ومشاتل وأعلاف', 'أعلاف', 'plants', [s('feed_kind', 'نوع العلف', ['برسيم', 'تبن', 'شعير', 'علف مركب', 'أخرى']), m('target_animals', 'الحيوانات المستهدفة', ['أغنام', 'ماعز', 'إبل', 'أبقار', 'خيل', 'دواجن']), s('feed_form', 'شكل العلف', ['بالات', 'حبوب', 'مجروش', 'حبيبات']), n('package_weight_kg', 'وزن العبوة أو البالة', 'كجم'), { ...n('protein_pct', 'نسبة البروتين من بطاقة المنتج', '%'), max: 100 }, f('expiry_date', 'تاريخ الانتهاء إن وجد', 'date'), s('supply_unit', 'وحدة التوريد', ['كيس', 'بالة', 'كجم', 'طن']), ...delivery]),
  template('irrigation', 'زراعة ومشاتل وأعلاف', 'مستلزمات ري', 'goods', [s('irrigation_kind', 'نوع المستلزم', ['تنقيط', 'رشاش', 'خرطوم', 'مضخة']), f('brand', 'العلامة'), condition, n('diameter_mm', 'القطر', 'مم'), n('length_m', 'الطول', 'متر'), n('flow_l_min', 'التدفق', 'لتر/دقيقة'), n('power_kw', 'القدرة', 'كيلوواط'), ...delivery]),
  template('garden_service', 'زراعة ومشاتل وأعلاف', 'خدمات زراعة وحدائق', 'service', [m('service_scope', 'الأعمال', ['زراعة', 'تقليم', 'صيانة', 'تركيب ري', 'تنسيق حدائق']), n('service_area_m2', 'مساحة العمل', 'م²'), s('materials_included', 'المواد', ['شامل المواد', 'عمل فقط', 'حسب الاتفاق']), s('frequency', 'التكرار', ['مرة واحدة', 'أسبوعي', 'شهري']), f('service_coverage', 'نطاق الخدمة'), n('lead_time_days', 'مدة التنفيذ', 'يوم'), f('experience', 'الخبرة')]),
  template('sheep_goats', 'مواشي ومستلزماتها', 'أغنام وماعز', 'livestock', [s('species', 'النوع', ['غنم', 'ماعز']), ...animal]),
  template('camels_cattle', 'مواشي ومستلزماتها', 'إبل وأبقار', 'livestock', [s('species', 'النوع', ['إبل', 'أبقار']), ...animal]),
  template('poultry', 'مواشي ومستلزماتها', 'دواجن', 'livestock', [s('species', 'النوع', ['دجاج', 'بط', 'سمان', 'أخرى']), n('age_days', 'العمر', 'يوم'), ...animal.filter(field => field.key !== 'age_months')]),
  template('livestock_equipment', 'مواشي ومستلزماتها', 'معالف وسقايات وتجهيزات', 'goods', [s('equipment_kind', 'نوع التجهيز', ['معلف', 'سقاية', 'حظيرة متنقلة', 'سياج']), s('equipment_material', 'المادة', ['معدن مجلفن', 'ستانلس', 'بلاستيك', 'أخرى']), n('capacity_value', 'السعة'), s('capacity_unit', 'وحدة السعة', ['لتر', 'كجم', 'رأس']), condition, ...dimensions, ...delivery]),
  template('cookware', 'أوانٍ منزلية', 'أواني طبخ', 'goods', [s('item_kind', 'نوع الإناء', ['قدر', 'مقلاة', 'صينية', 'طقم']), ...home, n('capacity_l', 'السعة', 'لتر'), n('diameter_cm', 'القطر', 'سم'), m('compatibility', 'الاستخدام المتوافق حسب المنتج', ['غاز', 'كهرباء', 'حث', 'فرن', 'ميكروويف']), m('care_features', 'العناية', ['غسالة أطباق', 'غسل يدوي', 'قابل للتكديس'])]),
  template('tableware', 'أوانٍ منزلية', 'تقديم ومائدة', 'goods', [f('item_kind', 'نوع الطقم'), ...home, n('persons', 'عدد الأشخاص'), m('care_features', 'العناية', ['غسالة أطباق', 'غسل يدوي'])]),
  template('storage', 'أوانٍ منزلية', 'حفظ وتنظيم', 'goods', [f('item_kind', 'نوع الحافظة أو المنظم'), ...home, n('capacity_l', 'السعة', 'لتر'), yes('airtight', 'محكم الإغلاق')]),
  template('rugs', 'ديكورات منزلية', 'سجاد', 'goods', [...decor, s('shape', 'الشكل', ['مستطيل', 'مربع', 'دائري', 'بيضاوي']), s('weave', 'نوع النسيج', ['يدوي', 'آلي', 'مسطح', 'وبر', 'غير معروف'])]),
  template('curtains', 'ديكورات منزلية', 'ستائر', 'goods', [...decor, s('opacity', 'نفاذية الضوء', ['شفافة', 'ترشيح ضوء', 'تعتيم']), s('mounting', 'طريقة التركيب', ['حلقات', 'سكة', 'رول', 'أخرى'])]),
  template('wall_decor', 'ديكورات منزلية', 'مرايا ولوحات', 'goods', [s('item_kind', 'نوع القطعة', ['مرآة', 'لوحة', 'إطار', 'زينة حائط']), ...decor]),
  template('decor_service', 'ديكورات منزلية', 'تفصيل وتركيب ديكور', 'service', [m('service_scope', 'الخدمات', ['قياس', 'تفصيل', 'تركيب', 'فك ونقل', 'تصميم']), f('specialty', 'التخصص'), n('work_area_m2', 'المساحة', 'م²'), s('materials_included', 'المواد', ['شامل المواد', 'عمل فقط', 'حسب الاتفاق']), n('lead_time_days', 'مدة التنفيذ', 'يوم'), f('service_coverage', 'نطاق التغطية'), f('warranty', 'ضمان العمل إن وجد')]),
  template('tiles', 'مواد بناء ومقاولات', 'بلاط وأرضيات', 'goods', [s('material_kind', 'نوع البلاط', ['سيراميك', 'بورسلين', 'رخام', 'جرانيت', 'أخرى']), f('brand', 'المصنع'), m('application', 'الاستخدام', ['أرضيات', 'جدران', 'واجهات', 'داخلي', 'خارجي']), n('length_mm', 'الطول', 'مم'), n('width_mm', 'العرض', 'مم'), n('thickness_mm', 'السماكة', 'مم'), s('finish', 'التشطيب', ['مطفي', 'لامع', 'محبب']), n('quantity_m2', 'الكمية', 'م²'), ...delivery]),
  template('building_materials', 'مواد بناء ومقاولات', 'مواد بناء أساسية', 'goods', [s('material_kind', 'نوع المادة', ['أسمنت', 'بلوك', 'طوب', 'حديد', 'رمل', 'حصى', 'أخرى']), f('brand', 'المصنع'), f('grade_spec', 'الدرجة أو المواصفة من المصنع'), n('quantity', 'الكمية'), s('supply_unit', 'وحدة التوريد', ['م²', 'م³', 'كيس', 'طن', 'قطعة', 'متر طولي']), f('dimensions_spec', 'الأبعاد أو المقاس'), ...delivery]),
  template('sanitary', 'مواد بناء ومقاولات', 'أدوات صحية', 'goods', [s('item_kind', 'نوع الأداة', ['مغسلة', 'خلاط', 'مرحاض', 'دش', 'أخرى']), ...home, f('connection_size', 'مقاس التوصيل'), f('installation', 'طريقة التركيب')]),
  template('contracting', 'مواد بناء ومقاولات', 'مقاولات وتشطيبات', 'service', [m('trade', 'التخصص', ['عظم', 'تشطيب', 'بلاط', 'دهان', 'سباكة', 'كهرباء', 'عزل']), n('work_area_m2', 'مساحة الأعمال', 'م²'), s('contract_scope', 'نطاق التعاقد', ['عمل فقط', 'مواد وعمل', 'توريد فقط']), s('pricing_basis', 'أساس التسعير', ['للمشروع', 'للمتر المربع', 'للمتر الطولي', 'باليوم']), n('duration_days', 'مدة التنفيذ', 'يوم'), f('service_coverage', 'نطاق التغطية'), f('warranty', 'ضمان العمل')]),
  template('earthmoving', 'نقليات ومعدات ثقيلة', 'معدات حفر وتحميل', 'goods', [s('equipment_kind', 'نوع المعدة', ['حفار', 'شيول', 'بلدوزر', 'أخرى']), ...equipment, m('attachments', 'الملحقات', ['باكت', 'مطرقة', 'شوك', 'أخرى']), n('bucket_m3', 'سعة الباكت', 'م³')]),
  template('lifting', 'نقليات ومعدات ثقيلة', 'رافعات ومناولة', 'goods', [s('equipment_kind', 'نوع المعدة', ['رافعة', 'رافعة شوكية', 'مناولة تلسكوبية']), ...equipment, n('capacity_t', 'حمولة الرفع المقننة', 'طن'), n('lift_height_m', 'ارتفاع الرفع', 'متر')]),
  template('commercial_vehicles', 'نقليات ومعدات ثقيلة', 'شاحنات ومقطورات', 'goods', [...vehicle, s('truck_type', 'النوع', ['قلاب', 'سطحة', 'قاطرة', 'مقطورة', 'براد', 'صهريج', 'أخرى']), n('capacity_t', 'الحمولة', 'طن'), n('axles', 'عدد المحاور')]),
  template('transport_service', 'نقليات ومعدات ثقيلة', 'خدمات نقل وتشغيل', 'service', [s('service_kind', 'الخدمة', ['نقل بضائع', 'نقل معدات', 'نقل أثاث', 'تشغيل معدات']), f('service_route', 'مسار النقل'), n('capacity_t', 'الحمولة', 'طن'), yes('operator_included', 'يشمل المشغل'), yes('loading_included', 'يشمل التحميل والتنزيل'), s('rate_basis', 'أساس السعر', ['رحلة', 'ساعة', 'يوم', 'شهر']), f('availability', 'مواعيد التوفر')]),
];
