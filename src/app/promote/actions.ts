'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createHash } from 'crypto';
import { requireUser } from '@/lib/auth';
import { saveUpload } from '@/lib/storage';
import { createPromo, getPromoPackage } from '@/lib/promos';
import { isPlacement } from '@/lib/promo-placements';
import { scanContent } from '@/lib/content-guard';
import { handleProhibited } from '@/lib/moderation';

/** Save a promo banner image as-is (keeps animated GIFs; no watermark on paid banners). */
async function savePromoImage(formData: FormData): Promise<string | null> {
  try {
    const file = formData.get('image');
    if (!(file instanceof File) || file.size === 0) return null;
    if (file.size > 10 * 1024 * 1024) return null;
    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf.length) return null;
    let ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) ext = 'jpg';
    const hash = createHash('sha256').update(new Uint8Array(buf)).digest('hex');
    return await saveUpload(buf, `promo_${hash}.${ext}`);
  } catch {
    return null;
  }
}

function cleanLink(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s.slice(0, 500);
  return `https://${s}`.slice(0, 500);
}

export async function createPromoAction(formData: FormData) {
  const session = await requireUser();
  const placement = String(formData.get('placement') || '');
  if (!isPlacement(placement)) redirect('/promote?error=placement');

  const packageId = Number(formData.get('packageId')) || 0;
  const pkg = packageId ? await getPromoPackage(packageId) : null;
  if (!pkg || !pkg.active) redirect('/promote?error=package');

  const title = String(formData.get('title') || '').trim().slice(0, 255) || null;
  const body = String(formData.get('body') || '').trim().slice(0, 500) || null;
  const phone = String(formData.get('phone') || '').trim().slice(0, 40) || null;
  const whatsapp = String(formData.get('whatsapp') || '').trim().slice(0, 40) || null;
  const link = cleanLink(String(formData.get('link') || ''));
  const image = await savePromoImage(formData);

  if (!image && !title && !body) redirect(`/promote?error=content&placement=${placement}&pkg=${packageId}`);
  if (!phone && !whatsapp) redirect(`/promote?error=contact&placement=${placement}&pkg=${packageId}`);

  const badContent = await scanContent(title, body);
  if (badContent) {
    const o = await handleProhibited(session.uid, badContent.category, badContent.term, `إعلان ترويجي: ${title || ''} ${body || ''}`.slice(0, 300));
    redirect(`/promote?error=blocked&cat=${o.category}&placement=${placement}&pkg=${packageId}`);
  }

  try {
    await createPromo({
      userId: session.uid, placement: placement, title, body, image, phone, whatsapp, link,
      days: pkg.days, price: pkg.price,
    });
  } catch {
    redirect(`/promote?error=save&placement=${placement}&pkg=${packageId}`);
  }
  revalidatePath('/account/promos');
  redirect('/account/promos?created=1');
}
