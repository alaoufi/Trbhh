import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * كشف عمولات الأعضاء الموثوقين (لضبط حسابات الموقع):
 * المستحقّ لكل عضو = مجموع «عمولة العضو» في سلعه ضمن الطلبات المدفوعة × الكمية.
 * المُحوَّل = مجموع تحويلات commerce_member_payouts. الرصيد = المستحقّ − المُحوَّل.
 * لا يُعرض هذا الكشف للعميل إطلاقاً.
 */
export type MemberCommissionRow = { memberId: bigint; name: string; owedMinor: number; transferredMinor: number; balanceMinor: number };

export async function memberCommissionStatement(): Promise<MemberCommissionRow[]> {
  const owed = await prisma.$queryRaw<{ member_id: bigint; owed: bigint | number }[]>`
    SELECT p.seller_member_id AS member_id, SUM(p.member_commission_minor * i.quantity) AS owed
    FROM commerce_order_items i
    JOIN commerce_orders o ON o.id=i.order_id AND o.status='paid'
    JOIN commerce_products p ON p.id=i.product_id AND p.seller_type='verified_member'
    WHERE p.seller_member_id IS NOT NULL AND p.member_commission_minor > 0
    GROUP BY p.seller_member_id`.catch(() => []);
  const paid = await prisma.$queryRaw<{ member_id: bigint; paid: bigint | number }[]>`
    SELECT member_id, SUM(amount_minor) AS paid FROM commerce_member_payouts GROUP BY member_id`.catch(() => []);

  const byId = new Map<string, { owed: number; transferred: number }>();
  for (const r of owed) byId.set(String(r.member_id), { owed: Number(r.owed) || 0, transferred: 0 });
  for (const r of paid) {
    const k = String(r.member_id);
    const e = byId.get(k) ?? { owed: 0, transferred: 0 };
    e.transferred = Number(r.paid) || 0;
    byId.set(k, e);
  }
  const ids = [...byId.keys()].map(k => BigInt(k));
  const users = ids.length ? await prisma.users.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, userName: true } }).catch(() => []) : [];
  const nameOf = new Map(users.map(u => [String(u.id), u.name || u.userName || 'عضو']));

  return [...byId.entries()]
    .map(([k, v]) => ({ memberId: BigInt(k), name: nameOf.get(k) || 'عضو', owedMinor: v.owed, transferredMinor: v.transferred, balanceMinor: v.owed - v.transferred }))
    .sort((a, b) => b.balanceMinor - a.balanceMinor);
}

/** سجل تحويلات عضو (آخر التحويلات) لعرضها في الكشف. */
export async function memberPayoutHistory(memberId: number | bigint, limit = 50) {
  return prisma.commerce_member_payouts.findMany({ where: { member_id: BigInt(memberId) }, orderBy: { id: 'desc' }, take: Math.min(Math.max(1, limit), 200) }).catch(() => []);
}

/** تسجيل «تم التحويل» لعضو (بالهللة) — لضبط الحسابات. */
export async function recordMemberPayout(memberId: number | bigint, amountMinor: number, note: string, adminId: number | bigint): Promise<boolean> {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 1_000_000_000) return false;
  await prisma.commerce_member_payouts.create({ data: { member_id: BigInt(memberId), amount_minor: amountMinor, note: (note || '').slice(0, 300), admin_id: BigInt(adminId) } }).catch(() => {});
  return true;
}
