'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAccess } from '@/lib/access-control/guards';
import { COMMERCE_DEFAULTS, saudiCommercePhone } from '@/lib/commerce/config';
import { getCommerceConfig } from '@/lib/commerce/settings';
import { assertCommerceSchemaReady } from '@/lib/commerce/schema';
import { parseCommerceProduct, parseStockAdjustment } from '@/lib/commerce/admin-input';
import { updateCommerceProduct } from '@/lib/commerce/products';
import { getCommerceGateway } from '@/lib/commerce/runtime';
import { dispatchPaidNotification } from '@/lib/commerce/notifications';
import { getMessagingConfig, sendSms, sendWhatsApp } from '@/lib/sms';

export async function saveCommerceSettings(form: FormData) {
  const session = await requireAccess('products', 'manage_settings');
  await assertCommerceSchemaReady(prisma);
  if (form.get('commerce_payments_enabled') === '1' && !(await getCommerceGateway())?.ready) {
    redirect('/admin/commerce?error=gateway_unverified');
  }
  const phone = String(form.get('commerce_admin_phone') || '').trim();
  if (phone && !saudiCommercePhone(phone)) redirect('/admin/commerce?error=phone');
  const values = Object.entries(COMMERCE_DEFAULTS).map(([k, fallback]) => {
    const flag = ['commerce_enabled', 'commerce_payments_enabled', 'commerce_purchasing_enabled', 'commerce_notifications_enabled'].includes(k);
    const v = flag ? (form.get(k) === '1' ? '1' : '0') : String(form.get(k) ?? fallback).trim();
    if (v.length > 1600) throw new Error('setting_too_long');
    return { k, v };
  });
  await prisma.$transaction(async tx => {
    for (const { k, v } of values) await tx.site_settings.upsert({ where: { k }, create: { k, v }, update: { v } });
    await tx.admin_log.create({ data: { admin_id: BigInt(session.uid), action: 'إعدادات تجارة تربح', note: 'تحديث مفاتيح التجارة والنصوص؛ دون تعديل بوابات المحفظة' } });
  });
  revalidatePath('/admin/commerce'); revalidatePath('/shop');
  redirect('/admin/commerce?saved=1');
}

export async function saveCommerceProduct(form: FormData) {
  const idRaw = String(form.get('id') || '');
  const session = await requireAccess('products', idRaw ? 'edit' : 'create');
  if (idRaw && !/^[1-9]\d{0,14}$/.test(idRaw)) redirect('/admin/commerce?error=product');
  let data: ReturnType<typeof parseCommerceProduct>;
  let stockDelta: number;
  try { data = parseCommerceProduct(form); stockDelta = parseStockAdjustment(String(form.get('stockDelta') || '')); } catch { redirect('/admin/commerce?error=product'); }
  await assertCommerceSchemaReady(prisma);
  await prisma.$transaction(async tx => {
    if (data.adId) {
      // This does not modify or approve the source advertisement. Private ad data
      // is never copied into the public catalog by this operation.
      const ad = await tx.ads.findUnique({ where: { id: data.adId }, select: { id: true } });
      if (!ad) throw new Error('source_ad_missing');
    }
    if (idRaw) {
      const id = BigInt(idRaw);
      const rows = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM commerce_products WHERE id=${id} FOR UPDATE`;
      if (!rows.length) throw new Error('product_not_found');
      await updateCommerceProduct(tx, id, data, stockDelta);
    } else {
      await tx.$executeRaw`INSERT INTO commerce_products (title,price_minor,stock_available,ad_id,approved,visible,enabled) VALUES (${data.title},${data.priceMinor},${data.stock},${data.adId},${Number(data.approved)},${Number(data.visible)},${Number(data.enabled)})`;
    }
    await tx.admin_log.create({ data: { admin_id: BigInt(session.uid), action: 'حفظ سلعة معتمدة', target: idRaw || 'سلعة جديدة', note: `اعتماد=${data.approved}; سعر=${data.priceMinor} هللة; ${idRaw ? `تعديل المخزون=${stockDelta}` : `مخزون أولي=${data.stock}`}` } });
  });
  revalidatePath('/admin/commerce'); revalidatePath('/shop');
  redirect('/admin/commerce?saved=1');
}

export async function deliverCommerceNotification(form: FormData) {
  await requireAccess('notifications', 'create');
  if (form.get('confirm') !== '1') redirect('/admin/commerce?error=confirm');
  const id = String(form.get('id') || '');
  if (!/^[1-9]\d{0,14}$/.test(id)) redirect('/admin/commerce?error=notification');
  const config = await getCommerceConfig();
  const messaging = await getMessagingConfig();
  const result = await dispatchPaidNotification(prisma, BigInt(id), config, {
    sms: (phone, message) => sendSms(phone, message, messaging),
    whatsapp: (phone, message) => sendWhatsApp(phone, message, messaging),
  });
  revalidatePath('/admin/commerce');
  redirect(`/admin/commerce?delivery=${result}`);
}
