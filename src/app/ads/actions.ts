'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { saveUpload } from '@/lib/storage';
import { watermarkImage } from '@/lib/watermark';
import { bumpDupAttempts, banUser, resetDupAttempts, DUP_LIMIT } from '@/lib/moderation';
import { getUserPackage, countAdsToday, lastAdAt, applyFeaturedToNewAd } from '@/lib/packages';
import { getMemberWindows, withinWindow, getSettingBool, SETTING_ADS_APPROVAL } from '@/lib/settings';
import { setAdMedia } from '@/lib/ad-media';
import { setUserArea } from '@/lib/user-location';
import { scanContent } from '@/lib/content-guard';
import { toInt } from '@/lib/utils';

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
      const up = await prisma.uploads.create({
        data: { file_name: rel, file_original_name: img.name, extension: img.ext, type: 'ad', file_size: img.buf.length, user_id: userId },
      });
      await prisma.photos.create({ data: { photo_path: String(toInt(up.id)), other_id: adId } });
    } catch {
      // skip a problematic image rather than failing the whole publish
    }
  }
}

/** Normalize Arabic text for duplicate comparison. */
function normalizeAr(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[ً-ْٰ]/g, '') // diacritics
    .replace(/[آأإا]/g, 'ا') // alef variants
    .replace(/ى/g, 'ي') // alef maqsura -> ya
    .replace(/ة/g, 'ه') // ta marbuta -> ha
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // drop punctuation/emoji
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Token-overlap (Jaccard) similarity between two normalized strings. */
function similarity(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Detect keyword-stuffing (حشو الكلمات): the same word or short phrase repeated
 * many times to manipulate Google search. Returns true when the text is spammy.
 */
function isKeywordStuffing(title: string, detail: string): boolean {
  const words = normalizeAr(`${title} ${detail}`).split(' ').filter((w) => w.length >= 3);
  if (words.length < 8) return false;

  // 1) a single word dominating the text (e.g. "تأجير تأجير تأجير …")
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  let topCount = 0;
  for (const c of freq.values()) if (c > topCount) topCount = c;
  if (topCount >= 6 && topCount / words.length >= 0.28) return true;
  if (topCount >= 12) return true; // extreme absolute repetition regardless of length

  // 2) a repeated adjacent phrase (bigram), e.g. "رافعة شوكية رافعة شوكية …"
  const bigrams = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const key = `${words[i]} ${words[i + 1]}`;
    bigrams.set(key, (bigrams.get(key) || 0) + 1);
  }
  for (const c of bigrams.values()) if (c >= 4) return true;

  return false;
}

/**
 * Decide whether a new ad must be held for admin approval before publishing.
 * Triggers when — versus any existing PUBLISHED ad:
 *   • title similarity ≥ 90%, OR
 *   • detail similarity ≥ 90%, OR
 *   • an uploaded image is byte-identical to an existing ad image.
 */
/** Duplicate against the SAME user's own ads (reposting the same ad). */
async function isOwnDuplicate(userId: number, title: string, detail: string, images: PreparedImage[]): Promise<boolean> {
  if (images.length) {
    const found = await prisma.uploads.findFirst({
      where: { user_id: userId, OR: images.map((i) => ({ file_name: { contains: i.hash } })) },
      select: { id: true },
    });
    if (found) return true;
  }
  const mine = await prisma.ads.findMany({
    where: { user_id: BigInt(userId) },
    select: { title: true, detail: true },
    orderBy: { id: 'desc' },
    take: 300,
  });
  const nTitle = normalizeAr(title);
  const nDetail = normalizeAr(detail);
  for (const r of mine) {
    if (similarity(nTitle, normalizeAr(r.title)) >= 0.9) return true;
    if (similarity(nDetail, normalizeAr(r.detail)) >= 0.9) return true;
  }
  return false;
}

export async function createAdAction(formData: FormData) {
  const session = await requireUser();
  const user = await prisma.users.findUnique({ where: { id: BigInt(session.uid) } });
  if (user?.ban === 'checked') redirect('/ads/new?error=banned');

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
  const lat = String(formData.get('lat') || '').trim();
  const lng = String(formData.get('lng') || '').trim();
  if (!title || !detail || !category_id) return;
  // تعهّد صحة الإعلان وتحمّل المسؤولية إجباري
  if (!formData.get('pledge')) redirect('/ads/new?error=pledge');
  // جوال أو واتساب إجباري حتى يستطيع العملاء التواصل مع صاحب الإعلان
  if (!phone && !whatsapp) redirect('/ads/new?error=contact');
  // منع حشو الكلمات (تكرار العبارات لخداع محرك البحث)
  if (isKeywordStuffing(title, detail)) redirect('/ads/new?error=repeat');

  // فحص ذكي للمحتوى: يمنع السياسي/المخدرات/الأمني/الأخلاقي — والأخلاقي يحظر مباشرة
  const badContent = await scanContent(title, detail);
  if (badContent) {
    if (badContent.category === 'immoral') {
      await banUser(session.uid);
      redirect('/ads/new?error=blocked&cat=immoral&banned=1');
    }
    redirect(`/ads/new?error=blocked&cat=${badContent.category}`);
  }

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
    if (nameHit.category === 'immoral') {
      await banUser(session.uid);
      redirect('/ads/new?error=blocked&cat=immoral&banned=1');
    }
    redirect(`/ads/new?error=blocked&cat=${nameHit.category}`);
  }

  // منع تكرار الإعلان: تحذير ٣ محاولات ثم حظر الحساب
  if (await isOwnDuplicate(session.uid, title, detail, images)) {
    const n = await bumpDupAttempts(session.uid);
    if (n >= DUP_LIMIT) {
      await banUser(session.uid);
      redirect('/ads/new?error=banned');
    }
    redirect(`/ads/new?error=duplicate&left=${Math.max(0, DUP_LIMIT - n)}`);
  }

  // النشر الفوري ما لم تُفعّل الإدارة «مراجعة الإعلانات قبل النشر»
  const requireApproval = await getSettingBool(SETTING_ADS_APPROVAL, false).catch(() => false);
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
    if (eBad.category === 'immoral') { await banUser(session.uid); redirect('/account/ads?error=blocked'); }
    redirect(`/ads/${toInt(adId)}/edit?error=blocked&cat=${eBad.category}`);
  }
  await prisma.users.update({
    where: { id: BigInt(session.uid) },
    data: {
      ...(phone ? { phoneNumber: phone, allow_phone: 1 } : {}),
      ...(whatsapp ? { phone_whatsapp: whatsapp, whatsapp: 1 } : {}),
    },
  }).catch(() => {});

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
      lat: String(formData.get('lat') || '').trim() || null,
      lng: String(formData.get('lng') || '').trim() || null,
      phoneAllow: formData.get('phoneAllow') ? 1 : 0,
      commentAllow: formData.get('commentAllow') ? 1 : 0,
    },
  });

  const images = await readImages(formData);
  if (images.length) await storeImages(images, session.uid, adId);
  const newVideo = await saveMediaFile(formData, 'video', 25 * 1024 * 1024, ['mp4', 'webm', 'mov', 'm4v']);
  if (newVideo) await prisma.ads.update({ where: { id: adId }, data: { video_path: newVideo } }).catch(() => {});
  const newAudio = await saveMediaFile(formData, 'audio', 8 * 1024 * 1024, ['webm', 'ogg', 'mp3', 'm4a', 'wav']);
  if (newAudio) await setAdMedia(adId, 'audio', newAudio).catch(() => {});

  revalidatePath(`/ads/${toInt(adId)}`);
  redirect(`/ads/${toInt(adId)}`);
}
