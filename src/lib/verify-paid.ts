import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';
import { getVerifyFeeConfig } from './settings';
import { charge, adjustBalance } from './wallet';

const ensure = ensureSchema;
const DAY = 86400000;

export type VerifyOrder = {
  id: number; userId: number; storeId: number; fee: number; days: number;
  status: number; note: string | null; refund: number;
  at: string | null; decidedAt: string | null; expiresAt: string | null;
};

const row = (r: { id: bigint; user_id: bigint; store_id: number; fee: number; days: number; status: number; note: string | null; refund: number; created_at: Date | null; decided_at: Date | null; expires_at: Date | null }): VerifyOrder => ({
  id: toInt(r.id), userId: toInt(r.user_id), storeId: r.store_id, fee: r.fee, days: r.days,
  status: r.status, note: r.note, refund: r.refund,
  at: r.created_at ? r.created_at.toISOString() : null,
  decidedAt: r.decided_at ? r.decided_at.toISOString() : null,
  expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
});

/** طلب صاحب المتجر توثيقاً مدفوعاً — يُحفظ معلقاً حتى موافقة إدارة المتاجر (لا خصم الآن). */
export async function requestPaidVerification(userId: number, storeId: number): Promise<'ok' | 'dup' | 'off' | 'trusted'> {
  await ensure();
  const { fee } = await getVerifyFeeConfig();
  if (fee <= 0) return 'off';
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { trusted: true } }).catch(() => null);
  const active = await prisma.verify_orders.findFirst({ where: { user_id: BigInt(userId), status: 1, expires_at: { gt: new Date() } } }).catch(() => null);
  if (u?.trusted === 1 && !active) return 'trusted'; // موثّق أصلاً (بالمستندات) — لا حاجة للدفع
  if (active) return 'trusted';
  const pending = await prisma.verify_orders.findFirst({ where: { user_id: BigInt(userId), status: 0 } }).catch(() => null);
  if (pending) return 'dup';
  const { days } = await getVerifyFeeConfig();
  await prisma.verify_orders.create({ data: { user_id: BigInt(userId), store_id: storeId, fee, days } });
  return 'ok';
}

/** أحدث طلب توثيق مدفوع للعضو (لعرض حالته في لوحة متجره). */
export async function myVerifyOrder(userId: number): Promise<VerifyOrder | null> {
  await ensure();
  const r = await prisma.verify_orders.findFirst({ where: { user_id: BigInt(userId) }, orderBy: { id: 'desc' } }).catch(() => null);
  return r ? row(r) : null;
}

/** موافقة إدارة المتاجر: الخصم أولاً — لا توثيق إلا برصيد يكفي.
 *  الرصيد لا يكفي ⇒ يبقى الطلب معلقاً ويُبلَّغ العضو بشحن رصيده. */
export async function approvePaidVerification(orderId: number, adminId: number): Promise<{ ok: boolean; reason?: 'balance' | 'gone'; order?: VerifyOrder; balance?: number }> {
  await ensure();
  const r = await prisma.verify_orders.findFirst({ where: { id: BigInt(orderId), status: 0 } }).catch(() => null);
  if (!r) return { ok: false, reason: 'gone' };
  const paid = await charge(toInt(r.user_id), r.fee, 'verify_fee', `توثيق مدفوع — طلب #${toInt(r.id)} (${r.days} يوم)`);
  if (!paid.ok) return { ok: false, reason: 'balance', order: row(r), balance: paid.balance };
  const now = new Date();
  const expires = new Date(now.getTime() + r.days * DAY);
  await prisma.verify_orders.update({ where: { id: r.id }, data: { status: 1, admin_id: BigInt(adminId), decided_at: now, expires_at: expires } }).catch(() => {});
  await prisma.users.update({ where: { id: r.user_id }, data: { trusted: 1, step: 0, verified_at: now } }).catch(() => {});
  return { ok: true, order: row({ ...r, status: 1, decided_at: now, expires_at: expires }) };
}

/** رفض الطلب المعلق مع سبب يُحفظ ويصل العضو. */
export async function rejectPaidVerification(orderId: number, adminId: number, note: string): Promise<VerifyOrder | null> {
  await ensure();
  const r = await prisma.verify_orders.findFirst({ where: { id: BigInt(orderId), status: 0 } }).catch(() => null);
  if (!r) return null;
  await prisma.verify_orders.update({ where: { id: r.id }, data: { status: 2, note: note.slice(0, 300), admin_id: BigInt(adminId), decided_at: new Date() } }).catch(() => {});
  return row({ ...r, status: 2, note });
}

/** حساب الاسترداد النسبي للأيام غير المستخدمة (مثال: 20 ر.س / 10 أيام، إلغاء بعد 5 ⇒ 10 ر.س). */
export function refundOf(order: { fee: number; days: number; expiresAt: string | null }): { remainingDays: number; refund: number } {
  if (!order.expiresAt) return { remainingDays: 0, refund: 0 };
  const remainMs = new Date(order.expiresAt).getTime() - Date.now();
  const remainingDays = Math.max(0, Math.min(order.days, Math.ceil(remainMs / DAY)));
  return { remainingDays, refund: Math.round((order.fee * remainingDays) / order.days) };
}

/** إلغاء توثيق مدفوع نشط بسبب إلزامي: سحب الشارة + استرداد قيمة الأيام غير المستخدمة للرصيد. */
export async function cancelPaidVerification(orderId: number, adminId: number, reason: string): Promise<{ order: VerifyOrder; refund: number } | null> {
  await ensure();
  const r = await prisma.verify_orders.findFirst({ where: { id: BigInt(orderId), status: 1 } }).catch(() => null);
  if (!r) return null;
  // قفل ذري ضد التنفيذ المكرر
  const flipped = await prisma.verify_orders.updateMany({ where: { id: r.id, status: 1 }, data: { status: 3, note: reason.slice(0, 300), admin_id: BigInt(adminId), decided_at: new Date() } }).catch(() => ({ count: 0 }));
  if (flipped.count === 0) return null;
  const { refund } = refundOf(row(r));
  if (refund > 0) {
    await adjustBalance(toInt(r.user_id), refund, 'refund', { adminId, note: `استرداد أيام توثيق غير مستخدمة — طلب #${toInt(r.id)}` });
    await prisma.verify_orders.update({ where: { id: r.id }, data: { refund } }).catch(() => {});
  }
  await prisma.users.update({ where: { id: r.user_id }, data: { trusted: 0, verified_at: null } }).catch(() => {});
  return { order: row({ ...r, status: 3, note: reason, refund }), refund };
}

/** قوائم الإدارة: المعلق (للموافقة/الرفض) + النشط (للإلغاء) مع أسماء الأعضاء وأرصدتهم. */
export async function listVerifyOrdersAdmin(): Promise<{ pending: (VerifyOrder & { userName: string; balance: number; storeName: string | null })[]; active: (VerifyOrder & { userName: string; storeName: string | null })[] }> {
  await ensure();
  await sweepExpiredPaidVerifications().catch(() => {});
  const rows = await prisma.verify_orders.findMany({ where: { status: { in: [0, 1] } }, orderBy: { id: 'desc' }, take: 200 }).catch(() => []);
  const uids = [...new Set(rows.map((r) => toInt(r.user_id)))];
  const sids = [...new Set(rows.map((r) => r.store_id).filter((n) => n > 0))];
  const [users, stores] = await Promise.all([
    uids.length ? prisma.users.findMany({ where: { id: { in: uids.map((u) => BigInt(u)) } }, select: { id: true, name: true, userName: true, balance: true } }).catch(() => []) : [],
    sids.length ? prisma.stores.findMany({ where: { id: { in: sids } }, select: { id: true, store_name: true } }).catch(() => []) : [],
  ]);
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || `#${toInt(u.id)}`]));
  const balById = new Map(users.map((u) => [toInt(u.id), u.balance ?? 0]));
  const storeById = new Map(stores.map((s) => [toInt(s.id), s.store_name ?? null]));
  const wrap = (r: (typeof rows)[number]) => ({ ...row(r), userName: nameById.get(toInt(r.user_id)) || `#${toInt(r.user_id)}`, storeName: storeById.get(r.store_id) ?? null });
  return {
    pending: rows.filter((r) => r.status === 0).map((r) => ({ ...wrap(r), balance: balById.get(toInt(r.user_id)) ?? 0 })),
    active: rows.filter((r) => r.status === 1).map(wrap),
  };
}

let lastVerifySweep = 0;
/** انتهاء مدة التوثيق المدفوع: سحب الشارة تلقائياً (لا يمس الموثّقين بالمستندات). */
export async function sweepExpiredPaidVerifications(): Promise<void> {
  const now = Date.now();
  if (now - lastVerifySweep < 600_000) return; // مرة كل 10 دقائق كحد أقصى
  lastVerifySweep = now;
  const expired = await prisma.verify_orders.findMany({ where: { status: 1, expires_at: { lt: new Date() } } }).catch(() => []);
  for (const r of expired) {
    await prisma.verify_orders.update({ where: { id: r.id }, data: { status: 4 } }).catch(() => {});
    await prisma.users.update({ where: { id: r.user_id }, data: { trusted: 0, verified_at: null } }).catch(() => {});
  }
}

/** عدّاد طلبات التوثيق المدفوع المعلقة (لشريط التنبيه الإداري). */
export async function countPendingVerifyOrders(): Promise<{ n: number; oldest: Date | null }> {
  await ensure();
  const [n, first] = await Promise.all([
    prisma.verify_orders.count({ where: { status: 0 } }).catch(() => 0),
    prisma.verify_orders.findFirst({ where: { status: 0 }, orderBy: { id: 'asc' }, select: { created_at: true } }).catch(() => null),
  ]);
  return { n, oldest: first?.created_at ?? null };
}
