import { describe, expect, it } from 'vitest';
import { subscriptionAccessMessage } from '@/lib/store-subscription-access';

describe('store subscription access message', () => {
  it('directs a suspended store owner with enough balance to renew instead of showing a generic error', () => {
    expect(subscriptionAccessMessage({ balance: 100, lowestPlanPrice: 50 })).toEqual({
      action: 'renew',
      shortfall: 0,
      message: 'انتهى اشتراك متجرك وأُوقف النشر منه مؤقتاً. رصيدك يكفي للتجديد الآن.',
    });
  });

  it('states the exact top-up shortfall when the wallet cannot cover renewal', () => {
    expect(subscriptionAccessMessage({ balance: 12.5, lowestPlanPrice: 50 })).toEqual({
      action: 'topup',
      shortfall: 37.5,
      message: 'انتهى اشتراك متجرك وأُوقف النشر منه مؤقتاً. تحتاج إلى شحن 37.50 ر.س على الأقل ثم تجديد الاشتراك.',
    });
  });
});
