import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';

const ensure = ensureSchema;

export async function setAdMedia(adId: number | bigint, kind: 'audio' | 'video', path: string) {
  await ensure();
  await prisma.ad_media.upsert({
    where: { ad_id_kind: { ad_id: BigInt(adId), kind } },
    create: { ad_id: BigInt(adId), kind, path },
    update: { path },
  });
}

export async function getAdAudio(adId: number | bigint): Promise<string | null> {
  await ensure();
  const row = await prisma.ad_media.findUnique({ where: { ad_id_kind: { ad_id: BigInt(adId), kind: 'audio' } } }).catch(() => null);
  return row?.path ?? null;
}
