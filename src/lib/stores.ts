import 'server-only';
import { cache } from 'react';
import { prisma } from './prisma';
import { mediaUrl, PLACEHOLDER } from './media';
import { toInt } from './utils';
import { storeHiddenByBanState } from './moderation';
import { getStoreShield } from './settings';

async function logoUrl(logoId: number | null): Promise<string> {
  if (!logoId) return PLACEHOLDER;
  const up = await prisma.uploads.findUnique({ where: { id: BigInt(logoId) } });
  return up?.file_name ? mediaUrl(up.file_name) : PLACEHOLDER;
}

export async function getStores() {
  const [rows, shieldOn] = await Promise.all([
    prisma.stores.findMany({ orderBy: { id: 'desc' }, take: 60 }),
    getStoreShield().catch(() => true),
  ]);
  const list = await Promise.all(
    rows.map(async (s) => {
      const owner = await prisma.users.findUnique({ where: { id: BigInt(s.user_id) }, select: { name: true, userName: true, trusted: true, ban: true, ban_until: true, ban_source: true } });
      // صاحب متجر محظور إدارياً/جسيماً: لا يظهر في الدليل. الحظر الآلي غير الجسيم لا يُسقط المتجر (درع المتجر).
      if (storeHiddenByBanState(owner?.ban, owner?.ban_until, owner?.ban_source, shieldOn)) return null;
      return {
        id: toInt(s.id),
        name: owner?.name || owner?.userName || 'شركة',
        trusted: owner?.trusted === 1,
        description: s.description,
        address: s.address,
        logo: await logoUrl(s.logo),
      };
    }),
  );
  return list.filter((s): s is NonNullable<typeof s> => s !== null);
}

async function getStoreImpl(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const s = await prisma.stores.findUnique({ where: { id: BigInt(id) } }).catch(() => null);
  if (!s) return null;
  const [owner, branches] = await Promise.all([
    prisma.users.findUnique({ where: { id: BigInt(s.user_id) }, select: { id: true, name: true, userName: true, trusted: true, phoneNumber: true, allow_phone: true, whatsapp: true, phone_whatsapp: true } }),
    prisma.store_branches.findMany({ where: { store_id: toInt(s.id) } }),
  ]);
  return {
    id: toInt(s.id),
    userId: s.user_id,
    name: owner?.name || owner?.userName || 'شركة',
    trusted: owner?.trusted === 1,
    description: s.description,
    address: s.address,
    logo: await logoUrl(s.logo),
    createdAt: s.created_at,
    phone: owner?.allow_phone ? owner?.phoneNumber : null,
    whatsapp: owner?.whatsapp ? owner?.phone_whatsapp || owner?.phoneNumber : null,
    branches: branches.map((b) => ({ id: toInt(b.id), name: b.name, address: b.address })),
  };
}

export async function getStoreByUser(userId: number) {
  // المتجر الفعّال (من هوية المتجر النشطة) — وإلا أول متجر (توافق مع متجر واحد)
  const { getActiveStoreId } = await import('./merchant');
  const sid = await getActiveStoreId(userId).catch(() => 0);
  const s = sid
    ? await prisma.stores.findFirst({ where: { id: BigInt(sid), user_id: userId } })
    : await prisma.stores.findFirst({ where: { user_id: userId } });
  return s ? { id: toInt(s.id), description: s.description, address: s.address, logo: s.logo } : null;
}

/* memoized per-request (React cache): tames repeated hot reads within one navigation */
export const getStore = cache(getStoreImpl);
