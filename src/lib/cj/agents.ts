import 'server-only';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
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

/**
 * بضائع الوكيل المباعة + متابعة الشحن: الطلبات المرتبطة بسلع الوكيل والتي تجاوزت
 * «بانتظار الدفع» (أي بيع مؤكَّد قيد التنفيذ/الشحن). الربط عبر cj_orders.cj_product_id
 * الذي يحمل معرّف السلعة الداخلي. تُرجَع مع بيانات عرض السلعة للوكيل.
 */
export async function listAgentSoldOrders(userId: number | bigint, limit = 100) {
  const products = await prisma.cj_products
    .findMany({ where: { agent_user_id: bid(userId) }, select: { id: true, name_ar: true, name: true, image: true } })
    .catch(() => [] as { id: bigint; name_ar: string; name: string; image: string }[]);
  if (!products.length) return [];
  const idStrs = products.map(p => String(p.id));
  const orders = await prisma.cj_orders
    .findMany({ where: { cj_product_id: { in: idStrs }, NOT: { status: 'awaiting_payment' } }, orderBy: { id: 'desc' }, take: Math.min(Math.max(1, limit), 300) })
    .catch(() => []);
  const byId = new Map(products.map(p => [String(p.id), p]));
  return orders.map(o => ({ order: o, product: byId.get(o.cj_product_id) ?? null }));
}

/** سلع متاحة للاختيار (بلا وكيل، جاهزة، ظاهرة، ولها صورة). */
export async function listClaimableProducts(limit = 60) {
  return prisma.cj_products.findMany({
    where: { agent_user_id: null, status: 'ready', hidden: 0, NOT: { image: '' } },
    orderBy: { id: 'desc' }, take: Math.min(Math.max(1, limit), 200),
  }).catch(() => []);
}

/**
 * روابط تواصل الوكيل (واتساب/اتصال) — تُستخدم في href فقط، دون كتابة الرقم علناً.
 * تُطبَّع الأرقام السعودية إلى صيغة دولية (966) لواتساب.
 */
export function agentContactLinks(a: Pick<CjAgent, 'phone' | 'whatsapp'>): { wa: string | null; tel: string | null } {
  const digits = (s: string) => (s || '').replace(/[^\d+]/g, '');
  const intl = (s: string) => {
    let d = digits(s).replace(/^\+/, '');
    if (!d) return '';
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('966')) return d;
    if (d.startsWith('0')) return '966' + d.slice(1);
    if (d.length === 9) return '966' + d; // 5XXXXXXXX
    return d;
  };
  const waNum = intl(a.whatsapp || a.phone);
  const telNum = intl(a.phone || a.whatsapp);
  return { wa: waNum ? `https://wa.me/${waNum}` : null, tel: telNum ? `tel:+${telNum}` : null };
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

/** Serializes quota checks with other claims and administrative agent deactivation. */
async function lockAgent(tx: Prisma.TransactionClient, uid: bigint) {
  const [agent] = await tx.$queryRaw<Pick<CjAgent, 'user_id' | 'active' | 'weekly_quota'>[]>`SELECT user_id,active,weekly_quota FROM cj_agents WHERE user_id=${uid} FOR UPDATE`;
  return agent?.active === 1 ? agent : null;
}

/** اختيار الوكيل لسلعة ضمن حصّته الأسبوعية (لا يأخذ سلعة لها وكيل آخر). */
export async function claimProduct(userId: number | bigint, productId: number): Promise<ClaimResult> {
  if (!Number.isSafeInteger(productId) || productId <= 0) return { ok: false, error: 'not_found' };
  const uid = bid(userId), id = BigInt(productId);
  return prisma.$transaction(async tx => {
    const agent = await lockAgent(tx, uid);
    if (!agent) return { ok: false, error: 'not_agent' };
    const row = await tx.cj_products.findUnique({ where: { id }, select: { agent_user_id: true, status: true, hidden: true, image: true } });
    if (!row) return { ok: false, error: 'not_found' };
    if (row.agent_user_id === uid) return { ok: true }; // Repeated request must not reset the claim date.
    if (row.agent_user_id !== null) return { ok: false, error: 'taken' };
    if (row.status !== 'ready' || row.hidden !== 0 || !row.image) return { ok: false, error: 'not_found' };
    const used = await tx.cj_products.count({ where: { agent_user_id: uid, agent_claimed_at: { gte: weekStart() } } });
    if (used >= agent.weekly_quota) return { ok: false, error: 'quota_full' };
    const changed = await tx.cj_products.updateMany({ where: { id, agent_user_id: null, status: 'ready', hidden: 0, NOT: { image: '' } }, data: { agent_user_id: uid, agent_claimed_at: new Date() } });
    return changed.count === 1 ? { ok: true } : { ok: false, error: 'taken' };
  }, { isolationLevel: 'ReadCommitted', maxWait: 10000, timeout: 15000 });
}

/** The owner predicate is checked at the write, including after a concurrent reassignment. */
export async function releaseProduct(userId: number | bigint, productId: number): Promise<{ ok: true } | { ok: false; error: 'not_agent' | 'not_yours' }> {
  if (!Number.isSafeInteger(productId) || productId <= 0) return { ok: false, error: 'not_yours' };
  const uid = bid(userId);
  return prisma.$transaction(async tx => {
    if (!await lockAgent(tx, uid)) return { ok: false, error: 'not_agent' };
    const changed = await tx.cj_products.updateMany({ where: { id: BigInt(productId), agent_user_id: uid }, data: { agent_user_id: null, agent_claimed_at: null } });
    return changed.count === 1 ? { ok: true } : { ok: false, error: 'not_yours' };
  }, { isolationLevel: 'ReadCommitted', maxWait: 10000, timeout: 15000 });
}

/** A stale contact form must not restore activation, quota, or administrative notes. */
export async function updateAgentContact(userId: number | bigint, phone: string, whatsapp: string): Promise<boolean> {
  const changed = await prisma.cj_agents.updateMany({ where: { user_id: bid(userId), active: 1 }, data: { phone: phone.trim().slice(0, 40), whatsapp: whatsapp.trim().slice(0, 40) } });
  return changed.count === 1;
}
