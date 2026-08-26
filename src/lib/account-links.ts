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

export type LinkedAccount = { id: number; name: string; userName: string | null; phone: string | null; hasStore: boolean; storeName: string | null; isAdmin: boolean; mode: 'direct' | 'confirm' };

/** بيانات عرض الحسابات المرتبطة (للمبدّل وللإدارة) — مع تفضيل التبديل لكل حساب. */
export async function linkedAccounts(userId: number): Promise<LinkedAccount[]> {
  const ids = await linkedUserIds(userId);
  if (ids.length <= 1) return [];
  const [users, stores, links] = await Promise.all([
    prisma.users.findMany({ where: { id: { in: ids.map((i) => BigInt(i)) } }, select: { id: true, name: true, userName: true, phoneNumber: true, is_admin: true } }).catch(() => []),
    prisma.stores.findMany({ where: { user_id: { in: ids } }, select: { user_id: true, store_name: true } }).catch(() => []),
    prisma.account_links.findMany({ where: { user_id: { in: ids.map((i) => BigInt(i)) } }, select: { user_id: true, mode: true } }).catch(() => [] as { user_id: bigint; mode: string }[]),
  ]);
  const storeBy = new Map(stores.map((s) => [s.user_id, s.store_name || 'متجر']));
  const modeBy = new Map(links.map((l) => [toInt(l.user_id), l.mode === 'direct' ? 'direct' : 'confirm']));
  return users.map((u) => ({
    id: toInt(u.id), name: u.name || u.userName || `#${toInt(u.id)}`, userName: u.userName ?? null,
    phone: u.phoneNumber ?? null, hasStore: storeBy.has(toInt(u.id)), storeName: storeBy.get(toInt(u.id)) ?? null,
    isAdmin: u.is_admin === 1, mode: (modeBy.get(toInt(u.id)) as 'direct' | 'confirm') ?? 'confirm',
  }));
}

/** Batched summary for administration cards; no credentials, tokens or private data. */
export async function linkedAccountCounts(userIds: number[]): Promise<Map<number, number>> {
  await ensure();
  const result = new Map(userIds.map((id) => [id, 1]));
  if (!userIds.length) return result;
  const links = await prisma.account_links.findMany({
    where: { user_id: { in: userIds.map((id) => BigInt(id)) } },
    select: { user_id: true, group_id: true },
  }).catch(() => [] as { user_id: bigint; group_id: bigint }[]);
  if (!links.length) return result;
  const groups = [...new Set(links.map((link) => link.group_id.toString()))].map((id) => BigInt(id));
  const grouped = await prisma.account_links.groupBy({
    by: ['group_id'], where: { group_id: { in: groups } }, _count: { user_id: true },
  }).catch(() => [] as { group_id: bigint; _count: { user_id: number } }[]);
  const countByGroup = new Map(grouped.map((group) => [group.group_id.toString(), group._count.user_id]));
  for (const link of links) result.set(toInt(link.user_id), countByGroup.get(link.group_id.toString()) ?? 1);
  return result;
}

/** تفضيل التبديل لحساب مرتبط ('direct' | 'confirm'). الافتراضي 'confirm'. */
export async function getLinkMode(userId: number): Promise<'direct' | 'confirm'> {
  await ensure();
  const row = await prisma.account_links.findUnique({ where: { user_id: BigInt(userId) }, select: { mode: true } }).catch(() => null);
  return row?.mode === 'direct' ? 'direct' : 'confirm';
}

/** ضبط تفضيل التبديل لحساب مرتبط — يُسمح فقط إن كان الحساب في مجموعة صاحب الطلب. */
export async function setLinkMode(ownerId: number, targetId: number, mode: 'direct' | 'confirm'): Promise<{ ok: boolean }> {
  await ensure();
  const group = await linkedUserIds(ownerId);
  if (!group.includes(targetId)) return { ok: false };
  await prisma.account_links.update({ where: { user_id: BigInt(targetId) }, data: { mode } }).catch(() => {});
  return { ok: true };
}

/** ربط ذاتي: العضو يثبت ملكية حساب آخر ببياناته (اسم الدخول + كلمة المرور) ثم يُضمّ
 *  لمجموعته. لا يُدمج شيء ولا يُحذف — فقط علاقة «نفس المالك» للتبديل بينهما. */
export async function verifyAndLinkOwn(ownerId: number, identifier: string, password: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  await ensure();
  const { verifyLogin } = await import('./login-core');
  const res = await verifyLogin((identifier || '').trim(), password || '');
  if (!res.ok) return { ok: false, error: res.error };
  if (res.uid === ownerId) return { ok: false, error: 'هذا هو حسابك الحالي — اختر حساباً آخر لك.' };
  // إن كان الحساب الهدف مرتبطاً بمجموعة أخرى (لمالك مختلف) لا تُدمج المجموعات تلقائياً
  const targetGroup = await prisma.account_links.findUnique({ where: { user_id: BigInt(res.uid) }, select: { group_id: true } }).catch(() => null);
  if (targetGroup) {
    const myGroup = await prisma.account_links.findUnique({ where: { user_id: BigInt(ownerId) }, select: { group_id: true } }).catch(() => null);
    if (!myGroup || myGroup.group_id !== targetGroup.group_id) {
      return { ok: false, error: 'هذا الحساب مرتبط بمجموعة أخرى بالفعل. فُكّ ارتباطه أولاً أو راجع الإدارة.' };
    }
    return { ok: true, name: res.name }; // مرتبط أصلاً بمجموعتك
  }
  await linkAccounts([ownerId, res.uid], ownerId);
  return { ok: true, name: res.name };
}

/** ربط حساب أثبت العضو ملكيته (عبر رمز تحقّق وصل لرقمه) بمجموعته — بلا كلمة مرور.
 *  لا يُدمج شيء ولا يُحذف: علاقة «نفس المالك» للتبديل فقط. يحرس ضدّ ربط حساب إداري
 *  أو حساب يخصّ مجموعة مالك آخر. */
export async function linkVerifiedAccount(ownerId: number, targetUid: number): Promise<{ ok: boolean; error?: string; name?: string }> {
  await ensure();
  if (!targetUid || targetUid === ownerId) return { ok: false, error: 'self' };
  const u = await prisma.users.findUnique({ where: { id: BigInt(targetUid) }, select: { name: true, userName: true, is_admin: true } }).catch(() => null);
  if (!u) return { ok: false, error: 'notfound' };
  if (u.is_admin === 1) return { ok: false, error: 'admin' };
  const targetGroup = await prisma.account_links.findUnique({ where: { user_id: BigInt(targetUid) }, select: { group_id: true } }).catch(() => null);
  if (targetGroup) {
    const myGroup = await prisma.account_links.findUnique({ where: { user_id: BigInt(ownerId) }, select: { group_id: true } }).catch(() => null);
    if (!myGroup || myGroup.group_id !== targetGroup.group_id) return { ok: false, error: 'othergroup' };
    return { ok: true, name: u.name || u.userName || 'حساب' }; // مرتبط أصلاً بمجموعتك
  }
  await linkAccounts([ownerId, targetUid], ownerId);
  return { ok: true, name: u.name || u.userName || 'حساب' };
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
  const rows = await prisma.account_links.findMany({ orderBy: { group_id: 'asc' }, select: { user_id: true, group_id: true, mode: true } }).catch(() => []);
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
      isAdmin: u.is_admin === 1, mode: r.mode === 'direct' ? 'direct' : 'confirm',
    });
    byGroup.set(g, arr);
  }
  return [...byGroup.entries()].map(([groupId, members]) => ({ groupId, members })).filter((g) => g.members.length > 1);
}
