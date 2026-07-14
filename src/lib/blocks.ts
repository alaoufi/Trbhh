import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';

const ensure = ensureSchema;

/** حظر عضو (يمنع المراسلة بين الطرفين). لا يحظر نفسه. */
export async function blockUser(blocker: number, blocked: number): Promise<void> {
  if (!blocker || !blocked || blocker === blocked) return;
  await ensure();
  await prisma.user_blocks.upsert({
    where: { blocker_id_blocked_id: { blocker_id: BigInt(blocker), blocked_id: BigInt(blocked) } },
    update: {},
    create: { blocker_id: BigInt(blocker), blocked_id: BigInt(blocked) },
  }).catch(() => {});
}

/** رفع الحظر. */
export async function unblockUser(blocker: number, blocked: number): Promise<void> {
  await ensure();
  await prisma.user_blocks.deleteMany({ where: { blocker_id: BigInt(blocker), blocked_id: BigInt(blocked) } }).catch(() => {});
}

/** هل حظر A العضو B (اتجاه واحد)؟ */
export async function hasBlocked(blocker: number, blocked: number): Promise<boolean> {
  if (!blocker || !blocked) return false;
  await ensure();
  const r = await prisma.user_blocks.findFirst({ where: { blocker_id: BigInt(blocker), blocked_id: BigInt(blocked) }, select: { blocker_id: true } }).catch(() => null);
  return !!r;
}

/** هل حظر أحد الطرفين الآخر (لمنع المراسلة في الاتجاهين)؟ */
export async function blockedBetween(a: number, b: number): Promise<boolean> {
  if (!a || !b) return false;
  await ensure();
  const r = await prisma.user_blocks.findFirst({
    where: { OR: [{ blocker_id: BigInt(a), blocked_id: BigInt(b) }, { blocker_id: BigInt(b), blocked_id: BigInt(a) }] },
    select: { blocker_id: true },
  }).catch(() => null);
  return !!r;
}

/** معرّفات الأعضاء الذين حظرهم هذا العضو. */
export async function listMyBlocks(uid: number): Promise<number[]> {
  await ensure();
  const rows = await prisma.user_blocks.findMany({ where: { blocker_id: BigInt(uid) }, select: { blocked_id: true } }).catch(() => []);
  return rows.map((r) => Number(r.blocked_id));
}
