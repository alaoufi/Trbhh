import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { getStoreSubPricing, subPlanPrice, SUB_PLAN_MONTHS, SUB_PLAN_LABELS, type SubPlan } from './settings';
import { charge } from './wallet';
import { storeIdOfUser } from './merchant';

const ensure = ensureSchema;

export type SubState = 'off' | 'none' | 'active' | 'grace' | 'suspended';
export type StoreSub = {
  state: SubState;
  until: Date | null;
  graceUntil: Date | null;
  daysLeft: number;      // days until expiry (active) — negative once expired
  graceDaysLeft: number; // days left in grace before suspension
  enabled: boolean;
  graceDays: number;
};

/** Compute a store's subscription state (enforcement respects the admin toggle). */
export async function getStoreSub(storeId: number): Promise<StoreSub> {
  await ensure();
  const pricing = await getStoreSubPricing();
  const row = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { sub_until: true } }).catch(() => null);
  const until = row?.sub_until ? new Date(row.sub_until) : null;
  const now = Date.now();
  const graceMs = pricing.graceDays * 86400000;
  const graceUntil = until ? new Date(until.getTime() + graceMs) : null;
  const daysLeft = until ? Math.ceil((until.getTime() - now) / 86400000) : 0;
  const graceDaysLeft = graceUntil ? Math.ceil((graceUntil.getTime() - now) / 86400000) : 0;

  let state: SubState;
  if (!pricing.enabled) state = 'off';
  else if (!until) state = 'none';
  else if (until.getTime() >= now) state = 'active';
  else if (graceUntil && graceUntil.getTime() >= now) state = 'grace';
  else state = 'suspended';

  return { state, until, graceUntil, daysLeft, graceDaysLeft, enabled: pricing.enabled, graceDays: pricing.graceDays };
}

/** Is the store hidden from public display due to an expired subscription? Owner/admin still see it. */
export async function isStoreSubBlocked(storeId: number): Promise<boolean> {
  const s = await getStoreSub(storeId);
  return s.state === 'suspended';
}

/** Subscribe/renew the caller's store to a plan, charging their wallet. Extends from the
 *  later of now / current expiry (so renewing early never loses remaining days). */
export async function subscribeStore(userId: number, plan: SubPlan): Promise<{ ok: boolean; error?: string; until?: Date }> {
  await ensure();
  const storeId = await storeIdOfUser(userId);
  if (!storeId) return { ok: false, error: 'لا يوجد متجر.' };
  const pricing = await getStoreSubPricing();
  const months = SUB_PLAN_MONTHS[plan];
  const price = subPlanPrice(pricing, plan);
  const paid = await charge(userId, price, 'subscription', `اشتراك متجر (${SUB_PLAN_LABELS[plan]})`);
  if (!paid.ok) return { ok: false, error: 'الرصيد غير كافٍ. اشحن رصيدك ثم أعد المحاولة.' };
  const cur = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { sub_until: true } }).catch(() => null);
  const base = cur?.sub_until && new Date(cur.sub_until).getTime() > Date.now() ? new Date(cur.sub_until) : new Date();
  const until = new Date(base);
  until.setMonth(until.getMonth() + months);
  await prisma.stores.updateMany({ where: { id: BigInt(storeId) }, data: { sub_until: until } }).catch(() => {});
  return { ok: true, until };
}

/** Admin sets a store's subscription expiry directly (grant/extend/clear). */
export async function adminSetStoreSub(storeId: number, until: Date | null): Promise<void> {
  await ensure();
  await prisma.stores.updateMany({ where: { id: BigInt(storeId) }, data: { sub_until: until } }).catch(() => {});
}
