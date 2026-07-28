'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createHash } from 'crypto';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { saveUpload } from '@/lib/storage';
import { watermarkImage } from '@/lib/watermark';
import { createClassified, getClassifiedById, updateClassified, deleteClassified, reactivateClassified, setClassifiedStatus, getClassifiedOwnerState } from '@/lib/classified';
import { hasAnyAdmin } from '@/lib/roles';
import { getMemberWindows, withinWindow, getClassifiedDupConfig, getServicePricing, serviceHasPrice, isDur, DUR_DAYS, getStrikeBanDays, getSettingBool } from '@/lib/settings';
import { charge, consumeDupCredit, addDupCredit, adjustBalance } from '@/lib/wallet';
import { censorGuard, summarizeHits } from '@/lib/content-guard';
import { handleProhibited, logMod, checkFlood, bumpDupAttempts, banUserFor, notifyModBlock, DUP_LIMIT } from '@/lib/moderation';
import { checkImageBuffer, imageModerationEnabled } from '@/lib/nsfw';
import { aHash, hashSimilarity } from '@/lib/phash';
import { normalizeAr, similarity } from '@/domain/text';
import { toInt } from '@/lib/utils';

/** Read the uploaded classified image into a buffer (or null), enforcing size/type. */
async function readImageBuffer(formData: FormData): Promise<{ buf: Buffer; name: string } | null> {
  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0 || file.size > 30 * 1024 * 1024) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) return null;
  return { buf, name: file.name };
}

/** Watermark + persist a classified image, recording a perceptual hash (phash) for duplicate detection. */
async function saveOneImage(img: { buf: Buffer; name: string } | null, userId: number): Promise<string | null> {
  try {
    if (!img?.buf.length) return null;
    const ext = (img.name.split('.').pop() || 'jpg').toLowerCase();
    const hash = createHash('sha256').update(new Uint8Array(img.buf)).digest('hex');
    const phash = await aHash(img.buf).catch(() => ''); // بصمة إدراكية لكشف تكرار الصورة
    const stamped = await watermarkImage(img.buf, ext); // burn "تربح" watermark (also downscales + normalizes format)
    // Store with the REAL output extension (HEIC/odd formats become JPEG) so the
    // file is served with a matching Content-Type and always renders.
    const outExt = stamped.ext || 'jpg';
    const rel = await saveUpload(stamped.buf, `${hash}.${outExt}`);
    // register in uploads (with owner + phash) so duplicate detection can match by image
    await prisma.uploads
      .create({ data: { file_name: rel, file_original_name: img.name, extension: outExt, type: 'classified', file_size: img.buf.length, user_id: userId, phash: phash || null } })
      .catch(() => {});
    return rel;
  } catch {
    return null; // never crash the publish flow because of an image
  }
}

type Bg = { theme: number; pattern: string; accent: string };

/** Background-design similarity (%) — how many of theme/pattern/accent match. */
function bgSimilarity(a: Bg, b: Bg): number {
  let m = 0;
  if (a.theme === b.theme) m++;
  if ((a.pattern || 'none') === (b.pattern || 'none')) m++;
  if ((a.accent || 'none') === (b.accent || 'none')) m++;
  return (m / 3) * 100;
}

/** Detect a duplicate classified among the SAME user's own classifieds.
 *  Flags when (per admin thresholds): content matches, OR image matches, OR the
 *  background design matches AND the text is at least half-similar (so a shared
 *  default background alone never blocks an otherwise different ad).
 *  Returns the matched ad (id + title) or null. */
async function classifiedDuplicateOf(
  userId: number,
  title: string | null,
  body: string | null,
  img: { buf: Buffer } | null,
  bg: Bg,
  excludeId = 0,
): Promise<{ id: number; title: string } | null> {
  const cfg = await getClassifiedDupConfig();
  if (!cfg.enabled) return null;
  const mine = await prisma.classified_ads.findMany({
    where: { user_id: BigInt(userId), ...(excludeId ? { id: { not: BigInt(excludeId) } } : {}) },
    select: { id: true, title: true, body: true, image: true, theme: true, pattern: true, accent: true },
    orderBy: { id: 'desc' },
    take: 300,
  });
  if (!mine.length) return null;

  const nNew = normalizeAr(`${title || ''} ${body || ''}`);
  const newHash = img ? await aHash(img.buf).catch(() => '') : '';
  // map each own classified image path → its stored phash
  const phashByPath = new Map<string, string>();
  if (newHash) {
    const paths = mine.map((m) => m.image).filter((p): p is string => !!p);
    if (paths.length) {
      const ups = await prisma.uploads.findMany({ where: { file_name: { in: paths }, phash: { not: null } }, select: { file_name: true, phash: true } }).catch(() => []);
      for (const u of ups) if (u.file_name && u.phash) phashByPath.set(u.file_name, u.phash);
    }
  }

  for (const r of mine) {
    const textSim = nNew.length ? similarity(nNew, normalizeAr(`${r.title || ''} ${r.body || ''}`)) * 100 : 0;
    const contentMatch = textSim >= cfg.content;
    const bgMatch = bgSimilarity(bg, { theme: r.theme, pattern: r.pattern, accent: r.accent }) >= cfg.background;
    let imageMatch = false;
    if (newHash && r.image) {
      const ph = phashByPath.get(r.image);
      if (ph) imageMatch = hashSimilarity(newHash, ph) >= cfg.image;
    }
    if (contentMatch || imageMatch || (bgMatch && textSim >= 50)) return { id: toInt(r.id), title: r.title || 'إعلان مبوّب' };
  }
  return null;
}

/** Detect a duplicate classified TEXT posted by a DIFFERENT member (spam networks
 *  reposting the same banner text under different accounts) — text only, mirrors
 *  crossUserDuplicateOf() in the main ads flow exactly. Never bypassable by a paid
 *  "duplicate repost" credit — that credit only covers reposting YOUR OWN content,
 *  not someone else's. Scoped to the last 30 days. */
async function crossUserClassifiedDuplicateOf(userId: number, title: string | null, body: string | null): Promise<{ id: number; title: string } | null> {
  const cfg = await getClassifiedDupConfig();
  if (!cfg.enabled) return null;
  const nNew = normalizeAr(`${title || ''} ${body || ''}`);
  if (!nNew) return null;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const others = await prisma.classified_ads.findMany({
    where: { user_id: { not: BigInt(userId) }, created_at: { gte: since } },
    select: { id: true, title: true, body: true },
    orderBy: { id: 'desc' },
    take: 1500,
  });
  for (const r of others) {
    const textSim = similarity(nNew, normalizeAr(`${r.title || ''} ${r.body || ''}`)) * 100;
    if (textSim >= cfg.content) return { id: toInt(r.id), title: r.title || 'إعلان مبوّب' };
  }
  return null;
}

function cleanLink(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s.slice(0, 500);
  return `https://${s}`.slice(0, 500);
}

export async function createClassifiedAction(formData: FormData) {
  const session = await requireUser();
  const title = String(formData.get('title') || '').trim().slice(0, 255) || null;
  const body = String(formData.get('body') || '').trim().slice(0, 2000) || null;
  const phone = String(formData.get('phone') || '').trim().slice(0, 40) || null;
  const whatsapp = String(formData.get('whatsapp') || '').trim().slice(0, 40) || null;
  const link = cleanLink(String(formData.get('link') || ''));

  // فحص بصري للصورة قبل الحفظ: الصور الإباحية = حظر فوري صارم
  const img = await readImageBuffer(formData);
  if (imageModerationEnabled() && img) {
    const v = await checkImageBuffer(img.buf);
    if (v.explicit) {
      await handleProhibited(session.uid, 'immoral', 'nsfw-image', `صورة مبوّب إباحية (${v.hardcore.toFixed(2)})`);
      redirect('/classified/new?error=blocked&cat=immoral&banned=1');
    }
    if (v.review) {
      await logMod(session.uid, { kind: 'content', category: 'immoral', term: 'nsfw-image-review', snippet: 'مراجعة صورة مبوّب', action: 'blocked' });
      redirect('/classified/new?error=image');
    }
  }

  // صورة أو نص إجباري (أحدهما)
  if (!img && !body && !title) redirect('/classified/new?error=content');
  // جوال أو واتساب إجباري (أحدهما)
  if (!phone && !whatsapp) redirect('/classified/new?error=contact');
  // سياسة المحتوى النصّي (متّفق عليها): لا يُحظر الإعلان إطلاقاً — تُشفَّر الكلمات المخالفة بنجوم
  // ويُنشر دائماً، إلا المستثناة (قائمة السماح) فتبقى كما هي. مهما كثرت الكلمات تُشفَّر جميعها.
  const cg = await censorGuard(title, body);
  const cTitle = cg.parts[0] || title;
  const cBody = cg.parts[1] || body;
  const flagTerms = cg.hits.length ? summarizeHits(cg.hits) : '';
  // حاجز إغراق صلب — نفس الحاجز المطبَّق على إعلانات تربح، لم يكن مفعّلاً هنا سابقاً
  const flood = await checkFlood(session.uid);
  if (flood.blocked) redirect(`/classified/new?error=flood&wait=${flood.waitSec}`);

  const theme = parseInt(String(formData.get('theme') || ''), 10);
  const pos = String(formData.get('pos') || 'bottom');
  const align = String(formData.get('align') || 'right');
  const size = String(formData.get('size') || 'md');
  const bold = formData.get('bold') ? true : false;
  const pattern = String(formData.get('pattern') || 'none');
  const accent = String(formData.get('accent') || 'none');
  const layout = String(formData.get('layout') || 'auto');

  // تكرار عبر أعضاء مختلفين (شبكات سبام) — منع فوري بلا خيار دفع (المحتوى ليس
  // ملكه أصلاً)، يُفحص قبل التكرار الذاتي عمداً كما في إعلانات تربح تماماً.
  const crossDup = await crossUserClassifiedDuplicateOf(session.uid, title, body);
  if (crossDup) {
    const n = await bumpDupAttempts(session.uid);
    await logMod(session.uid, { kind: 'duplicate_cross', action: n >= DUP_LIMIT ? 'banned' : 'blocked', snippet: `مبوّب مطابق لعضو آخر #${crossDup.id} «${crossDup.title}» — الجديد: ${(title || '').slice(0, 60)}` });
    if (n >= DUP_LIMIT) {
      await banUserFor(session.uid, await getStrikeBanDays(), 'auto');
      await notifyModBlock(session.uid, '🚫 تم حظر حسابك بعد تكرار نشر محتوى مطابق لإعلانات مبوّبة لأعضاء آخرين.');
      redirect('/classified/new?error=banned');
    }
    redirect(`/classified/new?error=crossdup&dup=${crossDup.id}&left=${Math.max(0, DUP_LIMIT - n)}`);
  }

  // التكرار: من اشترى «باقة تكرار» تُخصم نشرة واحدة ويُسمح؛ وإلا يُطلب شراء باقة أو يُمنع
  const pricing = await getServicePricing();
  const dup = await classifiedDuplicateOf(session.uid, title, body, img, { theme: Number.isFinite(theme) ? theme : 0, pattern, accent });
  let dupCreditConsumed = false;
  if (dup) {
    const consumed = await consumeDupCredit(session.uid);
    if (!consumed) {
      if (serviceHasPrice(pricing.dup3) || serviceHasPrice(pricing.dup5)) redirect(`/classified/new?error=needdup&dup=${dup.id}`);
      // إنذار متصاعد — كان يُرفض فقط بلا أي عقوبة، فيُعاد المحاولة للأبد بلا حظر
      const n = await bumpDupAttempts(session.uid);
      await logMod(session.uid, { kind: 'content', category: 'spam', term: 'classified-duplicate', snippet: `مبوّب مكرّر مع #${dup.id} «${dup.title}»`, action: n >= DUP_LIMIT ? 'banned' : 'blocked' });
      if (n >= DUP_LIMIT) {
        await banUserFor(session.uid, await getStrikeBanDays(), 'auto');
        await notifyModBlock(session.uid, '🚫 تم حظر حسابك بعد تكرار نشر نفس الإعلان المبوّب.');
        redirect('/classified/new?error=banned');
      }
      redirect(`/classified/new?error=duplicate&dup=${dup.id}&left=${Math.max(0, DUP_LIMIT - n)}`);
    }
    dupCreditConsumed = true;
    await logMod(session.uid, { kind: 'duplicate', action: 'charged', snippet: `تكرار مبوّب مسموح (باقة) مع #${dup.id} «${dup.title}»` });
  }

  // جدولة النشر (اختياري، إن فعّلتها الإدارة): موعد مستقبلي خلال ٣٠ يوماً ⇐ يبقى
  // مخفياً حتى يرقّيه الناشر الكسول في وقته. المدّة/الانتهاء تُحسب من موعد النشر.
  let publishAt: Date | null = null;
  const schedOn = await getSettingBool('schedule_on', false).catch(() => false);
  const rawSched = String(formData.get('publishAt') || '').trim();
  if (schedOn && rawSched) {
    const d = new Date(rawSched);
    // أقصى مدى للجدولة من الإعدادات (0 = بلا حد)
    const { getScheduleMaxDays } = await import('@/lib/settings');
    const maxDays = await getScheduleMaxDays().catch(() => 30);
    const maxMs = maxDays > 0 ? Date.now() + maxDays * 86400_000 : Infinity;
    if (!isNaN(d.getTime()) && d.getTime() > Date.now() + 60_000 && d.getTime() < maxMs) publishAt = d;
  }
  const startAt = publishAt ? publishAt.getTime() : Date.now();

  // رسوم نشر المبوّب حسب المدّة (إن سُعّرت) — تُخصم من الرصيد ويُضبط انتهاء المبوّب
  let cExpires: Date | null = null;
  let fee = 0;
  if (serviceHasPrice(pricing.classified)) {
    const raw = String(formData.get('duration') || '');
    if (!isDur(raw)) {
      if (dupCreditConsumed) await addDupCredit(session.uid, 1); // استرجاع رصيد التكرار — لن يُنشر شيء
      redirect('/classified/new?error=duration');
    }
    fee = pricing.classified[raw];
    if (fee > 0) {
      const paid = await charge(session.uid, fee, 'classified', `نشر إعلان مبوّب (${DUR_DAYS[raw]} يوم)`);
      if (!paid.ok) {
        if (dupCreditConsumed) await addDupCredit(session.uid, 1); // استرجاع رصيد التكرار المستهلك — النشر لن يتم بلا سداد الرسوم
        redirect(`/classified/new?error=needcredit&price=${fee}&bal=${paid.balance}`);
      }
    }
    cExpires = new Date(startAt + DUR_DAYS[raw] * 86400000);
  }

  const image = await saveOneImage(img, session.uid);

  // عزل بالهوية: يُنسب المبوّب لهوية ناشره الفعّالة (كالإعلانات) — يظهر لها وحدها في «مبوّباتي»
  const activeProfileId = await import('@/lib/profiles').then((m) => m.getActiveProfile(session.uid)).then((p) => p.id).catch(() => null);
  try {
    const newId = await createClassified({
      userId: session.uid, title: cTitle, body: cBody, image, phone, whatsapp, link,
      theme: Number.isFinite(theme) ? theme : undefined, pos, align, size, bold, pattern, accent, layout,
      publishAt, profileId: activeProfileId,
    });
    if (newId) {
      const upd: { expires_at?: Date; flag_terms?: string } = {};
      if (cExpires) upd.expires_at = cExpires;
      if (flagTerms) upd.flag_terms = flagTerms; // منشور للعامة مع تسجيل الكلمات المحجوبة
      if (Object.keys(upd).length) await prisma.classified_ads.updateMany({ where: { id: BigInt(newId) }, data: upd }).catch(() => {});
    }
  } catch {
    // فشل الحفظ بعد خصم رصيد التكرار و/أو رسوم النشر — استرجاع كل ما خُصم بدل خسارته على نشر لم يتم
    if (dupCreditConsumed) await addDupCredit(session.uid, 1);
    if (fee > 0) await adjustBalance(session.uid, fee, 'refund', { note: 'استرداد رسوم نشر مبوّب فشل حفظه' });
    redirect('/classified/new?error=save');
  }
  if (flagTerms) {
    await notifyModBlock(session.uid, `نُشر إعلانك المبوّب بعد حجب كلمات مخالفة بنجمات (${flagTerms}). إن رأيت المنع خطأً راسل الإدارة.`, '/account/classified').catch(() => {});
  }
  revalidatePath('/');
  revalidatePath('/classified');
  revalidatePath('/account/classified');
  if (flagTerms && !publishAt) redirect('/account/classified?censored=1');
  redirect(publishAt ? `/account/classified?scheduled=1${flagTerms ? '&censored=1' : ''}` : '/classified?created=1');
}

export async function updateClassifiedAction(formData: FormData) {
  const session = await requireUser();
  const id = Number(formData.get('id'));
  const existing = id ? await getClassifiedById(id) : null;
  if (!existing) redirect('/account/classified');
  const isAdmin = await hasAnyAdmin(session.uid).catch(() => false);
  const isOwner = existing!.userId === session.uid;
  if (!isOwner && !isAdmin) redirect('/account/classified');
  // المالك مقيّد بمهلة التعديل؛ الإدارة تعدّل بلا قيد
  if (isOwner && !isAdmin) {
    const { editHours } = await getMemberWindows();
    if (!withinWindow(existing!.createdAt, editHours)) redirect(`/classified/${id}/edit?error=window`);
  }

  const title = String(formData.get('title') || '').trim().slice(0, 255) || null;
  const body = String(formData.get('body') || '').trim().slice(0, 2000) || null;
  const phone = String(formData.get('phone') || '').trim().slice(0, 40) || null;
  const whatsapp = String(formData.get('whatsapp') || '').trim().slice(0, 40) || null;
  const link = cleanLink(String(formData.get('link') || ''));
  const img = await readImageBuffer(formData); // null when no new file (keep current)
  if (imageModerationEnabled() && img) {
    const v = await checkImageBuffer(img.buf);
    if (v.explicit) {
      await handleProhibited(session.uid, 'immoral', 'nsfw-image', `صورة مبوّب إباحية (تعديل ${v.hardcore.toFixed(2)})`);
      redirect('/classified/new?error=blocked&cat=immoral&banned=1');
    }
    if (v.review) {
      await logMod(session.uid, { kind: 'content', category: 'immoral', term: 'nsfw-image-review', snippet: 'مراجعة صورة مبوّب (تعديل)', action: 'blocked' });
      redirect(`/classified/${id}/edit?error=image`);
    }
  }

  if (!img && !existing!.image && !body && !title) redirect(`/classified/${id}/edit?error=content`);
  if (!phone && !whatsapp) redirect(`/classified/${id}/edit?error=contact`);
  // سياسة موحّدة مع الإنشاء: الكلمات المخالفة تُشفَّر بنجوم ولا تحجب الإعلان ولا تحظر الحساب،
  // والجُمل المستثناة (قائمة السماح) تمرّ عادية تماماً بلا تشفير ولا وسم.
  const eg = await censorGuard(title, body);
  const eTitleC = eg.parts[0] ?? (title || '');
  const eBodyC = eg.parts[1] ?? (body || '');
  const eFlag = eg.hits.length ? summarizeHits(eg.hits) : '';

  const theme = parseInt(String(formData.get('theme') || ''), 10);
  const pos = String(formData.get('pos') || 'bottom');
  const align = String(formData.get('align') || 'right');
  const size = String(formData.get('size') || 'md');
  const bold = formData.get('bold') ? true : false;
  const pattern = String(formData.get('pattern') || 'none');
  const accent = String(formData.get('accent') || 'none');
  const layout = String(formData.get('layout') || 'auto');

  // تكرار عبر أعضاء مختلفين عند التعديل — نفس فحص النشر، بلا خيار دفع
  const crossDup = await crossUserClassifiedDuplicateOf(session.uid, title, body);
  if (crossDup) {
    const n = await bumpDupAttempts(session.uid);
    await logMod(session.uid, { kind: 'duplicate_cross', action: n >= DUP_LIMIT ? 'banned' : 'blocked', snippet: `مبوّب مطابق لعضو آخر #${crossDup.id} «${crossDup.title}» (تعديل) — الجديد: ${(title || '').slice(0, 60)}` });
    if (n >= DUP_LIMIT) {
      await banUserFor(session.uid, await getStrikeBanDays(), 'auto');
      await notifyModBlock(session.uid, '🚫 تم حظر حسابك بعد تكرار نشر محتوى مطابق لإعلانات مبوّبة لأعضاء آخرين.');
      redirect('/account/classified?error=banned');
    }
    redirect(`/classified/${id}/edit?error=crossdup&dup=${crossDup.id}&left=${Math.max(0, DUP_LIMIT - n)}`);
  }

  // منع التكرار عند التعديل (باستثناء الإعلان نفسه) — يُتجاوز بخصم نشرة من «باقة التكرار»
  const dup = await classifiedDuplicateOf(session.uid, title, body, img, { theme: Number.isFinite(theme) ? theme : 0, pattern, accent }, id);
  let dupCreditConsumed = false;
  if (dup) {
    const consumed = await consumeDupCredit(session.uid);
    if (!consumed) {
      const svc = await getServicePricing();
      if (serviceHasPrice(svc.dup3) || serviceHasPrice(svc.dup5)) redirect(`/classified/${id}/edit?error=needdup&dup=${dup.id}`);
      const n = await bumpDupAttempts(session.uid);
      await logMod(session.uid, { kind: 'content', category: 'spam', term: 'classified-duplicate', snippet: `مبوّب مكرّر مع #${dup.id} «${dup.title}»`, action: n >= DUP_LIMIT ? 'banned' : 'blocked' });
      if (n >= DUP_LIMIT) {
        await banUserFor(session.uid, await getStrikeBanDays(), 'auto');
        await notifyModBlock(session.uid, '🚫 تم حظر حسابك بعد تكرار نشر نفس الإعلان المبوّب.');
        redirect('/account/classified?error=banned');
      }
      redirect(`/classified/${id}/edit?error=duplicate&dup=${dup.id}&left=${Math.max(0, DUP_LIMIT - n)}`);
    }
    dupCreditConsumed = true;
    await logMod(session.uid, { kind: 'duplicate', action: 'charged', snippet: `تكرار مبوّب مسموح (باقة، تعديل) مع #${dup.id}` });
  }

  const newImage = await saveOneImage(img, session.uid);

  try {
    await updateClassified(id, {
      title: eTitleC, body: eBodyC, image: newImage ?? undefined, phone, whatsapp, link,
      theme: Number.isFinite(theme) ? theme : undefined, pos, align, size, bold, pattern, accent, layout,
    });
    // وسم «مشكوك فيه» للإدارة عند تشفير كلمات مفردة (يُفرَغ إن لم يبقَ شيء) — لا حجب.
    await prisma.classified_ads.updateMany({ where: { id: BigInt(id) }, data: { flag_terms: eFlag || null } }).catch(() => {});
  } catch {
    // فشل الحفظ بعد خصم رصيد التكرار — استرجاعه بدل خسارته على تعديل لم يُحفظ
    if (dupCreditConsumed) await addDupCredit(session.uid, 1);
    redirect(`/classified/${id}/edit?error=save`);
  }
  revalidatePath('/');
  revalidatePath('/classified');
  revalidatePath('/account/classified');
  redirect(isOwner ? '/account/classified?updated=1' : `/classified/${id}`);
}

/** Re-activate an expired classified from the archive — charges classified[duration] and republishes. */
export async function reactivateClassifiedAction(formData: FormData) {
  const session = await requireUser();
  const id = Number(formData.get('id'));
  if (!id) redirect('/account/classified');
  const pricing = await getServicePricing();
  let days = 0;
  if (serviceHasPrice(pricing.classified)) {
    const raw = String(formData.get('duration') || '');
    if (!isDur(raw)) redirect('/account/classified?error=duration');
    const fee = pricing.classified[raw];
    if (fee > 0) {
      const { charge } = await import('@/lib/wallet');
      const paid = await charge(session.uid, fee, 'classified', `إعادة تفعيل مبوّب #${id} (${DUR_DAYS[raw]} يوم)`);
      if (!paid.ok) redirect(`/account/classified?error=needcredit&price=${fee}&bal=${paid.balance}`);
    }
    days = DUR_DAYS[raw];
  }
  await reactivateClassified(id, session.uid, days);
  revalidatePath('/');
  revalidatePath('/classified');
  revalidatePath('/account/classified');
  redirect('/account/classified?reactivated=1');
}

/** إيقاف/استئناف مبوّب — للمالك أو الإدارة فقط (يظهر/يُخفى من الموقع). */
export async function toggleClassifiedStatusAction(formData: FormData) {
  const session = await requireUser();
  const id = Number(formData.get('id'));
  if (!id) redirect('/classified');
  const st = await getClassifiedOwnerState(id);
  if (!st) redirect('/classified');
  const isOwner = st.userId === session.uid;
  const admin = await hasAnyAdmin(session.uid).catch(() => false);
  if (!isOwner && !admin) redirect(`/classified/${id}`);
  await setClassifiedStatus(id, st.status !== 1); // عكس الحالة الحالية
  revalidatePath(`/classified/${id}`);
  revalidatePath('/classified');
  revalidatePath('/');
  redirect(`/classified/${id}?status=${st.status === 1 ? 'paused' : 'resumed'}`);
}

/** حذف مبوّب من صفحته — المالك (ضمن مهلة الحذف) أو الإدارة (بلا قيد). */
export async function deleteClassifiedFromDetailAction(formData: FormData) {
  const session = await requireUser();
  const id = Number(formData.get('id'));
  if (!id) redirect('/classified');
  const st = await getClassifiedOwnerState(id);
  if (!st) redirect('/classified');
  const isOwner = st.userId === session.uid;
  const admin = await hasAnyAdmin(session.uid).catch(() => false);
  if (!isOwner && !admin) redirect(`/classified/${id}`);
  // المالك مقيّد بمهلة الحذف؛ الإدارة بلا قيد
  if (isOwner && !admin) {
    const existing = await getClassifiedById(id);
    const { deleteHours } = await getMemberWindows();
    if (!withinWindow(existing?.createdAt ?? null, deleteHours)) redirect(`/classified/${id}?error=deleteWindow`);
  }
  await deleteClassified(id);
  revalidatePath('/');
  revalidatePath('/classified');
  revalidatePath('/account/classified');
  redirect(!isOwner && admin ? '/admin/classified?deleted=1' : '/account/classified?deleted=1');
}

export async function deleteMyClassifiedAction(formData: FormData) {
  const session = await requireUser();
  const id = Number(formData.get('id'));
  const existing = id ? await getClassifiedById(id) : null;
  if (!existing || existing.userId !== session.uid) redirect('/account/classified');
  const { deleteHours } = await getMemberWindows();
  if (!withinWindow(existing.createdAt, deleteHours)) redirect('/account/classified?error=deleteWindow');
  await deleteClassified(id);
  revalidatePath('/');
  revalidatePath('/classified');
  revalidatePath('/account/classified');
  redirect('/account/classified?deleted=1');
}
