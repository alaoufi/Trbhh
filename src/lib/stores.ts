import 'server-only';
import { prisma } from './prisma';
import { mediaUrl, PLACEHOLDER } from './media';
import { toInt } from './utils';

async function logoUrl(logoId: number | null): Promise<string> {
  if (!logoId) return PLACEHOLDER;
  const up = await prisma.uploads.findUnique({ where: { id: BigInt(logoId) } });
  return up?.file_name ? mediaUrl(up.file_name) : PLACEHOLDER;
}

export async function getStores() {
  const rows = await prisma.stores.findMany({ orderBy: { id: 'desc' }, take: 60 });
  return Promise.all(
    rows.map(async (s) => {
      const owner = await prisma.users.findUnique({ where: { id: BigInt(s.user_id) }, select: { name: true, userName: true, trusted: true } });
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
}

export async function getStore(id: number) {
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
  const s = await prisma.stores.findFirst({ where: { user_id: userId } });
  return s ? { id: toInt(s.id), description: s.description, address: s.address, logo: s.logo } : null;
}
