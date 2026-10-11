/**
 * بذر/تحديث شجرة أقسام تربح الموحّدة (رئيسية + فرعية) مباشرةً في قاعدة البيانات،
 * مفعّلة فوراً (is_active='yes' / active=1). آمن ومتكرّر: ينشئ الناقص بالاسم فقط
 * ولا يمسّ أي قسم قائم، ويفعّل أي قسم/فرعي موجود بالاسم. لا يحذف شيئاً.
 *
 * التشغيل من الخادم (داخل حاوية التطبيق التي تحمل DATABASE_URL):
 *   cd /root/trbhh && docker compose exec -T app node scripts/seed-ad-categories.cjs
 * أو عبر stdin إن لم يكن الملف داخل الحاوية (انظر الأمر الجاهز في الرد).
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TREE = [
  { name: 'المنزل والمطبخ', subs: ['أدوات مطبخ', 'تنظيم وترتيب', 'إضاءة', 'ديكور', 'مفروشات'] },
  { name: 'الإلكترونيات والإكسسوارات', subs: ['سماعات', 'شواحن وكوابل', 'كفرات وحمايات', 'ساعات ذكية', 'إضاءة LED'] },
  { name: 'الموضة والأزياء', subs: ['ملابس رجالية', 'ملابس نسائية', 'أحذية', 'حقائب', 'إكسسوارات'] },
  { name: 'الجمال والعناية', subs: ['مكياج', 'عناية بالبشرة', 'عناية بالشعر', 'عطور', 'أدوات تجميل'] },
  { name: 'الرياضة واللياقة', subs: ['أدوات رياضية', 'ملابس رياضية', 'تخييم ورحلات', 'دراجات هوائية'] },
  { name: 'السيارات والدراجات', subs: ['إكسسوارات سيارات', 'خوذ ودراجات نارية', 'عدّة وصيانة'] },
  { name: 'الأطفال والألعاب', subs: ['ألعاب أطفال', 'مستلزمات أطفال', 'قرطاسية'] },
  { name: 'الأدوات والمعدات', subs: ['عدّة يدوية', 'أدوات كهربائية', 'تنظيم ورشة'] },
  { name: 'الحيوانات الأليفة', subs: ['مستلزمات قطط', 'مستلزمات كلاب'] },
];

(async () => {
  let addedCats = 0, addedSubs = 0, activated = 0;
  let order = TREE.length;
  for (const node of TREE) {
    let cat = await prisma.categories.findFirst({ where: { name: node.name }, select: { id: true, is_active: true } });
    if (cat) {
      if (cat.is_active !== 'yes') { await prisma.categories.update({ where: { id: cat.id }, data: { is_active: 'yes' } }); activated++; }
    } else {
      cat = await prisma.categories.create({ data: { name: node.name, photo_path: '', is_active: 'yes', ordered: order } });
      addedCats++;
    }
    order--;
    let subOrder = node.subs.length;
    for (const sub of node.subs) {
      const existing = await prisma.sub_categories.findFirst({ where: { category_id: Number(cat.id), name: sub }, select: { id: true, active: true } });
      if (existing) {
        if (existing.active !== 1) { await prisma.sub_categories.update({ where: { id: existing.id }, data: { active: 1 } }); activated++; }
      } else {
        await prisma.sub_categories.create({ data: { category_id: Number(cat.id), name: sub, order: subOrder, active: 1 } });
        addedSubs++;
      }
      subOrder--;
    }
  }
  // منع إعادة البذر الآلي عند الإقلاع (نفس علم schema-sync).
  await prisma.site_settings.upsert({ where: { k: 'ad_categories_seeded_v1' }, create: { k: 'ad_categories_seeded_v1', v: '1' }, update: { v: '1' } }).catch(() => {});
  console.log(`تم: أقسام جديدة=${addedCats} · فرعية جديدة=${addedSubs} · فُعِّلت=${activated}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error('فشل البذر:', e.message); await prisma.$disconnect(); process.exit(1); });
