import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';

const ensure = ensureSchema;

/** تسجيل إجراء إداري في سجل النشاط — لا يعطّل الإجراء نفسه أبداً. */
export async function logAdmin(adminId: number, action: string, target = '', note = ''): Promise<void> {
  try {
    await ensure();
    await prisma.admin_log.create({
      data: { admin_id: BigInt(adminId), action: action.slice(0, 60), target: target ? target.slice(0, 160) : null, note: note ? note.slice(0, 300) : null },
    });
  } catch { /* audit must never break the action */ }
}

export type AdminLogRow = { id: number; adminId: number; adminName: string; action: string; target: string | null; note: string | null; at: string | null };

/** سجل ما أرسلته الإدارة للمتاجر (إنذارات ورسائل رسمية وإخفاء إعلانات) مع اسم المُرسِل.
 *  مبني من سجل النشاط الإداري، مجمّعاً حسب المتجر. */
export type StoreComm = { id: number; kind: 'warn' | 'message' | 'adhide'; adminName: string; text: string | null; at: string | null };
const STORE_COMM_ACTIONS: Record<string, StoreComm['kind']> = {
  'إنذار متجر': 'warn',
  'رسالة رسمية لتاجر': 'message',
  'إخفاء إعلان متجر عن النشر + إنذار مخالفة': 'adhide',
};
export async function getStoresCommsLog(limit = 500): Promise<Map<number, StoreComm[]>> {
  await ensure();
  const rows = await prisma.admin_log.findMany({
    where: { action: { in: Object.keys(STORE_COMM_ACTIONS) } },
    orderBy: { id: 'desc' }, take: Math.min(1000, limit),
  }).catch(() => []);
  const ids = [...new Set(rows.map((r) => toInt(r.admin_id)))];
  const users = ids.length ? await prisma.users.findMany({ where: { id: { in: ids.map((i) => BigInt(i)) } }, select: { id: true, name: true, userName: true } }).catch(() => []) : [];
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || `#${toInt(u.id)}`]));
  const map = new Map<number, StoreComm[]>();
  for (const r of rows) {
    const m = (r.target || '').match(/متجر #(\d+)/);
    if (!m) continue;
    const sid = Number(m[1]);
    const arr = map.get(sid) || [];
    if (arr.length < 40) {
      arr.push({
        id: toInt(r.id), kind: STORE_COMM_ACTIONS[r.action] || 'message',
        adminName: nameById.get(toInt(r.admin_id)) || `#${toInt(r.admin_id)}`,
        text: r.note, at: r.created_at ? r.created_at.toISOString() : null,
      });
      map.set(sid, arr);
    }
  }
  return map;
}

/** إجمالي أسطر سجل النشاط. */
export async function countAdminLog(): Promise<number> {
  await ensure();
  return prisma.admin_log.count().catch(() => 0);
}

/** قراءة سجل النشاط (الأحدث أولاً) مع أسماء المشرفين. */
export async function listAdminLog(limit = 200, offset = 0): Promise<AdminLogRow[]> {
  await ensure();
  const rows = await prisma.admin_log.findMany({ orderBy: { id: 'desc' }, skip: Math.max(0, offset), take: Math.min(500, limit) }).catch(() => []);
  const ids = [...new Set(rows.map((r) => toInt(r.admin_id)))];
  const users = ids.length ? await prisma.users.findMany({ where: { id: { in: ids.map((i) => BigInt(i)) } }, select: { id: true, name: true, userName: true } }).catch(() => []) : [];
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || `#${toInt(u.id)}`]));
  return rows.map((r) => ({
    id: toInt(r.id), adminId: toInt(r.admin_id), adminName: nameById.get(toInt(r.admin_id)) || `#${toInt(r.admin_id)}`,
    action: r.action, target: r.target, note: r.note, at: r.created_at ? r.created_at.toISOString() : null,
  }));
}
