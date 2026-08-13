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
