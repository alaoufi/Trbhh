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

/** Database-safe predicate for Trbhh public lists. Store-front pages must not use it. */
export async function currentPlatformAdPublicWhere(now = new Date()) {
  const { enabled } = await getPlatformAdLifecycleConfig();
  return platformAdPublicWhere(now, enabled);
}
