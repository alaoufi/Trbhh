import 'server-only';
import { prisma } from './prisma';
import { toInt } from './utils';

let ensured = false;
async function ensureChatExtras() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS chat_typing (
      user_id INT NOT NULL,
      peer_id INT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, peer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `).catch(() => {});
  // allow longer chat messages (original column is VARCHAR(255))
  await prisma.$executeRawUnsafe(`ALTER TABLE chats MODIFY message TEXT`).catch(() => {});
  ensured = true;
}

/** Persist a chat message; clears the sender's "typing" flag. Returns new id. */
export async function sendChat(fromId: number, toId: number, message: string): Promise<number> {
  await ensureChatExtras();
  const text = message.slice(0, 2000);
  const now = new Date();
  const row = await prisma.chats.create({
    data: {
      sender_id: fromId, reciver_id: toId, message: text, is_read: 0, chat_id: 0,
      type_from_user: 'user', type_to_user: 'user', created_at: now, updated_at: now,
    },
  });
  await prisma.$executeRawUnsafe(`DELETE FROM chat_typing WHERE user_id = ? AND peer_id = ?`, fromId, toId).catch(() => {});
  return toInt(row.id);
}

/** Mark the sender as currently typing to the peer. */
export async function setTyping(fromId: number, toId: number) {
  await ensureChatExtras();
  await prisma.$executeRawUnsafe(
    `INSERT INTO chat_typing (user_id, peer_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
    fromId, toId,
  ).catch(() => {});
}

export type ChatMsg = { id: number; fromMe: boolean; message: string; at: string | null; read: boolean };
export type PollResult = { messages: ChatMsg[]; myReadMax: number; typing: boolean };

/**
 * Poll a thread: marks incoming messages as read, returns messages newer than
 * `afterId`, the highest id of my messages the peer has read (for ✓✓), and
 * whether the peer is currently typing.
 */
export async function pollThread(userId: number, otherId: number, afterId: number): Promise<PollResult> {
  await ensureChatExtras();
  await prisma.chats.updateMany({ where: { sender_id: otherId, reciver_id: userId, is_read: 0 }, data: { is_read: 1 } });

  const rows = await prisma.chats.findMany({
    where: {
      id: { gt: BigInt(afterId) },
      OR: [{ sender_id: userId, reciver_id: otherId }, { sender_id: otherId, reciver_id: userId }],
    },
    orderBy: { id: 'asc' },
    take: 200,
  });

  const readRow = await prisma.chats.findFirst({
    where: { sender_id: userId, reciver_id: otherId, is_read: 1 },
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  const myReadMax = readRow ? toInt(readRow.id) : 0;

  const typ = await prisma.$queryRawUnsafe<{ n: bigint | number }[]>(
    `SELECT COUNT(*) n FROM chat_typing WHERE user_id = ? AND peer_id = ? AND updated_at >= (NOW() - INTERVAL 5 SECOND)`,
    otherId, userId,
  ).catch(() => [] as { n: number }[]);
  const typing = Number(typ[0]?.n || 0) > 0;

  return {
    messages: rows.map((r) => ({
      id: toInt(r.id),
      fromMe: r.sender_id === userId,
      message: r.message,
      at: r.created_at ? r.created_at.toISOString() : null,
      read: r.sender_id === userId ? r.is_read === 1 : true,
    })),
    myReadMax,
    typing,
  };
}
