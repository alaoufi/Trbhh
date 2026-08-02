'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { toInt } from '@/lib/utils';
import { saveUpload } from '@/lib/storage';
import { createProject, deleteProject } from '@/lib/projects';
import { scanContent } from '@/lib/content-guard';

async function userLicense(uid: number): Promise<string> {
  return prisma.users
    .findUnique({ where: { id: BigInt(uid) }, select: { re_license: true } })
    .then((u) => String(u?.re_license || '').trim())
    .catch(() => '');
}

const num = (v: FormDataEntryValue | null): number | null => {
  const n = parseInt(String(v || ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export async function createProjectAction(formData: FormData) {
  const session = await requireUser();
  const license = await userLicense(session.uid);
  if (!license) redirect('/account/projects?error=nolicense');

  const name = String(formData.get('name') || '').trim();
  if (!name) redirect('/account/projects?error=missing');
  const description = String(formData.get('description') || '').trim();
  // فحص محتوى — نفس سياسة النشر
  const bad = await scanContent(name, description);
  if (bad) redirect('/account/projects?error=blocked');

  // صورة الغلاف (اختيارية)
  let coverId: number | null = null;
  const cover = formData.get('cover');
  if (cover instanceof File && cover.size > 0) {
    const ext = (cover.name.split('.').pop() || 'jpg').toLowerCase();
    const { normalizeUpload } = await import('@/lib/upload-normalize');
    const norm = await normalizeUpload(Buffer.from(await cover.arrayBuffer()), ext);
    const rel = await saveUpload(norm.buf, `project_${session.uid}_${Date.now()}.${norm.ext}`);
    const up = await prisma.uploads.create({ data: { file_name: rel, extension: norm.ext, type: 'project', file_size: norm.buf.length, user_id: session.uid } });
    coverId = toInt(up.id);
  }

  const lat = String(formData.get('lat') || '').trim() || null;
  const lng = String(formData.get('lng') || '').trim() || null;

  const id = await createProject(session.uid, {
    name,
    cityId: num(formData.get('city_id')),
    district: String(formData.get('district') || '').trim() || null,
    ptype: String(formData.get('ptype') || '').trim() || null,
    description: description || null,
    units: num(formData.get('units')),
    priceFrom: num(formData.get('price_from')),
    delivery: String(formData.get('delivery') || '').trim() || null,
    cover: coverId,
    lat,
    lng,
    reLicense: license,
  });
  revalidatePath('/projects');
  revalidatePath('/account/projects');
  redirect(id ? '/account/projects?created=1' : '/account/projects?error=missing');
}

export async function deleteProjectAction(formData: FormData) {
  const session = await requireUser();
  const id = Number(formData.get('id')) || 0;
  if (id) await deleteProject(id, session.uid);
  revalidatePath('/projects');
  revalidatePath('/account/projects');
  redirect('/account/projects?deleted=1');
}
