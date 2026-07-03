import 'server-only';
import { prisma } from './prisma';
import { toInt } from './utils';

/**
 * Per-member "new since last seen" alerts shown when they open their account:
 * unread messages, new ratings/reviews, and new reports on their ads.
 * Report REPORTERS stay secret (admin-only) — members only see the count.
 */
export type MemberAlerts = { messages: number; reviews: number; reports: number };

let ensured = false;
async function ensure() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS member_seen (
      user_id BIGINT UNSIGNED NOT NULL,
      kind VARCHAR(16) NOT NULL,
      seen_id BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, kind)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `).catch(() => {});
  // let the reported member write a defence/response to a report on their ad
  await prisma.$executeRawUnsafe(`ALTER TABLE repord_ads ADD COLUMN response TEXT NULL`).catch(() => {});
  await prisma.$executeRawUnsafe(`ALTER TABLE repord_ads ADD COLUMN responded_at TIMESTAMP NULL`).catch(() => {});
  ensured = true;
}

async function seenId(userId: number, kind: string): Promise<number> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ seen_id: bigint | number }[]>(
    `SELECT seen_id FROM member_seen WHERE user_id = ? AND kind = ?`, userId, kind,
  ).catch(() => []);
  return Number(rows[0]?.seen_id || 0);
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
  await prisma.$executeRawUnsafe(
    `INSERT INTO member_seen (user_id, kind, seen_id) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE seen_id = GREATEST(seen_id, VALUES(seen_id)), updated_at = CURRENT_TIMESTAMP`,
    userId, kind, maxId,
  ).catch(() => {});
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
  // responses live in columns Prisma doesn't know about → read them raw
  const resp = await prisma.$queryRawUnsafe<{ id: bigint | number; response: string | null }[]>(
    `SELECT id, response FROM repord_ads WHERE id IN (${rows.map(() => '?').join(',') || 'NULL'})`,
    ...rows.map((r) => toInt(r.id)),
  ).catch(() => []);
  const respOf = new Map(resp.map((r) => [toInt(r.id), r.response]));
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
  await prisma.$executeRawUnsafe(
    `UPDATE repord_ads SET response = ?, responded_at = NOW() WHERE id = ?`, text.slice(0, 1000), reportId,
  ).catch(() => {});
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
