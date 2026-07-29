import 'server-only';
import { prisma } from './prisma';

/**
 * مؤشّر سرعة رد البائع — إشارة ثقة قوية لجذب الزبون (كأسلوب OLX/أمازون).
 * يُحسب من محادثات البائع الأخيرة: زمن أول ردّ منه على أول رسالة واردة في كل محادثة،
 * ثم الوسيط (median). يُعرض فقط عند وجود عيّنة كافية (≥3 محادثات) لتفادي التشويش.
 */
export type ResponseSpeed = { label: string; icon: string };

const cache = new Map<number, { at: number; val: ResponseSpeed | null }>();
const TTL = 5 * 60 * 1000; // 5 دقائق

export async function getResponseSpeed(sellerId: number): Promise<ResponseSpeed | null> {
  if (!sellerId) return null;
  const hit = cache.get(sellerId);
  if (hit && Date.now() - hit.at < TTL) return hit.val;
  const val = await compute(sellerId).catch(() => null);
  cache.set(sellerId, { at: Date.now(), val });
  return val;
}

async function compute(sellerId: number): Promise<ResponseSpeed | null> {
  const since = new Date(Date.now() - 60 * 86400000); // آخر ٦٠ يوماً
  const rows = await prisma.chats.findMany({
    where: { OR: [{ sender_id: sellerId }, { reciver_id: sellerId }], created_at: { gte: since } },
    select: { sender_id: true, reciver_id: true, created_at: true },
    orderBy: { created_at: 'asc' },
    take: 800,
  }).catch(() => [] as { sender_id: number; reciver_id: number; created_at: Date | null }[]);
  if (rows.length < 6) return null;

  // اجمع كل محادثة مع طرفها الآخر مرتّبةً زمنياً
  const convos = new Map<number, { t: number; out: boolean }[]>();
  for (const r of rows) {
    if (!r.created_at) continue;
    const other = r.sender_id === sellerId ? r.reciver_id : r.sender_id;
    const arr = convos.get(other) || [];
    arr.push({ t: r.created_at.getTime(), out: r.sender_id === sellerId });
    convos.set(other, arr);
  }
  // زمن أول ردّ من البائع على أول رسالة واردة، لكل محادثة
  const deltasMin: number[] = [];
  for (const arr of convos.values()) {
    const firstIn = arr.find((x) => !x.out);
    if (!firstIn) continue;
    const reply = arr.find((x) => x.out && x.t > firstIn.t);
    if (reply) deltasMin.push((reply.t - firstIn.t) / 60000);
  }
  if (deltasMin.length < 3) return null;
  deltasMin.sort((a, b) => a - b);
  const median = deltasMin[Math.floor(deltasMin.length / 2)];
  if (median <= 15) return { label: 'يرد فوراً', icon: '⚡' };
  if (median <= 60) return { label: 'يرد خلال ساعة', icon: '⚡' };
  if (median <= 360) return { label: 'يرد خلال ساعات', icon: '🕒' };
  if (median <= 1440) return { label: 'يرد خلال يوم', icon: '🕒' };
  return null;
}
