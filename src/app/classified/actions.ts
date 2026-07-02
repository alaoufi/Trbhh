'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createHash } from 'crypto';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { saveUpload } from '@/lib/storage';
import { watermarkImage } from '@/lib/watermark';
import { createClassified } from '@/lib/classified';
import { toInt } from '@/lib/utils';

async function saveOneImage(formData: FormData): Promise<string | null> {
  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > 8 * 1024 * 1024) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) return null;
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const hash = createHash('sha256').update(new Uint8Array(buf)).digest('hex');
  const stamped = await watermarkImage(buf, ext); // burn "تربح" watermark
  const rel = await saveUpload(stamped, `${hash}.${ext}`);
  // register in uploads for consistency (best-effort)
  await prisma.uploads
    .create({ data: { file_name: rel, file_original_name: file.name, extension: ext, type: 'classified', file_size: buf.length, user_id: 0 } })
    .catch(() => {});
  return rel;
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

  const theme = parseInt(String(formData.get('theme') || ''), 10);
  const pos = String(formData.get('pos') || 'bottom');
  const align = String(formData.get('align') || 'right');
  const size = String(formData.get('size') || 'md');
  const bold = formData.get('bold') ? true : false;
  const pattern = String(formData.get('pattern') || 'none');
  const accent = String(formData.get('accent') || 'none');

  try {
    await createClassified({
      userId: session.uid, title, body, image, phone, whatsapp, link,
      theme: Number.isFinite(theme) ? theme : undefined, pos, align, size, bold, pattern, accent,
    });
  } catch {
    redirect('/classified/new?error=save');
  }
  revalidatePath('/');
  revalidatePath('/classified');
  redirect('/classified?created=1');
}
