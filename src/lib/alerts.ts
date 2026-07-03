import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';

/**
 * Per-member "new since last seen" alerts shown when they open their account:
 * unread messages, new ratings/reviews, and new reports on their ads.
 * Report REPORTERS stay secret (admin-only) — members only see the count.
 */
export type MemberAlerts = { messages: number; reviews: number; reports: number };

const ensure = ensureSchema;

async function seenId(userId: number, kind: string): Promise<number> {
  await ensure();
  const row = await prisma.member_seen.findUnique({ where: { user_id_kind: { user_id: BigInt(userId), kind } } }).catch(() => null);
  return Number(row?.seen_id ?? 0);
}

/** Mark a category as seen up to the newest current item (clears the alert). */
export async function markSeen(userId: number, kind: 'reviews' | 'reports') {
  await ensure();
  let maxId = 0;
  if (kind === 'reviews') {
    const r = await prisma.reviews.findFirst({ where: { reciver_id: BigInt(userId) }, orderBy: { id: 'desc' }, select: { id: true } });
    maxId = r ? toInt(r.id) : 0;
  } else {
    const adIds = await myAdIds(userId);
    if (adIds.length) {
      const r = await prisma.repord_ads.findFirst({ where: { ads_id: { in: adIds } }, orderBy: { id: 'desc' }, select: { id: true } });
      maxId = r ? toInt(r.id) : 0;
    }
  }
  // never regress the watermark (the raw version used GREATEST)
  const key = { user_id_kind: { user_id: BigInt(userId), kind } };
  const cur = await prisma.member_seen.findUnique({ where: key }).catch(() => null);
  const next = BigInt(Math.max(maxId, Number(cur?.seen_id ?? 0)));
  await prisma.member_seen.upsert({
    where: key,
    create: { user_id: BigInt(userId), kind, seen_id: next },
    update: { seen_id: next, updated_at: new Date() },
  }).catch(() => {});
}

async function myAdIds(userId: number): Promise<number[]> {
  const ads = await prisma.ads.findMany({ where: { user_id: BigInt(userId) }, select: { id: true } });
  return ads.map((a) => toInt(a.id));
}

export async function getMemberAlerts(userId: number): Promise<MemberAlerts> {
  const [unread, reviewsSeen, reportsSeen, adIds] = await Promise.all([
    prisma.chats.count({ where: { reciver_id: userId, is_read: 0 } }),
    seenId(userId, 'reviews'),
    seenId(userId, 'reports'),
    myAdIds(userId),
  ]);
  const [reviews, reports] = await Promise.all([
    prisma.reviews.count({ where: { reciver_id: BigInt(userId), id: { gt: BigInt(reviewsSeen) } } }),
    adIds.length ? prisma.repord_ads.count({ where: { ads_id: { in: adIds }, id: { gt: BigInt(reportsSeen) } } }) : Promise.resolve(0),
  ]);
  return { messages: unread, reviews, reports };
}

/** Reports filed against the member's ads — reporter identity is NOT included. */
export async function getMyAdReports(userId: number) {
  await ensure();
  const adIds = await myAdIds(userId);
  if (!adIds.length) return [];
  const rows = await prisma.repord_ads.findMany({ where: { ads_id: { in: adIds } }, orderBy: { id: 'desc' }, take: 100 });
  const ads = await prisma.ads.findMany({ where: { id: { in: rows.map((r) => BigInt(r.ads_id)) } }, select: { id: true, title: true } });
  const titleOf = new Map(ads.map((a) => [toInt(a.id), a.title]));
  const reasons = await prisma.report_resons.findMany().catch(() => [] as { id: bigint | number; reason: string }[]);
  const reasonOf = new Map(reasons.map((r) => [toInt(r.id), r.reason]));
  // schema.prisma now declares repord_ads.response — it's already on the rows
  const respOf = new Map(rows.map((r) => [toInt(r.id), r.response]));
  return rows.map((r) => ({
    id: toInt(r.id),
    adId: r.ads_id,
    adTitle: titleOf.get(r.ads_id) || `#${r.ads_id}`,
    reason: reasonOf.get(r.reason_id) || null,
    comment: r.comment || null,
    response: respOf.get(toInt(r.id)) || null,
    at: r.created_at ? r.created_at.toISOString() : null,
  }));
}

/** The reported member writes a response/defence to a report on THEIR ad. */
export async function respondToReport(userId: number, reportId: number, text: string): Promise<boolean> {
  await ensure();
  const adIds = await myAdIds(userId);
  if (!adIds.length) return false;
  const rep = await prisma.repord_ads.findFirst({ where: { id: BigInt(reportId), ads_id: { in: adIds } }, select: { id: true } });
  if (!rep) return false; // not a report on my ad
  await prisma.repord_ads.updateMany({
    where: { id: BigInt(reportId) },
    data: { response: text.slice(0, 1000), responded_at: new Date() },
  }).catch(() => {});
  return true;
}

/** Admin view: reports with the member's response (reporter still shown to admin). */
export async function getReportResponse(reportId: number): Promise<string | null> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ response: string | null }[]>(
    `SELECT response FROM repord_ads WHERE id = ?`, reportId,
  ).catch(() => []);
  return rows[0]?.response || null;
}
