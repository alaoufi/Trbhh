import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';

const ensure = ensureSchema;

/** Reasons recorded on each wallet transaction (for member + admin history). */
export type TxnReason = 'admin_credit' | 'admin_debit' | 'featured' | 'classified' | 'duplicate' | 'subscription' | 'refund' | 'topup' | 'bonus' | 'verify_gift' | 'store_show' | 'ad_show' | 'urgent' | 'bump';
export const REASON_LABELS: Record<TxnReason, string> = {
  topup: 'شحن رصيد (تحويل)',
  bonus: 'مكافأة شحن',
  verify_gift: 'هدية التوثيق',
  admin_credit: 'شحن رصيد من الإدارة',
  admin_debit: 'خصم من الإدارة',
  featured: 'إعلان مميّز',
  classified: 'إعلان مبوّب',
  duplicate: 'رسوم تكرار إعلان',
  subscription: 'اشتراك متجر',
  store_show: 'عرض المتجر في تربح',
  ad_show: 'عرض إعلان متجر في تربح',
  urgent: 'شارة عاجل',
  bump: 'تحديث إعلان (رفع للأعلى)',
  refund: 'استرداد',
};

/** Remaining duplicate-publish allowances (from bought «مكرّر» packages). */
export async function getDupCredit(userId: number): Promise<number> {
  await ensure();
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { dup_credit: true } }).catch(() => null);
  return u?.dup_credit ?? 0;
}

/** Add N duplicate allowances (after buying a package). */
export async function addDupCredit(userId: number, n: number): Promise<void> {
  await ensure();
  if (n <= 0) return;
  await prisma.users.update({ where: { id: BigInt(userId) }, data: { dup_credit: { increment: Math.round(n) } } }).catch(() => {});
}

/** Consume one duplicate allowance if available. Returns true when consumed. */
export async function consumeDupCredit(userId: number): Promise<boolean> {
  await ensure();
  try {
    const r = await prisma.users.updateMany({ where: { id: BigInt(userId), dup_credit: { gt: 0 } }, data: { dup_credit: { decrement: 1 } } });
    return r.count > 0;
  } catch {
    return false;
  }
}

/** Buy a duplicate-publish package: pay `price`, add `count` allowances. */
export async function buyDupPack(userId: number, count: number, price: number): Promise<{ ok: boolean; balance: number }> {
  const paid = await charge(userId, price, 'duplicate', `باقة تكرار (${count} نشرات)`);
  if (!paid.ok) return { ok: false, balance: paid.balance };
  await addDupCredit(userId, count);
  return { ok: true, balance: paid.balance };
}

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

export type RevenueSummary = {
  credited: number;   // إجمالي الشحن (موجب)
  spent: number;      // إجمالي المصروف (سالب، بالقيمة المطلقة) = الإيراد الفعلي
  outstanding: number; // مجموع أرصدة الأعضاء الحالية
  byReason: { reason: TxnReason; label: string; total: number }[]; // مصروف حسب النوع
  creditByReason: { reason: TxnReason; label: string; total: number }[]; // دخل (شحن) حسب النوع
  recent: (WalletTxn & { userId: number; userName: string })[];
};

/** Site-wide revenue summary for the admin (money in/out + breakdown + recent activity). */
export async function getRevenueSummary(recentLimit = 30): Promise<RevenueSummary> {
  await ensure();
  const [credited, spentRows, balSum, byReasonRows, creditReasonRows, recentRows] = await Promise.all([
    prisma.wallet_txns.aggregate({ _sum: { amount: true }, where: { amount: { gt: 0 } } }).catch(() => ({ _sum: { amount: 0 } })),
    prisma.wallet_txns.aggregate({ _sum: { amount: true }, where: { amount: { lt: 0 } } }).catch(() => ({ _sum: { amount: 0 } })),
    prisma.users.aggregate({ _sum: { balance: true } }).catch(() => ({ _sum: { balance: 0 } })),
    prisma.wallet_txns.groupBy({ by: ['reason'], where: { amount: { lt: 0 } }, _sum: { amount: true } }).catch(() => [] as { reason: string; _sum: { amount: number | null } }[]),
    prisma.wallet_txns.groupBy({ by: ['reason'], where: { amount: { gt: 0 } }, _sum: { amount: true } }).catch(() => [] as { reason: string; _sum: { amount: number | null } }[]),
    prisma.wallet_txns.findMany({ orderBy: { id: 'desc' }, take: Math.min(100, Math.max(1, recentLimit)) }).catch(() => []),
  ]);
  const spent = Math.abs(spentRows._sum.amount ?? 0);
  const asReasonRows = (rows: { reason: string; _sum: { amount: number | null } }[]) => rows
    .map((r) => ({ reason: r.reason as TxnReason, label: REASON_LABELS[r.reason as TxnReason] || r.reason, total: Math.abs(r._sum.amount ?? 0) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  const byReason = asReasonRows(byReasonRows);
  const creditByReason = asReasonRows(creditReasonRows);
  // names for recent rows
  const uids = [...new Set(recentRows.map((r) => Number(r.user_id)))];
  const users = uids.length ? await prisma.users.findMany({ where: { id: { in: uids.map((u) => BigInt(u)) } }, select: { id: true, name: true, userName: true } }).catch(() => []) : [];
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || `#${toInt(u.id)}`]));
  const recent = recentRows.map((r) => ({
    id: toInt(r.id), amount: r.amount, balanceAfter: r.balance_after, reason: r.reason as TxnReason,
    label: REASON_LABELS[r.reason as TxnReason] || r.reason, note: r.note, at: r.created_at ? r.created_at.toISOString() : null,
    byAdmin: !!r.admin_id, userId: toInt(r.user_id), userName: nameById.get(toInt(r.user_id)) || `#${toInt(r.user_id)}`,
  }));
  return { credited: credited._sum.amount ?? 0, spent, outstanding: balSum._sum.balance ?? 0, byReason, creditByReason, recent };
}

export type MemberLedgerRow = { userId: number; name: string; credited: number; consumed: number; balance: number; dupCredit: number };

/** Per-member budget: total credited (paid-in), consumed (spent), current balance, dup allowances. */
export async function getMemberLedger(limit = 300): Promise<MemberLedgerRow[]> {
  await ensure();
  const [credits, debits] = await Promise.all([
    prisma.wallet_txns.groupBy({ by: ['user_id'], where: { amount: { gt: 0 } }, _sum: { amount: true } }).catch(() => [] as { user_id: bigint; _sum: { amount: number | null } }[]),
    prisma.wallet_txns.groupBy({ by: ['user_id'], where: { amount: { lt: 0 } }, _sum: { amount: true } }).catch(() => [] as { user_id: bigint; _sum: { amount: number | null } }[]),
  ]);
  const creditBy = new Map(credits.map((c) => [toInt(c.user_id), c._sum.amount ?? 0]));
  const debitBy = new Map(debits.map((d) => [toInt(d.user_id), Math.abs(d._sum.amount ?? 0)]));
  const uids = [...new Set([...creditBy.keys(), ...debitBy.keys()])];
  if (!uids.length) return [];
  const users = await prisma.users.findMany({
    where: { id: { in: uids.map((u) => BigInt(u)) } },
    select: { id: true, name: true, userName: true, balance: true, dup_credit: true },
  }).catch(() => []);
  return users
    .map((u) => {
      const id = toInt(u.id);
      return {
        userId: id,
        name: u.name || u.userName || `#${id}`,
        credited: creditBy.get(id) ?? 0,
        consumed: debitBy.get(id) ?? 0,
        balance: u.balance ?? 0,
        dupCredit: u.dup_credit ?? 0,
      };
    })
    .sort((a, b) => b.consumed - a.consumed)
    .slice(0, limit);
}

/* ===================== طلبات شحن الرصيد (تحويل + إيصال) ===================== */

export type TopupStatus = 0 | 1 | 2; // 0 pending, 1 approved, 2 rejected
export type TopupRow = {
  id: number; userId: number; amount: number; receipt: string | null;
  status: TopupStatus; note: string | null; at: string | null; decidedAt: string | null;
};

const topupRow = (r: { id: bigint; user_id: bigint; amount: number; receipt: string | null; status: number; note: string | null; created_at: Date | null; decided_at: Date | null }): TopupRow => ({
  id: toInt(r.id), userId: toInt(r.user_id), amount: r.amount, receipt: r.receipt,
  status: (r.status === 1 || r.status === 2 ? r.status : 0) as TopupStatus, note: r.note,
  at: r.created_at ? r.created_at.toISOString() : null,
  decidedAt: r.decided_at ? r.decided_at.toISOString() : null,
});

/** Member files a top-up request (amount + uploaded receipt path). */
export async function requestTopup(userId: number, amount: number, receiptRel: string | null): Promise<boolean> {
  await ensure();
  const amt = Math.round(amount || 0);
  if (amt <= 0) return false;
  try {
    await prisma.wallet_topups.create({ data: { user_id: BigInt(userId), amount: amt, receipt: receiptRel } });
    return true;
  } catch {
    return false;
  }
}

/** Member's own top-up requests (newest first). */
export async function listMyTopups(userId: number, limit = 20): Promise<TopupRow[]> {
  await ensure();
  const rows = await prisma.wallet_topups.findMany({ where: { user_id: BigInt(userId) }, orderBy: { id: 'desc' }, take: limit }).catch(() => []);
  return rows.map(topupRow);
}

/** Admin listing with per-status counts. */
export async function listTopupsAdmin(status: 'all' | TopupStatus = 0, limit = 200, offset = 0): Promise<{ rows: (TopupRow & { userName: string })[]; counts: { all: number; pending: number; approved: number; rejected: number } }> {
  await ensure();
  const [all, pending, approved, rejected, rows] = await Promise.all([
    prisma.wallet_topups.count().catch(() => 0),
    prisma.wallet_topups.count({ where: { status: 0 } }).catch(() => 0),
    prisma.wallet_topups.count({ where: { status: 1 } }).catch(() => 0),
    prisma.wallet_topups.count({ where: { status: 2 } }).catch(() => 0),
    prisma.wallet_topups.findMany({ where: status === 'all' ? {} : { status }, orderBy: { id: 'desc' }, skip: Math.max(0, offset), take: limit }).catch(() => []),
  ]);
  const uids = [...new Set(rows.map((r) => toInt(r.user_id)))];
  const users = uids.length ? await prisma.users.findMany({ where: { id: { in: uids.map((u) => BigInt(u)) } }, select: { id: true, name: true, userName: true } }).catch(() => []) : [];
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || `#${toInt(u.id)}`]));
  return {
    rows: rows.map((r) => ({ ...topupRow(r), userName: nameById.get(toInt(r.user_id)) || `#${toInt(r.user_id)}` })),
    counts: { all, pending, approved, rejected },
  };
}

/** Admin confirms money arrived: flips the request to approved (once) then credits the balance.
 *  Returns the request when credited, null when already decided / not found / credit failed. */
export async function approveTopup(id: number, adminId: number): Promise<TopupRow | null> {
  await ensure();
  const req = await prisma.wallet_topups.findUnique({ where: { id: BigInt(id) } }).catch(() => null);
  if (!req || req.status !== 0) return null;
  // atomic status flip so a double-click can't credit twice
  const flipped = await prisma.wallet_topups.updateMany({ where: { id: BigInt(id), status: 0 }, data: { status: 1, admin_id: BigInt(adminId), decided_at: new Date() } }).catch(() => ({ count: 0 }));
  if (flipped.count === 0) return null;
  const credited = await adjustBalance(toInt(req.user_id), req.amount, 'topup', { adminId, note: `طلب شحن #${toInt(req.id)}` });
  if (!credited.ok) {
    // roll the request back so it can be retried
    await prisma.wallet_topups.updateMany({ where: { id: BigInt(id), status: 1 }, data: { status: 0, admin_id: null, decided_at: null } }).catch(() => {});
    return null;
  }
  await applyTopupBonuses(toInt(req.user_id), req.amount, adminId).catch(() => {});
  return topupRow({ ...req, status: 1 });
}

/** مكافآت الشحن (من الإعدادات): نسبة إضافية فوق حدّ أدنى + مكافأة أول شحن — 0 = معطّلة. */
async function applyTopupBonuses(userId: number, amount: number, adminId: number): Promise<void> {
  const { getTopupPromo } = await import('./settings');
  const promo = await getTopupPromo();
  if (promo.pct > 0 && amount >= promo.min) {
    const bonus = Math.round((amount * promo.pct) / 100);
    if (bonus > 0) await adjustBalance(userId, bonus, 'bonus', { adminId, note: `+${promo.pct}% على شحن ${amount} ر.س` });
  }
  if (promo.first > 0) {
    const prior = await prisma.wallet_txns.count({ where: { user_id: BigInt(userId), reason: 'topup' } }).catch(() => 99);
    if (prior === 1) { // شحنته المؤكدة الأولى فقط
      await adjustBalance(userId, promo.first, 'bonus', { adminId, note: 'مكافأة أول شحن' });
    }
  }
}

/** هدية التوثيق (مرة واحدة لكل عضو) — 0 = معطّلة. */
export async function grantVerifyGift(userId: number, adminId: number): Promise<number> {
  const { getVerifyGift } = await import('./settings');
  const gift = await getVerifyGift();
  if (gift <= 0) return 0;
  await ensure();
  const prior = await prisma.wallet_txns.count({ where: { user_id: BigInt(userId), reason: 'verify_gift' } }).catch(() => 1);
  if (prior > 0) return 0;
  const r = await adjustBalance(userId, gift, 'verify_gift', { adminId, note: 'هدية توثيق الحساب' });
  return r.ok ? gift : 0;
}

/** Admin rejects a pending request with a saved reason. */
export async function rejectTopup(id: number, adminId: number, reason: string): Promise<TopupRow | null> {
  await ensure();
  const req = await prisma.wallet_topups.findUnique({ where: { id: BigInt(id) } }).catch(() => null);
  if (!req || req.status !== 0) return null;
  const flipped = await prisma.wallet_topups.updateMany({
    where: { id: BigInt(id), status: 0 },
    data: { status: 2, note: reason.slice(0, 300), admin_id: BigInt(adminId), decided_at: new Date() },
  }).catch(() => ({ count: 0 }));
  return flipped.count > 0 ? topupRow({ ...req, status: 2, note: reason.slice(0, 300) }) : null;
}

/** إجمالي حركات محفظة العضو (للترقيم). */
export async function countTxns(userId: number): Promise<number> {
  await ensure();
  return prisma.wallet_txns.count({ where: { user_id: BigInt(userId) } }).catch(() => 0);
}

/** Transaction history for a member (newest first). */
export async function listTxns(userId: number, limit = 50, offset = 0): Promise<WalletTxn[]> {
  await ensure();
  const rows = await prisma.wallet_txns.findMany({
    where: { user_id: BigInt(userId) },
    orderBy: { id: 'desc' },
    skip: Math.max(0, offset),
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

export type MonthBudget = { month: string; income: number; revenue: number; expenses: number };

/** ميزانية شهرية (آخر ١٢ شهراً): الدخل (شحن)، الإيراد (المستهلك)، والمصروفات. */
export async function getMonthlyBudget(months = 12): Promise<MonthBudget[]> {
  await ensure();
  type Row = { m: string; inc: unknown; outc: unknown };
  const [txns, exps] = await Promise.all([
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT DATE_FORMAT(created_at,'%Y-%m') m,
              SUM(IF(amount>0,amount,0)) inc,
              SUM(IF(amount<0,-amount,0)) outc
       FROM wallet_txns WHERE created_at IS NOT NULL
       GROUP BY m ORDER BY m DESC LIMIT ${Math.max(1, months)}`,
    ).catch(() => [] as Row[]),
    prisma.$queryRawUnsafe<{ m: string; total: unknown }[]>(
      `SELECT DATE_FORMAT(COALESCE(spent_at, created_at),'%Y-%m') m, SUM(amount) total
       FROM site_expenses GROUP BY m ORDER BY m DESC LIMIT ${Math.max(1, months)}`,
    ).catch(() => [] as { m: string; total: unknown }[]),
  ]);
  const expBy = new Map(exps.map((e) => [e.m, Number(e.total) || 0]));
  const map = new Map<string, MonthBudget>();
  for (const t of txns) map.set(t.m, { month: t.m, income: Number(t.inc) || 0, revenue: Number(t.outc) || 0, expenses: 0 });
  for (const [m, total] of expBy) {
    const row = map.get(m);
    if (row) row.expenses = total;
    else map.set(m, { month: m, income: 0, revenue: 0, expenses: total });
  }
  return [...map.values()].sort((a, b) => (a.month < b.month ? 1 : -1)).slice(0, months);
}

/* ===================== مصروفات الموقع (تُدخلها الإدارة) ===================== */

export type ExpenseRow = { id: number; label: string; amount: number; note: string | null; spentAt: string | null; at: string | null };

export async function addSiteExpense(label: string, amount: number, adminId: number, opts: { note?: string; spentAt?: string } = {}): Promise<boolean> {
  await ensure();
  const amt = Math.round(amount || 0);
  const lbl = label.trim().slice(0, 120);
  if (amt <= 0 || !lbl) return false;
  const spent = opts.spentAt ? new Date(opts.spentAt) : new Date();
  try {
    await prisma.site_expenses.create({
      data: { label: lbl, amount: amt, note: opts.note ? opts.note.slice(0, 300) : null, spent_at: isNaN(spent.getTime()) ? new Date() : spent, admin_id: BigInt(adminId) },
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteSiteExpense(id: number): Promise<void> {
  await ensure();
  await prisma.site_expenses.delete({ where: { id: BigInt(id) } }).catch(() => {});
}

/** Expense list (newest first) + grand total. */
export async function listSiteExpenses(limit = 300): Promise<{ rows: ExpenseRow[]; total: number }> {
  await ensure();
  const [rows, sum] = await Promise.all([
    prisma.site_expenses.findMany({ orderBy: [{ spent_at: 'desc' }, { id: 'desc' }], take: limit }).catch(() => []),
    prisma.site_expenses.aggregate({ _sum: { amount: true } }).catch(() => ({ _sum: { amount: 0 } })),
  ]);
  return {
    rows: rows.map((r) => ({
      id: toInt(r.id), label: r.label, amount: r.amount, note: r.note,
      spentAt: r.spent_at ? r.spent_at.toISOString() : null,
      at: r.created_at ? r.created_at.toISOString() : null,
    })),
    total: sum._sum.amount ?? 0,
  };
}
