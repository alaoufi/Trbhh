import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({ log: [] });
const specs = {
  'أراضي': [['land_use','الاستخدام','select','سكني|تجاري|زراعي|صناعي','متر مربع'],['level','مستوى الأرض','select','مستوية|منحدرة|مردومة',''],['frontages','عدد الواجهات','number','','واجهة'],['street_width','عرض الشارع','number','','متر'],['utilities','الخدمات المتوفرة','select','كهرباء|ماء|صرف صحي|كاملة|غير متوفرة','']],
  'شقق وفلل': [['property_kind','نوع العقار','select','شقة|فيلا|دور|دوبلكس',''],['built_area','مساحة البناء','number','','متر مربع'],['bedrooms','غرف النوم','number','','غرفة'],['bathrooms','دورات المياه','number','','دورة'],['finishing','التشطيب','select','عادي|متوسط|فاخر|سوبر ديلوكس',''],['rent_price','سعر الإيجار','number','','ريال']],
  'سيارات': [['make','الماركة','text','',''],['model','الموديل','text','',''],['year','سنة الموديل','number','',''],['mileage','العداد','number','','كم'],['fuel','الوقود','select','بنزين|ديزل|هجين|كهرباء',''],['transmission','القير','select','أوتوماتيك|عادي|CVT',''],['drive','الدفع','select','أمامي|خلفي|رباعي','']],
  'شاحنات': [['equipment_type','نوع المعدة','text','',''],['load_capacity','الحمولة','number','','طن'],['manufacture_year','سنة الصنع','number','',''],['operating_hours','ساعات التشغيل','number','','ساعة'],['condition','الحالة','select','جديد|مستعمل|مجدد','']],
  'مشاتل': [['plant_type','نوع النبات','text','',''],['age','عمر النبات','number','','شهر'],['quantity','الكمية','number','','حبة'],['irrigation','طريقة الري','select','تنقيط|رش|يدوي|أخرى','']],
  'مواشي': [['animal_species','النوع','select','أغنام|ماعز|إبل|أبقار',''],['breed','السلالة','text','',''],['age','العمر','number','','شهر'],['count','العدد','number','','رأس'],['health','الحالة الصحية','select','سليمة|تحتاج فحصاً|مريضة','']],
  'أواني ومطابخ': [['material','الخامة','select','ستانلس ستيل|ألمنيوم|زجاج|سيراميك|بلاستيك',''],['pieces','عدد القطع','number','','قطعة'],['condition','الحالة','select','جديد|مستعمل','']],
  'أثاث وديكور': [['material','الخامة','text','',''],['dimensions','الأبعاد','text','',''],['color','اللون','text','',''],['condition','الحالة','select','جديد|مستعمل|مصمم حسب الطلب','']],
  'مواد بناء': [['material','نوع المادة','text','',''],['quantity','الكمية','number','',''],['unit','وحدة القياس','select','قطعة|متر|كيس|طن|متر مربع',''],['brand','الشركة المصنعة','text','','']],
  'دوام كامل': [['job_title','المسمى الوظيفي','text','',''],['experience','سنوات الخبرة','number','','سنة'],['salary','الراتب','number','','ريال'],['work_mode','نظام العمل','select','حضوري|عن بعد|هجين','']],
  'خدمات منزلية': [['service_type','نوع الخدمة','text','',''],['service_area','نطاق الخدمة','text','',''],['price_mode','طريقة التسعير','select','بالساعة|بالمهمة|عرض سعر','']],
  'إلكترونيات': [['product_brand','العلامة التجارية','text','',''],['product_model','الموديل','text','',''],['product_condition','الحالة','select','جديد|مستعمل|مجدد',''],['product_quantity','الكمية','number','','قطعة']],
};

try {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost','127.0.0.1','preview-db'].includes(url.hostname) || url.pathname !== '/trbhh_preview_audit') throw new Error('Refusing a non-preview database.');
  const subs = await db.sub_categories.findMany({ select: { id: true, category_id: true, name: true } });
  const rows = subs.flatMap((sub) => (specs[sub.name] || []).map(([field_key,label,field_type,options,unit], ordered) => ({
    category_id: BigInt(sub.category_id), subcategory_id: sub.id, field_key, label, field_type, options, unit: unit || null,
    required: 0, active: 1, searchable: 1, ordered,
  })));
  if (rows.length) await db.category_field_defs.createMany({ data: rows, skipDuplicates: true });
  console.info(`[preview-field-upgrade] Ensured ${rows.length} specialized field definitions for ${subs.length} subcategories.`);
} finally { await db.$disconnect(); }
