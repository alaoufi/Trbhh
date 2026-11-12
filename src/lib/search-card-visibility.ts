import type { Prisma } from '@prisma/client';

type Plan = { id: number; adDays: number };
type Subscription = { userId: number; packageId: number };

/** Mirror card visibility in SQL, before both counting and paging search results. */
export function searchCardVisibility({ plans, defaultDays, subscriptions, bannedIds, now }: {
  plans: Plan[]; defaultDays: number; subscriptions: Subscription[]; bannedIds: bigint[]; now: Date;
}): Prisma.adsWhereInput {
  const planDays = new Map(plans.map((plan) => [plan.id, plan.adDays]));
  const groups = new Map<number, bigint[]>();
  const assigned: bigint[] = [];
  for (const subscription of subscriptions) {
    const days = planDays.get(subscription.packageId);
    if (days === undefined) continue;
    const id = BigInt(subscription.userId);
    assigned.push(id);
    groups.set(days, [...(groups.get(days) || []), id]);
  }
  // With no assigned plans, an unlimited default imposes no age restriction.
  // Prisma drops an empty object inside OR instead of treating it as true.
  if (defaultDays <= 0 && assigned.length === 0) {
    return bannedIds.length ? { user_id: { notIn: bannedIds } } : {};
  }
  const age = (days: number): Prisma.adsWhereInput => days > 0 ? { created_at: { gte: new Date(now.getTime() - days * 86400000) } } : {};
  const regular: Prisma.adsWhereInput[] = [
    { ...(assigned.length ? { user_id: { notIn: assigned } } : {}), ...age(defaultDays) },
    ...[...groups].map(([days, ids]) => ({ user_id: { in: ids }, ...age(days) })),
  ];
  return {
    ...(bannedIds.length ? { user_id: { notIn: bannedIds } } : {}),
    OR: [
      { adsSpecial: 'checked', expires_at: { gt: now } },
      { urgent_until: { gt: now } },
      { created_at: null },
      ...regular,
    ],
  };
}
