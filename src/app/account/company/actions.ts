'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { saveUpload } from '@/lib/storage';
import { saveStoreMeta, markStorePending, agreeStoreTerms, setStoreProducts, setStoreHandle, requestPlatform } from '@/lib/merchant';
import { toInt } from '@/lib/utils';

export async function saveCompanyAction(formData: FormData) {
  const session = await requireUser();
  const description = String(formData.get('description') || '').trim();
  const address = String(formData.get('address') || '').trim();
  const storeName = String(formData.get('storeName') || '').trim();
  const color = String(formData.get('color') || '').trim();
  const about = String(formData.get('about') || '').trim();
  const banner = String(formData.get('banner') || '').trim();
  const tagline = String(formData.get('tagline') || '').trim();
  const layout = String(formData.get('layout') || '').trim();
  const catalog = String(formData.get('catalog') || '').trim();
  const fields = String(formData.get('fields') || '').trim();
  const since = String(formData.get('since') || '').trim();
  const specialty = String(formData.get('specialty') || '').trim();
  const audience = String(formData.get('audience') || '').trim();
  const handle = String(formData.get('handle') || '').trim();
  const nationalId = String(formData.get('nationalId') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const contacts = String(formData.get('contacts') || '').trim();
  const agreeTerms = !!formData.get('agreeTerms');

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
    // فتح متجر جديد يتطلب الموافقة على شروط المتجر وتحمّل مسؤولية المنتجات
    if (!agreeTerms) redirect('/store?error=terms');
    await prisma.stores.create({ data: { user_id: session.uid, description, address, logo: logoId ?? 0 } });
    await markStorePending(session.uid); // new store waits for admin approval
    await agreeStoreTerms(session.uid);
  }
  await saveStoreMeta(session.uid, { storeName, color, about, banner, tagline, layout, catalog, fields, since, specialty, audience, nationalId, phone, email, contacts });
  if (handle || existing) await setStoreHandle(session.uid, handle);
  revalidatePath('/store');
  // land the merchant on their own (independent) store page
  const mine = await prisma.stores.findFirst({ where: { user_id: session.uid }, select: { id: true } });
  redirect(mine ? `/companies/${toInt(mine.id)}` : '/store');
}

/** Merchant requests to feature their products on the Trbhh platform (admin approves). */
export async function requestPlatformAction() {
  const session = await requireUser();
  await requestPlatform(session.uid);
  revalidatePath('/store');
}

/** Owner picks which of their ads are showcased in the (independent) store. */
export async function setStoreProductsAction(formData: FormData) {
  const session = await requireUser();
  const ids = formData.getAll('productIds').map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  await setStoreProducts(session.uid, ids);
  revalidatePath('/store');
}

export async function addBranchAction(formData: FormData) {
  const session = await requireUser();
  const store = await prisma.stores.findFirst({ where: { user_id: session.uid } });
  if (!store) return;
  const name = String(formData.get('name') || '').trim();
  const address = String(formData.get('address') || '').trim();
  if (!name) return;
  await prisma.store_branches.create({ data: { store_id: toInt(store.id), name, address } });
  revalidatePath('/store');
}
