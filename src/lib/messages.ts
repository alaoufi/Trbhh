import 'server-only';
import { prisma } from './prisma';
import { mediaUrl } from './media';
import { toInt } from './utils';

/** List conversations for a user: the other party + last message + unread count. */
export async function getConversations(userId: number) {
  const rows = await prisma.chats.findMany({
    where: { OR: [{ sender_id: userId }, { reciver_id: userId }] },
    orderBy: { id: 'desc' },
    take: 400,
  });
  const convos = new Map<number, { otherId: number; last: string; at: string | null; unread: number }>();
  for (const c of rows) {
    const otherId = c.sender_id === userId ? c.reciver_id : c.sender_id;
    if (!otherId) continue;
    if (!convos.has(otherId)) {
      convos.set(otherId, {
        otherId,
        last: c.message,
        at: c.created_at ? c.created_at.toISOString() : null,
        unread: 0,
      });
    }
    if (c.reciver_id === userId && c.is_read === 0) {
      convos.get(otherId)!.unread += 1;
    }
  }
  const list = [...convos.values()];
  const ids = list.map((c) => BigInt(c.otherId));
  const users = ids.length
    ? await prisma.users.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, userName: true, photo_path: true } })
    : [];
  const byId = new Map(users.map((u) => [toInt(u.id), u]));
  return list.map((c) => {
    const u = byId.get(c.otherId);
    return { ...c, name: u?.name || u?.userName || 'مستخدم', avatar: u?.photo_path ? mediaUrl(u.photo_path) : null };
  });
}

export async function getThread(userId: number, otherId: number) {
  const rows = await prisma.chats.findMany({
    where: {
      OR: [
        { sender_id: userId, reciver_id: otherId },
        { sender_id: otherId, reciver_id: userId },
      ],
    },
    orderBy: { id: 'asc' },
    take: 500,
  });
  // mark incoming as read
  await prisma.chats.updateMany({
    where: { sender_id: otherId, reciver_id: userId, is_read: 0 },
    data: { is_read: 1 },
  });
  const other = await prisma.users.findUnique({ where: { id: BigInt(otherId) }, select: { id: true, name: true, userName: true } });
  return {
    other: other ? { id: toInt(other.id), name: other.name || other.userName || 'مستخدم' } : null,
    messages: rows.map((r) => ({
      id: toInt(r.id),
      fromMe: r.sender_id === userId,
      message: r.message,
      at: r.created_at ? r.created_at.toISOString() : null,
      read: r.sender_id === userId ? r.is_read === 1 : true,
    })),
  };
}
