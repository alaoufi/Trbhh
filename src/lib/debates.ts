import 'server-only';
import { prisma } from './prisma';
import { toInt } from './utils';

export async function getDebates() {
  const rows = await prisma.debates.findMany({ where: { hide: 0 }, orderBy: { id: 'desc' } });
  const ids = rows.map((r) => toInt(r.id));
  const [commentGroups, likeGroups] = await Promise.all([
    prisma.debate_comments.groupBy({ by: ['debate_id'], where: { debate_id: { in: ids } }, _count: true }),
    prisma.debate_likes.groupBy({ by: ['debate_id'], where: { debate_id: { in: ids }, like: 1 }, _count: true }),
  ]);
  const cCount = new Map(commentGroups.map((g) => [g.debate_id, g._count]));
  const lCount = new Map(likeGroups.map((g) => [g.debate_id, g._count]));
  return rows.map((r) => ({
    id: toInt(r.id),
    title: r.title,
    description: r.description,
    createdAt: r.created_at ? r.created_at.toISOString() : null,
    comments: cCount.get(toInt(r.id)) ?? 0,
    likes: lCount.get(toInt(r.id)) ?? 0,
  }));
}

export async function getDebate(id: number, userId?: number) {
  const d = await prisma.debates.findUnique({ where: { id: BigInt(id) } });
  if (!d || d.hide === 1) return null;
  const rows = await prisma.debate_comments.findMany({ where: { debate_id: id }, orderBy: { id: 'desc' }, take: 200 });
  const userIds = [...new Set(rows.map((r) => r.user_id))].map((n) => BigInt(n));
  const users = userIds.length ? await prisma.users.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, userName: true } }) : [];
  const byId = new Map(users.map((u) => [toInt(u.id), u]));
  const [likes, myLike] = await Promise.all([
    prisma.debate_likes.count({ where: { debate_id: id, like: 1 } }),
    userId ? prisma.debate_likes.findFirst({ where: { debate_id: id, user_id: userId, like: 1 } }) : Promise.resolve(null),
  ]);
  return {
    id: toInt(d.id),
    title: d.title,
    description: d.description,
    createdAt: d.created_at ? d.created_at.toISOString() : null,
    likes,
    liked: !!myLike,
    comments: rows.map((r) => {
      const u = byId.get(r.user_id);
      return { id: toInt(r.id), comment: r.comment, author: u?.name || u?.userName || 'مستخدم', createdAt: r.created_at ? r.created_at.toISOString() : null };
    }),
  };
}
