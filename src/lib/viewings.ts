import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';
import { notify } from './notify';

const ensure = ensureSchema;

export const VIEWING_STATUS: Record<number, string> = {
  0: 'جديد',
  1: 'تم التواصل',
  2: 'تمّت المعاينة',
  3: 'مغلق',
};

export type ViewingRow = {
  id: number;
  adId: number;
  adTitle: string;
  name: string;
  phone: string;
  preferred: string | null;
  message: string | null;
  status: number;
  createdAt: string | null;
};

/** إنشاء طلب معاينة وإشعار صاحب العقار (الوسيط/المالك). لا يرمي أبداً. */
export async function createViewingRequest(input: {
  adId: number;
  ownerId: number;
  userId?: number | null;
  name: string;
  phone: string;
  preferred?: string | null;
  message?: string | null;
  adTitle?: string;
}): Promise<boolean> {
  await ensure();
  try {
    await prisma.viewing_requests.create({
      data: {
        ad_id: BigInt(input.adId),
        owner_id: BigInt(input.ownerId),
        user_id: input.userId ? BigInt(input.userId) : null,
        name: input.name.slice(0, 120),
        phone: input.phone.slice(0, 30),
        preferred: input.preferred?.slice(0, 60) || null,
        message: input.message?.slice(0, 500) || null,
        status: 0,
      },
    });
  } catch {
    return false;
  }
  // إشعار صاحب العقار — يظهر في جرس التنبيهات ويُدفع لجهازه
  await notify(input.ownerId, {
    title: `📅 طلب معاينة جديد على «${(input.adTitle || 'عقارك').slice(0, 60)}»`,
    route: '/account/viewings',
    type: 'other',
    body: `${input.name} — ${input.phone}`,
    dedupe: false,
  }).catch(() => {});
  return true;
}

/** طلبات المعاينة الواردة لصاحب عقار (الوسيط/المالك). */
export async function getOwnerViewings(ownerId: number, take = 100): Promise<ViewingRow[]> {
  await ensure();
  const rows = await prisma.viewing_requests
    .findMany({ where: { owner_id: BigInt(ownerId) }, orderBy: [{ status: 'asc' }, { id: 'desc' }], take })
    .catch(() => [] as Array<Record<string, unknown>>);
  if (!rows.length) return [];
  const adIds = [...new Set(rows.map((r) => toInt(r.ad_id as bigint)))];
  const ads = await prisma.ads
    .findMany({ where: { id: { in: adIds.map((n) => BigInt(n)) } }, select: { id: true, title: true } })
    .catch(() => [] as { id: bigint; title: string | null }[]);
  const titles = new Map(ads.map((a) => [toInt(a.id), a.title || '']));
  return rows.map((r) => ({
    id: toInt(r.id as bigint),
    adId: toInt(r.ad_id as bigint),
    adTitle: titles.get(toInt(r.ad_id as bigint)) || `عقار #${toInt(r.ad_id as bigint)}`,
    name: String(r.name || ''),
    phone: String(r.phone || ''),
    preferred: (r.preferred as string) || null,
    message: (r.message as string) || null,
    status: Number(r.status || 0),
    createdAt: r.created_at ? new Date(r.created_at as Date).toISOString() : null,
  }));
}

/** عدد طلبات المعاينة الجديدة (غير المعالَجة) لصاحب عقار — لشارة العدّاد. */
export async function countNewViewings(ownerId: number): Promise<number> {
  await ensure();
  return prisma.viewing_requests.count({ where: { owner_id: BigInt(ownerId), status: 0 } }).catch(() => 0);
}

/** تحديث حالة طلب معاينة — يتحقّق أن المالك هو صاحب الطلب. */
export async function setViewingStatus(id: number, ownerId: number, status: number): Promise<void> {
  await ensure();
  const st = [0, 1, 2, 3].includes(status) ? status : 0;
  await prisma.viewing_requests
    .updateMany({ where: { id: BigInt(id), owner_id: BigInt(ownerId) }, data: { status: st } })
    .catch(() => {});
}
