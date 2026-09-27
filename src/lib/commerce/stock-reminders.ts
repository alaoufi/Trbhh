import 'server-only';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notify';

/**
 * تذكيرات نفاد المخزون: عند نفاد سلعة يطلب العميل تذكيره عند توفرها، وعند إعادة المخزون
 * (اعتماد/تحديث بمخزون>0) يُشعَر كل من طلب التذكير مرّة واحدة.
 */

/** يسجّل طلب تذكير العضو عند توفّر السلعة (يتجاهل التكرار، ويعيد التفعيل إن أُشعر سابقاً). */
export async function addStockReminder(productId: number | bigint, memberId: number | bigint): Promise<boolean> {
  try {
    await prisma.commerce_stock_reminders.upsert({
      where: { product_id_member_id: { product_id: BigInt(productId), member_id: BigInt(memberId) } },
      create: { product_id: BigInt(productId), member_id: BigInt(memberId), notified: 0 },
      update: { notified: 0 },
    });
    return true;
  } catch {
    return false;
  }
}

/** هل طلب هذا العضو تذكيراً لهذه السلعة (ولم يُشعَر بعد)؟ — لعرض حالة الزر. */
export async function hasPendingReminder(productId: number | bigint, memberId: number | bigint): Promise<boolean> {
  const row = await prisma.commerce_stock_reminders.findUnique({
    where: { product_id_member_id: { product_id: BigInt(productId), member_id: BigInt(memberId) } },
    select: { notified: true },
  }).catch(() => null);
  return !!row && row.notified === 0;
}

/** عند توفّر المخزون مجدداً: يُشعر أصحاب طلبات التذكير غير المُشعَرين ويعلّمهم. */
export async function notifyRestock(productId: number | bigint, route = `/shop/${productId}`): Promise<number> {
  const pid = BigInt(productId);
  const pending = await prisma.commerce_stock_reminders.findMany({ where: { product_id: pid, notified: 0 }, select: { id: true, member_id: true } }).catch(() => [] as { id: bigint; member_id: bigint }[]);
  if (!pending.length) return 0;
  for (const r of pending) await notify(Number(r.member_id), { title: 'توفّرت سلعة كنت تنتظرها — سارِع بالطلب', route, type: 'other' });
  await prisma.commerce_stock_reminders.updateMany({ where: { id: { in: pending.map(r => r.id) } }, data: { notified: 1 } }).catch(() => {});
  return pending.length;
}
