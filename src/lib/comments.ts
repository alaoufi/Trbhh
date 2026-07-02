import 'server-only';
import { prisma } from './prisma';
import { mediaUrl } from './media';
import { loadBanned, censorSync } from './censor';
import { toInt } from './utils';

export async function getComments(adId: number) {
  const rows = await prisma.comments.findMany({
    where: { ads_id: BigInt(adId), hide: 'no', active: 'yes' },
    orderBy: { id: 'desc' },
    take: 100,
  });
  const userIds = [...new Set(rows.map((r) => toInt(r.sender_id)))].map((n) => BigInt(n));
  const users = userIds.length ? await prisma.users.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, userName: true, photo_path: true } }) : [];
  const byId = new Map(users.map((u) => [toInt(u.id), u]));
  await loadBanned();
  return rows.map((r) => {
    const u = byId.get(toInt(r.sender_id));
    return {
      id: toInt(r.id),
      comment: censorSync(r.comment),
      createdAt: r.created_at ? r.created_at.toISOString() : null,
      parentId: r.parent_id,
      author: u?.name || u?.userName || 'مستخدم',
      avatar: u?.photo_path ? mediaUrl(u.photo_path) : null,
    };
  });
}
