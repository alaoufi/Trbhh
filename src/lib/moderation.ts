import 'server-only';
import { prisma } from './prisma';
import type { GuardCategory } from './content-guard';

/** Max duplicate attempts before the account is banned. */
export const DUP_LIMIT = 3;
/**
 * Prohibited-content policy: immoral content bans on the FIRST attempt.
 * Security/political/drugs content is blocked, and the SECOND attempt bans —
 * i.e. "if the member repeats, ban without hesitation".
 */
export const CONTENT_STRIKE_LIMIT = 2;

/** Hard anti-flood floor — applies to EVERY member regardless of package. */
export const FLOOD = {
  minGapSec: 25, // minimum seconds between two consecutive publishes
  windowMin: 10, // rolling short window…
  maxInWindow: 4, // …max publishes allowed inside it
  perHour: 12, // max publishes in a rolling hour
};

let ensured = false;
async function ensureTables() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dup_attempts (
      user_id BIGINT UNSIGNED NOT NULL,
      count INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // generic strike counter keyed by (user, kind): content | flood | …
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_strikes (
      user_id BIGINT UNSIGNED NOT NULL,
      kind VARCHAR(16) NOT NULL,
      count INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, kind)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // audit trail the admin can review
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mod_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      kind VARCHAR(16) NOT NULL,
      category VARCHAR(16) NULL,
      term VARCHAR(160) NULL,
      snippet VARCHAR(300) NULL,
      action VARCHAR(16) NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX mod_log_user (user_id),
      INDEX mod_log_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

/** Increment a user's duplicate-attempt counter and return the new total. */
export async function bumpDupAttempts(userId: number): Promise<number> {
  await ensureTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO dup_attempts (user_id, count) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE count = count + 1, updated_at = CURRENT_TIMESTAMP`,
    userId,
  );
  const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `SELECT count FROM dup_attempts WHERE user_id = ?`, userId,
  );
  return Number(rows[0]?.count || 0);
}

export async function resetDupAttempts(userId: number) {
  await ensureTables();
  await prisma.$executeRawUnsafe(`DELETE FROM dup_attempts WHERE user_id = ?`, userId).catch(() => {});
}

/** Increment a strike counter of a given kind and return the new total. */
export async function recordStrike(userId: number, kind: string): Promise<number> {
  await ensureTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO user_strikes (user_id, kind, count) VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE count = count + 1, updated_at = CURRENT_TIMESTAMP`,
    userId, kind,
  );
  const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `SELECT count FROM user_strikes WHERE user_id = ? AND kind = ?`, userId, kind,
  );
  return Number(rows[0]?.count || 0);
}

/** Ban a user's account (permanent — used by auto-moderation). */
export async function banUser(userId: number) {
  await prisma.users.update({ where: { id: BigInt(userId) }, data: { ban: 'checked' } }).catch(() => {});
}

/* ---- ban duration (temporary N days / permanent) ---- */
let banColEnsured = false;
async function ensureBanCol() {
  if (banColEnsured) return;
  await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN ban_until DATETIME NULL`).catch(() => {});
  banColEnsured = true;
}

/** Auto-lift any temporary bans whose end date has passed. */
export async function liftExpiredBans() {
  await ensureBanCol();
  await prisma.$executeRawUnsafe(`UPDATE users SET ban = 'no', ban_until = NULL WHERE ban = 'checked' AND ban_until IS NOT NULL AND ban_until < NOW()`).catch(() => {});
}

/** Ban a user for `days` days, or permanently when days ≤ 0. */
export async function banUserFor(userId: number, days: number) {
  await ensureBanCol();
  if (days > 0) {
    await prisma.$executeRawUnsafe(`UPDATE users SET ban = 'checked', ban_until = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id = ?`, Math.min(days, 3650), userId).catch(() => {});
  } else {
    await prisma.$executeRawUnsafe(`UPDATE users SET ban = 'checked', ban_until = NULL WHERE id = ?`, userId).catch(() => {});
  }
}

/** Lift a user's ban. */
export async function unbanUser(userId: number) {
  await ensureBanCol();
  await prisma.$executeRawUnsafe(`UPDATE users SET ban = 'no', ban_until = NULL WHERE id = ?`, userId).catch(() => {});
}

/** Is the user currently banned? (auto-lifts an expired temporary ban first.) */
export async function isUserBanned(userId: number): Promise<boolean> {
  await ensureBanCol();
  const rows = await prisma.$queryRawUnsafe<{ ban: string | null; ban_until: Date | null }[]>(`SELECT ban, ban_until FROM users WHERE id = ?`, userId).catch(() => []);
  const r = rows[0];
  if (!r || r.ban !== 'checked') return false;
  if (r.ban_until && new Date(r.ban_until).getTime() < Date.now()) { await unbanUser(userId); return false; }
  return true;
}

/** ban_until (or null=permanent) for currently-banned users among the given ids. */
export async function getBanMap(ids: number[]): Promise<Map<number, Date | null>> {
  await liftExpiredBans();
  const map = new Map<number, Date | null>();
  if (!ids.length) return map;
  const list = ids.map((n) => Number(n)).filter(Number.isFinite);
  if (!list.length) return map;
  const rows = await prisma.$queryRawUnsafe<{ id: number | bigint; ban_until: Date | null }[]>(
    `SELECT id, ban_until FROM users WHERE ban = 'checked' AND id IN (${list.map(() => '?').join(',')})`, ...list,
  ).catch(() => []);
  for (const r of rows) map.set(Number(r.id), r.ban_until ? new Date(r.ban_until) : null);
  return map;
}

/** Write one moderation event to the audit log (best-effort). */
export async function logMod(
  userId: number,
  e: { kind: string; category?: string | null; term?: string | null; snippet?: string | null; action: 'blocked' | 'banned' },
) {
  await ensureTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO mod_log (user_id, kind, category, term, snippet, action) VALUES (?, ?, ?, ?, ?, ?)`,
    userId, e.kind, e.category ?? null, (e.term ?? null)?.slice?.(0, 160) ?? null, (e.snippet ?? null)?.slice?.(0, 300) ?? null, e.action,
  ).catch(() => {});
}

export type ProhibitedOutcome = { banned: boolean; left: number; category: GuardCategory };

/**
 * Central policy for a prohibited-content hit found in an ad/classified.
 * • immoral → ban immediately.
 * • drugs / weapons / political → strike; ban once the strike limit is reached.
 * Logs the event either way. Returns whether the account was banned and how
 * many attempts remain before it will be.
 */
export async function handleProhibited(
  userId: number,
  category: GuardCategory,
  term: string,
  snippet: string,
): Promise<ProhibitedOutcome> {
  if (category === 'immoral') {
    await banUser(userId);
    await logMod(userId, { kind: 'content', category, term, snippet, action: 'banned' });
    return { banned: true, left: 0, category };
  }
  const n = await recordStrike(userId, 'content');
  const banned = n >= CONTENT_STRIKE_LIMIT;
  if (banned) await banUser(userId);
  await logMod(userId, { kind: 'content', category, term, snippet, action: banned ? 'banned' : 'blocked' });
  return { banned, left: Math.max(0, CONTENT_STRIKE_LIMIT - n), category };
}

/**
 * Hard anti-flood floor applied to every member before a publish, on top of any
 * package limits. Returns how long they must wait when they are posting too fast.
 */
export async function checkFlood(userId: number): Promise<{ blocked: boolean; waitSec: number }> {
  const now = Date.now();
  const hourAgo = new Date(now - 3600_000);
  const rows = await prisma.ads.findMany({
    where: { user_id: BigInt(userId), created_at: { gte: hourAgo } },
    select: { created_at: true },
    orderBy: { created_at: 'desc' },
  }).catch(() => [] as { created_at: Date | null }[]);

  const times = rows.map((r) => (r.created_at ? r.created_at.getTime() : 0)).filter(Boolean);
  // 1) minimum gap since the last publish
  if (times.length) {
    const sinceSec = (now - times[0]) / 1000;
    if (sinceSec < FLOOD.minGapSec) return blocked(FLOOD.minGapSec - sinceSec, userId);
  }
  // 2) short-window burst
  const windowMs = FLOOD.windowMin * 60_000;
  const inWindow = times.filter((t) => now - t < windowMs).length;
  if (inWindow >= FLOOD.maxInWindow) {
    const oldest = Math.min(...times.filter((t) => now - t < windowMs));
    return blocked((windowMs - (now - oldest)) / 1000, userId);
  }
  // 3) hourly cap
  if (times.length >= FLOOD.perHour) {
    const oldest = Math.min(...times);
    return blocked((3600_000 - (now - oldest)) / 1000, userId);
  }
  return { blocked: false, waitSec: 0 };
}

async function blocked(waitSec: number, userId: number): Promise<{ blocked: boolean; waitSec: number }> {
  const wait = Math.max(1, Math.ceil(waitSec));
  await recordStrike(userId, 'flood').catch(() => {});
  await logMod(userId, { kind: 'flood', action: 'blocked', snippet: `wait ${wait}s` });
  return { blocked: true, waitSec: wait };
}

/** Recent moderation events for the admin log (newest first). */
export async function getModLog(limit = 200): Promise<{
  id: number; userId: number; kind: string; category: string | null; term: string | null; snippet: string | null; action: string; createdAt: string | null;
}[]> {
  await ensureTables();
  const rows = await prisma.$queryRawUnsafe<{ id: number; user_id: bigint | number; kind: string; category: string | null; term: string | null; snippet: string | null; action: string; created_at: Date | null }[]>(
    `SELECT id, user_id, kind, category, term, snippet, action, created_at FROM mod_log ORDER BY id DESC LIMIT ?`, limit,
  ).catch(() => []);
  return rows.map((r) => ({
    id: Number(r.id),
    userId: Number(r.user_id),
    kind: r.kind,
    category: r.category,
    term: r.term,
    snippet: r.snippet,
    action: r.action,
    createdAt: r.created_at ? r.created_at.toISOString() : null,
  }));
}
