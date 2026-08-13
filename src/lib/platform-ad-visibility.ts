import 'server-only';
import { getPlatformAdLifecycleConfig } from './settings';

export function platformAdPublicWhere(now: Date, lifecycleEnabled: boolean) {
  if (lifecycleEnabled) {
    return {
      status: 1,
      state: 'active' as const,
      trbhh_until: { gt: now },
    };
  }
  return {
    status: 1,
    state: 'active' as const,
    AND: [{ OR: [{ store_only: 0 }, { trbhh_until: { gt: now } }] }],
  };
}

/**
 * عروض اليوم كانت تسمح سابقاً لمنتجات المتاجر المعتمدة بالظهور في المنصة.
 * نحافظ على ذلك فقط قبل تفعيل السياسة الجديدة؛ بعدها يلزم لكل إعلان استحقاق
 * نشر مستقل حتى لا تتجاوز موافقة المتجر الرسوم الجديدة.
 */
export function platformDealAdPublicWhere(now: Date, lifecycleEnabled: boolean, approvedStoreUserIds: number[]) {
  if (lifecycleEnabled) return platformAdPublicWhere(now, true);
  return {
    status: 1,
    state: 'active' as const,
    AND: [{
      OR: [
        { store_only: 0 },
        { trbhh_until: { gt: now } },
        ...(approvedStoreUserIds.length ? [{ user_id: { in: approvedStoreUserIds } }] : []),
      ],
    }],
  };
}

/** Database-safe predicate for Trbhh public lists. Store-front pages must not use it. */
export async function currentPlatformAdPublicWhere(now = new Date()) {
  const { enabled } = await getPlatformAdLifecycleConfig();
  return platformAdPublicWhere(now, enabled);
}
