import 'server-only';
import { prisma } from '@/lib/prisma';
import { getStoreShield, getStoreSubPricing } from '@/lib/settings';
import { publicStoreWhere } from '@/lib/store-subscription-access';
import { storeHiddenByBanState } from '@/lib/moderation';

/** Real store identities, with the same eligibility gates as the store directory. */
export async function catalogStores() {
  const [pricing, shield] = await Promise.all([getStoreSubPricing(), getStoreShield().catch(() => true)]);
  const stores = await prisma.stores.findMany({ where: publicStoreWhere(pricing), orderBy: { id: 'desc' }, select: { id: true, user_id: true, store_name: true } });
  const owners = await prisma.users.findMany({ where: { id: { in: stores.map(store => BigInt(store.user_id)) } }, select: { id: true, name: true, userName: true, ban: true, ban_until: true, ban_source: true } });
  const ownerById = new Map(owners.map(owner => [String(owner.id), owner]));
  return stores.flatMap(store => {
    const owner = ownerById.get(String(store.user_id));
    if (!owner || storeHiddenByBanState(owner.ban, owner.ban_until, owner.ban_source, shield)) return [];
    return [{ id: Number(store.id), name: store.store_name?.trim() || owner.name || owner.userName || 'متجر' }];
  });
}

export async function catalogStoreAdIds(storeId: number) {
  if (!(await catalogStores()).some(store => store.id === storeId)) return [];
  const rows = await prisma.store_products.findMany({ where: { store_id: storeId }, select: { ad_id: true } });
  return rows.map(row => BigInt(row.ad_id));
}
