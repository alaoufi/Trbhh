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
  // هوية النشر: التعليق المكتوب بهوية شخصية غير افتراضية يُعرض باسمها وصورتها
  const { getProfilesDisplayMap } = await import('./profiles');
  const profMap = await getProfilesDisplayMap(rows.map((r) => toInt(r.profile_id ?? 0n))).catch(() => new Map());
  await loadBanned();
  return rows.map((r) => {
    const u = byId.get(toInt(r.sender_id));
    const pr = r.profile_id ? profMap.get(toInt(r.profile_id)) : undefined;
    return {
      id: toInt(r.id),
      comment: censorSync(r.comment),
      createdAt: r.created_at ? r.created_at.toISOString() : null,
      parentId: r.parent_id,
      author: pr?.name || u?.name || u?.userName || 'مستخدم',
      avatar: pr ? (pr.avatarUrl || null) : (u?.photo_path ? mediaUrl(u.photo_path) : null),
      senderId: toInt(r.sender_id),
    };
  });
}
