'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { saveUpload } from '@/lib/storage';
import { watermarkImage, type WatermarkOptions } from '@/lib/watermark';
import { logClientError } from '@/lib/error-log';
import { aHash, hashSimilarity } from '@/lib/phash';
import { bumpDupAttempts, banUserFor, resetDupAttempts, DUP_LIMIT, handleProhibited, checkFlood, logMod, isUserBanned, notifyModBlock } from '@/lib/moderation';
import { getUserPackage, countAdsToday, lastAdAt, applyFeaturedToNewAd, logAdPublish } from '@/lib/packages';
import { getMemberWindows, withinWindow, getSettingBool, SETTING_ADS_APPROVAL, getDupThresholds, getServicePricing, serviceHasPrice, getStrikeBanDays } from '@/lib/settings';
import { charge, consumeDupCredit } from '@/lib/wallet';
import { bustAdCaches } from '@/lib/data';
import { setAdMedia } from '@/lib/ad-media';
import { setUserArea } from '@/lib/user-location';
import { scanContent, censorGuard, summarizeHits, CATEGORY_LABEL } from '@/lib/content-guard';
import { scanImages, imageModerationEnabled } from '@/lib/nsfw';
import { parseMapsUrl, type LatLng } from '@/lib/maps';
import { toInt } from '@/lib/utils';
import { isApprovedStoreOwner } from '@/lib/merchant';
import { getActiveProfile, ensureDefaultProfile, backfillProfileContact } from '@/lib/profiles';
import { normalizeAr, similarity, isKeywordStuffing } from '@/domain/text';

/** Resolve coordinates from a pasted maps link — follows shortened goo.gl links. */
async function resolveMapsUrl(input: string): Promise<LatLng | null> {
  const s = (input || '').trim();
  if (!s) return null;
  const direct = parseMapsUrl(s);
  if (direct) return direct;
  if (/^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl|g\.co)\//i.test(s)) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(s, { redirect: 'follow', signal: ctrl.signal });
      clearTimeout(t);
      return parseMapsUrl(res.url) || parseMapsUrl(await res.text().catch(() => ''));
    } catch {
      return null;
    }
  }
  return null;
}

/** Save a raw media file (video/audio) from the form; returns the stored path or null. */
async function saveMediaFile(formData: FormData, key: string, maxBytes: number, exts: string[]): Promise<string | null> {
  try {
    const file = formData.get(key);
    if (!(file instanceof File) || file.size === 0 || file.size > maxBytes) return null;
    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf.length) return null;
    let ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!exts.includes(ext)) ext = exts[0];
    const hash = createHash('sha256').update(new Uint8Array(buf)).digest('hex');
    return await saveUpload(buf, `${key}_${hash}.${ext}`);
  } catch {
    return null;
  }
}

type PreparedImage = { buf: Buffer; name: string; ext: string; hash: string };

async function readImages(formData: FormData): Promise<PreparedImage[]> {
  const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
  const out: PreparedImage[] = [];
  for (const file of files) {
    // 30MB cap: raw phone photos (esp. HEIC) are large; watermarkImage downscales
    // to ≤1600px anyway, so accepting big originals costs nothing and stops
    // full-resolution images from vanishing silently before they're processed.
    if (file.size > 30 * 1024 * 1024) continue;
    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf.length) continue;
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const hash = createHash('sha256').update(new Uint8Array(buf)).digest('hex');
    out.push({ buf, name: file.name, ext, hash });
  }
  return out;
}

/** Watermark + hash + persist ONE image; failures here just skip that image
 *  rather than failing the whole publish. */
async function storeOneImage(img: PreparedImage, userId: number, adId: bigint, wm?: WatermarkOptions) {
  try {
    const [stamped, phash] = await Promise.all([
      watermarkImage(img.buf, img.ext, wm), // burn watermark (store logo/name for store ads, else "تربح"); also downscales + normalizes format
      aHash(img.buf), // بصمة إدراكية للصورة (لكشف التكرار بالنسبة)
    ]);
    // Store with the ACTUAL output extension (watermarkImage re-encodes HEIC/gif/…
    // to JPEG). A content-addressed name keeps identical uploads on one file.
    const outExt = stamped.ext || img.ext;
    const safe = `${img.hash}.${outExt}`;
    const rel = await saveUpload(stamped.buf, safe);
    const up = await prisma.uploads.create({
      data: { file_name: rel, file_original_name: img.name, extension: outExt, type: 'ad', file_size: img.buf.length, user_id: userId, phash: phash || null },
    });
    await prisma.photos.create({ data: { photo_path: String(toInt(up.id)), other_id: adId } });
  } catch (e) {
    // Skip a problematic image rather than failing the whole publish — but LOG it
    // (previously a silent drop that made "the image disappeared" undiagnosable).
    await logClientError({
      message: `فشل حفظ صورة إعلان #${toInt(adId)} (${img.ext}, ${img.buf.length} بايت): ${e instanceof Error ? e.message : String(e)}`,
      url: '/ads/new',
      userId,
    }).catch(() => {});
  }
}

/** Every image's watermark/hash/upload/DB-write pipeline runs concurrently —
 *  was a fully serial for-loop that made an ad's save time scale linearly
 *  with its photo count. */
async function storeImages(images: PreparedImage[], userId: number, adId: bigint, wm?: WatermarkOptions) {
  await Promise.all(images.map((img) => storeOneImage(img, userId, adId, wm)));
}

/**
 * Decide whether a new ad must be held for admin approval before publishing.
 * Triggers when — versus any existing PUBLISHED ad:
 *   • title similarity ≥ 90%, OR
 *   • detail similarity ≥ 90%, OR
 *   • an uploaded image is byte-identical to an existing ad image.
 */
/** Duplicate against the SAME user's own ads (reposting the same ad).
 *  Comparison is ONLY on the AD TITLE and AD DETAILS — each with its own
 *  admin-configurable threshold (no image/price matching). Returns the matched
 *  ad (id + title) so we can tell the member/admin exactly which ad it
 *  duplicates — or null when it is not a duplicate. */
async function ownDuplicateOf(userId: number, title: string, detail: string, images: PreparedImage[]): Promise<{ id: number; title: string } | null> {
  const { title: titlePct, detail: detailPct, image: imagePct } = await getDupThresholds();

  // 1) text: title / details vs the user's own ads, each with its own threshold
  const mine = await prisma.ads.findMany({
    where: { user_id: BigInt(userId) },
    select: { id: true, title: true, detail: true },
    orderBy: { id: 'desc' },
    take: 300,
  });
  const nTitle = normalizeAr(title);
  const nDetail = normalizeAr(detail);
  for (const r of mine) {
    const titleMatch = similarity(nTitle, normalizeAr(r.title)) * 100 >= titlePct;
    const detailMatch = similarity(nDetail, normalizeAr(r.detail)) * 100 >= detailPct;
    if (titleMatch || detailMatch) return { id: toInt(r.id), title: r.title };
  }

  // 2) images: perceptual similarity (aHash) vs the user's own ad images
  if (images.length) {
    const newHashes = (await Promise.all(images.map((i) => aHash(i.buf)))).filter(Boolean);
    if (newHashes.length) {
      const ups = await prisma.uploads.findMany({
        where: { user_id: userId, type: 'ad', phash: { not: null } },
        select: { id: true, phash: true },
        orderBy: { id: 'desc' },
        take: 800,
      }).catch(() => []);
      for (const up of ups) {
        if (newHashes.some((h) => hashSimilarity(h, up.phash || '') >= imagePct)) {
          const ph = await prisma.photos.findFirst({ where: { photo_path: String(toInt(up.id)) }, select: { other_id: true } }).catch(() => null);
          const a = ph ? await prisma.ads.findUnique({ where: { id: BigInt(ph.other_id) }, select: { id: true, title: true } }).catch(() => null) : null;
          if (a) return { id: toInt(a.id), title: a.title };
        }
      }
    }
  }
  return null;
}

/** Duplicate against OTHER members' ads (spam networks reposting the same ad text
 *  under different accounts/phone numbers — e.g. "دينا" hauling ads). Text only
 *  (title/detail) — matching on images too would false-positive on sellers who
 *  legitimately share the same manufacturer/stock photo. Scoped to the last 30
 *  days so the comparison set stays bounded and relevant. */
export async function crossUserDuplicateOf(userId: number, title: string, detail: string): Promise<{ id: number; title: string } | null> {
  const { title: titlePct, detail: detailPct } = await getDupThresholds();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const others = await prisma.ads.findMany({
    where: { user_id: { not: BigInt(userId) }, created_at: { gte: since } },
    select: { id: true, title: true, detail: true },
    orderBy: { id: 'desc' },
    take: 1500,
  });
  const nTitle = normalizeAr(title);
  const nDetail = normalizeAr(detail);
  for (const r of others) {
    const titleMatch = similarity(nTitle, normalizeAr(r.title)) * 100 >= titlePct;
    const detailMatch = similarity(nDetail, normalizeAr(r.detail)) * 100 >= detailPct;
    if (titleMatch || detailMatch) return { id: toInt(r.id), title: r.title };
  }
  return null;
}

export async function createAdAction(formData: FormData) {
  const session = await requireUser();
  const user = await prisma.users.findUnique({ where: { id: BigInt(session.uid) } });
  if (await isUserBanned(session.uid)) redirect('/ads/new?error=banned');

  const title = String(formData.get('title') || '').trim();
  const detail = String(formData.get('detail') || '').trim();
  const adsType = String(formData.get('adsType')) === 'request' ? 'request' : 'offer';
  // نوع السعر (للمعروض): rent سعر + مدة تأجير / sale سعر بيع / som على السوم بلا سعر
  const ptRaw = String(formData.get('priceType') || '');
  const priceType = adsType === 'offer' && ['rent', 'sale', 'som'].includes(ptRaw) ? ptRaw : null;
  const rentPeriod = priceType === 'rent' ? String(formData.get('rentPeriod') || '').trim().slice(0, 20) || 'شهري' : null;
  const price = priceType === 'som' ? 0 : parseFloat(String(formData.get('price') || '0')) || 0;
  const category_id = BigInt(String(formData.get('category_id') || '0'));
  const subRaw = String(formData.get('subcategory_id') || '');
  const cityId = String(formData.get('city_id') || '0');
  const areaRaw = String(formData.get('area_id') || '');
  const countryRaw = String(formData.get('country_id') || '');
  const phone = String(formData.get('phone') || '').trim();
  const whatsapp = String(formData.get('whatsapp') || '').trim();
  let lat = String(formData.get('lat') || '').trim();
  let lng = String(formData.get('lng') || '').trim();
  // اختياري: استخراج الإحداثيات من رابط خرائط قوقل الملصق
  if (!lat || !lng) {
    const ll = await resolveMapsUrl(String(formData.get('mapLink') || ''));
    if (ll) { lat = String(ll.lat); lng = String(ll.lng); }
  }
  // هوية النشر: الوجهة تُحسم من اختيار النموذج الصريح فقط («باسمي الشخصي» بلا dest، أو «باسم
  // متجري» بـ dest=store). لا يُسمح لكوكي الهوية المنزلق (تصفّح سابق بهوية المتجر) بأن يحوّل
  // «باسمي الشخصي» إلى منتج متجر معزول عن تربح بصمت — هذا الانزلاق كان يُخفي إعلانات الأعضاء
  // عن تربح العام دون علمهم، ويجعلهم يظنّون أن الإعلان «اختفى».
  let active = await getActiveProfile(session.uid);
  const asStore = String(formData.get('dest') || '') === 'store';
  const dest = asStore ? 'store' : '';
  // اختير «باسمي الشخصي» بينما الهوية الفعّالة متجر: ثبّت على الهوية الشخصية الافتراضية حتى
  // يُنشر الإعلان في تربح العام لا داخل المتجر (تصحيح الانزلاق مصدره الكوكي).
  if (!asStore && active.type === 'store') {
    active = await ensureDefaultProfile(session.uid);
  }
  const q = dest ? '&dest=store' : '';
  // متجر موقوف (مؤقتاً أو نهائياً): لا يُسمح بنشر إعلانات منه
  if (dest === 'store') {
    const { storeStatusOfUser, storeIdOfUser } = await import('@/lib/merchant');
    const st = await storeStatusOfUser(session.uid).catch(() => 1);
    if (st === 2 || st === 3) redirect(st === 3 ? '/store?error=suspended_perm' : '/store?error=suspended');
    // انتهاء اشتراك المتجر لا يُحوّل العضو إلى شاشة خطأ عامة: يُنقل إلى التجديد
    // حيث يرى رصيده والخطط وخيار الشحن إن لم يكفِ الرصيد.
    const storeId = await storeIdOfUser(session.uid).catch(() => 0);
    if (storeId) {
      const { isStoreSubBlocked } = await import('@/lib/subscription');
      if (await isStoreSubBlocked(storeId)) redirect('/store?sub=expired&from=ad#sub');
    }
  }
  // حقول إجبارية — أظهِر السبب بدل الرجوع الصامت
  if (!title || !detail) redirect(`/ads/new?error=missing${q}`);
  // الأقسام مخفية (لا حقل قسم في النموذج): تصنيف ذكي محلي بالكلمات المفتاحية
  // يختار أنسب قسم فعلي من العنوان والتفاصيل، ويُعلَّم الإعلان لمراجعة الإدارة لاحقاً
  let catId = category_id;
  let aiClassified = false;
  if (catId <= 0n) {
    const { classifyAdText } = await import('@/lib/classifier');
    const r = await classifyAdText(title, detail);
    catId = BigInt(r.categoryId);
    aiClassified = true;
    if (catId <= 0n) redirect(`/ads/new?error=missing${q}`);
  }
  // تعهّد صحة الإعلان وتحمّل المسؤولية إجباري
  if (!formData.get('pledge')) redirect(`/ads/new?error=pledge${q}`);
  // جوال أو واتساب إجباري حتى يستطيع العملاء التواصل مع صاحب الإعلان
  if (!phone && !whatsapp) redirect(`/ads/new?error=contact${q}`);
  // منع حشو الكلمات (تكرار العبارات لخداع محرك البحث)
  if (isKeywordStuffing(title, detail)) redirect('/ads/new?error=repeat');

  // سياسة المحتوى النصّي (متّفق عليها): الكلمة المخالفة لا تحجب الإعلان إطلاقاً — تُشفَّر بنجوم
  // فقط ويُنشر الإعلان، إلا إن كانت من الكلمات المستثناة (قائمة السماح مثل «وايت سكس») فتبقى كما هي.
  // لا حدّ أقصى للحجب: مهما كثرت الكلمات المخالفة تُشفَّر جميعها ويُنشر الإعلان.
  const guard = await censorGuard(title, detail);
  const finalTitle = guard.parts[0] || title;
  const finalDetail = guard.parts[1] || detail;
  let flagTerms = guard.hits.length ? summarizeHits(guard.hits) : '';

  // حاجز إغراق صلب لكل الأعضاء (فوق حدود الباقة): يمنع النشر المتسارع
  const flood = await checkFlood(session.uid);
  if (flood.blocked) redirect(`/ads/new?error=flood&wait=${flood.waitSec}`);

  // حدود الباقة: عدد الإعلانات باليوم والفارق الزمني بين إعلان وآخر — لا تُتجاوَز إطلاقاً
  const pkg = await getUserPackage(session.uid);
  if (pkg.adsPerDay > 0 && (await countAdsToday(session.uid)) >= pkg.adsPerDay) {
    await logMod(session.uid, { kind: 'limit', action: 'blocked', snippet: `تجاوز الحد اليومي (${pkg.adsPerDay}/يوم) — العنوان: ${title.slice(0, 60)}` });
    await notifyModBlock(session.uid, `⚠️ لقد تجاوزت الحد المسموح لك من الإعلانات اليوم (${pkg.adsPerDay}/يوم). هل ترغب بالترقية إلى باقة أفضل للحصول على عدد إعلانات أكبر يومياً؟`, '/packages');
    redirect(`/ads/new?error=limit&max=${pkg.adsPerDay}`);
  }
  if (pkg.gapHours > 0) {
    const last = await lastAdAt(session.uid);
    if (last) {
      const elapsedH = (Date.now() - new Date(last).getTime()) / 3600000;
      if (elapsedH < pkg.gapHours) {
        const wait = Math.max(1, Math.ceil(pkg.gapHours - elapsedH));
        await logMod(session.uid, { kind: 'limit', action: 'blocked', snippet: `تجاوز الفاصل الزمني (${pkg.gapHours} ساعة) — العنوان: ${title.slice(0, 60)}` });
        await notifyModBlock(session.uid, `⚠️ يجب الانتظار ${pkg.gapHours} ساعة بين كل إعلان وآخر حسب باقتك. هل ترغب بالترقية إلى باقة أفضل لتقليل الفاصل الزمني؟`, '/packages');
        redirect(`/ads/new?error=gap&hours=${pkg.gapHours}&wait=${wait}`);
      }
    }
  }

  // هوية النشر: الهوية الفعّالة (شخصية أو متجر). إن كان dest=store من النموذج بينما
  // الهوية الشخصية فعّالة، نربطه بهوية المتجر.
  let profileId: number | null = active.id;
  if (dest === 'store' && active.type !== 'store') {
    const sp = await prisma.profiles.findFirst({ where: { user_id: BigInt(session.uid), type: 'store' }, orderBy: { id: 'asc' }, select: { id: true } }).catch(() => null);
    profileId = sp ? toInt(sp.id) : null;
  }
  const publishingAsDefault = active.type === 'personal' && active.isDefault;
  // بوابة اشتراك الباقات: النشر بهوية إضافية يتطلّب اشتراكاً سارياً أو إعفاءً (الرئيسية مجانية)
  if (active.type === 'personal' && !active.isDefault) {
    const { getMemberIdentitySub } = await import('@/lib/identity-plans');
    const sub = await getMemberIdentitySub(session.uid);
    if (!sub.active) redirect('/account/profiles?idexpired=1#packages');
  }

  // احفظ وسيلة التواصل والموقع في ملف العضو تلقائياً حتى تظهر في إعلاناته وملفه —
  // فقط عند النشر بالهوية الأساسية؛ الهويات الفرعية بياناتها مستقلة ولا تُلوّث الحساب.
  await prisma.users.update({
    where: { id: BigInt(session.uid) },
    data: {
      ...(publishingAsDefault && phone ? { phoneNumber: phone, allow_phone: 1 } : {}),
      ...(publishingAsDefault && whatsapp ? { phone_whatsapp: whatsapp, whatsapp: 1 } : {}),
      ...(cityId && cityId !== '0' ? { city_id: BigInt(cityId) } : {}),
    },
  }).catch(() => {});
  // هوية فرعية بلا جوال/واتساب محفوظ: عبّئها من أول إعلان يُنشر بها.
  if (profileId && !publishingAsDefault) await backfillProfileContact(profileId, phone, whatsapp).catch(() => {});
  if (areaRaw) await setUserArea(session.uid, Number(areaRaw)).catch(() => {});

  const images = await readImages(formData);

  // فحص أسماء ملفات الصور/الفيديو لكشف المحتوى غير الأخلاقي المصرّح باسمه
  const mediaName = String((formData.get('video') as File | null)?.name || '');
  const nameHit = await scanContent(images.map((i) => i.name).join(' '), mediaName);
  if (nameHit) {
    // اسم ملف مشبوه: لا نحجب — نُعلّم الإعلان «قيد المراجعة» لتراجعه الإدارة.
    const note = `اسم ملف: ${CATEGORY_LABEL[nameHit.category]}`;
    flagTerms = flagTerms ? `${flagTerms} — ${note}` : note;
  }

  // فحص بصري للصور بالذكاء الاصطناعي: الصور الإباحية = حظر فوري صارم
  if (imageModerationEnabled() && images.length) {
    const v = await scanImages(images.map((i) => i.buf));
    if (v.explicit) {
      await handleProhibited(session.uid, 'immoral', 'nsfw-image', `صورة إباحية (نسبة ${v.hardcore.toFixed(2)})`);
      redirect('/ads/new?error=blocked&cat=immoral&banned=1');
    }
    if (v.review) {
      await logMod(session.uid, { kind: 'content', category: 'immoral', term: 'nsfw-image-review', snippet: `مراجعة صورة (إباحي ${v.hardcore.toFixed(2)} / مثير ${v.sexy.toFixed(2)})`, action: 'blocked' });
      redirect('/ads/new?error=image');
    }
  }

  // تكرار عبر أعضاء مختلفين (شبكات سبام تنشر نفس النص بأرقام/حسابات متعددة —
  // مثل إعلانات "دينا" المتكررة). منع فوري دون خيار الدفع (المحتوى ليس ملكه
  // أصلاً)، مع نفس نظام المخالفات المتدرّج قبل الحظر.
  // يُفحص قبل التكرار الذاتي عمداً: هذا الفحص لا يقبل شراء باقة لتجاوزه إطلاقاً،
  // فلا داعي لاستهلاك رصيد تكرار (consumeDupCredit) هنا فقط لينتهي الأمر بحظر لاحق.
  const crossDup = dest === 'store' ? null : await crossUserDuplicateOf(session.uid, title, detail);
  if (crossDup) {
    const n = await bumpDupAttempts(session.uid);
    await logMod(session.uid, { kind: 'duplicate_cross', action: n >= DUP_LIMIT ? 'banned' : 'blocked', snippet: `مطابق لإعلان عضو آخر #${crossDup.id} «${crossDup.title}» — الجديد: ${title.slice(0, 60)}`, adId: crossDup.id });
    if (n >= DUP_LIMIT) {
      await banUserFor(session.uid, await getStrikeBanDays(), 'auto', 'تكرار نشر محتوى مطابق لإعلانات أعضاء آخرين');
      await notifyModBlock(session.uid, `🚫 تم حظر حسابك بعد تكرار نشر محتوى مطابق لإعلانات أعضاء آخرين.`);
      redirect('/ads/new?error=banned');
    }
    await notifyModBlock(session.uid, `⚠️ رُفض نشر إعلانك لأنه مطابق لإعلان عضو آخر — إنذار (${DUP_LIMIT - n} متبقية)، التكرار يؤدي للحظر.`, '/ads/new');
    redirect(`/ads/new?error=crossdup&left=${Math.max(0, DUP_LIMIT - n)}&dup=${crossDup.id}`);
  }

  // المتجر مستقل تماماً: إعلانات المتجر لا تخضع لسياسة تكرار تربح ولا تسعيراتها (سياسة
  // المتجر مختلفة). أمّا إعلانات تربح فتخضع لكشف التكرار وباقاته. (فحص المحتوى يبقى للجميع.)
  const dup = dest === 'store' ? null : await ownDuplicateOf(session.uid, title, detail, images);
  if (dup) {
    const consumed = await consumeDupCredit(session.uid);
    if (consumed) {
      await resetDupAttempts(session.uid);
      await logMod(session.uid, { kind: 'duplicate', action: 'charged', snippet: `تكرار مسموح (باقة) مع #${dup.id} «${dup.title}»`, adId: dup.id });
    } else {
      const svc = await getServicePricing();
      if (serviceHasPrice(svc.dup3) || serviceHasPrice(svc.dup5)) {
        // باقات التكرار مُفعّلة والرصيد نفد → يُطلب شراء باقة (لا حظر)
        await logMod(session.uid, { kind: 'duplicate', action: 'blocked', snippet: `تكرار مع #${dup.id} «${dup.title}» — يلزم باقة تكرار`, adId: dup.id });
        redirect(`/ads/new?error=needdup&dup=${dup.id}`);
      }
      const n = await bumpDupAttempts(session.uid);
      // يُسجَّل للإدارة: أي إعلان تطابق معه بالضبط (السجل الرقابي) — مع رقم الإعلان الأصلي لعرضه عند اتخاذ القرار
      await logMod(session.uid, { kind: 'duplicate', action: n >= DUP_LIMIT ? 'banned' : 'blocked', snippet: `مكرّر مع #${dup.id} «${dup.title}» — الجديد: ${title.slice(0, 60)}`, adId: dup.id });
      if (n >= DUP_LIMIT) {
        await banUserFor(session.uid, await getStrikeBanDays(), 'auto', 'تكرار نشر نفس الإعلان أكثر من مرة');
        await notifyModBlock(session.uid, `🚫 تم حظر حسابك بعد تكرار نشر نفس الإعلان أكثر من مرة.`);
        redirect('/ads/new?error=banned');
      }
      await notifyModBlock(session.uid, `⚠️ رُفض نشر إعلانك لأنه مطابق لإعلان سابق لك — إنذار (${DUP_LIMIT - n} متبقية)، التكرار يؤدي للحظر.`, '/ads/new');
      redirect(`/ads/new?error=duplicate&left=${Math.max(0, DUP_LIMIT - n)}&dup=${dup.id}`);
    }
  }

  // النشر الفوري ما لم تُفعّل الإدارة «مراجعة الإعلانات قبل النشر».
  // صاحب متجر معتمد: إعلاناته تُنشر مباشرة (الموافقة على المتجر تُغني عن مراجعة كل إعلان).
  const approvedStoreOwner = await isApprovedStoreOwner(session.uid).catch(() => false);
  const requireApproval = approvedStoreOwner ? false : await getSettingBool(SETTING_ADS_APPROVAL, false).catch(() => false);
  // جدولة النشر (مفتاح من الإعدادات): موعد مستقبلي = يبقى مخفياً حتى ينشره الناشر التلقائي.
  // غير متاحة مع وضع مراجعة الإعلانات أو النشر داخل المتجر.
  let scheduledAt: Date | null = null;
  if (dest !== 'store' && !requireApproval) {
    const schedOn = await getSettingBool('schedule_on', false).catch(() => false);
    const rawSched = String(formData.get('publishAt') || '').trim();
    if (schedOn && rawSched) {
      const d = new Date(rawSched);
      // أقصى مدى للجدولة من الإعدادات (0 = بلا حد)
      const { getScheduleMaxDays } = await import('@/lib/settings');
      const maxDays = await getScheduleMaxDays().catch(() => 30);
      const maxMs = maxDays > 0 ? Date.now() + maxDays * 86400_000 : Infinity;
      if (!isNaN(d.getTime()) && d.getTime() > Date.now() + 60_000 && d.getTime() < maxMs) scheduledAt = d;
    }
  }
  const video = await saveMediaFile(formData, 'video', 25 * 1024 * 1024, ['mp4', 'webm', 'mov', 'm4v']);

  const ad = await prisma.ads.create({
    data: {
      title: finalTitle, detail: finalDetail, price, adsType,
      category_id: catId,
      subcategory_id: subRaw ? Number(subRaw) : null,
      city_id: BigInt(cityId || '0'),
      area_id: areaRaw ? Number(areaRaw) : null,
      country_id: countryRaw ? Number(countryRaw) : (user?.country_id ?? null),
      user_id: BigInt(session.uid),
      profile_id: profileId ? BigInt(profileId) : null,
      video_path: video || '',
      lat: lat || null,
      lng: lng || null,
      phoneAllow: formData.get('phoneAllow') ? 1 : 0,
      commentAllow: formData.get('commentAllow') ? 1 : 0,
      adsSpecial: 'no',
      state: 'active',
      status: requireApproval ? 0 : 1,
      flag_terms: flagTerms || null,
      price_type: priceType,
      rent_period: rentPeriod,
      // عروض اليوم + حالة التوفر (يظهر الحقلان عند تفعيلهما من التحكم)
      old_price: priceType === 'som' ? 0 : Math.max(0, parseFloat(String(formData.get('old_price') || '0')) || 0),
      stock_state: [0, 1, 2].includes(Number(formData.get('stock_state'))) ? Number(formData.get('stock_state')) : 0,
      store_only: dest === 'store' ? 1 : 0, // عزل تام: إعلان المتجر لا يظهر في تربح
      cat_reviewed: aiClassified ? 0 : 1, // تصنيف آلي؟ ينتظر مراجعة الإدارة
      bumped_at: new Date(), // ترتيب «الأحدث» يعتمد آخر تحديث (Bump)
      ...(scheduledAt ? { status: 0, publish_at: scheduledAt } : {}),
      created_at: new Date(),
    },
  });

  // إعلان المتجر: العلامة المائية هوية المتجر (شعار/اسم حسب اختيار المالك) بدل «تربح»
  const wm = dest === 'store' ? await (await import('@/lib/merchant')).getStoreWatermark(session.uid) : undefined;
  await storeImages(images, session.uid, ad.id, wm);
  const audio = await saveMediaFile(formData, 'audio', 8 * 1024 * 1024, ['webm', 'ogg', 'mp3', 'm4a', 'wav']);
  if (audio) await setAdMedia(ad.id, 'audio', audio).catch(() => {});
  await logAdPublish(session.uid); // سجل ثابت لحدّ الباقة — لا يتأثر بحذف الإعلان لاحقاً
  // لا تصفير لعدّاد محاولات التكرار هنا: تصفيره عند أي نشر ناجح كان يتيح
  // للمخالف التناوب بين إعلان سليم وآخر مكرّر بلا نهاية دون بلوغ حدّ الحظر
  // (bumpDupAttempts أدناه يتكفّل بتقادم العدّاد تلقائياً بعد ٢٤ ساعة هدوء).
  // نقاط أول إعلان + مكافأة الإحالة — لا تعطّل النشر
  import('@/lib/points').then(async (m) => {
    const count = await prisma.ads.count({ where: { user_id: BigInt(session.uid) } }).catch(() => 99);
    if (count === 1) {
      const cfg = await m.getPointsConfig();
      await m.grantPoints(session.uid, cfg.firstAd, 'first_ad', true);
      await m.rewardReferral(session.uid);
    }
  }).catch(() => {});
  if (dest !== 'store') await applyFeaturedToNewAd(session.uid, ad.id, pkg).catch(() => {}); // باقة التميز خاصة بإعلانات تربح
  // التمييز ⭐ المطلوب من نموذج النشر: يغطي الرصيد → خصم وتمييز فوري، لا يغطي → يُنشر الإعلان وتُطلب إعادة الشحن
  let featuredState: '' | 'ok' | 'need' = '';
  const fdur = String(formData.get('featuredDur') || '');
  if (fdur && dest !== 'store') {
    const { getServicePricing, isDur, DUR_DAYS, DUR_LABEL } = await import('@/lib/settings');
    if (isDur(fdur)) {
      const fprice = (await getServicePricing()).featured[fdur];
      if (fprice > 0) {
        const { charge } = await import('@/lib/wallet');
        const paid = await charge(session.uid, fprice, 'featured', `تمييز الإعلان (${DUR_LABEL[fdur]}) #${toInt(ad.id)}`);
        if (paid.ok) {
          const base = scheduledAt ?? new Date();
          await prisma.ads.update({ where: { id: ad.id }, data: { adsSpecial: 'checked', expires_at: new Date(base.getTime() + DUR_DAYS[fdur] * 86400000) } }).catch(() => {});
          featuredState = 'ok';
        } else {
          featuredState = 'need';
        }
      }
    }
  }
  // شارة عاجل المطلوبة من نموذج النشر (باقة 24 أو 48 ساعة): يغطي الرصيد → خصم وتفعيل فوري، لا يغطي → يُنشر الإعلان وتُطلب إعادة الشحن
  let urgentState: '' | 'ok' | 'need' = '';
  const urgentHoursReq = Number(formData.get('urgent') || 0);
  if (urgentHoursReq > 0 && dest !== 'store') {
    const { getAdExtras } = await import('@/lib/settings');
    const x = await getAdExtras();
    const upack = x.urgentPacks.find((pk) => pk.hours === urgentHoursReq);
    if (upack) {
      const { charge } = await import('@/lib/wallet');
      const paid = await charge(session.uid, upack.price, 'urgent', `شارة عاجل (${upack.hours} ساعة) #${toInt(ad.id)}`);
      if (paid.ok) {
        const base = scheduledAt ?? new Date();
        await prisma.ads.update({ where: { id: ad.id }, data: { urgent_until: new Date(base.getTime() + upack.hours * 3600_000) } }).catch(() => {});
        urgentState = 'ok';
      } else {
        urgentState = 'need';
      }
    }
  }
  await bustAdCaches().catch(() => {}); // يظهر الإعلان فوراً في الرئيسية/البحث/المتاجر
  if (!requireApproval && dest !== 'store' && !scheduledAt) {
    // تنبيهات البحث المحفوظ + مطابقة عرض/طلب — لإعلانات تربح فقط (عزل المتاجر)
    import('@/lib/saved-search').then((m) => {
      m.notifySavedSearches(toInt(ad.id), title, detail, session.uid).catch(() => {});
      m.notifyOppositeType(toInt(ad.id), title, Number(catId), Number(cityId || '0'), adsType as 'offer' | 'request', session.uid).catch(() => {});
    }).catch(() => {});
  }
  // كلمات مخالفة قليلة: نُشر الإعلان للعامة بعد حجب تلك الكلمات بنجمات — أعلِم صاحبه بذلك.
  if (flagTerms) {
    await notifyModBlock(session.uid, `نُشر إعلانك «${finalTitle.slice(0, 40)}» بعد حجب كلمات مخالفة بنجمات (${flagTerms}). إن رأيت المنع خطأً راسل الإدارة.`, `/ads/${toInt(ad.id)}`).catch(() => {});
  }
  // نشر من المتجر: أدرِج الإعلان في واجهة المتجر، ثم انتقل إلى إعلانات المتجر (لا للرجوع لصفحة الإضافة)
  if (dest === 'store') {
    const { addStoreProduct, getActiveStoreId, staffStoreId } = await import('@/lib/merchant');
    await addStoreProduct(session.uid, toInt(ad.id)).catch(() => {});
    if (requireApproval) redirect('/store?added=pending'); // بانتظار الموافقة → لا يظهر بعد
    // المالك أو الموظف — كلاهما يعود لواجهة المتجر الفعّال نفسه
    const sid = (await getActiveStoreId(session.uid).catch(() => 0)) || (await staffStoreId(session.uid).catch(() => 0));
    redirect(sid ? `/companies/${sid}?added=1` : '/store?added=1');
  }
  // ينشر مباشرة، إلا إذا كان مقيّداً بالموافقة أو مجدولاً
  const extraFlags: string[] = [];
  if (urgentState === 'ok') extraFlags.push('urgent=1');
  if (urgentState === 'need') extraFlags.push('urgentneed=1');
  if (featuredState === 'ok') extraFlags.push('featured=1');
  if (featuredState === 'need') extraFlags.push('featuredneed=1');
  const needFlags = extraFlags.filter((f) => f.includes('need')).map((f) => `&${f}`).join('');
  if (flagTerms && !scheduledAt) redirect(`/account/ads?censored=1${needFlags}`);
  if (scheduledAt) redirect(`/account/ads?scheduled=1${flagTerms ? '&censored=1' : ''}${needFlags}`);
  if (requireApproval) redirect(`/account/ads?pending=1${needFlags}`);
  // نجاح فوري بلا رسوم إضافية معلّقة: رسالة «تم نشر إعلانك» + تحويل للصفحة الرئيسية حيث يظهر.
  if (extraFlags.length === 0) redirect(`/?published=${toInt(ad.id)}`);
  // شراء «عاجل/مميز» أو نقص رصيدهما: ابقَ على صفحة الإعلان لإتمام/معالجة ذلك قربه.
  redirect(`/ads/${toInt(ad.id)}?${extraFlags.join('&')}`);
}

export async function updateAdAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const ad = await prisma.ads.findUnique({ where: { id: adId } });
  if (!ad || toInt(ad.user_id) !== session.uid) redirect('/account/ads');

  // مدة السماح بالتعديل التي تحددها الإدارة — لا تنطبق على إعلانات المتجر:
  // صاحب المتجر يتحكّم بإعلانات متجره كاملاً ويعدّلها في أي وقت.
  if (Number(ad.store_only) !== 1) {
    const { editHours } = await getMemberWindows();
    if (!withinWindow(ad.created_at, editHours)) redirect(`/ads/${toInt(adId)}/edit?error=editWindow&hours=${editHours}`);
  }

  const phone = String(formData.get('phone') || '').trim();
  const whatsapp = String(formData.get('whatsapp') || '').trim();
  const eTitle = String(formData.get('title') || '').trim();
  const eDetail = String(formData.get('detail') || '').trim();
  if (!phone && !whatsapp) redirect(`/ads/${toInt(adId)}/edit?error=contact`);
  if (isKeywordStuffing(eTitle, eDetail)) redirect(`/ads/${toInt(adId)}/edit?error=repeat`);
  // سياسة موحّدة مع الإنشاء: الكلمات المخالفة تُشفَّر بنجوم ولا تحجب الإعلان ولا تحظر الحساب،
  // والجُمل المستثناة (قائمة السماح) تمرّ عادية تماماً بلا تشفير ولا وسم. لا تصنيف حاجب على النصّ.
  const eGuard = await censorGuard(eTitle, eDetail);
  const eFinalTitle = eGuard.parts[0] || eTitle;
  const eFinalDetail = eGuard.parts[1] || eDetail;
  const eFlagTerms = eGuard.hits.length ? summarizeHits(eGuard.hits) : '';
  await prisma.users.update({
    where: { id: BigInt(session.uid) },
    data: {
      ...(phone ? { phoneNumber: phone, allow_phone: 1 } : {}),
      ...(whatsapp ? { phone_whatsapp: whatsapp, whatsapp: 1 } : {}),
    },
  }).catch(() => {});

  let eLat = String(formData.get('lat') || '').trim();
  let eLng = String(formData.get('lng') || '').trim();
  if (!eLat || !eLng) {
    const ll = await resolveMapsUrl(String(formData.get('mapLink') || ''));
    if (ll) { eLat = String(ll.lat); eLng = String(ll.lng); }
  }
  // العنوان والتفاصيل إجباريان في التعديل أيضاً (كالإضافة)
  if (!eTitle || !eDetail) redirect(`/ads/${toInt(adId)}/edit?error=missing`);
  // نوع السعر عند التعديل: نفس منطق الإضافة (على السوم = صفر بلا سعر)
  const eType = String(formData.get('adsType')) === 'request' ? 'request' : 'offer';
  const ePtRaw = String(formData.get('priceType') || '');
  const ePriceType = eType === 'offer' && ['rent', 'sale', 'som'].includes(ePtRaw) ? ePtRaw : null;
  const eRentPeriod = ePriceType === 'rent' ? String(formData.get('rentPeriod') || '').trim().slice(0, 20) || 'شهري' : null;
  const newPrice = ePriceType === 'som' ? 0 : parseFloat(String(formData.get('price') || '0')) || 0;
  const oldPrice = ad.price || 0;
  await prisma.ads.update({
    where: { id: adId },
    data: {
      title: eFinalTitle,
      detail: eFinalDetail,
      flag_terms: eFlagTerms || null,
      price: newPrice,
      adsType: eType,
      price_type: ePriceType,
      rent_period: eRentPeriod,
      ...(ePriceType === 'som' ? { old_price: 0 } : {}),
      // الأقسام مخفية؟ لا حقل قسم مُرسل — نبقي قسم الإعلان الحالي دون أي تغيير.
      // اختيار العضو صراحةً لقسم = لا حاجة لمراجعة إدارية (ليس تصنيفاً آلياً).
      ...(Number(formData.get('category_id') || 0) > 0
        ? { category_id: BigInt(String(formData.get('category_id'))), subcategory_id: formData.get('subcategory_id') ? Number(formData.get('subcategory_id')) : null, cat_reviewed: 1 }
        : {}),
      city_id: BigInt(String(formData.get('city_id') || '0')),
      area_id: formData.get('area_id') ? Number(formData.get('area_id')) : null,
      lat: eLat || null,
      lng: eLng || null,
      phoneAllow: formData.get('phoneAllow') ? 1 : 0,
      commentAllow: formData.get('commentAllow') ? 1 : 0,
      // لا تُصفَّر القيم إذا كانت الميزة موقوفة من التحكم (الحقل غير معروض أصلاً)
      ...(formData.get('old_price') !== null ? { old_price: Math.max(0, parseFloat(String(formData.get('old_price') || '0')) || 0) } : {}),
      ...(formData.get('stock_state') !== null ? { stock_state: [0, 1, 2].includes(Number(formData.get('stock_state'))) ? Number(formData.get('stock_state')) : 0 } : {}),
    },
  });

  // تنبيه هبوط السعر: من أضافوا هذا الإعلان لمفضّلتهم يصلهم تنبيه عند تخفيض سعره (عودة للشراء)
  if (newPrice > 0 && oldPrice > newPrice) {
    const favs = await prisma.favorites.findMany({ where: { ads_id: adId, user_id: { not: BigInt(session.uid) } }, select: { user_id: true }, take: 3000 }).catch(() => []);
    if (favs.length) {
      const title = `📉 انخفض سعر إعلان في مفضّلتك: «${(eFinalTitle || '').slice(0, 45)}» — الآن ${new Intl.NumberFormat('en-US').format(newPrice)} ر.س`;
      const route = `/ads/${toInt(adId)}`;
      await prisma.notfications.createMany({ data: favs.map((f) => ({ title, route, user_id: String(toInt(f.user_id)), type: 'other' })) }).catch(() => {});
    }
  }

  const images = await readImages(formData);
  if (imageModerationEnabled() && images.length) {
    const v = await scanImages(images.map((i) => i.buf));
    if (v.explicit) {
      await handleProhibited(session.uid, 'immoral', 'nsfw-image', `صورة إباحية (تعديل، نسبة ${v.hardcore.toFixed(2)})`);
      redirect('/account/ads?error=blocked');
    }
    if (v.review) {
      await logMod(session.uid, { kind: 'content', category: 'immoral', term: 'nsfw-image-review', snippet: `مراجعة صورة (تعديل)`, action: 'blocked' });
      redirect(`/ads/${toInt(adId)}/edit?error=image`);
    }
  }
  // تعديل إعلان متجر: حافظ على علامة المتجر المائية (شعار/اسم) بدل «تربح»
  const eWm = Number(ad.store_only) === 1 ? await (await import('@/lib/merchant')).getStoreWatermark(session.uid) : undefined;
  if (images.length) await storeImages(images, session.uid, adId, eWm);
  const newVideo = await saveMediaFile(formData, 'video', 25 * 1024 * 1024, ['mp4', 'webm', 'mov', 'm4v']);
  if (newVideo) await prisma.ads.update({ where: { id: adId }, data: { video_path: newVideo } }).catch(() => {});
  const newAudio = await saveMediaFile(formData, 'audio', 8 * 1024 * 1024, ['webm', 'ogg', 'mp3', 'm4a', 'wav']);
  if (newAudio) await setAdMedia(adId, 'audio', newAudio).catch(() => {});

  await bustAdCaches().catch(() => {});
  revalidatePath(`/ads/${toInt(adId)}`);
  redirect(`/ads/${toInt(adId)}`);
}
