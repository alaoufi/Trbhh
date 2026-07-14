import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';

const ensure = ensureSchema;

/** كل معرّفات الحسابات المرتبطة بحساب معيّن (نفس المالك) — يشمل الحساب نفسه. */
export async function linkedUserIds(userId: number): Promise<number[]> {
  await ensure();
  const me = await prisma.account_links.findUnique({ where: { user_id: BigInt(userId) }, select: { group_id: true } }).catch(() => null);
  if (!me) return [userId];
  const rows = await prisma.account_links.findMany({ where: { group_id: me.group_id }, select: { user_id: true } }).catch(() => []);
  const ids = rows.map((r) => toInt(r.user_id));
  return ids.length ? ids : [userId];
}

export type LinkedAccount = { id: number; name: string; userName: string | null; phone: string | null; hasStore: boolean; storeName: string | null; isAdmin: boolean };

/** بيانات عرض الحسابات المرتبطة (للمبدّل وللإدارة). */
export async function linkedAccounts(userId: number): Promise<LinkedAccount[]> {
  const ids = await linkedUserIds(userId);
  if (ids.length <= 1) return [];
  const [users, stores] = await Promise.all([
    prisma.users.findMany({ where: { id: { in: ids.map((i) => BigInt(i)) } }, select: { id: true, name: true, userName: true, phoneNumber: true, is_admin: true } }).catch(() => []),
    prisma.stores.findMany({ where: { user_id: { in: ids } }, select: { user_id: true, store_name: true } }).catch(() => []),
  ]);
  const storeBy = new Map(stores.map((s) => [s.user_id, s.store_name || 'متجر']));
  return users.map((u) => ({
    id: toInt(u.id), name: u.name || u.userName || `#${toInt(u.id)}`, userName: u.userName ?? null,
    phone: u.phoneNumber ?? null, hasStore: storeBy.has(toInt(u.id)), storeName: storeBy.get(toInt(u.id)) ?? null,
    isAdmin: u.is_admin === 1,
  }));
}

/** ربط مجموعة حسابات معاً في مجموعة واحدة (دمج مجموعاتها القائمة إن وُجدت). */
export async function linkAccounts(userIds: number[], adminId: number): Promise<{ ok: boolean; count: number }> {
  await ensure();
  const uniq = [...new Set(userIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (uniq.length < 2) return { ok: false, count: 0 };
  // اجمع كل المجموعات القائمة لأي من هؤلاء لتوحيدها تحت مجموعة واحدة
  const existing = await prisma.account_links.findMany({ where: { user_id: { in: uniq.map((i) => BigInt(i)) } }, select: { group_id: true } }).catch(() => []);
  const groupId = existing.length ? existing[0].group_id : BigInt(Math.min(...uniq));
  // كل الأعضاء الحاليين في أي من هذه المجموعات + الجدد → مجموعة واحدة
  const groupIds = [...new Set(existing.map((e) => e.group_id.toString()))].map((s) => BigInt(s));
  const membersOfGroups = groupIds.length
    ? await prisma.account_links.findMany({ where: { group_id: { in: groupIds } }, select: { user_id: true } }).catch(() => [])
    : [];
  const all = [...new Set([...uniq, ...membersOfGroups.map((m) => toInt(m.user_id))])];
  for (const uid of all) {
    await prisma.account_links.upsert({
      where: { user_id: BigInt(uid) },
      update: { group_id: groupId, linked_by: BigInt(adminId) },
      create: { user_id: BigInt(uid), group_id: groupId, linked_by: BigInt(adminId) },
    }).catch(() => {});
  }
  return { ok: true, count: all.length };
}

/** فك حساب واحد من مجموعته. إن بقي في المجموعة عضو واحد يُفكّ هو الآخر (لا معنى لمجموعة بعضو واحد). */
export async function unlinkAccount(userId: number): Promise<void> {
  await ensure();
  const me = await prisma.account_links.findUnique({ where: { user_id: BigInt(userId) }, select: { group_id: true } }).catch(() => null);
  await prisma.account_links.delete({ where: { user_id: BigInt(userId) } }).catch(() => {});
  if (me) {
    const left = await prisma.account_links.findMany({ where: { group_id: me.group_id }, select: { user_id: true } }).catch(() => []);
    if (left.length === 1) await prisma.account_links.delete({ where: { user_id: left[0].user_id } }).catch(() => {});
  }
}

export type LinkGroup = { groupId: number; members: LinkedAccount[] };

/** كل مجموعات الربط (للتبويب الإداري «ربط الأعضاء»). */
export async function listLinkGroups(): Promise<LinkGroup[]> {
  await ensure();
  const rows = await prisma.account_links.findMany({ orderBy: { group_id: 'asc' }, select: { user_id: true, group_id: true } }).catch(() => []);
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => toInt(r.user_id)))];
  const [users, stores] = await Promise.all([
    prisma.users.findMany({ where: { id: { in: ids.map((i) => BigInt(i)) } }, select: { id: true, name: true, userName: true, phoneNumber: true, is_admin: true } }).catch(() => []),
    prisma.stores.findMany({ where: { user_id: { in: ids } }, select: { user_id: true, store_name: true } }).catch(() => []),
  ]);
  const storeBy = new Map(stores.map((s) => [s.user_id, s.store_name || 'متجر']));
  const userBy = new Map(users.map((u) => [toInt(u.id), u]));
  const byGroup = new Map<number, LinkedAccount[]>();
  for (const r of rows) {
    const g = toInt(r.group_id);
    const u = userBy.get(toInt(r.user_id));
    if (!u) continue;
    const arr = byGroup.get(g) || [];
    arr.push({
      id: toInt(u.id), name: u.name || u.userName || `#${toInt(u.id)}`, userName: u.userName ?? null,
      phone: u.phoneNumber ?? null, hasStore: storeBy.has(toInt(u.id)), storeName: storeBy.get(toInt(u.id)) ?? null,
      isAdmin: u.is_admin === 1,
    });
    byGroup.set(g, arr);
  }
  return [...byGroup.entries()].map(([groupId, members]) => ({ groupId, members })).filter((g) => g.members.length > 1);
}
