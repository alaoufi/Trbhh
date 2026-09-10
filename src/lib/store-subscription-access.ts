import type { Prisma } from '@prisma/client';

type SubscriptionPolicy = { enabled: boolean; graceDays: number };
export type SubState = 'off' | 'none' | 'active' | 'grace' | 'suspended';

/** Same entitlement calculation for the public directory, promotions and store detail. */
export function storeSubscriptionState(until: Date | null, policy: SubscriptionPolicy, now = new Date()): SubState {
  if (!policy.enabled) return 'off';
  if (!until) return 'none';
  if (until >= now) return 'active';
  return until.getTime() + Math.max(0, policy.graceDays) * 86400000 >= now.getTime() ? 'grace' : 'suspended';
}

/** Apply before ordering/limiting so inactive stores never consume a public slot.
 * Administrative placement grants are a separate condition, never a subscription bypass.
 * Null subscriptions keep the existing detail-page semantics (state = none).
 */
export function publicStoreWhere(policy: SubscriptionPolicy, now = new Date()): Prisma.storesWhereInput {
  if (!policy.enabled) return { status: 1 };
  return { status: 1, OR: [{ sub_until: null }, { sub_until: { gte: new Date(now.getTime() - Math.max(0, policy.graceDays) * 86400000) } }] };
}

export type StoreSubscriptionAccess = {
  action: 'renew' | 'topup';
  shortfall: number;
  message: string;
};

/** Explains an expired store subscription in terms of the owner's usable wallet balance. */
export function subscriptionAccessMessage({ balance, lowestPlanPrice }: { balance: number; lowestPlanPrice: number }): StoreSubscriptionAccess {
  const shortfall = Math.max(0, Math.round((lowestPlanPrice - balance) * 100) / 100);
  if (shortfall === 0) {
    return {
      action: 'renew',
      shortfall,
      message: 'انتهى اشتراك متجرك وأُوقف النشر منه مؤقتاً. رصيدك يكفي للتجديد الآن.',
    };
  }
  return {
    action: 'topup',
    shortfall,
    message: `انتهى اشتراك متجرك وأُوقف النشر منه مؤقتاً. تحتاج إلى شحن ${shortfall.toFixed(2)} ر.س على الأقل ثم تجديد الاشتراك.`,
  };
}
