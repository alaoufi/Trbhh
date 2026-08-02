import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';
import { notify } from './notify';

const ensure = ensureSchema;

// مراحل الصفقة (CRM): طلب → تواصل → معاينة → تفاوض → اتفاق → مكتملة (أو ملغى)
export const VIEWING_STATUS: Record<number, string> = {
  0: 'طلب جديد',
  1: 'تواصل',
  2: 'معاينة',
  3: 'تفاوض',
  4: 'اتفاق',
  5: 'صفقة مكتملة',
  6: 'ملغى',
};
// المراحل بالترتيب (لعرض المسار والتقدّم للمرحلة التالية)
export const DEAL_STAGES = [0, 1, 2, 3, 4, 5] as const;
export const DEAL_CANCELLED = 6;

export type ViewingRow = {
  id: number;
  adId: number;
  adTitle: string;
  name: string;
  phone: string;
  preferred: string | null;
  message: string | null;
  note: string | null;
  status: number;
  createdAt: string | null;
  updatedAt: string | null;
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

/** طلبات المعاينة/الصفقات الواردة لصاحب عقار — مع تصفية اختيارية بالمرحلة. */
export async function getOwnerViewings(ownerId: number, stage?: number, take = 200): Promise<ViewingRow[]> {
  await ensure();
  const rows = await prisma.viewing_requests
    .findMany({
      where: { owner_id: BigInt(ownerId), ...(stage !== undefined && stage >= 0 ? { status: stage } : {}) },
      orderBy: [{ status: 'asc' }, { id: 'desc' }],
      take,
    })
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
    note: (r.note as string) || null,
    status: Number(r.status || 0),
    createdAt: r.created_at ? new Date(r.created_at as Date).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at as Date).toISOString() : null,
  }));
}

/** عدد كل مرحلة لصاحب عقار — لشريط CRM (طلب/تواصل/معاينة/تفاوض/اتفاق/مكتملة/ملغى). */
export async function ownerStageCounts(ownerId: number): Promise<Record<number, number>> {
  await ensure();
  const rows = await prisma.viewing_requests
    .groupBy({ by: ['status'], where: { owner_id: BigInt(ownerId) }, _count: { _all: true } })
    .catch(() => [] as { status: number; _count: { _all: number } }[]);
  const out: Record<number, number> = {};
  for (const r of rows) out[Number(r.status)] = r._count._all;
  return out;
}

/** عدد طلبات المعاينة الجديدة (المرحلة 0) لصاحب عقار — لشارة العدّاد. */
export async function countNewViewings(ownerId: number): Promise<number> {
  await ensure();
  return prisma.viewing_requests.count({ where: { owner_id: BigInt(ownerId), status: 0 } }).catch(() => 0);
}

/** عدد الصفقات المكتملة (المرحلة 5) — يظهر في ملف الوسيط. */
export async function dealsCount(ownerId: number): Promise<number> {
  await ensure();
  return prisma.viewing_requests.count({ where: { owner_id: BigInt(ownerId), status: 5 } }).catch(() => 0);
}

/** تحديث مرحلة الصفقة — يتحقّق أن المالك هو صاحبها. */
export async function setViewingStatus(id: number, ownerId: number, status: number): Promise<void> {
  await ensure();
  const st = status >= 0 && status <= 6 ? status : 0;
  await prisma.viewing_requests
    .updateMany({ where: { id: BigInt(id), owner_id: BigInt(ownerId) }, data: { status: st, updated_at: new Date() } })
    .catch(() => {});
}

/** حفظ ملاحظة الوسيط الخاصة على الصفقة (CRM). */
export async function setViewingNote(id: number, ownerId: number, note: string): Promise<void> {
  await ensure();
  await prisma.viewing_requests
    .updateMany({ where: { id: BigInt(id), owner_id: BigInt(ownerId) }, data: { note: note.slice(0, 500) || null } })
    .catch(() => {});
}
