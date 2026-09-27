import 'server-only';
import { prisma } from '@/lib/prisma';
import { getSetting } from '@/lib/settings';
import { getMessagingConfig, sendWhatsApp } from '@/lib/sms';
import { getCommerceConfig } from '@/lib/commerce/settings';
import { saudiCommercePhone } from '@/lib/commerce/config';

/**
 * تتبّع شحن طلب التجارة: يضيفه البائع (عضو موثوق لسلعته، أو الإدارة) بعد الدفع،
 * فيُحفظ ويُرسَل واتساب للعميل ليتابع شحنته. القالب من إعداد لوحة الإدارة (لا نص ثابت).
 */
export async function shipmentMessageTemplate(): Promise<string> {
  return getSetting('commerce_shipment_message',
    'تربح: شُحن طلبك رقم {order} عبر {carrier}. رقم التتبّع: {tracking}. تابع شحنتك لدى شركة الشحن. شكراً لثقتك.',
  ).catch(() => 'تربح: شُحن طلبك رقم {order} عبر {carrier}. رقم التتبّع: {tracking}.');
}

export type TrackingResult =
  | { ok: true; whatsapp: 'sent' | 'skipped' | 'failed' }
  | { ok: false; error: 'not_found' | 'not_paid' | 'invalid' };

/**
 * يحفظ شركة الشحن ورقم التتبّع لطلب مدفوع، وينقله إلى «تم الشحن»، ثم يُرسل واتساب
 * للعميل. الصلاحية: الإدارة، أو العضو الذي يملك سلعةً في هذا الطلب (بائعها).
 */
export async function setCommerceOrderTracking(
  orderId: bigint, carrier: string, trackingNumber: string,
  opts: { sellerMemberId?: bigint | null; isAdmin?: boolean },
): Promise<TrackingResult> {
  const c = carrier.trim().slice(0, 120);
  const t = trackingNumber.trim().slice(0, 160);
  if (!c || !t) return { ok: false, error: 'invalid' };
  const [order] = await prisma.$queryRaw<{ id: bigint; status: string; shipping: unknown }[]>`
    SELECT id, status, shipping FROM commerce_orders WHERE id=${orderId} LIMIT 1`.catch(() => []);
  if (!order) return { ok: false, error: 'not_found' };
  if (order.status !== 'paid') return { ok: false, error: 'not_paid' };
  if (!opts.isAdmin) {
    if (!opts.sellerMemberId) return { ok: false, error: 'not_found' };
    const [own] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) n FROM commerce_order_items i JOIN commerce_products p ON p.id=i.product_id
      WHERE i.order_id=${orderId} AND p.seller_type='verified_member' AND p.seller_member_id=${opts.sellerMemberId}`.catch(() => [{ n: 0n }]);
    if (!own || Number(own.n) <= 0) return { ok: false, error: 'not_found' };
  }
  await prisma.$executeRaw`UPDATE commerce_orders SET carrier=${c}, tracking_number=${t}, fulfillment_status='shipped', shipped_at=CURRENT_TIMESTAMP(3) WHERE id=${orderId}`.catch(() => {});
  const whatsapp = await notifyShipment(orderId, order.shipping, c, t).catch(() => 'failed' as const);
  return { ok: true, whatsapp };
}

async function notifyShipment(orderId: bigint, shipping: unknown, carrier: string, tracking: string): Promise<'sent' | 'skipped' | 'failed'> {
  const config = await getCommerceConfig().catch(() => null);
  if (!config?.notificationsEnabled) return 'skipped';
  let ship: { phone?: string } | null = null;
  try { ship = typeof shipping === 'string' ? JSON.parse(shipping) : (shipping as { phone?: string }); } catch { ship = null; }
  const phone = saudiCommercePhone(String(ship?.phone || ''));
  if (!phone) return 'skipped';
  const messaging = await getMessagingConfig().catch(() => null);
  if (!messaging || !(messaging.waInstance && messaging.waToken)) return 'skipped';
  const tpl = await shipmentMessageTemplate();
  const message = tpl.replaceAll('{order}', String(orderId)).replaceAll('{carrier}', carrier).replaceAll('{tracking}', tracking).slice(0, 1600);
  if (!message.trim()) return 'skipped';
  const sent = await sendWhatsApp(phone, message, messaging).catch(() => false);
  return sent ? 'sent' : 'failed';
}
