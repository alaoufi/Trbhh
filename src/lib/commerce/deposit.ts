import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * تأمين رصيد العضو الموثوق: ضمان مالي يُعوَّض منه العميل عند إخلال العضو بشروط السلعة.
 * قاعدة العرض: مجموع التزام سلع العضو المعروضة (السعر × المخزون) لا يتجاوز التأمين المسجّل.
 * لا يُعرض هذا الرقم للعميل — للعضو والإدارة فقط.
 */

/** تأمين العضو (بالهللة). */
export async function memberSaleDeposit(memberId: number | bigint): Promise<number> {
  const u = await prisma.users.findUnique({ where: { id: BigInt(memberId) }, select: { sale_deposit_minor: true } }).catch(() => null);
  return u ? Number(u.sale_deposit_minor) : 0;
}

/** إجمالي التزام سلع العضو المعروضة (sale_listed=1) = مجموع (السعر × المخزون)، بالهللة.
 *  excludeAdId: يُستثنى إعلانٌ معيّن (عند إعادة عرض سلعته لحساب القيمة الجديدة). */
export async function memberSaleExposure(memberId: number | bigint, excludeAdId?: number | bigint | null): Promise<number> {
  const rows = await prisma.commerce_products.findMany({
    where: { seller_type: 'verified_member', seller_member_id: BigInt(memberId), sale_listed: 1 },
    select: { ad_id: true, price_minor: true, stock_available: true },
  }).catch(() => [] as { ad_id: bigint | null; price_minor: number; stock_available: number }[]);
  const exclude = excludeAdId != null ? BigInt(excludeAdId) : null;
  let sum = 0;
  for (const r of rows) {
    if (exclude != null && r.ad_id != null && BigInt(r.ad_id) === exclude) continue;
    sum += Math.max(0, r.price_minor) * Math.max(0, r.stock_available);
  }
  return sum;
}

/** ملخّص تأمين العضو: المسجَّل + المستخدَم (التزام السلع المعروضة) + المتبقّي. */
export async function memberDepositSummary(memberId: number | bigint): Promise<{ depositMinor: number; exposureMinor: number; remainingMinor: number }> {
  const [depositMinor, exposureMinor] = await Promise.all([memberSaleDeposit(memberId), memberSaleExposure(memberId)]);
  return { depositMinor, exposureMinor, remainingMinor: depositMinor - exposureMinor };
}
