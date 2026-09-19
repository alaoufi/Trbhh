import 'server-only';
import type { Prisma } from '@prisma/client';
import type { parseCommerceProduct } from './admin-input';

/** Caller holds its RBAC gate and transaction. Stock is a delta, not a stale
 * absolute form snapshot. A metadata edit with delta=0 cannot undo reservations.
 */
export async function updateCommerceProduct(tx: Prisma.TransactionClient, id: bigint, data: ReturnType<typeof parseCommerceProduct>, stockDelta: number) {
  if (!Number.isSafeInteger(stockDelta) || Math.abs(stockDelta) > 1000000) throw new Error('invalid_stock_adjustment');
  const changed = await tx.$executeRaw`UPDATE commerce_products
    SET title=${data.title},price_minor=${data.priceMinor},stock_available=stock_available+${stockDelta},ad_id=${data.adId},
      approved=${Number(data.approved)},visible=${Number(data.visible)},enabled=${Number(data.enabled)},updated_at=CURRENT_TIMESTAMP(3)
    WHERE id=${id} AND stock_available+${stockDelta} BETWEEN 0 AND 1000000`;
  if (changed !== 1) throw new Error('invalid_stock_adjustment');
}
