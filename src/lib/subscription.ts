import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { getStoreSubPricing, subPlanPrice, SUB_PLAN_MONTHS, SUB_PLAN_LABELS, getStoreSubReminderConfig, getSetting, setSetting, SETTING_SUB_REMINDER_MSG, DEFAULT_SUB_REMINDER_MSG, type SubPlan } from './settings';
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

/**
 * Notify store owners whose subscription is approaching expiry, BEFORE it expires.
 * Admin sets "how many days before" and "how many times" in settings; the message
 * text is edited in the Texts tab ({days}/{date} tokens). No background scheduler
 * exists, so this runs LAZILY (called on store/admin page loads) and self-throttles
 * to one sweep per 30 minutes. Dedupe per store per subscription period, ≤ once/day.
 */
export async function sendDueSubReminders(): Promise<void> {
  await ensure();
  const pricing = await getStoreSubPricing();
  if (!pricing.enabled) return;
  const { days, count } = await getStoreSubReminderConfig();
  if (days <= 0 || count <= 0) return;

  // خانق عام: مسح واحد كل ٣٠ دقيقة كحدّ أقصى (لا جدولة خلفية في التطبيق)
  const last = await getSetting('sub_remind_lastrun', '');
  if (last && Date.now() - Date.parse(last) < 30 * 60 * 1000) return;
  await setSetting('sub_remind_lastrun', new Date().toISOString());

  const now = new Date();
  const horizon = new Date(now.getTime() + days * 86400000);
  const rows = await prisma.stores
    .findMany({ where: { sub_until: { gt: now, lte: horizon }, status: 1 }, select: { id: true, user_id: true, sub_until: true } })
    .catch(() => [] as { id: bigint; user_id: number; sub_until: Date | null }[]);
  if (!rows.length) return;

  const { getPrimaryAdminId } = await import('./admin-inbox');
  const { sendChat } = await import('./chat');
  const adminId = await getPrimaryAdminId().catch(() => 0);
  if (!adminId) return;
  const rawMsg = await getSetting(SETTING_SUB_REMINDER_MSG, DEFAULT_SUB_REMINDER_MSG);
  if (!rawMsg.trim()) return;
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const today = ymd(now);

  for (const r of rows) {
    if (!r.sub_until) continue;
    const storeId = Number(r.id);
    const ownerId = Number(r.user_id);
    if (!ownerId) continue;
    const daysLeft = Math.max(0, Math.ceil((r.sub_until.getTime() - now.getTime()) / 86400000));
    const mark = await prisma.store_sub_reminders.findUnique({ where: { store_id: storeId } }).catch(() => null);
    const samePeriod = !!(mark?.sub_until && r.sub_until && mark.sub_until.getTime() === r.sub_until.getTime());
    const sent = samePeriod ? mark!.sent : 0;
    if (sent >= count) continue;                                   // بلغ الحد الأقصى للتنبيهات
    if (samePeriod && mark?.last_sent && ymd(mark.last_sent) === today) continue; // مرة واحدة يومياً

    const body = rawMsg.replace(/\{days\}/g, String(daysLeft)).replace(/\{date\}/g, ymd(r.sub_until));
    await sendChat(adminId, ownerId, body).catch(() => {});
    await prisma.store_sub_reminders
      .upsert({
        where: { store_id: storeId },
        create: { store_id: storeId, sub_until: r.sub_until, sent: 1, last_sent: now },
        update: { sub_until: r.sub_until, sent: sent + 1, last_sent: now },
      })
      .catch(() => {});
  }
}
