import 'server-only';
import { prisma } from '@/lib/prisma';
import { getSetting, setSetting } from '@/lib/settings';

/**
 * نظام الوكلاء: عضو يُمنح دور «وكيل» بجواله وواتسه وحصّة أسبوعية يختار خلالها سلعاً
 * من سلع CJ، فيصبح وكيلها المسؤول عن التواصل ومتابعة الشحن وإتمام البيع. الحصّة
 * الأسبوعية والقيم كلها من الإعدادات/لوحة التحكم — لا قيم ثابتة بالكود.
 */

const QUOTA_KEY = 'cj_agent_weekly_quota';

export type CjAgent = { user_id: bigint; phone: string; whatsapp: string; weekly_quota: number; active: number; notes: string };

const bid = (v: number | bigint) => (typeof v === 'bigint' ? v : BigInt(v));

/** الحصّة الأسبوعية الافتراضية (تُضبط من التحكم). */
export async function defaultAgentWeeklyQuota(): Promise<number> {
  const n = Number(await getSetting(QUOTA_KEY, '10').catch(() => '10'));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10;
}
export async function setDefaultAgentWeeklyQuota(n: number): Promise<void> {
  await setSetting(QUOTA_KEY, String(Math.max(0, Math.floor(n))));
}

export async function getAgent(userId: number | bigint): Promise<CjAgent | null> {
  return prisma.cj_agents.findUnique({ where: { user_id: bid(userId) } }).catch(() => null);
}
export async function isActiveAgent(userId: number | bigint): Promise<boolean> {
  const a = await getAgent(userId);
  return !!a && a.active === 1;
}
export async function listAgents(): Promise<CjAgent[]> {
  return prisma.cj_agents.findMany({ orderBy: { created_at: 'desc' }, take: 200 }).catch(() => []);
}

/** إنشاء/تحديث ملف وكيل. الحصّة الافتراضية إن لم تُمرَّر. */
export async function upsertAgent(input: { userId: number | bigint; phone?: string; whatsapp?: string; weeklyQuota?: number; active?: boolean; notes?: string }): Promise<void> {
  const uid = bid(input.userId);
  const quota = input.weeklyQuota != null ? Math.max(0, Math.floor(input.weeklyQuota)) : await defaultAgentWeeklyQuota();
  const data = {
    phone: (input.phone ?? '').slice(0, 40), whatsapp: (input.whatsapp ?? '').slice(0, 40),
    weekly_quota: quota, active: input.active === false ? 0 : 1, notes: (input.notes ?? '').slice(0, 500),
  };
  await prisma.cj_agents.upsert({ where: { user_id: uid }, create: { user_id: uid, ...data }, update: data }).catch(() => {});
}
export async function setAgentActive(userId: number | bigint, active: boolean): Promise<void> {
  await prisma.cj_agents.update({ where: { user_id: bid(userId) }, data: { active: active ? 1 : 0 } }).catch(() => {});
}

/** بداية النافذة الأسبوعية (آخر ٧ أيام) لاحتساب الحصّة. */
function weekStart(): Date { return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); }

/** عدد السلع التي اختارها الوكيل خلال الأسبوع الجاري. */
export async function agentClaimsThisWeek(userId: number | bigint): Promise<number> {
  return prisma.cj_products.count({ where: { agent_user_id: bid(userId), agent_claimed_at: { gte: weekStart() } } }).catch(() => 0);
}
export async function remainingWeeklyQuota(userId: number | bigint): Promise<number> {
  const agent = await getAgent(userId);
  if (!agent || agent.active !== 1) return 0;
  const used = await agentClaimsThisWeek(userId);
  return Math.max(0, agent.weekly_quota - used);
}

/** سلع الوكيل. */
export async function listAgentProducts(userId: number | bigint, limit = 200) {
  return prisma.cj_products.findMany({ where: { agent_user_id: bid(userId) }, orderBy: { agent_claimed_at: 'desc' }, take: Math.min(Math.max(1, limit), 500) }).catch(() => []);
}

/** إسناد سلعة لوكيل (من الإدارة) — يتجاوز الحصّة. */
export async function assignProductAgent(productId: number, agentUserId: number | bigint): Promise<void> {
  if (!Number.isInteger(productId) || productId <= 0) return;
  await prisma.cj_products.update({ where: { id: BigInt(productId) }, data: { agent_user_id: bid(agentUserId), agent_claimed_at: new Date() } }).catch(() => {});
}
export async function unassignProductAgent(productId: number): Promise<void> {
  if (!Number.isInteger(productId) || productId <= 0) return;
  await prisma.cj_products.update({ where: { id: BigInt(productId) }, data: { agent_user_id: null, agent_claimed_at: null } }).catch(() => {});
}

export type ClaimResult = { ok: true } | { ok: false; error: 'not_agent' | 'quota_full' | 'taken' | 'not_found' };

/** اختيار الوكيل لسلعة ضمن حصّته الأسبوعية (لا يأخذ سلعة لها وكيل آخر). */
export async function claimProduct(userId: number | bigint, productId: number): Promise<ClaimResult> {
  if (!Number.isInteger(productId) || productId <= 0) return { ok: false, error: 'not_found' };
  if (!(await isActiveAgent(userId))) return { ok: false, error: 'not_agent' };
  if ((await remainingWeeklyQuota(userId)) <= 0) return { ok: false, error: 'quota_full' };
  const row = await prisma.cj_products.findUnique({ where: { id: BigInt(productId) }, select: { agent_user_id: true } }).catch(() => null);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.agent_user_id && row.agent_user_id !== bid(userId)) return { ok: false, error: 'taken' };
  await prisma.cj_products.update({ where: { id: BigInt(productId) }, data: { agent_user_id: bid(userId), agent_claimed_at: new Date() } }).catch(() => {});
  return { ok: true };
}
