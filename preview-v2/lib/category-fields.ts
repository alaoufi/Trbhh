/** V2 preview catalog. No network, executable rules, personal identifiers or payment data. */
export type Details = Record<string, string | string[]>;
export type Field = { id: string; label: string; type: 'text' | 'number' | 'select' | 'multi' | 'date'; group: string; required?: boolean; unit?: string; options?: string[]; min?: number; max?: number; integer?: boolean; when?: { field: string; values: string[] }; hint?: string };
export type Profile = { fields: Field[]; condition: boolean; pricing: 'item' | 'property' | 'service' | 'supplier' | 'salary'; example: string };
const t = (id: string, label: string, required = false, group = 'المواصفات'): Field => ({ id, label, required, group, type: 'text' });
const n = (id: string, label: string, unit = '', required = false, min = 0, max = 1000000, integer = false): Field => ({ id, label, unit, required, min, max, integer, group: 'المواصفات', type: 'number' });
const s = (id: string, label: string, options: string, required = false, group = 'المواصفات'): Field => ({ id, label, options: options.split('|'), required, group, type: 'select' });
const m = (id: string, label: string, options: string): Field => ({ ...s(id, label, options), type: 'multi' });
const d = (id: string, label: string): Field => ({ id, label, type: 'date', group: 'التوفر والمواعيد' });
const when = (field: Field, id: string, values: string): Field => ({ ...field, when: { field: id, values: values.split('|') } });
const group = (name: string, fields: Field[]): Field[] => fields.map(f => ({ ...f, group: name }));
const p = (fields: Field[], example: string, condition = true, pricing: Profile['pricing'] = 'item'): Profile => ({ fields, example, condition, pricing });
const yes = 'نعم|لا|غير معروف';
const brand = t('brand', 'الماركة');
const model = t('model', 'الموديل');
const year = n('year', 'سنة الصنع', '', true, 1900, new Date().getUTCFullYear() + 1, true);
const quantity = n('quantity', 'الكمية المتاحة', '', false, 1, 1000000, true);
const delivery = s('delivery', 'التوصيل', 'متاح|استلام فقط|حسب الاتفاق');
const dimensions = [n('width', 'العرض', 'سم', false, 0.1), n('length', 'الطول', 'سم', false, 0.1), n('height', 'الارتفاع', 'سم', false, 0.1)];
const warranty = t('warranty', 'الضمان المتبقي وشروطه');
const materials = t('material', 'الخامة', true);
const product = [brand, model, warranty, delivery];
const sale = s('purpose', 'الغرض من الإعلان', 'للبيع|للإيجار', true, 'العرض والسعر');
const rent = [when(s('rentPeriod', 'دورية الإيجار', 'سنوي|شهري|يومي', true, 'العرض والسعر'), 'purpose', 'للإيجار'), when(n('deposit', 'التأمين المسترد', 'ر.س'), 'purpose', 'للإيجار'), when(n('payments', 'عدد دفعات الإيجار', '', false, 1, 12, true), 'purpose', 'للإيجار')];
const location = group('الموقع والخدمات', [t('district', 'الحي'), s('frontage', 'الواجهة', 'شمالية|جنوبية|شرقية|غربية|شمالية شرقية|شمالية غربية|جنوبية شرقية|جنوبية غربية|متعددة'), n('streetWidth', 'عرض الشارع', 'م', false, 1, 300), m('utilities', 'الخدمات المتوفرة', 'كهرباء|مياه|صرف صحي|ألياف بصرية|طريق مسفلت')]);
const boundaries = group('الحدود والأطوال', [t('northBoundary', 'الحد الشمالي'), n('northLength', 'طول الحد الشمالي', 'م', false, 0.1), t('southBoundary', 'الحد الجنوبي'), n('southLength', 'طول الحد الجنوبي', 'م', false, 0.1), t('eastBoundary', 'الحد الشرقي'), n('eastLength', 'طول الحد الشرقي', 'م', false, 0.1), t('westBoundary', 'الحد الغربي'), n('westLength', 'طول الحد الغربي', 'م', false, 0.1)]);
const housing = [sale, ...rent, n('bedrooms', 'غرف النوم', '', true, 0, 100, true), n('bathrooms', 'دورات المياه', '', true, 0, 100, true), n('livingRooms', 'الصالات والمجالس', '', false, 0, 100, true), n('age', 'عمر العقار', 'سنة', false, 0, 200), s('finish', 'مستوى التشطيب', 'عظم|نصف تشطيب|اقتصادي|جيد|فاخر|فاخر جداً|يحتاج تجديد', true), s('furnishing', 'التأثيث', 'غير مفروش|مفروش جزئياً|مفروش بالكامل'), s('completion', 'حالة الإنجاز', 'جاهز|قيد الإنشاء|على الخارطة'), s('occupancy', 'الإشغال', 'شاغر|مؤجر|مشغول من المالك'), when(n('annualIncome', 'الدخل الإيجاري السنوي الحالي', 'ر.س'), 'occupancy', 'مؤجر'), d('availableDate', 'تاريخ الإتاحة'), ...location];
const propertyAmenities = m('amenities', 'المرافق', 'مصعد|مواقف|مطبخ راكب|تكييف|غرفة خادمة|غرفة سائق|حديقة|مسبح|سطح مستقل|مدخل مستقل|وصول مهيأ');
const carCore = [t('brand', 'الشركة المصنعة', true), t('model', 'الطراز', true), year, n('mileage', 'الممشى', 'كم', true, 0, 3000000, true), s('fuel', 'نوع الوقود', 'بنزين|ديزل|هجين|كهرباء', true), s('transmission', 'ناقل الحركة', 'أوتوماتيك|يدوي|شبه أوتوماتيك', true), t('trim', 'الفئة'), s('regional', 'المواصفات الإقليمية', 'سعودية|خليجية|أمريكية|أوروبية|يابانية|كورية|أخرى'), t('color', 'اللون الخارجي'), n('engine', 'سعة المحرك', 'سم³', false, 0, 15000), n('power', 'القوة', 'حصان', false, 1, 3000), s('accidents', 'سجل الحوادث', 'بدون حوادث بحسب المالك|حوادث بسيطة|حوادث مؤثرة|غير معروف'), s('paint', 'حالة الطلاء', 'طلاء المصنع بحسب المالك|رش جزئي|رش كامل|غير معروف'), s('serviceHistory', 'سجل الصيانة', 'وكالة|مركز متخصص|متوفر جزئياً|غير متوفر'), warranty, s('inspection', 'تقرير فحص متاح', yes)];
const fitment = [t('compatibleMake', 'الشركة المتوافقة', true), t('compatibleModel', 'الموديلات المتوافقة', true), t('compatibleYears', 'سنوات الموديل المتوافقة'), brand, quantity, delivery];
const equipment = [brand, model, year, n('hours', 'ساعات التشغيل', 'ساعة', false, 0, 200000, true), s('purpose', 'نوع العرض', 'للبيع|للإيجار', true), when(s('rentalUnit', 'وحدة الإيجار', 'ساعة|يوم|أسبوع|شهر', true), 'purpose', 'للإيجار'), s('operational', 'الحالة التشغيلية', 'تعمل بالكامل|تحتاج صيانة|لا تعمل|للقطع', true), t('maintenance', 'الصيانة والأعطال المعروفة'), warranty, delivery];
const animals = [t('breed', 'السلالة', true), n('headCount', 'عدد الرؤوس', 'رأس', true, 1, 100000, true), s('sex', 'الجنس', 'ذكور|إناث|مختلط', true), n('animalAge', 'العمر التقريبي', 'شهر', false, 0, 600, true), n('weight', 'متوسط الوزن', 'كجم', false, 0.1, 3000), s('animalPurpose', 'الغرض', 'تربية|إنتاج|تسمين|ذبح|أخرى'), s('priceBasis', 'السعر المحدد', 'للرأس|للمجموعة', true), t('health', 'الحالة الصحية والفحص'), t('vaccinations', 'التحصينات المسجلة'), when(s('pregnancy', 'حالة الحمل', 'حامل|غير حامل|غير معروف'), 'sex', 'إناث|مختلط'), delivery];
const furnishing = [materials, ...dimensions, t('color', 'اللون'), quantity, s('assembly', 'الفك والتركيب', 'قابل للفك|قطعة واحدة|يحتاج مختص'), delivery, t('defects', 'العيوب أو آثار الاستخدام')];
const service = [t('specialty', 'التخصص', true), t('coverage', 'نطاق الخدمة', true), s('pricingBasis', 'طريقة التسعير', 'بالساعة|بالزيارة|بالمشروع|حسب عرض السعر', true), n('experience', 'سنوات الخبرة', 'سنة', false, 0, 70, true), n('deliveryDays', 'المدة المتوقعة للتنفيذ', 'يوم', false, 1, 1000, true), t('scope', 'الأعمال المشمولة'), t('exclusions', 'الأعمال غير المشمولة'), warranty];
const supply = [t('productType', 'نوع المنتج', true), materials, n('minimumOrder', 'الحد الأدنى للطلب', '', true, 1), s('unit', 'وحدة البيع', 'قطعة|كرتون|طقم|كجم|طن|متر|متر مربع|متر مكعب|لتر', true), n('capacity', 'الطاقة أو الكمية المتاحة'), n('leadDays', 'مدة التجهيز', 'يوم', false, 0, 1000, true), t('origin', 'بلد المنشأ'), t('certifications', 'شهادات الجودة المتاحة'), s('sample', 'عينة متاحة', yes), delivery];
const job = [t('jobTitle', 'المسمى الوظيفي', true), t('employer', 'اسم جهة العمل'), s('workMode', 'نمط العمل', 'حضوري|هجين|عن بُعد', true), s('qualification', 'المؤهل', 'لا يشترط مؤهل|ثانوي|دبلوم|بكالوريوس|ماجستير|دكتوراه', true), n('experience', 'سنوات الخبرة', 'سنة', false, 0, 60, true), t('skills', 'المهارات المطلوبة'), t('languages', 'اللغات المطلوبة'), n('vacancies', 'عدد الشواغر', '', false, 1, 10000, true), ...group('الراتب والمزايا', [n('salaryMin', 'الراتب من', 'ر.س', false, 0, 10000000), n('salaryMax', 'الراتب إلى', 'ر.س', false, 0, 10000000), s('salaryPeriod', 'دورية الراتب', 'شهري|سنوي|بالساعة'), t('benefits', 'المزايا والبدلات')]), d('deadline', 'آخر موعد للتقديم'), t('application', 'آلية التقديم (دون بيانات حساسة)')];

export const catalog: Record<string, Record<string, Profile>> = {
  'عقارات': {
    'أراضٍ': p([sale, ...rent, n('plotArea', 'مساحة الأرض', 'م²', true, 1, 100000000), s('landUse', 'استخدام الأرض', 'سكني|تجاري|سكني تجاري|زراعي|صناعي|استثماري', true), s('terrain', 'طبيعة الأرض', 'مستوية|منحدرة|جبلية|تحتاج تسوية|غير معروف', true), s('landShape', 'شكل الأرض', 'مستطيلة|مربعة|غير منتظمة|أخرى'), s('corner', 'موقع القطعة', 'شارع واحد|زاوية|ثلاث شوارع|بلوك كامل'), s('soil', 'طبيعة التربة', 'رملية|صخرية|طينية|مختلطة|غير معروف'), n('permittedFloors', 'الأدوار المسموحة حسب المستند', '', false, 1, 200, true), t('ownership', 'نوع وثيقة الملكية (دون رقم أو صورة)'), t('restrictions', 'القيود أو الارتفاقات المعروفة'), ...location, ...boundaries], 'أرض تجارية مستوية 600 م² على شارعين', false, 'property'),
    'فلل ومنازل': p([...housing, n('plotArea', 'مساحة الأرض', 'م²', true, 1), n('builtArea', 'مسطح البناء', 'م²', true, 1), n('floors', 'عدد الأدوار', '', true, 1, 100, true), n('apartments', 'عدد الوحدات المستقلة', '', false, 0, 100, true), propertyAmenities, ...boundaries], 'فيلا 5 غرف بمسطح بناء 420 م² وتشطيب فاخر', false, 'property'),
    'شقق': p([...housing, n('area', 'مساحة الشقة', 'م²', true, 1), n('floorNumber', 'رقم الدور', '', true, -5, 200, true), n('buildingFloors', 'أدوار المبنى', '', false, 1, 200, true), n('unitsPerFloor', 'عدد الشقق في الدور', '', false, 1, 100, true), propertyAmenities, n('serviceFees', 'رسوم الخدمات السنوية', 'ر.س')], 'شقة 3 غرف بالدور الثاني مع مصعد وموقف', false, 'property'),
    'محلات ومكاتب': p([sale, ...rent, s('commercialType', 'نوع الوحدة', 'محل|مكتب|معرض|عيادة|أخرى', true), n('area', 'المساحة', 'م²', true, 1), n('floorNumber', 'رقم الدور', '', false, -5, 200, true), n('frontWidth', 'عرض الواجهة', 'م', false, 0.1), n('ceiling', 'ارتفاع السقف', 'م', false, 1, 100), s('fitOut', 'التجهيز', 'عظم|مشطب|مجهز للنشاط'), t('activity', 'النشاط المناسب'), n('parking', 'عدد المواقف', '', false, 0, 1000, true), n('bathrooms', 'دورات المياه', '', false, 0, 100, true), ...location], 'مكتب مجهز 120 م² مع مواقف', false, 'property'),
    'مستودعات': p([sale, ...rent, n('area', 'المساحة', 'م²', true, 1), n('ceiling', 'الارتفاع الصافي', 'م', true, 1, 100), s('storage', 'نوع التخزين', 'جاف|مبرد|مجمد|مختلط', true), n('powerKw', 'القدرة الكهربائية', 'كيلوواط'), n('loadingDoors', 'بوابات التحميل', '', false, 0, 100, true), s('truckAccess', 'دخول الشاحنات', yes), s('fireSystem', 'نظام مكافحة الحريق', 'متوفر|غير متوفر|غير معروف'), ...location], 'مستودع جاف بارتفاع 8 أمتار وبوابتي تحميل', false, 'property'),
    'عقارات أخرى': p([sale, ...rent, t('propertyType', 'نوع العقار', true), n('area', 'المساحة', 'م²', true, 1), t('usage', 'الاستخدام المناسب', true), s('completion', 'حالة الإنجاز', 'جاهز|قيد الإنشاء'), t('facilities', 'المرافق المتاحة'), ...location], 'عقار استثماري متعدد الاستخدامات', false, 'property'),
  },
  'سيارات': {
    'سيارات': p([...carCore, s('body', 'نوع الهيكل', 'سيدان|دفع رباعي|هاتشباك|كوبيه|بيك أب|فان|كشف|أخرى', true), s('drive', 'نظام الدفع', 'أمامي|خلفي|رباعي|كلي'), n('seats', 'عدد المقاعد', '', false, 1, 60, true), t('interiorColor', 'لون المقصورة'), m('features', 'التجهيزات', 'مثبت سرعة|كاميرا خلفية|كاميرا 360|حساسات|فتحة سقف|مقاعد جلد|تدفئة وتبريد مقاعد|مساعدة قيادة'), when(n('batteryHealth', 'صحة بطارية الدفع', '%', false, 0, 100), 'fuel', 'كهرباء|هجين'), when(n('range', 'المدى المقدر', 'كم', false, 1, 2000), 'fuel', 'كهرباء'), s('sellerType', 'صفة المعلن', 'مالك|معرض|وسيط')], 'سيارة عائلية 2023 خليجية ممشى 45 ألف كم'),
    'دراجات نارية': p([...carCore, s('bikeType', 'نوع الدراجة', 'رياضية|سكوتر|كروزر|طرق وعرة|رحلات|أخرى', true), s('cooling', 'التبريد', 'هوائي|سائل'), s('abs', 'فرامل ABS', yes), t('accessories', 'التجهيزات والملحقات')], 'دراجة رحلات 650 سم³ موديل 2022'),
    'قطع غيار': p([t('partType', 'نوع القطعة', true), t('partNumber', 'رقم القطعة'), s('partOrigin', 'تصنيف القطعة', 'أصلية|بديلة|مجددة|غير معروف', true), ...fitment, s('position', 'موضع التركيب', 'أمامي|خلفي|يمين|يسار|داخلي|أخرى'), warranty], 'كمبروسر مكيف أصلي متوافق مع موديلات 2018–2022'),
    'إكسسوارات': p([t('accessoryType', 'نوع الإكسسوار', true), ...fitment, t('material', 'الخامة'), t('connection', 'نوع التوصيل أو التثبيت'), s('installation', 'يشمل التركيب', yes), warranty], 'شاشة سيارة مع كاميرا وتركيب'),
    'إطارات وجنوط': p([s('itemType', 'النوع', 'إطار|جنط|طقم كامل', true), brand, t('tireSize', 'مقاس الإطار أو الجنط', true), n('diameter', 'قطر الجنط', 'بوصة', false, 8, 40), t('loadIndex', 'مؤشر الحمولة والسرعة'), t('productionCode', 'أسبوع وسنة الإنتاج'), n('tread', 'عمق النقشة', 'مم', false, 0, 30), quantity, delivery], 'طقم إطارات مقاس 265/65 R17'),
  },
  'معدات وآليات': {
    'معدات ثقيلة': p([...equipment, s('machineType', 'نوع المعدة', 'حفار|شيول|بلدوزر|رافعة|مدحلة|قريدر|أخرى', true), n('operatingWeight', 'الوزن التشغيلي', 'طن', false, 0.1, 1000), n('power', 'قوة المحرك', 'حصان'), n('capacity', 'الحمولة أو قدرة الرفع', 'طن'), n('digDepth', 'عمق الحفر', 'م'), t('attachments', 'الملحقات'), s('operator', 'مشغل متاح مع الإيجار', yes)], 'حفار 20 طن بساعات تشغيل موثقة'),
    'رافعات شوكية': p([...equipment, n('capacity', 'حمولة الرفع', 'طن', true, 0.1, 100), n('liftHeight', 'ارتفاع الرفع', 'م', true, 0.1, 100), s('fuel', 'مصدر الطاقة', 'ديزل|غاز|كهرباء', true), t('mast', 'نوع الصاري'), n('forkLength', 'طول الشوك', 'سم'), t('battery', 'مواصفات البطارية والشاحن')], 'رافعة شوكية كهربائية 3 طن بارتفاع 5 م'),
    'معدات ورش': p([...equipment, t('toolType', 'نوع الجهاز', true), n('voltage', 'الجهد', 'فولت', false, 1, 1000), s('phase', 'الطور الكهربائي', 'أحادي|ثلاثي|لا ينطبق'), n('powerKw', 'القدرة', 'كيلوواط'), t('workingRange', 'نطاق العمل أو المقاس'), t('included', 'الملحقات المشمولة')], 'ضاغط هواء للورشة 500 لتر'),
    'معدات زراعية': p([...equipment, t('machineType', 'نوع الآلة', true), n('power', 'قوة المحرك', 'حصان'), n('workingWidth', 'عرض العمل', 'م'), s('drive', 'الدفع', 'ثنائي|رباعي|غير ذاتي'), t('compatibility', 'التوافق مع الجرار'), t('attachments', 'الملحقات الزراعية')], 'جرار زراعي دفع رباعي مع ملحقات'),
    'شاحنات ونقليات': p([...carCore, s('truckType', 'نوع الشاحنة', 'رأس تريلا|قلاب|سطحة|صهريج|صندوق|براد|أخرى', true), n('payload', 'الحمولة', 'طن', true, 0.1, 500), n('axles', 'عدد المحاور', '', false, 2, 15, true), n('boxLength', 'طول الصندوق', 'م'), s('purpose', 'نوع العرض', 'للبيع|للإيجار', true), when(s('rentalUnit', 'وحدة الإيجار', 'يوم|شهر|رحلة', true), 'purpose', 'للإيجار')], 'شاحنة براد حمولة 10 طن'),
    'معدات أخرى': p([...equipment, t('machineType', 'نوع المعدة', true), t('application', 'الاستخدام'), t('capacitySpec', 'السعة الإنتاجية ووحدتها'), t('energy', 'مصدر الطاقة'), ...dimensions], 'معدة متخصصة جاهزة للعمل'),
  },
  'مواشي وزراعة': {
    'أغنام': p([...animals, s('sheepType', 'الفئة', 'ضأن|ماعز', true), s('ageClass', 'الفئة العمرية', 'رضيع|جذع|ثني|رباع|سديس|كبير')], 'غنم نجدي للتربية مع سجل تحصينات', false),
    'إبل': p([...animals, t('camelType', 'نوع الإبل'), s('camelUse', 'الاستخدام المتخصص', 'إنتاج|حليب|ركوب|سباق|مزاين|غير ذلك'), t('lineage', 'النسب المعلن')], 'ناقة إنتاج مع تفاصيل العمر والحالة', false),
    'خيول': p([...animals, n('height', 'الارتفاع عند الكتف', 'سم', false, 30, 250), t('training', 'مستوى التدريب'), s('passport', 'جواز أو وثائق متاحة', yes), t('discipline', 'التخصص الرياضي')], 'حصان عربي مدرب للركوب', false),
    'أبقار': p([...animals, n('milkYield', 'إنتاج الحليب اليومي المعلن', 'لتر'), n('lactations', 'عدد الولادات', '', false, 0, 30, true)], 'أبقار حلوب مع تفاصيل الإنتاج', false),
    'مستلزمات مواشي': p([t('supplyType', 'نوع المستلزم', true), s('animalType', 'الحيوان المناسب', 'أغنام|إبل|خيول|أبقار|دواجن|متعدد'), materials, n('capacity', 'السعة', 'لتر'), ...dimensions, quantity, delivery], 'معالف ومشارب للمواشي'),
    'شتلات ونباتات': p([t('plantName', 'اسم النبات أو الصنف', true), s('plantType', 'نوع النبات', 'شجرة|نخلة|شتلة خضار|زهور|نبات داخلي|نبات خارجي', true), n('height', 'ارتفاع النبات', 'سم', false, 1), n('potSize', 'قطر الأصيص', 'سم'), n('plantAge', 'العمر', 'شهر'), s('light', 'الاحتياج للضوء', 'شمس مباشرة|ظل جزئي|ضوء غير مباشر'), t('watering', 'احتياج الري'), t('climate', 'ملاءمة المناخ'), s('grafted', 'مطعمة', yes), quantity, delivery], 'شتلات ليمون مطعمة مناسبة للحدائق', false),
    'أعلاف': p([t('feedType', 'نوع العلف', true), s('animalType', 'الحيوان المستهدف', 'أغنام|إبل|خيول|أبقار|دواجن|متعدد', true), s('form', 'شكل العلف', 'حبوب|مكعبات|مطحون|بالات|سائل|أخرى'), n('protein', 'نسبة البروتين المعلنة', '%', false, 0, 100), n('packWeight', 'وزن العبوة أو البالة', 'كجم', true, 0.1), s('priceBasis', 'وحدة السعر', 'كيس|بالة|كجم|طن', true), d('productionDate', 'تاريخ الإنتاج'), d('expiryDate', 'تاريخ الانتهاء'), t('storage', 'ظروف التخزين'), quantity, delivery], 'علف أغنام مع بيانات البروتين ووزن الكيس', false),
    'بذور وأسمدة': p([s('productType', 'النوع', 'بذور|سماد|تربة|محسن تربة', true), t('crop', 'المحصول أو الاستخدام', true), t('composition', 'التركيب أو نسبة NPK'), n('packWeight', 'وزن العبوة', 'كجم', false, 0.01), n('germination', 'نسبة الإنبات المعلنة للبذور', '%', false, 0, 100), d('expiryDate', 'تاريخ الانتهاء'), t('origin', 'بلد المنشأ'), quantity, delivery], 'بذور خضروات مع تاريخ الصلاحية', false),
    'مستلزمات زراعية': p([t('itemType', 'نوع المستلزم', true), s('application', 'مجال الاستخدام', 'ري|زراعة محمية|أدوات يدوية|تربة|أخرى', true), materials, t('diameter', 'القطر أو المقاس'), n('pressure', 'ضغط التشغيل', 'بار'), t('compatibility', 'التوافق'), quantity, delivery], 'شبكة ري بالتنقيط للمزرعة'),
    'أخرى': p([t('itemType', 'نوع العرض الزراعي', true), t('purpose', 'الاستخدام', true), t('variety', 'الصنف'), quantity, s('unit', 'الوحدة', 'قطعة|كجم|طن|صندوق|رأس'), t('specification', 'المواصفات'), delivery], 'عرض متخصص في الزراعة أو الثروة الحيوانية', false),
  },
  'إلكترونيات': {
    'جوالات': p([...product, n('storage', 'سعة التخزين', 'GB', true, 1, 8192), n('ram', 'الذاكرة العشوائية', 'GB', false, 1, 64), s('os', 'نظام التشغيل', 'iOS|Android|أخرى'), n('batteryHealth', 'صحة البطارية', '%', false, 0, 100), s('sim', 'نوع الشرائح', 'شريحة|شريحتان|eSIM|شريحة وeSIM'), t('repairs', 'الصيانة والقطع المستبدلة'), t('accessories', 'الملحقات'), t('color', 'اللون')], 'جوال 256 GB مع توضيح صحة البطارية'),
    'كمبيوتر ولابتوب': p([...product, s('deviceType', 'نوع الجهاز', 'لابتوب|مكتبي|الكل في واحد', true), t('cpu', 'المعالج', true), n('ram', 'الذاكرة العشوائية', 'GB', true, 1, 2048), n('storage', 'التخزين', 'GB', true, 1, 100000), s('storageType', 'نوع التخزين', 'SSD|HDD|SSD وHDD'), t('gpu', 'بطاقة الرسوميات'), n('screen', 'حجم الشاشة', 'بوصة', false, 5, 100), t('os', 'نظام التشغيل'), t('keyboard', 'لغة لوحة المفاتيح'), t('battery', 'حالة البطارية'), t('defects', 'العيوب المعروفة')], 'لابتوب أعمال 16 GB و512 GB SSD'),
    'كاميرات': p([...product, s('cameraType', 'نوع الكاميرا', 'Mirrorless|DSLR|مدمجة|أكشن|فيديو|أخرى', true), t('sensor', 'حجم المستشعر'), n('megapixels', 'الدقة', 'MP', false, 1, 300), n('shutter', 'عدد اللقطات', 'لقطة', false, 0, 5000000, true), t('mount', 'قاعدة العدسات'), t('lens', 'العدسة المشمولة'), t('video', 'دقة الفيديو'), t('accessories', 'الملحقات')], 'كاميرا بدون مرآة مع عدسة وعدد لقطات موضح'),
    'أجهزة ألعاب': p([...product, s('platform', 'المنصة', 'PlayStation|Xbox|Nintendo|PC محمول|أخرى', true), n('storage', 'التخزين', 'GB', false, 1, 8192), s('edition', 'الإصدار', 'أقراص|رقمي|أخرى'), n('controllers', 'عدد أذرع التحكم', '', false, 0, 20, true), t('games', 'الألعاب المشمولة'), t('defects', 'العيوب')], 'جهاز ألعاب مع ذراعي تحكم'),
    'أجهزة أخرى': p([...product, t('deviceType', 'نوع الجهاز', true), t('specifications', 'المواصفات الفنية', true), t('connectivity', 'الاتصال والتوافق'), t('power', 'مصدر الطاقة'), t('accessories', 'الملحقات')], 'جهاز إلكتروني بمواصفات واضحة'),
  },
  'منزل وأثاث': {
    'أثاث منزلي': p([s('furnitureType', 'نوع الأثاث', 'كنب|سرير|طاولة|خزانة|كرسي|طقم|أخرى', true), ...furnishing, n('seats', 'عدد المقاعد إن وجدت', '', false, 1, 100, true), s('style', 'النمط', 'مودرن|كلاسيكي|ريفي|صناعي|أخرى')], 'كنبة 3 مقاعد بقماش قابل للتنظيف'),
    'أثاث مكتبي': p([s('furnitureType', 'نوع الأثاث المكتبي', 'مكتب|كرسي مكتب|طاولة اجتماعات|خزانة ملفات|طقم مكتب', true), ...furnishing, s('adjustable', 'قابلية التعديل', 'ارتفاع|ظهر|ارتفاع وظهر|ثابت'), n('stations', 'عدد محطات العمل', '', false, 1, 1000, true)], 'مكاتب لفريق من 6 أشخاص مع المقاسات'),
    'أجهزة منزلية': p([...product, s('applianceType', 'نوع الجهاز', 'ثلاجة|غسالة|مكيف|فرن|غسالة صحون|مكنسة|أخرى', true), t('capacity', 'السعة ووحدتها', true), n('voltage', 'الجهد', 'فولت', false, 1, 1000), t('energyRating', 'تصنيف كفاءة الطاقة'), ...dimensions, n('age', 'عمر الاستخدام', 'شهر', false, 0, 600, true), t('repairs', 'الأعطال والإصلاحات')], 'ثلاجة 450 لتر مع تصنيف كفاءة الطاقة'),
    'أواني منزلية': p([s('utensilType', 'نوع الأواني', 'قدور|مقالي|صحون|أكواب|أدوات تقديم|أدوات مطبخ|طقم', true), materials, n('pieces', 'عدد القطع', '', true, 1, 1000, true), n('capacity', 'السعة', 'لتر', false, 0.01), n('diameter', 'القطر', 'سم', false, 0.1), m('compatible', 'ملاءمة الاستخدام', 'غاز|كهرباء|حث حراري|فرن|ميكروويف|غسالة صحون'), s('coating', 'الطلاء', 'غير لاصق|بدون طلاء|مينا|أخرى'), brand, delivery], 'طقم قدور ستانلس 8 قطع مناسب للحث'),
    'ديكور': p([s('decorType', 'نوع الديكور', 'مرآة|لوحة|سجادة|ستارة|إنارة|تحفة|ورق جدران|أخرى', true), ...furnishing, s('style', 'الطراز', 'مودرن|كلاسيكي|تراثي|مينيمال|أخرى'), s('placement', 'الاستخدام', 'داخلي|خارجي|كلاهما'), s('installation', 'يشمل التركيب', yes)], 'مرآة جدارية مع المقاسات والخامة'),
  },
  'خدمات': {
    'صيانة وتركيب': p([...service, s('trade', 'مجال الصيانة', 'كهرباء|سباكة|تكييف|أجهزة|أثاث|أخرى', true), s('materialsIncluded', 'المواد وقطع الغيار', 'مشمولة|غير مشمولة|حسب المعاينة'), s('visit', 'زيارة معاينة', 'مجانية|برسوم|غير متاحة'), s('emergency', 'خدمة طوارئ', yes)], 'صيانة وتركيب مكيفات مع ضمان عمل', false, 'service'),
    'نقل وتوصيل': p([...service, s('transportType', 'نوع النقل', 'أثاث|بضائع|طرود|نقل ثقيل|مبرد', true), t('origin', 'مدينة الانطلاق'), t('destination', 'الوجهة أو المسارات'), n('capacity', 'الحمولة المتاحة', 'طن'), m('included', 'الخدمات المشمولة', 'تحميل وتنزيل|تغليف|فك وتركيب|تبريد|تأمين نقل'), t('vehicle', 'نوع المركبة')], 'نقل أثاث بين المدن مع تغليف', false, 'service'),
    'تصميم وتقنية': p([...service, t('deliverables', 'المخرجات المسلّمة', true), t('technology', 'التقنيات أو البرامج'), n('revisions', 'جولات التعديل', '', false, 0, 100, true), s('sourceFiles', 'تسليم الملفات المصدرية', yes), t('support', 'الدعم بعد التسليم')], 'تصميم هوية مع ملفات مفتوحة وجولتي تعديل', false, 'service'),
    'مقاولات وبناء': p([...service, s('scopeType', 'نوع المقاولة', 'عظم|تشطيب|ترميم|تسليم مفتاح|أعمال متخصصة', true), n('projectArea', 'مساحة المشروع', 'م²', false, 1), s('supply', 'توفير المواد', 'مع المواد|مصنعية فقط|حسب الاتفاق'), t('workStages', 'مراحل العمل والتسليم'), t('license', 'نوع الترخيص أو التصنيف المعلن')], 'مقاولات تشطيب مع نطاق أعمال واضح', false, 'service'),
    'خدمات أخرى': p([...service, t('serviceType', 'نوع الخدمة', true), t('deliverables', 'النتيجة المتوقعة', true), t('requirements', 'متطلبات بدء العمل')], 'خدمة متخصصة بنطاق ومدة واضحين', false, 'service'),
  },
  'شركات وموردون': {
    'توريد منتجات': p([...supply, t('packaging', 'التعبئة والتغليف'), s('customization', 'التخصيص متاح', yes), t('specification', 'المواصفات الفنية')], 'توريد عبوات بكميات ومواصفات محددة', false, 'supplier'),
    'تصنيع': p([...supply, t('process', 'عملية التصنيع', true), t('tolerance', 'التفاوتات المطلوبة'), t('drawings', 'المخططات أو النماذج المطلوبة'), s('tooling', 'قوالب خاصة', yes)], 'تصنيع قطع حسب المقاس والمادة', false, 'supplier'),
    'تجارة بالجملة': p([...supply, n('cartonUnits', 'عدد القطع في الكرتون', '', false, 1, 100000, true), t('tiers', 'شرائح سعر الكميات'), t('shelfLife', 'الصلاحية إن وجدت'), t('returns', 'شروط الاستبدال')], 'منتجات جملة بحد أدنى واضح', false, 'supplier'),
    'مواد بناء': p([...supply, s('buildingType', 'فئة المادة', 'أسمنت|حديد|بلوك|رمل وبحص|خشب|عزل|أخرى', true), t('grade', 'الدرجة أو المواصفة الفنية'), t('size', 'المقاس أو القطر'), n('packWeight', 'وزن العبوة', 'كجم'), t('strength', 'المقاومة المعلنة ووحدتها')], 'حديد تسليح بمقاسات ومواصفات معلنة', false, 'supplier'),
    'بلاط وأرضيات': p([...supply, s('tileType', 'نوع الأرضية', 'سيراميك|بورسلان|رخام|جرانيت|باركيه|فينيل', true), ...dimensions, n('thickness', 'السماكة', 'مم', false, 0.1), n('boxArea', 'تغطية الكرتون', 'م²', false, 0.01), s('finish', 'السطح', 'مطفي|لامع|خشن|مصقول'), s('usage', 'مكان الاستخدام', 'داخلي|خارجي|رطب|متعدد')], 'بورسلان 60 × 60 سم مع تغطية الكرتون', false, 'supplier'),
    'أخرى': p([...supply, t('businessType', 'نوع النشاط', true), t('specification', 'المواصفات أو نطاق التوريد', true), t('afterSale', 'خدمات ما بعد البيع')], 'عرض تجاري متخصص للشركات', false, 'supplier'),
  },
  'وظائف': {
    'دوام كامل': p([...job, s('contract', 'نوع العقد', 'محدد المدة|غير محدد المدة|مشروع'), n('weeklyHours', 'ساعات العمل الأسبوعية', 'ساعة', false, 1, 84), t('schedule', 'أيام ومواعيد العمل')], 'محاسب دوام كامل بخبرة سنتين', false, 'salary'),
    'دوام جزئي': p([...job, n('weeklyHours', 'الساعات الأسبوعية', 'ساعة', true, 1, 84), t('schedule', 'الأيام والفترات', true), s('flexible', 'مرونة الساعات', yes)], 'دعم عملاء بدوام جزئي 20 ساعة أسبوعياً', false, 'salary'),
    'عمل عن بُعد': p([...job.filter(f => f.id !== 'workMode'), s('workMode', 'نمط العمل', 'عن بُعد', true), t('timezone', 'المنطقة الزمنية المطلوبة', true), t('remoteRegion', 'نطاق التوظيف الجغرافي'), s('equipmentProvided', 'توفير أجهزة العمل', yes), t('overlapHours', 'ساعات التواجد المشترك')], 'مطور واجهات عن بُعد بتوقيت الرياض', false, 'salary'),
    'تدريب': p([...job, t('trainingField', 'مجال التدريب', true), n('durationWeeks', 'مدة التدريب', 'أسبوع', true, 1, 104, true), s('trainingType', 'نوع التدريب', 'تعاوني|صيفي|مهني|تأهيل للخريجين', true), s('paid', 'مكافأة تدريب', 'متاحة|غير متاحة|يحدد لاحقاً'), s('certificate', 'شهادة إتمام', yes)], 'تدريب تعاوني في المحاسبة لمدة 12 أسبوعاً', false, 'salary'),
  },
  'أخرى': {
    'رياضة وهوايات': p([t('sport', 'النشاط أو الرياضة', true), t('itemType', 'نوع الأداة', true), brand, t('size', 'المقاس'), s('skillLevel', 'المستوى', 'مبتدئ|متوسط|متقدم|كل المستويات'), t('material', 'الخامة'), t('accessories', 'الملحقات'), delivery], 'دراجة مدينة مع المقاس والملحقات'),
    'مستلزمات شخصية': p([t('itemType', 'نوع المستلزم', true), brand, t('size', 'المقاس'), t('material', 'الخامة'), t('color', 'اللون'), s('packaging', 'التغليف', 'مغلق|مفتوح|بدون تغليف'), delivery], 'حقيبة سفر مع الأبعاد والخامة'),
    'كتب': p([t('bookTitle', 'اسم الكتاب', true), t('author', 'المؤلف', true), t('language', 'اللغة'), t('isbn', 'ISBN'), t('publisher', 'الناشر'), n('edition', 'رقم الطبعة', '', false, 1, 100, true), n('publicationYear', 'سنة النشر', '', false, 1400, 2100, true), s('binding', 'نوع الغلاف', 'ورقي|مقوى'), t('annotations', 'الكتابة أو التلف'), quantity, delivery], 'كتاب ورقي مع المؤلف والطبعة'),
    'أخرى': p([t('itemType', 'نوع المعروض', true), t('usage', 'الاستخدام', true), brand, t('material', 'الخامة'), t('size', 'المقاس أو السعة'), quantity, delivery], 'معروض آخر بوصف محدد ومقاسات واضحة'),
  },
};

export function getProfile(category: string, subcategory: string): Profile | undefined {
  if (!Object.hasOwn(catalog, category) || !Object.hasOwn(catalog[category], subcategory)) return undefined;
  return catalog[category][subcategory];
}
export function visibleFields(profile: Profile | undefined, details: Details): Field[] {
  return (profile?.fields ?? []).filter(f => !f.when || (typeof details[f.when.field] === 'string' && f.when.values.includes(details[f.when.field] as string)));
}
export function normalizeNumber(value: string): string {
  return value.trim().replace(/[٠-٩]/g, x => String(x.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, x => String(x.charCodeAt(0) - 1776)).replace(/٫/g, '.').replace(/٬/g, '');
}
export function updateDetail(profile: Profile | undefined, details: Details, id: string, value: string | string[]): Details {
  if (!profile?.fields.some(f => f.id === id)) return details;
  const next = { ...details, [id]: value };
  // Preserve archived and retired values. Only an actual controller change prunes dependents.
  const changed = [id];
  for (let i = 0; i < changed.length; i++) {
    for (const f of profile.fields) {
      if (f.when?.field === changed[i] && !f.when.values.includes(String(next[f.when.field] ?? '')) && Object.hasOwn(next, f.id)) { delete next[f.id]; changed.push(f.id); }
    }
  }
  return next;
}
export function cleanDetails(profile: Profile | undefined, value: unknown): Details {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Details : {};
  const result: Details = {};
  for (const f of visibleFields(profile, raw)) {
    if (!Object.hasOwn(raw, f.id)) continue;
    const v = raw[f.id];
    if (f.type === 'multi' && Array.isArray(v)) {
      const selected = [...new Set(v.filter(item => typeof item === 'string' && f.options?.includes(item)))];
      if (selected.length) result[f.id] = selected;
    } else if (typeof v === 'string' && v.trim() && v.length <= 300) {
      if (f.type === 'select' && !f.options?.includes(v)) continue;
      result[f.id] = f.type === 'number' ? normalizeNumber(v) : v.trim();
    }
  }
  return result;
}
export function validateDetails(profile: Profile | undefined, details: Details, intent: 'offer' | 'wanted'): Record<string, string> {
  const errors: Record<string, string> = {};
  const visibleIds = new Set(visibleFields(profile, details).map(f => f.id));
  for (const f of visibleFields(profile, details)) {
    const v = details[f.id];
    if (v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) {
      if (f.required && intent === 'offer') errors[f.id] = `أكمل حقل ${f.label}.`;
      continue;
    }
    if (f.type === 'multi') {
      if (!Array.isArray(v) || v.some(item => !f.options?.includes(item))) errors[f.id] = 'اختر من الخيارات المتاحة.';
    } else if (typeof v !== 'string' || v.length > 300) errors[f.id] = 'أدخل قيمة نصية لا تتجاوز 300 حرف.';
    else if (f.type === 'select' && !f.options?.includes(v)) errors[f.id] = 'اختر قيمة من القائمة.';
    else if (f.type === 'number') {
      const normalized = normalizeNumber(v); const number = Number(normalized);
      if (!/^-?\d+(\.\d+)?$/.test(normalized) || !Number.isFinite(number) || number < (f.min ?? 0) || number > (f.max ?? 1000000) || (f.integer && !Number.isInteger(number))) errors[f.id] = `أدخل ${f.integer ? 'عدداً صحيحاً' : 'رقماً'} بين ${f.min ?? 0} و${f.max ?? 1000000}.`;
    } else if (f.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)) errors[f.id] = 'أدخل تاريخاً صحيحاً.';
  }
  if (profile?.pricing === 'salary' && visibleIds.has('salaryMin') && visibleIds.has('salaryMax') && details.salaryMin && details.salaryMax && Number(normalizeNumber(String(details.salaryMin))) > Number(normalizeNumber(String(details.salaryMax)))) errors.salaryMax = 'الحد الأعلى للراتب يجب ألا يقل عن الحد الأدنى.';
  if (profile?.pricing === 'salary' && visibleIds.has('salaryPeriod') && ((visibleIds.has('salaryMin') && details.salaryMin) || (visibleIds.has('salaryMax') && details.salaryMax)) && !details.salaryPeriod) errors.salaryPeriod = 'حدد دورية الراتب لتوضيح المبلغ.';
  if (visibleIds.has('productionDate') && visibleIds.has('expiryDate') && details.productionDate && details.expiryDate && details.expiryDate < details.productionDate) errors.expiryDate = 'تاريخ الانتهاء يجب ألا يسبق الإنتاج.';
  return errors;
}
export function displayDetails(profile: Profile | undefined, details: Details): [string, string][] {
  const safe = cleanDetails(profile, details);
  return visibleFields(profile, safe).filter(f => Object.hasOwn(safe, f.id)).map(f => [f.label, `${Array.isArray(safe[f.id]) ? (safe[f.id] as string[]).join('، ') : safe[f.id]}${f.unit ? ` ${f.unit}` : ''}`]);
}
export function changeClassification<T extends { category: string; subcategory: string; price: string; condition: string; spec1: string; spec2: string; details: Details }>(form: T, category: string, subcategory = ''): T {
  if (form.category === category && form.subcategory === subcategory) return form;
  return { ...form, category, subcategory, details: {}, condition: '', price: '', spec1: '', spec2: '' };
}
