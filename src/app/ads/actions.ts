'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { saveUpload } from '@/lib/storage';
import { toInt } from '@/lib/utils';

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
    // content-addressed filename → identical images resolve to the same file
    const safe = `${img.hash}.${img.ext}`;
    const rel = await saveUpload(img.buf, safe);
    const up = await prisma.uploads.create({
      data: { file_name: rel, file_original_name: img.name, extension: img.ext, type: 'ad', file_size: img.buf.length, user_id: userId },
    });
    await prisma.photos.create({ data: { photo_path: String(toInt(up.id)), other_id: adId } });
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
 * Decide whether a new ad must be held for admin approval before publishing.
 * Triggers when — versus any existing PUBLISHED ad:
 *   • title similarity ≥ 90%, OR
 *   • detail similarity ≥ 90%, OR
 *   • an uploaded image is byte-identical to an existing ad image.
 */
async function needsReview(title: string, detail: string, images: PreparedImage[]): Promise<boolean> {
  // 1) identical image (content hash is embedded in the stored file_name)
  if (images.length) {
    const found = await prisma.uploads.findFirst({
      where: { OR: images.map((i) => ({ file_name: { contains: i.hash } })) },
      select: { id: true },
    });
    if (found) return true;
  }
  // 2) text similarity against recent published ads
  const recent = await prisma.ads.findMany({
    where: { status: 1 },
    select: { title: true, detail: true },
    orderBy: { id: 'desc' },
    take: 400,
  });
  const nTitle = normalizeAr(title);
  const nDetail = normalizeAr(detail);
  for (const r of recent) {
    if (similarity(nTitle, normalizeAr(r.title)) >= 0.9) return true;
    if (similarity(nDetail, normalizeAr(r.detail)) >= 0.9) return true;
  }
  return false;
}

export async function createAdAction(formData: FormData) {
  const session = await requireUser();
  const user = await prisma.users.findUnique({ where: { id: BigInt(session.uid) } });

  const title = String(formData.get('title') || '').trim();
  const detail = String(formData.get('detail') || '').trim();
  const price = parseFloat(String(formData.get('price') || '0')) || 0;
  const adsType = String(formData.get('adsType')) === 'request' ? 'request' : 'offer';
  const category_id = BigInt(String(formData.get('category_id') || '0'));
  const subRaw = String(formData.get('subcategory_id') || '');
  const cityId = String(formData.get('city_id') || '0');
  const countryRaw = String(formData.get('country_id') || '');
  if (!title || !detail || !category_id) return;

  const images = await readImages(formData);

  // 90% similar (title/detail) OR identical images => hold for admin approval
  const pending = await needsReview(title, detail, images);

  const ad = await prisma.ads.create({
    data: {
      title, detail, price, adsType,
      category_id,
      subcategory_id: subRaw ? Number(subRaw) : null,
      city_id: BigInt(cityId || '0'),
      country_id: countryRaw ? Number(countryRaw) : (user?.country_id ?? null),
      user_id: BigInt(session.uid),
      video_path: '',
      phoneAllow: formData.get('phoneAllow') ? 1 : 0,
      commentAllow: formData.get('commentAllow') ? 1 : 0,
      adsSpecial: 'no',
      state: 'active',
      status: pending ? 0 : 1,
    },
  });

  await storeImages(images, session.uid, ad.id);

  if (pending) {
    // notify admins to review
    const admins = await prisma.users.findMany({ where: { is_admin: 1 }, select: { id: true } });
    await Promise.all(
      admins.map((a) =>
        prisma.notfications
          .create({ data: { title: 'إعلان بانتظار الموافقة (مشابه لإعلان قائم)', route: '/admin/ads?pending=1', user_id: String(toInt(a.id)), type: 'review' } })
          .catch(() => {}),
      ),
    );
    redirect('/account/ads?pending=1');
  }
  redirect(`/ads/${toInt(ad.id)}`);
}

export async function updateAdAction(formData: FormData) {
  const session = await requireUser();
  const adId = BigInt(String(formData.get('adId')));
  const ad = await prisma.ads.findUnique({ where: { id: adId } });
  if (!ad || toInt(ad.user_id) !== session.uid) redirect('/account/ads');

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
      phoneAllow: formData.get('phoneAllow') ? 1 : 0,
      commentAllow: formData.get('commentAllow') ? 1 : 0,
    },
  });

  const images = await readImages(formData);
  if (images.length) await storeImages(images, session.uid, adId);

  revalidatePath(`/ads/${toInt(adId)}`);
  redirect(`/ads/${toInt(adId)}`);
}
