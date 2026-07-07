'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createHash } from 'crypto';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { saveUpload } from '@/lib/storage';
import { watermarkImage } from '@/lib/watermark';
import { createClassified, getClassifiedById, updateClassified, deleteClassified } from '@/lib/classified';
import { getMemberWindows, withinWindow, getClassifiedDupConfig, getPricing } from '@/lib/settings';
import { charge, getBalance } from '@/lib/wallet';
import { scanContent } from '@/lib/content-guard';
import { handleProhibited, logMod } from '@/lib/moderation';
import { checkImageBuffer, imageModerationEnabled } from '@/lib/nsfw';
import { aHash, hashSimilarity } from '@/lib/phash';
import { normalizeAr, similarity } from '@/domain/text';
import { toInt } from '@/lib/utils';

/** Read the uploaded classified image into a buffer (or null), enforcing size/type. */
async function readImageBuffer(formData: FormData): Promise<{ buf: Buffer; name: string } | null> {
  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0 || file.size > 12 * 1024 * 1024) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) return null;
  return { buf, name: file.name };
}

/** Watermark + persist a classified image, recording a perceptual hash (phash) for duplicate detection. */
async function saveOneImage(img: { buf: Buffer; name: string } | null, userId: number): Promise<string | null> {
  try {
    if (!img?.buf.length) return null;
    let ext = (img.name.split('.').pop() || 'jpg').toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) ext = 'jpg'; // normalize odd formats
    const hash = createHash('sha256').update(new Uint8Array(img.buf)).digest('hex');
    const phash = await aHash(img.buf).catch(() => ''); // بصمة إدراكية لكشف تكرار الصورة
    const stamped = await watermarkImage(img.buf, ext); // burn "تربح" watermark (also downscales)
    const rel = await saveUpload(stamped, `${hash}.${ext}`);
    // register in uploads (with owner + phash) so duplicate detection can match by image
    await prisma.uploads
      .create({ data: { file_name: rel, file_original_name: img.name, extension: ext, type: 'classified', file_size: img.buf.length, user_id: userId, phash: phash || null } })
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
  // فحص ذكي للمحتوى — الأخلاقي يحظر فوراً، والأمني/السياسي/المخدرات يُحظر عند التكرار
  const bad = await scanContent(title, body);
  if (bad) {
    const o = await handleProhibited(session.uid, bad.category, bad.term, `${title || ''} ${body || ''}`);
    redirect(`/classified/new?error=blocked&cat=${o.category}${o.banned ? '&banned=1' : `&left=${o.left}`}`);
  }

  const theme = parseInt(String(formData.get('theme') || ''), 10);
  const pos = String(formData.get('pos') || 'bottom');
  const align = String(formData.get('align') || 'right');
  const size = String(formData.get('size') || 'md');
  const bold = formData.get('bold') ? true : false;
  const pattern = String(formData.get('pattern') || 'none');
  const accent = String(formData.get('accent') || 'none');
  const layout = String(formData.get('layout') || 'auto');

  // التسعير: رسوم نشر المبوّب + رسوم التكرار (إن وُجد ودفعها العضو يتجاوز التكرار)
  const price = await getPricing();
  const dup = await classifiedDuplicateOf(session.uid, title, body, img, { theme: Number.isFinite(theme) ? theme : 0, pattern, accent });
  if (dup && price.duplicate <= 0) {
    // التكرار غير مسعّر → يُمنع كما هو (لا يمكن الدفع لتجاوزه)
    await logMod(session.uid, { kind: 'content', category: 'spam', term: 'classified-duplicate', snippet: `مبوّب مكرّر مع #${dup.id} «${dup.title}»`, action: 'blocked' });
    redirect(`/classified/new?error=duplicate&dup=${dup.id}`);
  }
  const dupFee = dup ? price.duplicate : 0;
  const total = price.classified + dupFee;
  if (total > 0) {
    const bal = await getBalance(session.uid);
    if (bal < total) redirect(`/classified/new?error=needcredit&price=${total}&bal=${bal}${dup ? `&dup=${dup.id}` : ''}`);
    if (price.classified > 0) await charge(session.uid, price.classified, 'classified', 'نشر إعلان مبوّب');
    if (dupFee > 0) {
      await charge(session.uid, dupFee, 'duplicate', `تكرار مبوّب مع #${dup!.id}`);
      await logMod(session.uid, { kind: 'duplicate', action: 'charged', snippet: `تكرار مبوّب مدفوع ${dupFee} ر.س مع #${dup!.id} «${dup!.title}»` });
    }
  }

  const image = await saveOneImage(img, session.uid);

  try {
    await createClassified({
      userId: session.uid, title, body, image, phone, whatsapp, link,
      theme: Number.isFinite(theme) ? theme : undefined, pos, align, size, bold, pattern, accent, layout,
    });
  } catch {
    redirect('/classified/new?error=save');
  }
  revalidatePath('/');
  revalidatePath('/classified');
  redirect('/classified?created=1');
}

export async function updateClassifiedAction(formData: FormData) {
  const session = await requireUser();
  const id = Number(formData.get('id'));
  const existing = id ? await getClassifiedById(id) : null;
  if (!existing || existing.userId !== session.uid) redirect('/account/classified');

  const { editHours } = await getMemberWindows();
  if (!withinWindow(existing.createdAt, editHours)) redirect(`/classified/${id}/edit?error=window`);

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
  // امنع إدخال محتوى ممنوع عبر التعديل بعد نشر نظيف
  const eBad = await scanContent(title, body);
  if (eBad) {
    const o = await handleProhibited(session.uid, eBad.category, eBad.term, `${title || ''} ${body || ''}`);
    redirect(`/classified/${id}/edit?error=blocked&cat=${o.category}${o.banned ? '&banned=1' : `&left=${o.left}`}`);
  }

  const theme = parseInt(String(formData.get('theme') || ''), 10);
  const pos = String(formData.get('pos') || 'bottom');
  const align = String(formData.get('align') || 'right');
  const size = String(formData.get('size') || 'md');
  const bold = formData.get('bold') ? true : false;
  const pattern = String(formData.get('pattern') || 'none');
  const accent = String(formData.get('accent') || 'none');
  const layout = String(formData.get('layout') || 'auto');

  // منع التكرار عند التعديل (باستثناء الإعلان نفسه) — يمكن تجاوزه بدفع رسوم التكرار
  const dup = await classifiedDuplicateOf(session.uid, title, body, img, { theme: Number.isFinite(theme) ? theme : 0, pattern, accent }, id);
  if (dup) {
    const dupFee = (await getPricing()).duplicate;
    if (dupFee <= 0) {
      await logMod(session.uid, { kind: 'content', category: 'spam', term: 'classified-duplicate', snippet: `مبوّب مكرّر مع #${dup.id} «${dup.title}»`, action: 'blocked' });
      redirect(`/classified/${id}/edit?error=duplicate&dup=${dup.id}`);
    }
    const paid = await charge(session.uid, dupFee, 'duplicate', `تعديل مبوّب مكرّر مع #${dup.id}`);
    if (!paid.ok) redirect(`/classified/${id}/edit?error=needcredit&price=${dupFee}&bal=${paid.balance}&dup=${dup.id}`);
    await logMod(session.uid, { kind: 'duplicate', action: 'charged', snippet: `تكرار مبوّب مدفوع (تعديل) ${dupFee} ر.س مع #${dup.id}` });
  }

  const newImage = await saveOneImage(img, session.uid);

  try {
    await updateClassified(id, {
      title, body, image: newImage ?? undefined, phone, whatsapp, link,
      theme: Number.isFinite(theme) ? theme : undefined, pos, align, size, bold, pattern, accent, layout,
    });
  } catch {
    redirect(`/classified/${id}/edit?error=save`);
  }
  revalidatePath('/');
  revalidatePath('/classified');
  revalidatePath('/account/classified');
  redirect('/account/classified?updated=1');
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
