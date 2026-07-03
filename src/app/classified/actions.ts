'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createHash } from 'crypto';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { saveUpload } from '@/lib/storage';
import { watermarkImage } from '@/lib/watermark';
import { createClassified, getClassifiedById, updateClassified, deleteClassified } from '@/lib/classified';
import { getMemberWindows, withinWindow } from '@/lib/settings';
import { scanContent } from '@/lib/content-guard';
import { handleProhibited } from '@/lib/moderation';
import { toInt } from '@/lib/utils';

async function saveOneImage(formData: FormData): Promise<string | null> {
  try {
    const file = formData.get('image');
    if (!(file instanceof File) || file.size === 0) return null;
    if (file.size > 12 * 1024 * 1024) return null;
    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf.length) return null;
    let ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) ext = 'jpg'; // normalize odd formats
    const hash = createHash('sha256').update(new Uint8Array(buf)).digest('hex');
    const stamped = await watermarkImage(buf, ext); // burn "تربح" watermark (also downscales)
    const rel = await saveUpload(stamped, `${hash}.${ext}`);
    // register in uploads for consistency (best-effort)
    await prisma.uploads
      .create({ data: { file_name: rel, file_original_name: file.name, extension: ext, type: 'classified', file_size: buf.length, user_id: 0 } })
      .catch(() => {});
    return rel;
  } catch {
    return null; // never crash the publish flow because of an image
  }
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
  const image = await saveOneImage(formData);

  // صورة أو نص إجباري (أحدهما)
  if (!image && !body && !title) redirect('/classified/new?error=content');
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
  const newImage = await saveOneImage(formData); // null when no new file (keep current)

  if (!newImage && !existing!.image && !body && !title) redirect(`/classified/${id}/edit?error=content`);
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
