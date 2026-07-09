'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { saveUpload } from '@/lib/storage';
import { watermarkImage } from '@/lib/watermark';
import { aHash, hashSimilarity } from '@/lib/phash';
import { bumpDupAttempts, banUser, resetDupAttempts, DUP_LIMIT, handleProhibited, checkFlood, logMod, isUserBanned } from '@/lib/moderation';
import { getUserPackage, countAdsToday, lastAdAt, applyFeaturedToNewAd } from '@/lib/packages';
import { getMemberWindows, withinWindow, getSettingBool, SETTING_ADS_APPROVAL, getDupThresholds, getServicePricing, serviceHasPrice } from '@/lib/settings';
import { charge, consumeDupCredit } from '@/lib/wallet';
import { bustAdCaches } from '@/lib/data';
import { setAdMedia } from '@/lib/ad-media';
import { setUserArea } from '@/lib/user-location';
import { scanContent } from '@/lib/content-guard';
import { scanImages, imageModerationEnabled } from '@/lib/nsfw';
import { parseMapsUrl, type LatLng } from '@/lib/maps';
import { toInt } from '@/lib/utils';
import { isApprovedStoreOwner } from '@/lib/merchant';
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
    if (file.size > 8 * 1024 * 1024) continue; // 8MB cap
    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf.length) continue;
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const hash = createHash('sha256').update(new Uint8Array(buf)).digest('hex');
    out.push({ buf, name: file.name, ext, hash });
  }
  return out;
}

async function storeImages(images: PreparedImage[], userId: number, adId: bigint) {
  for (const img of images) {
    try {
      // content-addressed filename → identical images resolve to the same file
      const safe = `${img.hash}.${img.ext}`;
      const stamped = await watermarkImage(img.buf, img.ext); // burn "تربح" watermark (also downscales)
      const rel = await saveUpload(stamped, safe);
      const phash = await aHash(img.buf); // بصمة إدراكية للصورة (لكشف التكرار بالنسبة)
      const up = await prisma.uploads.create({
        data: { file_name: rel, file_original_name: img.name, extension: img.ext, type: 'ad', file_size: img.buf.length, user_id: userId, phash: phash || null },
      });
      await prisma.photos.create({ data: { photo_path: String(toInt(up.id)), other_id: adId } });
    } catch {
      // skip a problematic image rather than failing the whole publish
    }
  }
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

export async function createAdAction(formData: FormData) {
  const session = await requireUser();
  const user = await prisma.users.findUnique({ where: { id: BigInt(session.uid) } });
  if (await isUserBanned(session.uid)) redirect('/ads/new?error=banned');

  const title = String(formData.get('title') || '').trim();
  const detail = String(formData.get('detail') || '').trim();
  const price = parseFloat(String(formData.get('price') || '0')) || 0;
  const adsType = String(formData.get('adsType')) === 'request' ? 'request' : 'offer';
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
  // نشر من داخل المتجر: للرجوع للمتجر وإدراج الإعلان في واجهته تلقائياً
  const dest = String(formData.get('dest') || '') === 'store' ? 'store' : '';
  const q = dest ? '&dest=store' : '';
  // حقول إجبارية — أظهِر السبب بدل الرجوع الصامت
  if (!title || !detail || category_id <= 0n) redirect(`/ads/new?error=missing${q}`);
  // تعهّد صحة الإعلان وتحمّل المسؤولية إجباري
  if (!formData.get('pledge')) redirect(`/ads/new?error=pledge${q}`);
  // جوال أو واتساب إجباري حتى يستطيع العملاء التواصل مع صاحب الإعلان
  if (!phone && !whatsapp) redirect(`/ads/new?error=contact${q}`);
  // منع حشو الكلمات (تكرار العبارات لخداع محرك البحث)
  if (isKeywordStuffing(title, detail)) redirect('/ads/new?error=repeat');

  // فحص ذكي للمحتوى: يمنع السياسي/المخدرات/الأمني/الأخلاقي.
  // الأخلاقي يحظر فوراً، والبقية تُسجَّل مخالفة ويُحظر عند التكرار (بدون تردد).
  const badContent = await scanContent(title, detail);
  if (badContent) {
    const o = await handleProhibited(session.uid, badContent.category, badContent.term, `${title} ${detail}`);
    redirect(`/ads/new?error=blocked&cat=${o.category}${o.banned ? '&banned=1' : `&left=${o.left}`}`);
  }

  // حاجز إغراق صلب لكل الأعضاء (فوق حدود الباقة): يمنع النشر المتسارع
  const flood = await checkFlood(session.uid);
  if (flood.blocked) redirect(`/ads/new?error=flood&wait=${flood.waitSec}`);

  // حدود الباقة: عدد الإعلانات باليوم والفارق الزمني بين إعلان وآخر
  const pkg = await getUserPackage(session.uid);
  if (pkg.adsPerDay > 0 && (await countAdsToday(session.uid)) >= pkg.adsPerDay) {
    redirect(`/ads/new?error=limit&max=${pkg.adsPerDay}`);
  }
  if (pkg.gapHours > 0) {
    const last = await lastAdAt(session.uid);
    if (last) {
      const elapsedH = (Date.now() - new Date(last).getTime()) / 3600000;
      if (elapsedH < pkg.gapHours) {
        const wait = Math.max(1, Math.ceil(pkg.gapHours - elapsedH));
        redirect(`/ads/new?error=gap&hours=${pkg.gapHours}&wait=${wait}`);
      }
    }
  }

  // احفظ وسيلة التواصل والموقع في ملف العضو تلقائياً حتى تظهر في إعلاناته وملفه
  await prisma.users.update({
    where: { id: BigInt(session.uid) },
    data: {
      ...(phone ? { phoneNumber: phone, allow_phone: 1 } : {}),
      ...(whatsapp ? { phone_whatsapp: whatsapp, whatsapp: 1 } : {}),
      ...(cityId && cityId !== '0' ? { city_id: BigInt(cityId) } : {}),
    },
  }).catch(() => {});
  if (areaRaw) await setUserArea(session.uid, Number(areaRaw)).catch(() => {});

  const images = await readImages(formData);

  // فحص أسماء ملفات الصور/الفيديو لكشف المحتوى غير الأخلاقي المصرّح باسمه
  const mediaName = String((formData.get('video') as File | null)?.name || '');
  const nameHit = await scanContent(images.map((i) => i.name).join(' '), mediaName);
  if (nameHit) {
    const o = await handleProhibited(session.uid, nameHit.category, nameHit.term, `filename: ${images.map((i) => i.name).join(' ')} ${mediaName}`);
    redirect(`/ads/new?error=blocked&cat=${o.category}${o.banned ? '&banned=1' : `&left=${o.left}`}`);
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

  // المتجر مستقل تماماً: إعلانات المتجر لا تخضع لسياسة تكرار تربح ولا تسعيراتها (سياسة
  // المتجر مختلفة). أمّا إعلانات تربح فتخضع لكشف التكرار وباقاته. (فحص المحتوى يبقى للجميع.)
  const dup = dest === 'store' ? null : await ownDuplicateOf(session.uid, title, detail, images);
  if (dup) {
    const consumed = await consumeDupCredit(session.uid);
    if (consumed) {
      await resetDupAttempts(session.uid);
      await logMod(session.uid, { kind: 'duplicate', action: 'charged', snippet: `تكرار مسموح (باقة) مع #${dup.id} «${dup.title}»` });
    } else {
      const svc = await getServicePricing();
      if (serviceHasPrice(svc.dup3) || serviceHasPrice(svc.dup5)) {
        // باقات التكرار مُفعّلة والرصيد نفد → يُطلب شراء باقة (لا حظر)
        await logMod(session.uid, { kind: 'duplicate', action: 'blocked', snippet: `تكرار مع #${dup.id} «${dup.title}» — يلزم باقة تكرار` });
        redirect(`/ads/new?error=needdup&dup=${dup.id}`);
      }
      const n = await bumpDupAttempts(session.uid);
      // يُسجَّل للإدارة: أي إعلان تطابق معه بالضبط (السجل الرقابي)
      await logMod(session.uid, { kind: 'duplicate', action: n >= DUP_LIMIT ? 'banned' : 'blocked', snippet: `مكرّر مع #${dup.id} «${dup.title}» — الجديد: ${title.slice(0, 60)}` });
      if (n >= DUP_LIMIT) {
        await banUser(session.uid);
        redirect('/ads/new?error=banned');
      }
      redirect(`/ads/new?error=duplicate&left=${Math.max(0, DUP_LIMIT - n)}&dup=${dup.id}`);
    }
  }

  // النشر الفوري ما لم تُفعّل الإدارة «مراجعة الإعلانات قبل النشر».
  // صاحب متجر معتمد: إعلاناته تُنشر مباشرة (الموافقة على المتجر تُغني عن مراجعة كل إعلان).
  const approvedStoreOwner = await isApprovedStoreOwner(session.uid).catch(() => false);
  const requireApproval = approvedStoreOwner ? false : await getSettingBool(SETTING_ADS_APPROVAL, false).catch(() => false);
  const video = await saveMediaFile(formData, 'video', 25 * 1024 * 1024, ['mp4', 'webm', 'mov', 'm4v']);

  const ad = await prisma.ads.create({
    data: {
      title, detail, price, adsType,
      category_id,
      subcategory_id: subRaw ? Number(subRaw) : null,
      city_id: BigInt(cityId || '0'),
      area_id: areaRaw ? Number(areaRaw) : null,
      country_id: countryRaw ? Number(countryRaw) : (user?.country_id ?? null),
      user_id: BigInt(session.uid),
      video_path: video || '',
      lat: lat || null,
      lng: lng || null,
      phoneAllow: formData.get('phoneAllow') ? 1 : 0,
      commentAllow: formData.get('commentAllow') ? 1 : 0,
      adsSpecial: 'no',
      state: 'active',
      status: requireApproval ? 0 : 1,
      created_at: new Date(),
    },
  });

  await storeImages(images, session.uid, ad.id);
  const audio = await saveMediaFile(formData, 'audio', 8 * 1024 * 1024, ['webm', 'ogg', 'mp3', 'm4a', 'wav']);
  if (audio) await setAdMedia(ad.id, 'audio', audio).catch(() => {});
  await resetDupAttempts(session.uid); // successful non-duplicate → clear strikes
  await applyFeaturedToNewAd(session.uid, ad.id, pkg).catch(() => {}); // باقة التميز: تثبيت بالأعلى
  await bustAdCaches().catch(() => {}); // يظهر الإعلان فوراً في الرئيسية/البحث/المتاجر
  if (!requireApproval) {
    // تنبيهات البحث المحفوظ — لا تعطّل النشر بأي حال
    import('@/lib/saved-search').then((m) => m.notifySavedSearches(toInt(ad.id), title, detail, session.uid)).catch(() => {});
  }
  // نشر من المتجر: أدرِج الإعلان في واجهة المتجر، ثم انتقل إلى إعلانات المتجر (لا للرجوع لصفحة الإضافة)
  if (dest === 'store') {
    const { addStoreProduct, storeIdOfUser } = await import('@/lib/merchant');
    await addStoreProduct(session.uid, toInt(ad.id)).catch(() => {});
    if (requireApproval) redirect('/store?added=pending'); // بانتظار الموافقة → لا يظهر بعد
    const sid = await storeIdOfUser(session.uid).catch(() => 0);
    redirect(sid ? `/companies/${sid}?added=1` : '/store?added=1');
  }
  // ينشر مباشرة، إلا إذا كان مقيّداً بالموافقة
  if (requireApproval) redirect('/account/ads?pending=1');
  redirect(`/ads/${toInt(ad.id)}`);
}

export async function updateAdAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const ad = await prisma.ads.findUnique({ where: { id: adId } });
  if (!ad || toInt(ad.user_id) !== session.uid) redirect('/account/ads');

  // مدة السماح بالتعديل التي تحددها الإدارة
  const { editHours } = await getMemberWindows();
  if (!withinWindow(ad.created_at, editHours)) redirect(`/ads/${toInt(adId)}/edit?error=editWindow&hours=${editHours}`);

  const phone = String(formData.get('phone') || '').trim();
  const whatsapp = String(formData.get('whatsapp') || '').trim();
  const eTitle = String(formData.get('title') || '').trim();
  const eDetail = String(formData.get('detail') || '').trim();
  if (!phone && !whatsapp) redirect(`/ads/${toInt(adId)}/edit?error=contact`);
  if (isKeywordStuffing(eTitle, eDetail)) redirect(`/ads/${toInt(adId)}/edit?error=repeat`);
  const eBad = await scanContent(eTitle, eDetail);
  if (eBad) {
    const o = await handleProhibited(session.uid, eBad.category, eBad.term, `${eTitle} ${eDetail}`);
    if (o.banned) redirect('/account/ads?error=blocked');
    redirect(`/ads/${toInt(adId)}/edit?error=blocked&cat=${o.category}&left=${o.left}`);
  }
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
  await prisma.ads.update({
    where: { id: adId },
    data: {
      title: String(formData.get('title') || '').trim(),
      detail: String(formData.get('detail') || '').trim(),
      price: parseFloat(String(formData.get('price') || '0')) || 0,
      adsType: String(formData.get('adsType')) === 'request' ? 'request' : 'offer',
      category_id: BigInt(String(formData.get('category_id') || '0')),
      subcategory_id: formData.get('subcategory_id') ? Number(formData.get('subcategory_id')) : null,
      city_id: BigInt(String(formData.get('city_id') || '0')),
      area_id: formData.get('area_id') ? Number(formData.get('area_id')) : null,
      lat: eLat || null,
      lng: eLng || null,
      phoneAllow: formData.get('phoneAllow') ? 1 : 0,
      commentAllow: formData.get('commentAllow') ? 1 : 0,
    },
  });

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
  if (images.length) await storeImages(images, session.uid, adId);
  const newVideo = await saveMediaFile(formData, 'video', 25 * 1024 * 1024, ['mp4', 'webm', 'mov', 'm4v']);
  if (newVideo) await prisma.ads.update({ where: { id: adId }, data: { video_path: newVideo } }).catch(() => {});
  const newAudio = await saveMediaFile(formData, 'audio', 8 * 1024 * 1024, ['webm', 'ogg', 'mp3', 'm4a', 'wav']);
  if (newAudio) await setAdMedia(adId, 'audio', newAudio).catch(() => {});

  await bustAdCaches().catch(() => {});
  revalidatePath(`/ads/${toInt(adId)}`);
  redirect(`/ads/${toInt(adId)}`);
}
