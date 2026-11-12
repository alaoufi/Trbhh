import 'server-only';
import { prisma } from './prisma';
import { currentPlatformAdPublicWhere } from './platform-ad-visibility';
import { getPlatformAdLifecycleConfig, getSettingNum } from './settings';
import {
  getHomeLatestAds,
  getFeaturedAds,
  getMostViewedAds,
  getTopRatedAds,
} from './data';
import { homeFeaturedAds } from './merchant';
import { getDefaultPackage } from './packages';

export type DiagRow = { label: string; value: string | number; note?: string; bad?: boolean };
export type DiagSource = { label: string; count: number | null; error?: string; bad?: boolean };
export type FeedDiagnostics = {
  counts: DiagRow[];
  sources: DiagSource[];
  sample: { id: number; state: string; status: number; storeOnly: number | null; trbhhUntil: string | null; createdAt: string | null }[];
  lifetime: { defaultPackageName: string; adDays: number; droppedByLifetime: number | null };
  verdict: { ok: boolean; title: string; detail: string; hint: string };
  generatedAt: string;
};

async function safeCount(fn: () => Promise<number>): Promise<number | null> {
  try { return await fn(); } catch { return null; }
}

async function sourceLen(label: string, fn: () => Promise<unknown[]>): Promise<DiagSource> {
  try { const r = await fn(); return { label, count: Array.isArray(r) ? r.length : 0 }; }
  catch (e) { return { label, count: null, error: e instanceof Error ? e.message : String(e), bad: true }; }
}

/**
 * تشخيص قراءة-فقط لتغذية الرئيسية: يكشف أين تختفي إعلانات الأعضاء بين قاعدة البيانات
 * ودوال العرض. لا يُعدّل شيئاً. يقارن «ما في القاعدة» بـ«ما يُرجعه كل مصدر فعلياً» بعد
 * toCards، فإن كان المؤهّل كبيراً والمعروض صغيراً عرف أن الخلل في التصفية لا البيانات.
 */
export async function getFeedDiagnostics(): Promise<FeedDiagnostics> {
  const now = new Date();
  const since = new Date(Date.now() - 30 * 86400000);
  const activeWhere = await currentPlatformAdPublicWhere(now).catch(() => null);
  const lifecycle = await getPlatformAdLifecycleConfig().catch(() => ({ enabled: false }));
  const maxPerSeller = await getSettingNum('home_max_per_seller', 3).catch(() => 3);

  const [total, statusOn, stateOn, bothOn, storeOnlyZero, trbhhFuture, eligible, last30] = await Promise.all([
    safeCount(() => prisma.ads.count()),
    safeCount(() => prisma.ads.count({ where: { status: 1 } })),
    safeCount(() => prisma.ads.count({ where: { state: 'active' } })),
    safeCount(() => prisma.ads.count({ where: { status: 1, state: 'active' } })),
    safeCount(() => prisma.ads.count({ where: { status: 1, state: 'active', store_only: 0 } })),
    safeCount(() => prisma.ads.count({ where: { status: 1, state: 'active', trbhh_until: { gt: now } } })),
    safeCount(() => (activeWhere ? prisma.ads.count({ where: activeWhere }) : Promise.resolve(0))),
    safeCount(() => prisma.ads.count({ where: { status: 1, state: 'active', created_at: { gte: since } } })),
  ]);

  const counts: DiagRow[] = [
    { label: 'إجمالي الإعلانات', value: total ?? 'خطأ' },
    { label: 'منشورة (status=1)', value: statusOn ?? 'خطأ' },
    { label: 'مُفعّلة (state=active)', value: stateOn ?? 'خطأ' },
    { label: 'منشورة ومُفعّلة معاً', value: bothOn ?? 'خطأ' },
    { label: 'غير حصرية متجر (store_only=0)', value: storeOnlyZero ?? 'خطأ' },
    { label: 'عرض متجر مدفوع ساري (trbhh_until>الآن)', value: trbhhFuture ?? 'خطأ' },
    { label: '⭐ مؤهّلة لفلتر الرئيسية فعلياً', value: eligible ?? 'خطأ', bad: (eligible ?? 0) < 5, note: 'هذا ما يفترض ظهوره' },
    { label: 'منها خلال آخر ٣٠ يوماً', value: last30 ?? 'خطأ' },
    { label: 'دورة حياة العرض المدفوع مفعّلة؟', value: lifecycle.enabled ? 'نعم' : 'لا', note: lifecycle.enabled ? 'عند التفعيل: يلزم كل إعلان trbhh_until ساري ليظهر' : 'الوضع المتسامح (store_only=0 يكفي)' },
    { label: 'حد أقصى لكل معلن (home_max_per_seller)', value: maxPerSeller },
  ];

  const sources: DiagSource[] = await Promise.all([
    sourceLen('أحدث إعلانات الرئيسية (getHomeLatestAds)', () => getHomeLatestAds(20)),
    sourceLen('المميّزة (getFeaturedAds)', () => getFeaturedAds(8)),
    sourceLen('الأكثر مشاهدة (getMostViewedAds)', () => getMostViewedAds(8)),
    sourceLen('الأعلى تقييماً (getTopRatedAds)', () => getTopRatedAds(8)),
    sourceLen('منتجات المتاجر (homeFeaturedAds)', () => homeFeaturedAds()),
  ]);

  let sample: FeedDiagnostics['sample'] = [];
  try {
    const rows = await prisma.ads.findMany({
      where: activeWhere ?? { status: 1, state: 'active' },
      take: 5,
      orderBy: { id: 'desc' },
      select: { id: true, state: true, status: true, store_only: true, trbhh_until: true, created_at: true },
    });
    sample = rows.map((r) => ({
      id: Number(r.id),
      state: String(r.state),
      status: Number(r.status),
      storeOnly: r.store_only == null ? null : Number(r.store_only),
      trbhhUntil: r.trbhh_until ? r.trbhh_until.toISOString() : null,
      createdAt: r.created_at ? r.created_at.toISOString() : null,
    }));
  } catch { /* عيّنة غير متاحة — لا يؤثر على التشخيص */ }

  // سقف «مدة بقاء الإعلان» للباقة الافتراضية — السبب الأشيع لاختفاء المحتوى المستورد القديم
  const def = await getDefaultPackage().catch(() => null);
  const defAdDays = def?.adDays ?? 0;
  let droppedByLifetime: number | null = null;
  if (defAdDays > 0 && activeWhere) {
    const cutoff = new Date(Date.now() - defAdDays * 86400000);
    // تقدير: المؤهّلون غير المميّزين/العاجلين الأقدم من سقف الباقة الافتراضية — هؤلاء يُخفيهم toCards
    droppedByLifetime = await safeCount(() => prisma.ads.count({
      where: { AND: [activeWhere, { created_at: { lt: cutoff } }, { OR: [{ adsSpecial: { not: 'checked' } }, { expires_at: null }, { expires_at: { lt: now } }] }, { OR: [{ urgent_until: null }, { urgent_until: { lt: now } }] }] },
    }));
    counts.push({ label: '⚠️ مؤهّلة لكن يُخفيها سقف مدة بقاء الإعلان', value: droppedByLifetime ?? 'خطأ', bad: (droppedByLifetime ?? 0) > 0, note: `الباقة الافتراضية «${def?.name ?? ''}» تُخفي الإعلان بعد ${defAdDays} يوماً` });
  }
  const lifetime = { defaultPackageName: def?.name ?? '—', adDays: defAdDays, droppedByLifetime };

  // تحليل تلقائي للسبب
  const homeLatest = sources[0]?.count ?? 0;
  const anyError = sources.find((s) => s.bad);
  let verdict: FeedDiagnostics['verdict'];
  if (anyError) {
    verdict = { ok: false, title: 'استثناء في أحد مصادر التغذية', detail: `فشل «${anyError.label}»: ${anyError.error}`, hint: 'الخطأ أعلاه يكشف الدالة/العمود الذي يفشل — يُصلَح في الكود مباشرة.' };
  } else if (defAdDays > 0 && (droppedByLifetime ?? 0) >= 5 && (homeLatest ?? 0) < 5) {
    verdict = { ok: false, title: '🎯 السبب: سقف «مدة بقاء الإعلان» يُخفي الإعلانات القديمة المستوردة', detail: `المؤهّل=${eligible}، لكن ${droppedByLifetime} منها أقدم من ${defAdDays} يوماً (مدة الباقة الافتراضية «${def?.name ?? ''}») فيُخفيها toCards، ويبقى ${homeLatest} فقط.`, hint: 'الحل: اضبط مدة بقاء الإعلان للباقة الافتراضية = 0 (بلا حد) — بالزر أدناه، أو من: التحكم ← الباقات ← الباقة الافتراضية ← مدة بقاء الإعلان = 0.' };
  } else if ((eligible ?? 0) >= 5 && (homeLatest ?? 0) < 5) {
    verdict = { ok: false, title: 'الإعلانات مؤهّلة في القاعدة لكنها تُحذف أثناء التحويل لبطاقات', detail: `المؤهّل=${eligible} لكن getHomeLatestAds أرجع ${homeLatest} فقط.`, hint: 'السبب في toCards: إمّا بائعون محظورون (banned)، أو سقف «مدة بقاء الإعلان» (adDays) يُسقط القديم. راجع getUsersAdMeta و loadBanned.' };
  } else if ((eligible ?? 0) < 5 && (bothOn ?? 0) >= 5) {
    verdict = { ok: false, title: 'إعلانات منشورة ومُفعّلة لكنها تسقط من فلتر الرئيسية', detail: `منشورة ومُفعّلة=${bothOn} لكن المؤهّل=${eligible}.`, hint: 'السبب شرط store_only/trbhh_until أو دورة حياة العرض المدفوع. راجع جدول store_only أعلاه.' };
  } else if ((bothOn ?? 0) < 5 && (statusOn ?? 0) >= 5) {
    verdict = { ok: false, title: 'إعلانات منشورة لكن state ليست active', detail: `status=1 عددها ${statusOn} لكن المنشورة+المفعّلة ${bothOn}.`, hint: 'عمود state (ENUM) لا يساوي active — راجع استيراد البيانات أو خريطة الـENUM.' };
  } else if ((eligible ?? 0) >= 5 && (homeLatest ?? 0) >= 5) {
    verdict = { ok: true, title: 'التغذية سليمة', detail: `المؤهّل=${eligible} والمعروض=${homeLatest}.`, hint: 'إن كانت الرئيسية لا تزال تعرض قليلاً فالسبب الذاكرة المؤقتة (Redis) — امسحها.' };
  } else {
    verdict = { ok: false, title: 'لا توجد إعلانات مؤهّلة', detail: `إجمالي=${total}, منشورة=${statusOn}, مفعّلة=${stateOn}.`, hint: 'لا يوجد ما يُعرض أصلاً بالشروط الحالية.' };
  }

  return { counts, sources, sample, lifetime, verdict, generatedAt: now.toISOString() };
}

/**
 * إصلاح بضغطة: يجعل مدة بقاء الإعلان للباقة الافتراضية بلا حد (ad_days=0) فلا يُخفى أي
 * إعلان قديم، ثم يمسح ذاكرة القوائم ليظهر الأثر فوراً. قراءة-فقط لبقية الإعدادات.
 * يُرجع عدد الصفوف المتأثرة. آمن ومتكرّر (idempotent).
 */
export async function clearDefaultPackageAdLifetime(): Promise<{ ok: boolean; message: string }> {
  try {
    const def = await getDefaultPackage().catch(() => null);
    await prisma.$executeRawUnsafe(`UPDATE packages SET ad_days = 0 WHERE is_default = 1`);
    // احتياط: إن لم تُعلَّم أي باقة كافتراضية، صفّر الأقل سعراً (المجانية) أيضاً لا شيء — نكتفي بالافتراضية.
    await import('./data').then((m) => m.bustAdCaches()).catch(() => {});
    return { ok: true, message: `تم: مدة بقاء الإعلان للباقة الافتراضية «${def?.name ?? ''}» صارت بلا حد (0)، ومُسِحت الذاكرة المؤقتة. حدّث الرئيسية.` };
  } catch (e) {
    return { ok: false, message: `تعذّر الإصلاح: ${e instanceof Error ? e.message : String(e)}` };
  }
}
