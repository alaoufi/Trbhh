'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { saveUpload } from '@/lib/storage';
import { saveStoreMeta, markStorePending } from '@/lib/merchant';
import { toInt } from '@/lib/utils';

export async function saveCompanyAction(formData: FormData) {
  const session = await requireUser();
  const description = String(formData.get('description') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const storeName = String(formData.get('storeName') || '').trim();
  const color = String(formData.get('color') || '').trim();
  const about = String(formData.get('about') || '').trim();

  let logoId: number | undefined;
  const logo = formData.get('logo');
  if (logo instanceof File && logo.size > 0) {
    const ext = (logo.name.split('.').pop() || 'png').toLowerCase();
    const buf = Buffer.from(await logo.arrayBuffer());
    const rel = await saveUpload(buf, `store_${session.uid}_${Date.now()}.${ext}`);
    const up = await prisma.uploads.create({ data: { file_name: rel, extension: ext, type: 'store', file_size: logo.size, user_id: session.uid } });
    logoId = toInt(up.id);
  }

  const existing = await prisma.stores.findFirst({ where: { user_id: session.uid } });
  if (existing) {
    await prisma.stores.update({ where: { id: existing.id }, data: { description, address, ...(logoId ? { logo: logoId } : {}) } });
  } else {
    await prisma.stores.create({ data: { user_id: session.uid, description, address, logo: logoId ?? 0 } });
    await markStorePending(session.uid); // new store waits for admin approval
  }
  await saveStoreMeta(session.uid, { storeName, color, about });
  revalidatePath('/account/company');
  redirect('/account/company');
}

export async function addBranchAction(formData: FormData) {
  const session = await requireUser();
  const store = await prisma.stores.findFirst({ where: { user_id: session.uid } });
  if (!store) return;
  const name = String(formData.get('name') || '').trim();
  const address = String(formData.get('address') || '').trim();
  if (!name) return;
  await prisma.store_branches.create({ data: { store_id: toInt(store.id), name, address } });
  revalidatePath('/account/company');
}
