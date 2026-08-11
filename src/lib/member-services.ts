import 'server-only';
import { prisma } from '@/lib/prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from '@/lib/utils';
import { refundableRiyals } from '@/lib/member-service-proration';

export const MEMBER_SERVICE_STATUS = {
  pendingAcceptance: 'pending_acceptance',
  cancelledBeforeAcceptance: 'cancelled_before_acceptance',
  awaitingExecution: 'awaiting_execution',
  active: 'active',
  completed: 'completed',
  cancelledAfterStart: 'cancelled_after_start',
  expired: 'expired',
} as const;

export type MemberServiceStatus = (typeof MEMBER_SERVICE_STATUS)[keyof typeof MEMBER_SERVICE_STATUS];
export type ServiceActionCode = 'ok' | 'not_found' | 'not_pending' | 'expired' | 'insufficient_balance' | 'not_awaiting_execution' | 'not_active' | 'forbidden';
export type ServiceActionResult = { ok: boolean; code: ServiceActionCode; balance?: number; refund?: number };

export type MemberServiceOrder = {
  id: number;
  userId: number;
  adminId: number;
  title: string;
  description: string | null;
  amount: number;
  startsAt: string;
  endsAt: string;
  acceptUntil: string;
  status: MemberServiceStatus;
  acceptedAt: string | null;
  executionConfirmedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  debitTxnId: number | null;
  refundTxnId: number | null;
};

function asDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function present(row: {
  id: bigint; user_id: bigint; admin_id: bigint; title: string; description: string | null; amount: number;
  starts_at: Date; ends_at: Date; accept_until: Date; status: string; accepted_at: Date | null;
  execution_confirmed_at: Date | null; cancelled_at: Date | null; cancelled_by: string | null;
  cancel_reason: string | null; debit_txn_id: bigint | null; refund_txn_id: bigint | null;
}): MemberServiceOrder {
  return {
    id: toInt(row.id), userId: toInt(row.user_id), adminId: toInt(row.admin_id), title: row.title,
    description: row.description, amount: row.amount, startsAt: row.starts_at.toISOString(), endsAt: row.ends_at.toISOString(),
    acceptUntil: row.accept_until.toISOString(), status: row.status as MemberServiceStatus, acceptedAt: asDate(row.accepted_at),
    executionConfirmedAt: asDate(row.execution_confirmed_at), cancelledAt: asDate(row.cancelled_at),
    cancelledBy: row.cancelled_by, cancelReason: row.cancel_reason, debitTxnId: row.debit_txn_id ? toInt(row.debit_txn_id) : null,
    refundTxnId: row.refund_txn_id ? toInt(row.refund_txn_id) : null,
  };
}

export function canAcceptMemberServiceOrder(status: string, acceptUntil: Date, availableBalance: number, amount: number, now = new Date()): boolean {
  return status === MEMBER_SERVICE_STATUS.pendingAcceptance && acceptUntil.getTime() >= now.getTime() && availableBalance >= amount;
}

export async function expirePendingMemberServiceOrders(now = new Date()): Promise<number> {
  await ensureSchema();
  const updated = await prisma.member_service_orders.updateMany({
    where: { status: MEMBER_SERVICE_STATUS.pendingAcceptance, accept_until: { lt: now } },
    data: { status: MEMBER_SERVICE_STATUS.expired, cancelled_at: now, cancelled_by: 'system', cancel_reason: 'انتهت مهلة موافقة العضو', updated_at: now },
  }).catch(() => ({ count: 0 }));
  return updated.count;
}

export async function createMemberServiceOrder(input: {
  userId: number; title: string; description?: string; amount: number; startsAt: Date; endsAt: Date; acceptUntil: Date;
}, adminId: number): Promise<MemberServiceOrder | null> {
  await ensureSchema();
  const title = input.title.trim().slice(0, 160);
  const description = input.description?.trim().slice(0, 500) || null;
  const amount = Math.round(input.amount);
  if (!title || !Number.isInteger(amount) || amount <= 0 || input.endsAt <= input.startsAt || input.acceptUntil <= new Date()) return null;
  const row = await prisma.member_service_orders.create({ data: {
    user_id: BigInt(input.userId), admin_id: BigInt(adminId), title, description, amount,
    starts_at: input.startsAt, ends_at: input.endsAt, accept_until: input.acceptUntil,
  } }).catch(() => null);
  return row ? present(row) : null;
}

export async function acceptMemberServiceOrder(orderId: number, userId: number): Promise<ServiceActionResult> {
  await ensureSchema();
  const now = new Date();
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.member_service_orders.findFirst({ where: { id: BigInt(orderId), user_id: BigInt(userId) } });
      if (!order) return { ok: false, code: 'not_found' };
      if (order.status !== MEMBER_SERVICE_STATUS.pendingAcceptance) return { ok: false, code: 'not_pending' };
      if (order.accept_until < now) {
        await tx.member_service_orders.updateMany({ where: { id: order.id, status: MEMBER_SERVICE_STATUS.pendingAcceptance }, data: { status: MEMBER_SERVICE_STATUS.expired, cancelled_at: now, cancelled_by: 'system', cancel_reason: 'انتهت مهلة موافقة العضو', updated_at: now } });
        return { ok: false, code: 'expired' };
      }
      const claimed = await tx.member_service_orders.updateMany({
        where: { id: order.id, status: MEMBER_SERVICE_STATUS.pendingAcceptance },
        data: { status: MEMBER_SERVICE_STATUS.awaitingExecution, accepted_at: now, updated_at: now },
      });
      if (!claimed.count) return { ok: false, code: 'not_pending' };
      const debited = await tx.users.updateMany({ where: { id: BigInt(userId), balance: { gte: order.amount } }, data: { balance: { decrement: order.amount } } });
      if (!debited.count) throw new Error('insufficient_balance');
      const user = await tx.users.findUnique({ where: { id: BigInt(userId) }, select: { balance: true } });
      const ledger = await tx.wallet_txns.create({ data: {
        user_id: BigInt(userId), amount: -order.amount, balance_after: user?.balance ?? 0, reason: 'member_service',
        note: `خدمة خاصة #${toInt(order.id)}: ${order.title}`.slice(0, 200), admin_id: order.admin_id,
      } });
      await tx.member_service_orders.update({ where: { id: order.id }, data: { debit_txn_id: ledger.id, updated_at: now } });
      return { ok: true, code: 'ok', balance: user?.balance ?? 0 };
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'insufficient_balance') return { ok: false, code: 'insufficient_balance' };
    return { ok: false, code: 'not_pending' };
  }
}

export async function confirmMemberServiceExecution(orderId: number, userId: number): Promise<ServiceActionResult> {
  await ensureSchema();
  const now = new Date();
  const order = await prisma.member_service_orders.findFirst({ where: { id: BigInt(orderId), user_id: BigInt(userId) } }).catch(() => null);
  if (!order) return { ok: false, code: 'not_found' };
  const effectiveStart = order.starts_at > now ? order.starts_at : now;
  const updated = await prisma.member_service_orders.updateMany({
    where: { id: order.id, user_id: BigInt(userId), status: MEMBER_SERVICE_STATUS.awaitingExecution },
    data: { status: MEMBER_SERVICE_STATUS.active, starts_at: effectiveStart, execution_confirmed_at: now, updated_at: now },
  }).catch(() => ({ count: 0 }));
  return updated.count ? { ok: true, code: 'ok' } : { ok: false, code: 'not_awaiting_execution' };
}

export async function cancelMemberServiceOrder(orderId: number, userId: number, reason = ''): Promise<ServiceActionResult> {
  await ensureSchema();
  const now = new Date();
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.member_service_orders.findFirst({ where: { id: BigInt(orderId), user_id: BigInt(userId) } });
      if (!order) return { ok: false, code: 'not_found' };
      if (order.status !== MEMBER_SERVICE_STATUS.active || order.refund_txn_id) return { ok: false, code: 'not_active' };
      const claimed = await tx.member_service_orders.updateMany({
        where: { id: order.id, status: MEMBER_SERVICE_STATUS.active, refund_txn_id: null },
        data: { status: MEMBER_SERVICE_STATUS.cancelledAfterStart, cancelled_at: now, cancelled_by: 'member', cancel_reason: reason.trim().slice(0, 300) || null, updated_at: now },
      });
      if (!claimed.count) return { ok: false, code: 'not_active' };
      const refund = refundableRiyals(order.amount, order.starts_at, order.ends_at, now);
      if (!refund) return { ok: true, code: 'ok', refund: 0 };
      const user = await tx.users.update({ where: { id: BigInt(userId) }, data: { balance: { increment: refund } }, select: { balance: true } });
      const ledger = await tx.wallet_txns.create({ data: {
        user_id: BigInt(userId), amount: refund, balance_after: user.balance, reason: 'refund',
        note: `استرداد خدمة خاصة #${toInt(order.id)}: ${order.title}`.slice(0, 200), admin_id: order.admin_id,
      } });
      await tx.member_service_orders.update({ where: { id: order.id }, data: { refund_txn_id: ledger.id, updated_at: now } });
      return { ok: true, code: 'ok', balance: user.balance, refund };
    });
  } catch {
    return { ok: false, code: 'not_active' };
  }
}

export async function cancelPendingMemberServiceOrder(orderId: number, reason: string): Promise<ServiceActionResult> {
  await ensureSchema();
  const now = new Date();
  const updated = await prisma.member_service_orders.updateMany({
    where: { id: BigInt(orderId), status: MEMBER_SERVICE_STATUS.pendingAcceptance },
    data: { status: MEMBER_SERVICE_STATUS.cancelledBeforeAcceptance, cancelled_at: now, cancelled_by: 'admin', cancel_reason: reason.trim().slice(0, 300) || 'ألغتها الإدارة', updated_at: now },
  }).catch(() => ({ count: 0 }));
  return updated.count ? { ok: true, code: 'ok' } : { ok: false, code: 'not_pending' };
}

export async function listMyMemberServiceOrders(userId: number): Promise<MemberServiceOrder[]> {
  await expirePendingMemberServiceOrders();
  const rows = await prisma.member_service_orders.findMany({ where: { user_id: BigInt(userId) }, orderBy: { id: 'desc' }, take: 200 }).catch(() => []);
  return rows.map(present);
}
