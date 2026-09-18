/**
 * Synthetic data for an isolated audit preview. Never imports production data.
 *
 * First generate Prisma and create the empty schema with `prisma db push`.
 * Required: DATABASE_URL (loopback / preview-db, database trbhh_preview_audit)
 *           PREVIEW_LOGIN_PASSWORD (a new strong, preview-only password).
 * Run: node scripts/preview/seed.mjs
 *
 * Accounts: preview (member), preview-store (merchant) and preview-admin (administrator), same supplied password.
 * No financial transaction, message,
 * notification, external contact detail, payment credential or MFA secret is seeded.
 * Images use the repository's own public/placeholder-ad.svg; no media is fetched.
 * Re-runs only recognize this exact seed marker and make no changes.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const DATABASE = 'trbhh_preview_audit';
const MARKER = 'preview_audit_seed';
const VERSION = '2026-09-10-v1';
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'preview-db']);
const DAY = 86_400_000;

const PREVIEW_CATEGORIES = [
  { id: 1n, name: 'عقارات', subs: ['شقق وفلل', 'أراضي', 'مكاتب ومستودعات'] },
  { id: 2n, name: 'سيارات ومستلزماتها', subs: ['سيارات', 'قطع غيار', 'إكسسوارات وخدمات سيارات'] },
  { id: 3n, name: 'نقليات ومعدات ثقيلة', subs: ['شاحنات', 'رافعات', 'معدات إنشائية', 'نقل وخدمات لوجستية'] },
  { id: 4n, name: 'زراعة ومشاتل وأعلاف', subs: ['مشاتل', 'أعلاف', 'معدات زراعية'] },
  { id: 5n, name: 'مواشي ومستلزماتها', subs: ['مواشي', 'طيور', 'مستلزمات وتغذية'] },
  { id: 6n, name: 'أواني منزلية', subs: ['أواني ومطابخ', 'أدوات منزلية'] },
  { id: 7n, name: 'ديكورات منزلية', subs: ['إضاءة', 'أثاث وديكور', 'ستائر وسجاد'] },
  { id: 8n, name: 'مواد بناء ومقاولات', subs: ['مواد بناء', 'تشطيبات', 'مقاولات وصيانة'] },
  { id: 9n, name: 'وظائف', subs: ['دوام كامل', 'دوام جزئي', 'عمل حر'] },
  { id: 10n, name: 'خدمات', subs: ['خدمات منزلية', 'نقل وتوصيل', 'خدمات أعمال'] },
  { id: 11n, name: 'فرص تجارية', subs: ['شراكات', 'امتيازات', 'مشاريع'] },
  { id: 12n, name: 'منتجات', subs: ['إلكترونيات', 'ملابس', 'متنوع'] },
  { id: 13n, name: 'أخرى', subs: [] },
];

function previewCategoryFor(title) {
  const t = String(title || '');
  if (t.includes('أوان')) return 6n;
  if (t.includes('إضاءة') || t.includes('رفوف')) return 7n;
  if (t.includes('معدات')) return 3n;
  if (t.includes('دراجة')) return 2n;
  if (t.includes('حاسب') || t.includes('شاشة')) return 12n;
  return 13n;
}

class PreviewGuardError extends Error {}
function guard(condition, message) {
  if (!condition) throw new PreviewGuardError(message);
}

async function seed() {
  let url;
  try { url = new URL(process.env.DATABASE_URL || ''); }
  catch { throw new PreviewGuardError('Provide an explicit preview DATABASE_URL.'); }
  guard(url.protocol === 'mysql:', 'Only a MySQL preview database is allowed.');
  guard(ALLOWED_HOSTS.has(url.hostname), 'Refusing a database outside the preview host allowlist.');
  guard(url.pathname === `/${DATABASE}`, 'Refusing a database other than trbhh_preview_audit.');
  // Disallow socket or host override query parameters, even for an otherwise safe URL.
  guard([...url.searchParams.keys()].every((key) => ['connection_limit', 'pool_timeout', 'connect_timeout'].includes(key)), 'Unsupported database connection parameter.');
  const password = process.env.PREVIEW_LOGIN_PASSWORD || '';
  guard([...password].length >= 12 && Buffer.byteLength(password, 'utf8') <= 72, 'Supply a preview password of at least 12 characters and at most 72 UTF-8 bytes.');
  guard(!/^\p{N}+$/u.test(password) && !/^(.)\1+$/u.test(password) && !/^(password|qwerty|123456|كلمة المرور)+[\d!@#$]*$/i.test(password), 'Supply a strong preview-only password.');

  const prisma = new PrismaClient({ log: [] });
  try {
    const actual = await prisma.$queryRaw`SELECT DATABASE() AS name`;
    guard(actual[0]?.name === DATABASE, 'The connected database does not match the explicit preview name.');
    const marker = await prisma.site_settings.findUnique({ where: { k: MARKER } });
    if (marker) {
      guard(marker.v === VERSION, 'A different preview seed version already exists; no changes made.');
      console.info('[preview-seed] This preview was already seeded; no data or password changed.');
      return;
    }
    // Check actual rows, not information_schema's approximate row estimates.
    // Table names are database-provided and restricted to identifiers before interpolation.
    const tables = await prisma.$queryRaw`SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ${DATABASE} AND TABLE_TYPE = 'BASE TABLE'`;
    for (const { name } of tables) {
      if (name === '_prisma_migrations') continue;
      guard(/^[a-zA-Z0-9_]+$/.test(name), 'Unexpected table identifier in preview database.');
      const rows = await prisma.$queryRawUnsafe(`SELECT 1 AS present FROM \`${name}\` LIMIT 1`);
      guard(rows.length === 0, `Preview database must be empty before seeding (table: ${name}).`);
    }

    const hash = await bcrypt.hash(password, 10);
    const now = new Date();
    const before = (days) => new Date(now.getTime() - days * DAY);
    const after = (days) => new Date(now.getTime() + days * DAY);
    const member = 1001n;
    const merchant = 1002n;
    const memberProfile = 1001n;
    const merchantProfile = 1002n;
    const storeProfile = 1003n;

    await prisma.$transaction(async (db) => {
      await db.site_settings.createMany({ data: Object.entries({
        [MARKER]: VERSION,
        site_share_title: 'تربح — معاينة مستقلة ببيانات تجريبية',
        site_share_desc: 'هذه نسخة معاينة مستقلة؛ جميع الحسابات والإعلانات والأسعار والإحصاءات تجريبية.',
        home_discovery_on: '1', search_price_filter_on: '1', ad_mobile_contact_on: '1',
        categories_v2_on: '1',
        store_landing_on: '1', store_onboarding_on: '1',
        home_discovery_title: 'تربح — معاينة تجريبية',
        home_discovery_subtitle: 'جرّب التصميم والبحث والمتاجر. جميع البيانات هنا تجريبية وليست عروضًا للبيع.',
        ticker_note: 'نسخة معاينة تجريبية مستقلة — البيانات والأسعار صناعية ولا تمثل عروض بيع.',
        store_landing_intro: 'هذه أسعار تجريبية لعرض تصميم صفحة المتجر، وليست تسعيرة الموقع الأساسي.',
        sub_store_enabled: '1', sub_store_monthly: '29', sub_store_6mo: '149', sub_store_yearly: '249',
        sub_trial_days: '14', sub_grace_days: '0',
        auth_require_admin_mfa: '0', auth_password_min: '12',
        otp_enabled: '0', sms_username: '', sms_password: '', sms_sender: '', wa_instance: '', wa_token: '',
        push_on: '0', vapid_public: '', vapid_private: '',
        pay_online_on: '0', payment_electronic_enabled: '0', payment_transfer_enabled: '0',
        pay_provider: '', pay_mode: 'test', pay_methods: '[]',
        platform_ad_lifecycle_enabled: '0', platform_ad_sms_enabled: '0',
        autorenew_on: '0', sub_remind_days: '0', sub_remind_count: '0', archive_autodelete_on: '0',
        lead_on: '0', plus_on: '0',
        topup_accounts: '[]',
        feed_texts_promo: 'هذه نسخة معاينة مستقلة ببيانات صناعية. لا تنفّذ معاملات مالية أو طلبات شراء.',
        feed_texts_aware: 'يمكنك تجربة الفلاتر والمفضلة وتصميم المتجر دون تغيير الموقع الأساسي.',
      }).map(([k, v]) => ({ k, v })) });
      await db.settings.create({ data: {
        name: 'تربح — معاينة تجريبية', logo: 0, default_image: 0, active_register: 0,
        description: 'معاينة معزولة ببيانات صناعية فقط',
        login_message: 'استخدم حساب المعاينة المخصص؛ بيانات الموقع الأساسي غير موجودة هنا.',
        created_at: now, updated_at: now,
      } });
      await db.countries.create({ data: { id: 1, name: 'المملكة العربية السعودية', key: '966', send_sms: 0 } });
      await db.categories.createMany({ data: PREVIEW_CATEGORIES.map((cat, index) => ({
        id: cat.id, name: cat.name, photo_path: '', is_active: 'yes', ordered: PREVIEW_CATEGORIES.length - index,
        created_at: now, updated_at: now,
      })) });
      const subRows = [];
      let subId = 100n;
      for (const cat of PREVIEW_CATEGORIES) for (const name of cat.subs) {
        subRows.push({ id: ++subId, category_id: Number(cat.id), name, order: subRows.length, active: 1, created_at: now, updated_at: now });
      }
      if (subRows.length) await db.sub_categories.createMany({ data: subRows });
      const subIdFor = (categoryId, name) => Number(subRows.find((row) => row.category_id === categoryId && row.name === name)?.id || 0) || null;
      const specialized = [
        [1, 'أراضي', [['land_use','الاستخدام','select','سكني|تجاري|زراعي|صناعي','متر مربع'],['level','مستوى الأرض','select','مستوية|منحدرة|مردومة',''],['frontages','عدد الواجهات','number','','واجهة'],['street_width','عرض الشارع','number','','متر'],['utilities','الخدمات المتوفرة','select','كهرباء|ماء|صرف صحي|كاملة|غير متوفرة','']]],
        [1, 'شقق وفلل', [['property_kind','نوع العقار','select','شقة|فيلا|دور|دوبلكس',''],['built_area','مساحة البناء','number','','متر مربع'],['bedrooms','غرف النوم','number','','غرفة'],['bathrooms','دورات المياه','number','','دورة'],['finishing','التشطيب','select','عادي|متوسط|فاخر|سوبر ديلوكس',''],['rent_price','سعر الإيجار','number','','ريال']]],
        [2, 'سيارات', [['make','الماركة','text','',''],['model','الموديل','text','',''],['year','سنة الموديل','number','',''],['mileage','العداد','number','','كم'],['fuel','الوقود','select','بنزين|ديزل|هجين|كهرباء',''],['transmission','القير','select','أوتوماتيك|عادي|CVT',''],['drive','الدفع','select','أمامي|خلفي|رباعي','']]],
        [3, 'شاحنات', [['equipment_type','نوع المعدة','text','',''],['load_capacity','الحمولة','number','','طن'],['manufacture_year','سنة الصنع','number','',''],['operating_hours','ساعات التشغيل','number','','ساعة'],['condition','الحالة','select','جديد|مستعمل|مجدد','']]],
        [4, 'مشاتل', [['plant_type','نوع النبات','text','',''],['age','عمر النبات','number','','شهر'],['quantity','الكمية','number','','حبة'],['irrigation','طريقة الري','select','تنقيط|رش|يدوي|أخرى','']]],
        [5, 'مواشي', [['animal_species','النوع','select','أغنام|ماعز|إبل|أبقار',''],['breed','السلالة','text','',''],['age','العمر','number','','شهر'],['count','العدد','number','','رأس'],['health','الحالة الصحية','select','سليمة|تحتاج فحصاً|مريضة','']]],
        [6, 'أواني ومطابخ', [['material','الخامة','select','ستانلس ستيل|ألمنيوم|زجاج|سيراميك|بلاستيك',''],['pieces','عدد القطع','number','','قطعة'],['condition','الحالة','select','جديد|مستعمل','']]],
        [7, 'أثاث وديكور', [['material','الخامة','text','',''],['dimensions','الأبعاد','text','',''],['color','اللون','text','',''],['condition','الحالة','select','جديد|مستعمل|مصمم حسب الطلب','']]],
        [8, 'مواد بناء', [['material','نوع المادة','text','',''],['quantity','الكمية','number','',''],['unit','وحدة القياس','select','قطعة|متر|كيس|طن|متر مربع',''],['brand','الشركة المصنعة','text','','']]],
        [9, 'دوام كامل', [['job_title','المسمى الوظيفي','text','',''],['experience','سنوات الخبرة','number','','سنة'],['salary','الراتب','number','','ريال'],['work_mode','نظام العمل','select','حضوري|عن بعد|هجين','']]],
        [10, 'خدمات منزلية', [['service_type','نوع الخدمة','text','',''],['service_area','نطاق الخدمة','text','',''],['price_mode','طريقة التسعير','select','بالساعة|بالمهمة|عرض سعر','']]],
        [11, 'مشاريع', [['activity','النشاط','text','',''],['capital','رأس المال المطلوب','number','','ريال'],['partner_role','نوع الشريك','text','','']]],
        [12, 'إلكترونيات', [['product_brand','العلامة التجارية','text','',''],['product_model','الموديل','text','',''],['product_condition','الحالة','select','جديد|مستعمل|مجدد',''],['product_quantity','الكمية','number','','قطعة']]],
      ].flatMap(([categoryId, subName, specs]) => specs.map(([field_key,label,field_type,options,unit], index) => ({ category_id: BigInt(categoryId), subcategory_id: subIdFor(categoryId, subName), field_key, label, field_type, options, unit: unit || null, required: 0, active: 1, searchable: 1, ordered: index })));
      await db.category_field_defs.createMany({ data: [
        { category_id: 1n, field_key: 'property_type', label: 'نوع العقار', field_type: 'select', options: 'شقة|فيلا|أرض|مكتب|مستودع', required: 0, ordered: 1 },
        { category_id: 2n, field_key: 'vehicle_make', label: 'الماركة أو النوع', field_type: 'text', required: 0, ordered: 1 },
        { category_id: 3n, field_key: 'capacity', label: 'السعة أو الحمولة', field_type: 'text', required: 0, ordered: 1 },
        { category_id: 4n, field_key: 'agriculture_kind', label: 'نوع المنتج الزراعي', field_type: 'text', required: 0, ordered: 1 },
        { category_id: 5n, field_key: 'livestock_kind', label: 'نوع الماشية أو المستلزم', field_type: 'text', required: 0, ordered: 1 },
        { category_id: 8n, field_key: 'contract_type', label: 'نوع العمل أو المادة', field_type: 'text', required: 0, ordered: 1 },
        ...specialized,
      ] });
      const regions = ['الرياض', 'مكة المكرمة', 'المدينة المنورة', 'القصيم', 'المنطقة الشرقية', 'عسير', 'تبوك', 'حائل', 'الحدود الشمالية', 'جازان', 'نجران', 'الباحة', 'الجوف'];
      await db.cities.createMany({ data: regions.map((name, i) => ({ id: BigInt(i + 1), name, country_id: 1, ordered: i + 1 })) });
      // cities = regions, areas = cities. The app fills the remaining Saudi cities itself.
      await db.areas.createMany({ data: [
        { id: 1n, name: 'الرياض', city_id: 1 }, { id: 2n, name: 'الدرعية', city_id: 1 },
        { id: 3n, name: 'جدة', city_id: 2 }, { id: 4n, name: 'مكة المكرمة', city_id: 2 },
        { id: 5n, name: 'المدينة المنورة', city_id: 3 }, { id: 6n, name: 'الخبر', city_id: 5 },
      ] });
      await db.users.createMany({ data: [
        { id: member, userName: 'preview', name: 'عضو المعاينة', email: 'member@example.test', city_id: 1n },
        { id: merchant, userName: 'preview-store', name: 'تاجر المعاينة', email: 'merchant@example.test', city_id: 2n },
        { id: 1003n, userName: 'preview-admin', name: 'مدير المعاينة', email: 'admin@example.test', city_id: 1n, is_admin: 1 },
      ].map((user) => ({ ...user, password: hash, type: 'user', is_admin: user.is_admin || 0, country_id: 1,
        auth_session_version: randomUUID(), created_at: before(90), updated_at: now,
        allow_phone: 0, whatsapp: 0, phoneNumber: null, balance: 0, balance_halala: 0,
      })) });
      await db.stores.createMany({ data: [
        { id: 1n, user_id: Number(merchant), store_name: 'متجر المعاينة', handle: 'preview-shop',
          about: 'متجر صناعي لتجربة التصميم وعرض المنتجات؛ جميع المنتجات والأسعار تجريبية.',
          tagline: 'تصميم جديد، وتجربة أوضح', description: 'بيانات تجريبية فقط',
          brand_color: '#b45309', banner: 'sunset', layout: 'luxury', catalog: 'tiles',
          catalog_fields: 'price,title,city', specialty: 'منتجات منزلية وتقنية تجريبية',
          status: 1, home_featured: 1, show_on_platform: 1, show_until: after(60), sub_until: after(60),
          terms_agreed: 1, terms_agreed_at: now, on_trial: 1, allow_ads: 1, allow_reviews: 0,
          product_note: 'للمعاينة فقط — لا توجد عمليات بيع حقيقية.', created_at: before(25), updated_at: now },
        { id: 2n, user_id: Number(merchant), store_name: 'متجر منتهي — اختبار الإخفاء', handle: 'preview-expired',
          status: 1, home_featured: 1, show_on_platform: 1, show_until: after(60), sub_until: before(90),
          terms_agreed: 1, created_at: before(120), updated_at: now },
        { id: 3n, user_id: Number(merchant), store_name: 'متجر قيد المراجعة — اختبار الإخفاء', handle: 'preview-pending',
          status: 0, home_featured: 1, show_on_platform: 1, show_until: after(60), sub_until: after(60),
          terms_agreed: 1, created_at: before(5), updated_at: now },
      ] });
      await db.profiles.createMany({ data: [
        { id: memberProfile, user_id: member, type: 'personal', name: 'عضو المعاينة', is_default: 1, status: 1 },
        { id: merchantProfile, user_id: merchant, type: 'personal', name: 'تاجر المعاينة', is_default: 1, status: 1 },
        { id: storeProfile, user_id: merchant, type: 'store', store_id: 1n, name: 'متجر المعاينة', status: 1 },
        { id: 1004n, user_id: merchant, type: 'store', store_id: 2n, name: 'متجر منتهي — معاينة', status: 1 },
        { id: 1005n, user_id: merchant, type: 'store', store_id: 3n, name: 'متجر قيد المراجعة — معاينة', status: 1 },
      ] });
      const fixtures = [
        { id: 101n, title: 'كنبة عصرية بحالة ممتازة — تجريبي', price: 1450, old_price: 1800, city_id: 1n, area_id: 1 },
        { id: 102n, title: 'كرسي مكتب مريح — تجريبي', price: 320, city_id: 1n, area_id: 2 },
        { id: 103n, title: 'معدات تخييم للإيجار اليومي — تجريبي', price: 120, price_type: 'rent', rent_period: 'يومي', city_id: 2n, area_id: 3 },
        { id: 104n, title: 'مطلوب طاولة مكتب — تجريبي', price: 0, adsType: 'request', city_id: 3n, area_id: 5 },
        { id: 105n, title: 'دراجة للمشي والرياضة — تجريبي', price: 680, city_id: 5n, area_id: 6 },
        { id: 106n, title: 'طقم أوانٍ منزلية — تجريبي', price: 0, city_id: 1n, area_id: 1 },
        { id: 201n, title: 'حاسب محمول للأعمال — تجريبي', price: 3490, old_price: 3990, city_id: 2n, area_id: 3 },
        { id: 202n, title: 'شاشة مكتبية 27 بوصة — تجريبي', price: 890, city_id: 2n, area_id: 3 },
        { id: 203n, title: 'رفوف خشبية متعددة الاستخدام — تجريبي', price: 250, city_id: 2n, area_id: 4 },
        { id: 204n, title: 'إضاءة مكتبية قابلة للتعديل — تجريبي', price: 95, city_id: 2n, area_id: 3 },
        { id: 301n, title: 'إعلان مخفي — للتحقق من عداد المفضلة', price: 10, status: 0, city_id: 1n, area_id: 1 },
        { id: 302n, title: 'إعلان مؤرشف — للتحقق من عداد المفضلة', price: 20, data_archive: now.toISOString(), city_id: 1n, area_id: 1 },
        { id: 401n, title: 'منتج متجر منتهي — يجب ألا يظهر بالرئيسية', price: 30, city_id: 2n, area_id: 3 },
        { id: 402n, title: 'منتج متجر غير معتمد — يجب ألا يظهر بالرئيسية', price: 40, city_id: 2n, area_id: 3 },
      ];
      await db.ads.createMany({ data: fixtures.map((ad, index) => {
        const storeId = ad.id === 401n ? 2 : ad.id === 402n ? 3 : ad.id >= 201n && ad.id <= 204n ? 1 : 0;
        return { adsType: 'offer', adsSpecial: 'no', state: 'active', status: 1, category_id: previewCategoryFor(ad.title),
          country_id: 1, user_id: storeId ? merchant : member, profile_id: storeId ? BigInt(1002 + storeId) : memberProfile,
          store_only: storeId ? 1 : 0, trbhh_until: storeId ? after(60) : null,
          title: ad.title, detail: 'إعلان تجريبي في نسخة معاينة مستقلة. لا يمثل منتجًا حقيقيًا أو عرض بيع. يمكنك استكشاف عرض السعر والفلاتر والمفضلة والإحصاءات.',
          video_path: '', phoneAllow: 0, commentAllow: 0, price_type: 'fixed',
          created_at: before(index / 3), updated_at: now, ...ad };
      }) });
      await db.uploads.createMany({ data: fixtures.map((ad) => ({ id: ad.id,
        file_original_name: 'preview-placeholder.svg', file_name: '/placeholder-ad.svg', extension: 'svg', type: 'image',
        user_id: Number(ad.id >= 201n && ad.id <= 204n ? merchant : member), created_at: now, updated_at: now })) });
      await db.photos.createMany({ data: fixtures.map((ad) => ({ other_id: ad.id, photo_path: String(ad.id), created_at: now, updated_at: now })) });
      await db.store_products.createMany({ data: [201, 202, 203, 204].map((ad_id) => ({ store_id: 1, ad_id })).concat([
        { store_id: 2, ad_id: 401 }, { store_id: 3, ad_id: 402 },
      ]) });
      await db.favorites.createMany({ data: [201n, 202n, 203n, 301n, 302n].map((ads_id) => ({ user_id: member, profile_id: memberProfile, ads_id })).concat([
        { user_id: merchant, profile_id: merchantProfile, ads_id: 101n },
        { user_id: merchant, profile_id: merchantProfile, ads_id: 103n },
      ]) });
      const views = [];
      const contacts = [];
      for (const ad of fixtures.slice(0, 10)) {
        for (let day = 0; day < 45; day++) {
          const count = (Number(ad.id) + day * 3) % 5 + 1;
          for (let visitor = 0; visitor < count; visitor++) views.push({ ads_id: ad.id,
            user_id: `preview-${ad.id}-${day}-${visitor}`, created_at: before(day), updated_at: before(day) });
          if (day % 5 === 0) contacts.push({ ad_id: ad.id, viewer: `preview-contact-${ad.id}-${day}`, kind: 'message', created_at: before(day) });
        }
      }
      await db.ads_views.createMany({ data: views });
      // Historical event counters only; this does not create or send any messages.
      await db.ad_contacts.createMany({ data: contacts });
    }, { timeout: 60_000, maxWait: 10_000 });
    console.info('[preview-seed] Created synthetic preview member, merchant and preview-only administrator.');
    console.info('[preview-seed] Public preview: 10 ads, 1 eligible store (/companies/preview-shop), 3 visible member favorites.');
    console.info('[preview-seed] Seed complete. Password was read only from PREVIEW_LOGIN_PASSWORD and is not printed.');
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error) => {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? ` (${error.code})` : '';
  // Prisma diagnostics can contain connection URLs; never echo arbitrary error messages.
  console.error(`[preview-seed] ${error instanceof PreviewGuardError ? error.message : `Seed failed${code}; check the isolated schema and connection. No credentials logged.`}`);
  process.exitCode = 1;
});
