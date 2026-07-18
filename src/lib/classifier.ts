import 'server-only';
import { prisma } from './prisma';
import { getCategories, getFallbackCategoryId } from './data';
import { normalizeAr } from '@/domain/text';

/**
 * تصنيف محلي بالكلمات المفتاحية — بلا أي خدمة ذكاء اصطناعي خارجية ولا اتصال إنترنت.
 * يعمل فقط على نص الإعلان (العنوان + التفاصيل)؛ لا يمكن تحليل الصور محلياً بدون
 * خدمة رؤية حاسوبية خارجية، لذلك لا تُستخدم الصور في هذا التصنيف.
 *
 * كل قسم حقيقي في قاعدة البيانات يُقارَن اسمه بقائمة تصنيفات شائعة لها كلمات
 * مفتاحية غنية؛ إن لم يوجد تطابق (قسم أضافه المدير باسم غير موجود في القائمة)،
 * تُشتق كلمات ضعيفة من اسم القسم نفسه — فيبقى التصنيف صالحاً لأي قسم مستقبلي.
 */
type Taxon = { match: string[]; keywords: string[] };

const TAXONOMY: Taxon[] = [
  {
    match: ['سيارات', 'مركبات', 'سيارة'],
    keywords: ['سيارة', 'سيارات', 'مركبة', 'تويوتا', 'كامري', 'هيونداي', 'نيسان', 'فورد', 'شفروليه', 'لكزس', 'مرسيدس', 'بي ام دبليو', 'بنز', 'كيا', 'مازدا', 'جيب', 'جمس', 'دفع رباعي', 'سيدان', 'دبل', 'فل كامل', 'فحص السيارة', 'لوحة سيارة', 'استيكر', 'كم ماشي', 'موديل', 'دينا', 'سطحة', 'بكب', 'بيك اب', 'هايلكس', 'لاندكروزر', 'كورولا', 'النترا', 'سوناتا', 'اكسنت', 'باترول', 'رخصة سير'],
  },
  {
    match: ['دراجات نارية', 'موتوسكل', 'دباب'],
    keywords: ['دراجة نارية', 'دراجات نارية', 'موتوسيكل', 'دباب', 'هارلي', 'ياماها', 'كوزاكي', 'سكوتر'],
  },
  {
    match: ['قطع غيار'],
    keywords: ['قطع غيار', 'مكينة سيارة', 'قير', 'رديتر', 'بطارية سيارة', 'اطارات', 'جنوط', 'كفرات', 'زيت محرك'],
  },
  {
    match: ['معدات ثقيلة', 'شاحنات'],
    keywords: ['حفار', 'لودر', 'رافعة', 'شيول', 'معدات ثقيلة', 'شاحنة', 'تريلا', 'قلاب', 'ونش'],
  },
  {
    match: ['عقار', 'شقق', 'اراضي', 'فلل'],
    keywords: ['شقة', 'شقق', 'فيلا', 'فلل', 'عمارة', 'ارض', 'أرض', 'اراضي', 'أراضي', 'دور', 'استوديو', 'غرفة وصالة', 'دوبلكس', 'عقار', 'عقارات', 'ايجار', 'إيجار', 'تمليك', 'استثماري', 'مخطط', 'صك', 'سكني', 'تجاري للايجار', 'مكتب اداري', 'معرض تجاري', 'مستودع', 'شقة مفروشة'],
  },
  {
    match: ['اثاث', 'منزل', 'ديكور', 'مفروشات'],
    keywords: ['أثاث', 'اثاث', 'كنب', 'مجلس', 'طاولة', 'كرسي', 'سرير', 'دولاب', 'خزانة', 'مطبخ', 'ديكور', 'ستائر', 'سجاد', 'مفروشات', 'انتريه', 'ركن', 'تسريحة', 'غرفة نوم'],
  },
  {
    match: ['اجهزة كهربائية', 'الكترونيات', 'اجهزة منزلية'],
    keywords: ['ثلاجة', 'غسالة', 'مكيف', 'مكيفات', 'فريزر', 'مايكرويف', 'فرن', 'شفاط', 'تلفزيون', 'تلفزيونات', 'شاشة', 'سماعة', 'ايباد', 'لابتوب', 'حاسوب', 'كمبيوتر', 'بلايستيشن', 'ابل', 'سامسونج', 'جوال', 'جوالات', 'ايفون', 'هاتف', 'راوتر', 'طابعة'],
  },
  {
    match: ['ازياء', 'ملابس', 'موضة'],
    keywords: ['ملابس', 'عباية', 'عبايات', 'ثوب', 'ثياب', 'احذية', 'أحذية', 'حقيبة', 'حقائب', 'ساعة يد', 'عطور', 'مكياج', 'اكسسوارات', 'بشت'],
  },
  {
    match: ['حيوانات', 'مواشي', 'طيور'],
    keywords: ['قطط', 'قطة', 'كلاب', 'كلب', 'طيور', 'حمام', 'غنم', 'ابل', 'إبل', 'خيول', 'حصان', 'عصافير', 'هامستر', 'اسماك زينة', 'مواشي', 'اغنام'],
  },
  {
    match: ['وظائف', 'توظيف'],
    keywords: ['وظيفة', 'وظائف', 'مطلوب موظف', 'مطلوب موظفة', 'دوام كامل', 'دوام جزئي', 'عن بعد', 'خبرة سنوات', 'راتب', 'سيرة ذاتية', 'توظيف', 'مندوب مبيعات', 'سائق خاص', 'كاشير', 'محاسب'],
  },
  {
    match: ['خدمات'],
    keywords: ['خدمة', 'خدمات', 'صيانة', 'تنظيف منازل', 'نقل عفش', 'ترميم', 'تصميم', 'مقاول', 'كهربائي منازل', 'سباك', 'دهان', 'تركيب', 'عزل مائي', 'مكافحة حشرات', 'خدمة توصيل'],
  },
  {
    match: ['رياضة', 'لياقة'],
    keywords: ['جهاز رياضي', 'دراجة هوائية', 'دمبل', 'اثقال', 'كرة قدم', 'كرة سلة', 'نادي رياضي', 'ملابس رياضية', 'تريدميل'],
  },
  {
    match: ['كتب', 'تعليم', 'دورات'],
    keywords: ['كتاب', 'كتب', 'قرطاسية', 'دورة تدريبية', 'معلم خصوصي', 'مدرسة', 'جامعة', 'شهادة دراسية'],
  },
  {
    match: ['مواد بناء'],
    keywords: ['حديد بناء', 'اسمنت', 'بلوك', 'رخام', 'سيراميك', 'دهانات بناء', 'سقالات'],
  },
  {
    match: ['اطفال', 'العاب'],
    keywords: ['العاب اطفال', 'مقعد سيارة اطفال', 'عربة اطفال', 'ملابس اطفال', 'حفاضات'],
  },
  {
    match: ['تحف', 'مقتنيات', 'انتيكات'],
    keywords: ['تحفة', 'تحف', 'انتيك', 'مقتنيات نادرة', 'عملات قديمة', 'طوابع بريد'],
  },
  {
    match: ['سياحة', 'سفر', 'تذاكر'],
    keywords: ['تذكرة طيران', 'حجز فندق', 'رحلة سياحية', 'تأشيرة سفر'],
  },
];

const FALLBACK_NAME = 'عروض أخرى';

/** كلمات التصنيف الفعّالة لقسم معيّن: القائمة الغنية إن طابق اسمه تصنيفاً معروفاً،
 *  وإلا كلمات مشتقة من اسم القسم نفسه (يبقى صالحاً لأي قسم يضيفه المدير مستقبلاً). */
function keywordsForCategory(name: string): string[] {
  const norm = normalizeAr(name);
  const curated = TAXONOMY.find((t) => t.match.some((m) => norm.includes(normalizeAr(m))));
  const ownWords = norm.split(' ').filter((w) => w.length >= 2);
  return curated ? [...curated.keywords, ...ownWords] : ownWords;
}

export interface ClassifyResult {
  categoryId: number;
  confidence: number; // 0..1 تقريبية، للعرض فقط
  matched: string[];
}

/** يصنّف نص إعلان (عنوان + تفاصيل) إلى أنسب قسم حالي فعّال في قاعدة البيانات.
 *  عدم العثور على أي تطابق يُعيد قسم «عروض أخرى» الاحتياطي بثقة صفر. */
export async function classifyAdText(title: string, detail: string): Promise<ClassifyResult> {
  const categories = await getCategories();
  // العنوان يُكرَّر ليُعطى وزناً أكبر من التفاصيل عند التصنيف
  const text = normalizeAr(`${title} ${title} ${detail}`);
  let best: { id: number; score: number; hits: string[] } | null = null;
  for (const cat of categories) {
    if (cat.name === FALLBACK_NAME) continue; // لا يُختار كتصنيف فعلي إلا حين لا يوجد أي تطابق آخر
    const keywords = keywordsForCategory(cat.name);
    let score = 0;
    const hits: string[] = [];
    for (const kw of keywords) {
      const nkw = normalizeAr(kw);
      if (nkw.length < 2 || !text.includes(nkw)) continue;
      score += nkw.length >= 4 ? 2 : 1;
      hits.push(kw);
    }
    if (!best || score > best.score) best = { id: cat.id, score, hits };
  }
  if (!best || best.score === 0) {
    return { categoryId: await getFallbackCategoryId(), confidence: 0, matched: [] };
  }
  return { categoryId: best.id, confidence: Math.min(1, best.score / 8), matched: best.hits };
}

/** إعادة تصنيف دفعة من الإعلانات القديمة الجالسة في «عروض أخرى» ولم تُعالَج بعد
 *  (cat_reviewed=1 يعني «لم يمرّ عليها المصنّف قط» طالما كانت في القسم الاحتياطي).
 *  كل إعلان تُعالِجه الدفعة يُعلَّم cat_reviewed=0 ليظهر في قائمة مراجعة الإدارة،
 *  سواء انتقل لقسم جديد أو بقي في «عروض أخرى» (لا شيء أفضل له فعلياً). */
export async function classifyPendingAds(limit = 200): Promise<{ processed: number; moved: number }> {
  const fid = await getFallbackCategoryId();
  const ads = await prisma.ads.findMany({
    where: { category_id: BigInt(fid), cat_reviewed: 1 },
    select: { id: true, title: true, detail: true },
    take: limit,
    orderBy: { id: 'asc' },
  });
  let moved = 0;
  for (const ad of ads) {
    const r = await classifyAdText(ad.title, ad.detail);
    await prisma.ads.update({ where: { id: ad.id }, data: { category_id: BigInt(r.categoryId), cat_reviewed: 0 } }).catch(() => {});
    if (r.categoryId !== fid) moved++;
  }
  return { processed: ads.length, moved };
}

/** عدد الإعلانات القديمة التي لم تُعرَض على المصنّف بعد (لزر «تصنيف الإعلانات القديمة»). */
export async function countUnclassifiedAds(): Promise<number> {
  const fid = await getFallbackCategoryId();
  return prisma.ads.count({ where: { category_id: BigInt(fid), cat_reviewed: 1 } }).catch(() => 0);
}

/** عدد الإعلانات التي صنّفها المصنّف الآلي وتنتظر مراجعة الإدارة. */
export async function countPendingReview(): Promise<number> {
  return prisma.ads.count({ where: { cat_reviewed: 0 } }).catch(() => 0);
}
