import 'server-only';
import { prisma } from './prisma';
import { storeIdByHandle, collaboratorAds } from './merchant';
import { storeSubscriptionState } from './store-subscription-access';
import { storeHiddenByBanState } from './moderation';
import { SETTING_SUB_ENABLED, SETTING_SUB_GRACE_DAYS, SETTING_STORE_SHIELD } from './settings';

function positiveId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Store entitlement, not platform entitlement. No promotion, renewal or ban mutations. */
export async function storeProductAccess(id: string, adId: string) {
  const productId = positiveId(adId);
  if (!productId) return null;
  if (!/^\d+$/.test(id) && !/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/i.test(id)) return null;
  try {
    const storeId = /^\d+$/.test(id) ? positiveId(id) : await storeIdByHandle(id);
    if (!storeId || !Number.isSafeInteger(storeId) || storeId <= 0) return null;
    const [store, ad, settings] = await Promise.all([
      prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { user_id: true, status: true, sub_until: true } }),
      prisma.ads.findUnique({ where: { id: BigInt(productId) }, select: { status: true, state: true, data_archive: true, paused_by_owner: true, publish_at: true } }),
      // The general settings loader swallows database errors. Authorization must not.
      prisma.site_settings.findMany({ where: { k: { in: [SETTING_SUB_ENABLED, SETTING_SUB_GRACE_DAYS, SETTING_STORE_SHIELD] } }, select: { k: true, v: true } }),
    ]);
    if (!store || !ad) return null;
    const ownerId = Number(store.user_id);
    const owner = await prisma.users.findUnique({ where: { id: BigInt(ownerId) }, select: { ban: true, ban_until: true, ban_source: true } });
    if (!owner) return null;
    const product = await prisma.store_products.findFirst({ where: { store_id: storeId, ad_id: productId }, select: { ad_id: true } });
    if (!product && !(await collaboratorAds(storeId)).some((p) => p.id === productId)) return null;
    const values = new Map(settings.map((row) => [row.k, row.v]));
    const bool = (key: string, fallback: string) => {
      const value = values.get(key) ?? fallback;
      return value !== '0' && value !== '' && value.toLowerCase() !== 'false';
    };
    const parsedGrace = parseInt(values.get(SETTING_SUB_GRACE_DAYS) ?? '10', 10);
    const policy = { enabled: bool(SETTING_SUB_ENABLED, '0'), graceDays: Math.max(0, Number.isFinite(parsedGrace) ? parsedGrace : 10) };
    const now = new Date();
    const publicVisible = store.status === 1
      && storeSubscriptionState(store.sub_until, policy, now) !== 'suspended'
      && !storeHiddenByBanState(owner.ban, owner.ban_until, owner.ban_source, bool(SETTING_STORE_SHIELD, '1'))
      && ad.status === 1 && ad.state === 'active'
      && (ad.data_archive === null || ad.data_archive === '')
      && ad.paused_by_owner === 0
      && (ad.publish_at === null || ad.publish_at.getTime() <= now.getTime());
    return { storeId, productId, ownerId, publicVisible };
  } catch {
    // Missing policy/schema/database data denies both content and inspection.
    return null;
  }
}
