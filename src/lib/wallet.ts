import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';

const ensure = ensureSchema;

/** Reasons recorded on each wallet transaction (for member + admin history). */
export type TxnReason = 'admin_credit' | 'admin_debit' | 'featured' | 'classified' | 'duplicate' | 'refund';
export const REASON_LABELS: Record<TxnReason, string> = {
  admin_credit: 'شحن رصيد من الإدارة',
  admin_debit: 'خصم من الإدارة',
  featured: 'إعلان مميّز',
  classified: 'إعلان مبوّب',
  duplicate: 'رسوم تكرار إعلان',
  refund: 'استرداد',
};

/** Current balance (SAR) for a member. */
export async function getBalance(userId: number): Promise<number> {
  await ensure();
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { balance: true } }).catch(() => null);
  return u?.balance ?? 0;
}

/** Atomically change a balance and record a transaction. `amount` is signed
 *  (positive = credit, negative = debit). Refuses a debit that would go negative
 *  (returns { ok:false }). Returns the new balance on success. */
export async function adjustBalance(
  userId: number,
  amount: number,
  reason: TxnReason,
  opts: { note?: string; adminId?: number } = {},
): Promise<{ ok: boolean; balance: number }> {
  await ensure();
  const amt = Math.round(amount);
  if (!Number.isFinite(amt) || amt === 0) {
    return { ok: false, balance: await getBalance(userId) };
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const u = await tx.users.findUnique({ where: { id: BigInt(userId) }, select: { balance: true } });
      const cur = u?.balance ?? 0;
      const next = cur + amt;
      if (next < 0) return { ok: false, balance: cur }; // insufficient funds
      await tx.users.update({ where: { id: BigInt(userId) }, data: { balance: next } });
      await tx.wallet_txns.create({
        data: {
          user_id: BigInt(userId),
          amount: amt,
          balance_after: next,
          reason,
          note: opts.note ? opts.note.slice(0, 200) : null,
          admin_id: opts.adminId ? BigInt(opts.adminId) : null,
        },
      });
      return { ok: true, balance: next };
    });
  } catch {
    return { ok: false, balance: await getBalance(userId) };
  }
}

/** Charge (debit) a fee if the member can afford it. No-op success when price ≤ 0. */
export async function charge(userId: number, price: number, reason: TxnReason, note?: string): Promise<{ ok: boolean; balance: number; price: number }> {
  const p = Math.max(0, Math.round(price || 0));
  if (p === 0) return { ok: true, balance: await getBalance(userId), price: 0 };
  const r = await adjustBalance(userId, -p, reason, { note });
  return { ok: r.ok, balance: r.balance, price: p };
}

/** Admin adds credit to a member. */
export async function creditUser(userId: number, amount: number, adminId: number, note?: string) {
  return adjustBalance(userId, Math.abs(Math.round(amount || 0)), 'admin_credit', { adminId, note });
}

/** Admin deducts credit from a member (won't go below zero). */
export async function debitUser(userId: number, amount: number, adminId: number, note?: string) {
  return adjustBalance(userId, -Math.abs(Math.round(amount || 0)), 'admin_debit', { adminId, note });
}

export type WalletTxn = { id: number; amount: number; balanceAfter: number; reason: TxnReason; label: string; note: string | null; at: string | null; byAdmin: boolean };

/** Transaction history for a member (newest first). */
export async function listTxns(userId: number, limit = 50): Promise<WalletTxn[]> {
  await ensure();
  const rows = await prisma.wallet_txns.findMany({
    where: { user_id: BigInt(userId) },
    orderBy: { id: 'desc' },
    take: Math.min(200, Math.max(1, limit)),
  }).catch(() => []);
  return rows.map((r) => ({
    id: toInt(r.id),
    amount: r.amount,
    balanceAfter: r.balance_after,
    reason: r.reason as TxnReason,
    label: REASON_LABELS[r.reason as TxnReason] || r.reason,
    note: r.note,
    at: r.created_at ? r.created_at.toISOString() : null,
    byAdmin: !!r.admin_id,
  }));
}
