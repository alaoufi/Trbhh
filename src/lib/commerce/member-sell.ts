import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { canMemberSellDirectly } from './seller-types';

/**
 * البيع المباشر للعضو الموثوق: يعرض إعلانه كسلعة قابلة للشراء المباشر داخل تربح
 * بسعر وشحن محدّدين، بانتظار اعتماد الإدارة. لا خصم ولا دفع هنا — الشراء الفعلي
 * يمرّ بمحرّك الطلبات المقفل خلف حارس الشراء (لا بوابة دفع مسجّلة بعد).
 */
export type MemberSaleRow = { id: bigint; ad_id: bigint | null; price_minor: number; shipping_minor: number; item_price_minor: number; site_commission_minor: number; member_commission_minor: number; stock_available: number; approved: number; visible: number; enabled: number };

/** كل سلع البيع المباشر لهذا العضو، مفهرسة بمعرّف الإعلان (لعرضها في «إعلاناتي»). */
export async function listMemberSaleProducts(memberId: number | bigint): Promise<Map<string, MemberSaleRow>> {
  const rows = await prisma.$queryRaw<MemberSaleRow[]>`
    SELECT id, ad_id, price_minor, shipping_minor, item_price_minor, site_commission_minor, member_commission_minor, stock_available, approved, visible, enabled
    FROM commerce_products WHERE seller_type='verified_member' AND seller_member_id=${BigInt(memberId)}`.catch(() => [] as MemberSaleRow[]);
  const map = new Map<string, MemberSaleRow>();
  for (const r of rows) if (r.ad_id != null) map.set(String(r.ad_id), r);
  return map;
}

/** مكوّنات سعر سلعة العضو (بالهللة). الإجمالي المعروض للعميل = مجموعها. */
export type SalePriceParts = { itemMinor: number; shippingMinor: number; siteCommMinor: number; memberCommMinor: number };
export type ListSaleResult = { ok: true } | { ok: false; error: 'not_allowed' | 'not_owner' | 'bad_amounts' | 'ad_missing' };

const okMinor = (n: number, max: number) => Number.isSafeInteger(n) && n >= 0 && n <= max;

/** يعرض إعلان العضو للبيع المباشر بتفصيل السعر (سلعة/شحن/عمولة موقع/عمولة عضو) والكمية،
 *  بانتظار اعتماد الإدارة. الإجمالي price_minor = مجموع المكوّنات (يرى العميل الإجمالي فقط).
 *  أي تعديل يعيد الحالة إلى «بانتظار الاعتماد» ويخفيها حتى تراجعها الإدارة. */
export async function listAdForDirectSale(memberId: number | bigint, adId: number | bigint, parts: SalePriceParts, quantity: number): Promise<ListSaleResult> {
  if (!(await canMemberSellDirectly(memberId))) return { ok: false, error: 'not_allowed' };
  const { itemMinor, shippingMinor, siteCommMinor, memberCommMinor } = parts;
  if (!okMinor(itemMinor, 100_000_000) || itemMinor <= 0 || !okMinor(shippingMinor, 10_000_000)
    || !okMinor(siteCommMinor, 10_000_000) || !okMinor(memberCommMinor, 10_000_000)) return { ok: false, error: 'bad_amounts' };
  const priceMinor = itemMinor + shippingMinor + siteCommMinor + memberCommMinor;
  if (priceMinor <= 0 || priceMinor > 200_000_000) return { ok: false, error: 'bad_amounts' };
  const qty = Math.max(1, Math.min(999, Math.trunc(quantity) || 1));
  const ad = await prisma.ads.findUnique({ where: { id: BigInt(adId) }, select: { id: true, user_id: true, title: true } }).catch(() => null);
  if (!ad) return { ok: false, error: 'ad_missing' };
  if (Number(ad.user_id) !== Number(memberId)) return { ok: false, error: 'not_owner' };
  const title = (ad.title || 'سلعة').slice(0, 200);
  const existing = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT id FROM commerce_products WHERE ad_id=${BigInt(adId)} AND seller_type='verified_member' AND seller_member_id=${BigInt(memberId)} LIMIT 1`.catch(() => []);
  if (existing[0]) {
    await prisma.$executeRaw`UPDATE commerce_products SET title=${title}, price_minor=${priceMinor}, shipping_minor=${shippingMinor}, item_price_minor=${itemMinor}, site_commission_minor=${siteCommMinor}, member_commission_minor=${memberCommMinor}, stock_available=${qty}, approved=0, visible=0, enabled=0, updated_at=CURRENT_TIMESTAMP(3) WHERE id=${existing[0].id}`.catch(() => {});
  } else {
    await prisma.$executeRaw`INSERT INTO commerce_products (title, price_minor, shipping_minor, item_price_minor, site_commission_minor, member_commission_minor, stock_available, ad_id, seller_type, seller_member_id, approved, visible, enabled)
      VALUES (${title}, ${priceMinor}, ${shippingMinor}, ${itemMinor}, ${siteCommMinor}, ${memberCommMinor}, ${qty}, ${BigInt(adId)}, 'verified_member', ${BigInt(memberId)}, 0, 0, 0)`.catch(() => {});
  }
  return { ok: true };
}

/** طلبات بيع العضو المدفوعة (مبيعاته) — لعرضها في «مبيعاتي» وإضافة تتبّع الشحن. */
export type MemberSoldOrder = { id: bigint; total_minor: number; fulfillment_status: string; carrier: string; tracking_number: string; paid_at: Date | null; shipping: unknown };
export async function listMemberSoldOrders(memberId: number | bigint): Promise<MemberSoldOrder[]> {
  return prisma.$queryRaw<MemberSoldOrder[]>`
    SELECT DISTINCT o.id, o.total_minor, o.fulfillment_status, o.carrier, o.tracking_number, o.paid_at, o.shipping
    FROM commerce_orders o
    JOIN commerce_order_items i ON i.order_id=o.id
    JOIN commerce_products p ON p.id=i.product_id
    WHERE p.seller_type='verified_member' AND p.seller_member_id=${BigInt(memberId)} AND o.status='paid'
    ORDER BY o.id DESC LIMIT 100`.catch(() => [] as MemberSoldOrder[]);
}

/** سلعة العضو الموثوق المعتمدة والمتاحة للشراء المباشر المرتبطة بإعلان — لعرض زر «شراء مباشر»
 *  والإجمالي فقط على صفحة الإعلان وبطاقته بالرئيسية. تُرجع null إن لم تكن معتمدة/ظاهرة/متاحة
 *  أو نفد مخزونها. الإجمالي price_minor يشمل الشحن (يرى العميل الإجمالي فقط). */
export type DirectSaleAd = { productId: string; priceMinor: number };
export async function directSaleForAd(adId: number | bigint): Promise<DirectSaleAd | null> {
  const rows = await prisma.$queryRaw<{ id: bigint; price_minor: number }[]>`
    SELECT id, price_minor FROM commerce_products
    WHERE ad_id=${BigInt(adId)} AND seller_type='verified_member'
      AND approved=1 AND visible=1 AND enabled=1 AND currency='SAR'
      AND price_minor>0 AND stock_available>stock_reserved
    ORDER BY id DESC LIMIT 1`.catch(() => [] as { id: bigint; price_minor: number }[]);
  return rows[0] ? { productId: String(rows[0].id), priceMinor: rows[0].price_minor } : null;
}

/** خرائط الشراء المباشر لعدة إعلانات دفعة واحدة (لبطاقات القوائم/الرئيسية) — بمعرّف الإعلان. */
export async function directSaleForAds(adIds: readonly (number | bigint)[]): Promise<Map<string, DirectSaleAd>> {
  const ids = [...new Set(adIds.map(a => BigInt(a)).filter(a => a > 0n))];
  if (!ids.length) return new Map();
  const rows = await prisma.$queryRaw<{ ad_id: bigint; id: bigint; price_minor: number }[]>`
    SELECT ad_id, id, price_minor FROM commerce_products
    WHERE seller_type='verified_member' AND ad_id IN (${Prisma.join(ids)})
      AND approved=1 AND visible=1 AND enabled=1 AND currency='SAR'
      AND price_minor>0 AND stock_available>stock_reserved
    ORDER BY id DESC`.catch(() => [] as { ad_id: bigint; id: bigint; price_minor: number }[]);
  const map = new Map<string, DirectSaleAd>();
  for (const r of rows) if (r.ad_id != null && !map.has(String(r.ad_id))) map.set(String(r.ad_id), { productId: String(r.id), priceMinor: r.price_minor });
  return map;
}

/** إيقاف عرض سلعة العضو للبيع المباشر (تُخفى فقط, لا تُحذف بياناتها). */
export async function stopMemberSale(memberId: number | bigint, adId: number | bigint): Promise<void> {
  await prisma.$executeRaw`UPDATE commerce_products SET visible=0, enabled=0, updated_at=CURRENT_TIMESTAMP(3)
    WHERE ad_id=${BigInt(adId)} AND seller_type='verified_member' AND seller_member_id=${BigInt(memberId)}`.catch(() => {});
}
