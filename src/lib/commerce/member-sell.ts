import 'server-only';
import { prisma } from '@/lib/prisma';
import { canMemberSellDirectly } from './seller-types';

/**
 * البيع المباشر للعضو الموثوق: يعرض إعلانه كسلعة قابلة للشراء المباشر داخل تربح
 * بسعر وشحن محدّدين، بانتظار اعتماد الإدارة. لا خصم ولا دفع هنا — الشراء الفعلي
 * يمرّ بمحرّك الطلبات المقفل خلف حارس الشراء (لا بوابة دفع مسجّلة بعد).
 */
export type MemberSaleRow = { id: bigint; ad_id: bigint | null; price_minor: number; shipping_minor: number; stock_available: number; approved: number; visible: number; enabled: number };

/** كل سلع البيع المباشر لهذا العضو، مفهرسة بمعرّف الإعلان (لعرضها في «إعلاناتي»). */
export async function listMemberSaleProducts(memberId: number | bigint): Promise<Map<string, MemberSaleRow>> {
  const rows = await prisma.$queryRaw<MemberSaleRow[]>`
    SELECT id, ad_id, price_minor, shipping_minor, stock_available, approved, visible, enabled
    FROM commerce_products WHERE seller_type='verified_member' AND seller_member_id=${BigInt(memberId)}`.catch(() => [] as MemberSaleRow[]);
  const map = new Map<string, MemberSaleRow>();
  for (const r of rows) if (r.ad_id != null) map.set(String(r.ad_id), r);
  return map;
}

export type ListSaleResult = { ok: true } | { ok: false; error: 'not_allowed' | 'not_owner' | 'bad_price' | 'bad_shipping' | 'ad_missing' };

/** يعرض إعلان العضو للبيع المباشر (سعر + شحن + كمية) بانتظار اعتماد الإدارة. أي تعديل
 *  يعيد الحالة إلى «بانتظار الاعتماد» ويخفيها حتى تراجعها الإدارة. */
export async function listAdForDirectSale(memberId: number | bigint, adId: number | bigint, priceMinor: number, shippingMinor: number, quantity: number): Promise<ListSaleResult> {
  if (!(await canMemberSellDirectly(memberId))) return { ok: false, error: 'not_allowed' };
  if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0 || priceMinor > 100_000_000) return { ok: false, error: 'bad_price' };
  if (!Number.isSafeInteger(shippingMinor) || shippingMinor < 0 || shippingMinor > 10_000_000) return { ok: false, error: 'bad_shipping' };
  const qty = Math.max(1, Math.min(999, Math.trunc(quantity) || 1));
  const ad = await prisma.ads.findUnique({ where: { id: BigInt(adId) }, select: { id: true, user_id: true, title: true } }).catch(() => null);
  if (!ad) return { ok: false, error: 'ad_missing' };
  if (Number(ad.user_id) !== Number(memberId)) return { ok: false, error: 'not_owner' };
  const title = (ad.title || 'سلعة').slice(0, 200);
  const existing = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT id FROM commerce_products WHERE ad_id=${BigInt(adId)} AND seller_type='verified_member' AND seller_member_id=${BigInt(memberId)} LIMIT 1`.catch(() => []);
  if (existing[0]) {
    await prisma.$executeRaw`UPDATE commerce_products SET title=${title}, price_minor=${priceMinor}, shipping_minor=${shippingMinor}, stock_available=${qty}, approved=0, visible=0, enabled=0, updated_at=CURRENT_TIMESTAMP(3) WHERE id=${existing[0].id}`.catch(() => {});
  } else {
    await prisma.$executeRaw`INSERT INTO commerce_products (title, price_minor, shipping_minor, stock_available, ad_id, seller_type, seller_member_id, approved, visible, enabled)
      VALUES (${title}, ${priceMinor}, ${shippingMinor}, ${qty}, ${BigInt(adId)}, 'verified_member', ${BigInt(memberId)}, 0, 0, 0)`.catch(() => {});
  }
  return { ok: true };
}

/** إيقاف عرض سلعة العضو للبيع المباشر (تُخفى فقط، لا تُحذف بياناتها). */
export async function stopMemberSale(memberId: number | bigint, adId: number | bigint): Promise<void> {
  await prisma.$executeRaw`UPDATE commerce_products SET visible=0, enabled=0, updated_at=CURRENT_TIMESTAMP(3)
    WHERE ad_id=${BigInt(adId)} AND seller_type='verified_member' AND seller_member_id=${BigInt(memberId)}`.catch(() => {});
}
