import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';

const ensure = ensureSchema;

export async function getUserArea(userId: number): Promise<number | null> {
  await ensure();
  const row = await prisma.user_area.findUnique({ where: { user_id: BigInt(userId) } }).catch(() => null);
  return row ? row.area_id : null;
}

export async function setUserArea(userId: number, areaId: number | null) {
  await ensure();
  if (!areaId) {
    await prisma.user_area.deleteMany({ where: { user_id: BigInt(userId) } }).catch(() => {});
    return;
  }
  await prisma.user_area.upsert({
    where: { user_id: BigInt(userId) },
    create: { user_id: BigInt(userId), area_id: areaId },
    update: { area_id: areaId },
  }).catch(() => {});
}
