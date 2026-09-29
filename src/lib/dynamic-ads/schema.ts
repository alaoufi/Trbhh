export const INITIAL_ENTITY_KEYS = ['vehicle', 'property', 'livestock', 'product', 'service', 'equipment', 'agriculture', 'livestock_supplies', 'household', 'home_decor', 'construction', 'heavy_transport', 'vehicle_parts', 'other'] as const;
export type InitialEntityKey = typeof INITIAL_ENTITY_KEYS[number];
type DefaultField = Pick<DynamicField, 'key' | 'label' | 'type' | 'options' | 'searchable'> & { groupKey?: string };
const f = (key: string, label: string, type: DynamicFieldType = 'text', options: string[] = [], groupKey = 'specs'): DefaultField => ({ key, label, type, options, searchable: true, groupKey });
/** Seed catalogue only: values remain in dynamic_ad_values, never fixed ad columns. */
export const DEFAULT_ENTITY_FIELDS: Record<InitialEntityKey, DefaultField[]> = {
  vehicle: [f('vehicle_type','نوع المركبة','select',['سيارة','دراجة','شاحنة','مركبة أخرى']),f('manufacturer','الشركة المصنعة'),f('model','الموديل'),f('trim','الفئة'),f('year','سنة الصنع','number'),f('condition','الحالة','select',['جديد','مستعمل']),f('mileage','العداد','number'),f('fuel','الوقود','select',['بنزين','ديزل','كهرباء','هجين']),f('transmission','ناقل الحركة','select',['أوتوماتيك','عادي']),f('drive_system','نظام الدفع'),f('color','اللون'),f('seats','عدد المقاعد','number'),f('country_of_origin','بلد الصنع'),f('warranty','الضمان','boolean'),f('accidents','الحوادث','boolean'),f('maintenance','الصيانة','textarea'),f('notes','ملاحظات','textarea')],
  property: [f('property_type','نوع العقار','select',['شقة','فيلا','أرض','عمارة','مكتب','محل']),f('offer_type','نوع العرض','select',['بيع','إيجار']),f('area_sqm','المساحة','number'),f('region','المنطقة','text',[],'location'),f('city','المدينة','text',[],'location'),f('district','الحي','text',[],'location'),f('map_location','الموقع على الخريطة','location',[],'location'),f('rooms','عدد الغرف','number'),f('bathrooms','عدد دورات المياه','number'),f('floor','الدور','number'),f('property_age','عمر العقار','number'),f('finishing','التشطيب'),f('parking','المواقف','number'),f('nearby_services','الخدمات القريبة','textarea'),f('direction','اتجاه العقار'),f('facade','الواجهة')],
  livestock: [f('livestock_type','النوع','select',['إبل','غنم','ماعز','أبقار']),f('breed','السلالة'),f('gender','الجنس','select',['ذكر','أنثى']),f('age','العمر'),f('color','اللون'),f('weight','الوزن','decimal'),f('health_status','الحالة الصحية'),f('vaccinations','التحصينات','textarea'),f('production','الإنتاج'),f('sire','الأب'),f('dam','الأم'),f('stud','الفحل'),f('lineage','النسب'),f('notes','الملاحظات','textarea')],
  product: [f('product_type','نوع المنتج'),f('brand','الماركة'),f('model','الموديل'),f('condition','الحالة','select',['جديد','مستعمل']),f('color','اللون'),f('warranty','الضمان','boolean'),f('country_of_origin','بلد الصنع'),f('specifications','المواصفات','textarea'),f('notes','الملاحظات','textarea')],
  service: [f('service_type','نوع الخدمة'),f('service_field','مجال الخدمة'),f('region','المنطقة','text',[],'location'),f('experience','الخبرة'),f('delivery_duration','مدة التنفيذ'),f('estimated_price','السعر التقريبي','decimal'),f('service_description','الوصف','textarea'),f('notes','الملاحظات','textarea')],
  equipment: [],
  agriculture: [f('agriculture_type','نوع النشاط','select',['مزرعة','مشاتل','أعلاف','بذور','مبيدات','معدات زراعية']),f('area_sqm','المساحة','number'),f('soil_type','نوع التربة'),f('irrigation','الري','select',['مياه جوفية','شبكة','ري بالتنقيط','بدون']),f('is_level','الأرض مستوية','boolean'),f('production','الإنتاج','textarea'),f('notes','ملاحظات','textarea')],
  livestock_supplies: [f('supply_type','نوع المستلزم','select',['أعلاف','حظائر','أدوية','معدات','إكسسوارات']),f('brand','الماركة'),f('condition','الحالة','select',['جديد','مستعمل']),f('quantity','الكمية','number'),f('unit','الوحدة'),f('expiry_date','تاريخ الانتهاء','date'),f('notes','ملاحظات','textarea')],
  household: [f('product_type','نوع الأواني','select',['أواني طبخ','أطقم تقديم','أجهزة منزلية صغيرة','مستلزمات مطبخ']),f('brand','الماركة'),f('material','الخامة'),f('condition','الحالة','select',['جديد','مستعمل']),f('quantity','الكمية','number'),f('warranty','الضمان','boolean'),f('notes','ملاحظات','textarea')],
  home_decor: [f('decor_type','نوع الديكور','select',['أثاث','إضاءة','ستائر','سجاد','لوحات','إكسسوارات']),f('style','الطراز'),f('material','الخامة'),f('condition','الحالة','select',['جديد','مستعمل']),f('dimensions','الأبعاد'),f('color','اللون'),f('notes','ملاحظات','textarea')],
  construction: [f('material_type','نوع المادة','select',['حديد','أسمنت','بلاط','خشب','دهانات','عوازل','أدوات']),f('grade','الدرجة/المقاس'),f('quantity','الكمية','number'),f('unit','الوحدة'),f('origin','بلد المنشأ'),f('condition','الحالة','select',['جديد','مستعمل']),f('notes','ملاحظات','textarea')],
  heavy_transport: [f('equipment_type','نوع المعدة','select',['شاحنة','رافعة','لودر','حفار','سطحة','معدات نقل']),f('manufacturer','الشركة المصنعة'),f('model','الموديل'),f('year','سنة الصنع','number'),f('hours','ساعات التشغيل','number'),f('condition','الحالة','select',['جديد','مستعمل']),f('capacity','الحمولة/السعة'),f('notes','ملاحظات','textarea')],
  vehicle_parts: [f('part_type','نوع القطعة'),f('vehicle_compatibility','التوافق مع المركبة'),f('brand','الماركة'),f('condition','الحالة','select',['جديد','مستعمل','مجدد']),f('warranty','الضمان','boolean'),f('part_number','رقم القطعة'),f('notes','ملاحظات','textarea')],
  other: [],
};
export type DynamicFieldType = 'text' | 'textarea' | 'number' | 'decimal' | 'select' | 'multiselect' | 'boolean' | 'date' | 'location' | 'media' | 'file' | 'url';

export type DynamicField = {
  id?: number;
  key: string;
  label: string;
  type: DynamicFieldType;
  required: boolean;
  searchable: boolean;
  options: string[];
  placeholder?: string;
  groupId?: number | null;
  inputOrder?: number;
  displayOrder?: number;
  inputVisible?: boolean;
  displayVisible?: boolean;
};

export type DynamicValuesResult = { ok: boolean; values: Record<string, string | number | boolean | string[]>; errors: Record<string, string> };

const validTypes = new Set<DynamicFieldType>(['text', 'textarea', 'number', 'decimal', 'select', 'multiselect', 'boolean', 'date', 'location', 'media', 'file', 'url']);
export function normalizeDynamicFieldLayout(input: { groupId?: number | null; inputOrder?: number; displayOrder?: number; inputVisible?: boolean; displayVisible?: boolean }) {
  return { groupId: Number.isSafeInteger(input.groupId) && (input.groupId ?? 0) > 0 ? input.groupId! : null, inputOrder: Math.max(0, Math.trunc(input.inputOrder ?? 999)), displayOrder: Math.max(0, Math.trunc(input.displayOrder ?? 999)), inputVisible: input.inputVisible !== false, displayVisible: input.displayVisible !== false };
}

/** Validate only fields declared by the selected entity. Never trust browser field names. */
export function validateDynamicValues(fields: DynamicField[], input: Record<string, unknown>): DynamicValuesResult {
  const values: Record<string, string | number | boolean | string[]> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(field.key) || !validTypes.has(field.type)) continue;
    const raw = input[field.key];
    if (field.type === 'multiselect') {
      const selected = (Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === '' ? [] : [raw]).map((item) => String(item).trim()).filter(Boolean).slice(0, 30);
      if (!selected.length) { if (field.required) errors[field.key] = 'هذا الحقل مطلوب'; continue; }
      if (field.options.length && selected.some((value) => !field.options.includes(value))) { errors[field.key] = 'اختر قيماً من القائمة'; continue; }
      values[field.key] = selected;
      continue;
    }
    const text = typeof raw === 'string' ? raw.trim() : raw === undefined || raw === null ? '' : String(raw).trim();
    if (!text) {
      if (field.required) errors[field.key] = 'هذا الحقل مطلوب';
      continue;
    }
    if (field.type === 'number' || field.type === 'decimal') {
      const value = Number(text);
      if (!Number.isFinite(value)) { errors[field.key] = 'أدخل رقماً صحيحاً'; continue; }
      values[field.key] = value;
      continue;
    }
    if (field.type === 'boolean') {
      values[field.key] = text === '1' || text === 'true' || text === 'on';
      continue;
    }
    if (field.type === 'select' && field.options.length && !field.options.includes(text)) {
      errors[field.key] = 'اختر قيمة من القائمة';
      continue;
    }
    values[field.key] = text.slice(0, field.type === 'textarea' ? 4000 : 255);
  }
  return { ok: Object.keys(errors).length === 0, values, errors };
}
