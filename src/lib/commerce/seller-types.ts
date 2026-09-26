import 'server-only';
import { getSetting } from '@/lib/settings';
import { prisma } from '@/lib/prisma';

/**
 * أنواع البائع للسلعة القابلة للشراء المباشر داخل تربح:
 * - trbhh: مبيعات تربح — تربح البائع، تحسم وتشحن.
 * - verified_member: عضو موثوق يبيع بسعره وشحنه، ويحسم من مدى (المال إليه).
 * - imported: مستورد من مورد (CJ) — تحسم وتشحن من المورد.
 * (العضو العادي غير الموثوق لا يبيع مباشرة — إعلانه للتواصل والاتفاق خارج الموقع.)
 */
export const SELLER_TYPES = ['trbhh', 'verified_member', 'imported'] as const;
export type SellerType = (typeof SELLER_TYPES)[number];

export const SELLER_TYPE_LABELS: Record<SellerType, string> = {
  trbhh: 'مبيعات تربح',
  verified_member: 'عضو موثوق',
  imported: 'مستورد',
};

export function isSellerType(v: string): v is SellerType {
  return (SELLER_TYPES as readonly string[]).includes(v);
}
export function sellerTypeLabel(v: string): string {
  return isSellerType(v) ? SELLER_TYPE_LABELS[v] : SELLER_TYPE_LABELS.trbhh;
}

/** مفتاح إداري: هل يُسمح للأعضاء الموثوقين بالبيع المباشر؟ (افتراضياً مطفأ). */
export async function verifiedDirectSaleEnabled(): Promise<boolean> {
  return (await getSetting('verified_direct_sale_enabled', '0').catch(() => '0')) === '1';
}

/** هل يستطيع هذا العضو البيع المباشر؟ يجب أن يكون موثوقاً والمفتاح مفعّلاً. */
export async function canMemberSellDirectly(userId: number | bigint | null | undefined): Promise<boolean> {
  if (!userId) return false;
  if (!(await verifiedDirectSaleEnabled())) return false;
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { trusted: true } }).catch(() => null);
  return Number(u?.trusted) === 1;
}
