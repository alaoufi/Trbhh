import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
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

const ensureTables = ensureSchema;

/** Increment a user's duplicate-attempt counter and return the new total. */
export async function bumpDupAttempts(userId: number): Promise<number> {
  await ensureTables();
  const row = await prisma.dup_attempts.upsert({
    where: { user_id: BigInt(userId) },
    create: { user_id: BigInt(userId), count: 1 },
    update: { count: { increment: 1 }, updated_at: new Date() },
  });
  return row.count;
}

export async function resetDupAttempts(userId: number) {
  await ensureTables();
  await prisma.dup_attempts.deleteMany({ where: { user_id: BigInt(userId) } }).catch(() => {});
}

/** Increment a strike counter of a given kind and return the new total. */
export async function recordStrike(userId: number, kind: string): Promise<number> {
  await ensureTables();
  const row = await prisma.user_strikes.upsert({
    where: { user_id_kind: { user_id: BigInt(userId), kind } },
    create: { user_id: BigInt(userId), kind, count: 1 },
    update: { count: { increment: 1 }, updated_at: new Date() },
  });
  return row.count;
}

/** Ban a user's account (permanent — used by auto-moderation). */
export async function banUser(userId: number) {
  await prisma.users.update({ where: { id: BigInt(userId) }, data: { ban: 'checked' } }).catch(() => {});
}

/* ---- ban duration (temporary N days / permanent) ---- */
const ensureBanCol = ensureSchema;

/** Auto-lift any temporary bans whose end date has passed.
 *  خانق ٦٠ ثانية: كانت تُنفَّذ مع كل عرض صفحة (ومرتين في صفحة المستخدمين)
 *  فتزاحم حوض الاتصالات وتساهم في تعليق لوحة الإدارة. */
let lastLift = 0;
export async function liftExpiredBans(force = false) {
  if (!force && Date.now() - lastLift < 60_000) return;
  lastLift = Date.now();
  await ensureBanCol();
  await prisma.users.updateMany({
    where: { ban: 'checked', ban_until: { not: null, lt: new Date() } },
    data: { ban: 'no', ban_until: null },
  }).catch(() => {});
}

/** Ban a user for `days` days, or permanently when days ≤ 0. */
export async function banUserFor(userId: number, days: number) {
  await ensureBanCol();
  const until = days > 0 ? new Date(Date.now() + Math.min(days, 3650) * 86_400_000) : null;
  await prisma.users.updateMany({ where: { id: BigInt(userId) }, data: { ban: 'checked', ban_until: until } }).catch(() => {});
}

/** Lift a user's ban. */
export async function unbanUser(userId: number) {
  await ensureBanCol();
  await prisma.users.updateMany({ where: { id: BigInt(userId) }, data: { ban: 'no', ban_until: null } }).catch(() => {});
}

/** Is the user currently banned? (auto-lifts an expired temporary ban first.) */
export async function isUserBanned(userId: number): Promise<boolean> {
  await ensureBanCol();
  const r = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { ban: true, ban_until: true } }).catch(() => null);
  if (!r || r.ban !== 'checked') return false;
  if (r.ban_until && r.ban_until.getTime() < Date.now()) { await unbanUser(userId); return false; }
  return true;
}

/** ban_until (or null=permanent) for currently-banned users among the given ids. */
export async function getBanMap(ids: number[]): Promise<Map<number, Date | null>> {
  await liftExpiredBans();
  const map = new Map<number, Date | null>();
  if (!ids.length) return map;
  const list = ids.map((n) => Number(n)).filter(Number.isFinite);
  if (!list.length) return map;
  const rows = await prisma.users.findMany({
    where: { ban: 'checked', id: { in: list.map((n) => BigInt(n)) } },
    select: { id: true, ban_until: true },
  }).catch(() => []);
  for (const r of rows) map.set(Number(r.id), r.ban_until ?? null);
  return map;
}

/** Write one moderation event to the audit log (best-effort). */
export async function logMod(
  userId: number,
  e: { kind: string; category?: string | null; term?: string | null; snippet?: string | null; action: 'blocked' | 'banned' | 'charged' },
) {
  await ensureTables();
  await prisma.mod_log.create({
    data: {
      user_id: BigInt(userId), kind: e.kind, category: e.category ?? null,
      term: e.term?.slice(0, 160) ?? null, snippet: e.snippet?.slice(0, 300) ?? null, action: e.action,
    },
  }).catch(() => {});
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
  const rows = await prisma.mod_log.findMany({ orderBy: { id: 'desc' }, take: limit }).catch(() => []);
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
