/** مجموعات الأرشفة حسب مدة بقاء الإعلان في باقة صاحبه — نفس قاعدة رؤية البطاقات تماماً:
 *  العضو المشترك تُطبَّق عليه مدة باقته، وغيره مدة الباقة الافتراضية؛ المدة 0 = بلا انتهاء. */
export type ExpiryGroup = { userIn?: bigint[]; userNotIn?: bigint[]; cutoff: Date };

export function packageExpiryGroups({ plans, defaultDays, subscriptions, now }: {
  plans: { id: number; adDays: number }[]; defaultDays: number;
  subscriptions: { userId: number; packageId: number }[]; now: Date;
}): ExpiryGroup[] {
  const planDays = new Map(plans.map((plan) => [plan.id, plan.adDays]));
  const byDays = new Map<number, bigint[]>();
  const assigned: bigint[] = [];
  for (const sub of subscriptions) {
    const days = planDays.get(sub.packageId);
    if (days === undefined) continue; // باقة غير نشطة ⇒ يُعامل بالافتراضية
    const id = BigInt(sub.userId);
    assigned.push(id);
    byDays.set(days, [...(byDays.get(days) || []), id]);
  }
  const cutoff = (days: number) => new Date(now.getTime() - days * 86400000);
  const groups: ExpiryGroup[] = [];
  if (defaultDays > 0) groups.push({ ...(assigned.length ? { userNotIn: assigned } : {}), cutoff: cutoff(defaultDays) });
  for (const [days, ids] of byDays) if (days > 0) groups.push({ userIn: ids, cutoff: cutoff(days) });
  return groups;
}
