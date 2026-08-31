import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';

const ensureChatExtras = ensureSchema;

/** Persist a chat message; clears the sender's "typing" flag. Returns new id. */
/** فحص رسالة عضو قبل الإرسال: حارس المحتوى يمنع (بنفس تدرّج عقوبات الإعلانات)،
 *  والكلمات المرفوضة تُحجب من النص. للنقاط التي يرسل فيها الأعضاء فقط (لا رسائل النظام). */
export async function screenChatMessage(userId: number, text: string): Promise<{ ok: true; text: string } | { ok: false; banned: boolean }> {
  const { scanContent } = await import('./content-guard');
  const hit = await scanContent(text).catch(() => null);
  if (hit) {
    const { handleProhibited } = await import('./moderation');
    const o = await handleProhibited(userId, hit.category, hit.term, text.slice(0, 200)).catch(() => ({ banned: false }));
    return { ok: false, banned: !!(o as { banned?: boolean }).banned };
  }
  const { loadBanned, censorSync } = await import('./censor');
  await loadBanned().catch(() => {});
  return { ok: true, text: censorSync(text) };
}

export async function sendChat(fromId: number, toId: number, message: string): Promise<number> {
  await ensureChatExtras();
  const text = message.slice(0, 2000);
  const now = new Date();
  // منع التكرار المطابق بنفس اليوم: نفس المرسل والمستلم والنص خلال ٢٤ ساعة → لا تُنشأ نسخة ثانية
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dup = await prisma.chats.findFirst({
    where: { sender_id: fromId, reciver_id: toId, message: text, created_at: { gt: dayAgo } },
    select: { id: true },
  }).catch(() => null);
  if (dup) return toInt(dup.id);
  const row = await prisma.chats.create({
    data: {
      sender_id: fromId, reciver_id: toId, message: text, is_read: 0, chat_id: 0,
      type_from_user: 'user', type_to_user: 'user', created_at: now, updated_at: now,
    },
  });
  // أي رسالة جديدة من عضو إلى الحساب الإداري الرئيسي تعيد فتح التذكرة التي
  // أُرشفت سابقاً؛ رسالة الإدارة نفسها لا تغيّر حالة المعالجة.
  const { getPrimaryAdminId } = await import('./admin-inbox');
  const primaryAdminId = await getPrimaryAdminId().catch(() => 0);
  if (primaryAdminId === toId && fromId !== toId) {
    const sender = await prisma.users.findUnique({ where: { id: BigInt(fromId) }, select: { is_admin: true } }).catch(() => null);
    if (sender?.is_admin !== 1) {
      await prisma.admin_message_threads.upsert({
        where: { admin_id_member_id: { admin_id: toId, member_id: fromId } },
        create: { admin_id: toId, member_id: fromId, status: 'open', created_at: now, updated_at: now },
        update: { status: 'open', archived_at: null, archived_by: null, updated_at: now },
      }).catch(() => {});
    }
  }
  await prisma.chat_typing.deleteMany({ where: { user_id: fromId, peer_id: toId } }).catch(() => {});
  // تنبيه فوري للمستلم (إن فعّلته الإدارة واشترك جهازه) — لا يعطّل الإرسال بأي حال
  import('./push').then(async ({ sendPushToUser }) => {
    const sender = await prisma.users.findUnique({ where: { id: BigInt(fromId) }, select: { name: true, userName: true } }).catch(() => null);
    await sendPushToUser(toId, {
      title: `رسالة جديدة من ${sender?.name || sender?.userName || 'عضو'}`,
      body: text.slice(0, 120),
      url: '/messages',
    });
  }).catch(() => {});
  return toInt(row.id);
}

/** Mark the sender as currently typing to the peer. */
export async function setTyping(fromId: number, toId: number) {
  await ensureChatExtras();
  await prisma.chat_typing.upsert({
    where: { user_id_peer_id: { user_id: fromId, peer_id: toId } },
    create: { user_id: fromId, peer_id: toId },
    update: { updated_at: new Date() },
  }).catch(() => {});
}

/**
 * Delete a SINGLE message the user sent (delete-for-everyone), but only within
 * the configured grace period. `windowMin` = 0 means unlimited.
 */
export async function deleteChatMessage(userId: number, messageId: number, windowMin: number): Promise<boolean> {
  const msg = await prisma.chats.findFirst({ where: { id: BigInt(messageId), sender_id: userId }, select: { created_at: true } });
  if (!msg) return false;
  if (windowMin > 0) {
    const ageMin = msg.created_at ? (Date.now() - msg.created_at.getTime()) / 60000 : Infinity;
    if (ageMin > windowMin) return false; // grace period passed
  }
  const res = await prisma.chats.deleteMany({ where: { id: BigInt(messageId), sender_id: userId } });
  return res.count > 0;
}

/** Admin removes ANY message (no ownership/window check). */
export async function adminDeleteMessage(messageId: number): Promise<boolean> {
  const res = await prisma.chats.deleteMany({ where: { id: BigInt(messageId) } });
  return res.count > 0;
}

export type AdminThreadStatus = 'open' | 'archived';
export type AdminInboxThread = {
  adminId: number;
  memberId: number;
  memberName: string;
  last: string;
  at: string | null;
  count: number;
  unread: number;
};

/** Actionable conversations sent to the primary administration account. */
export async function listAdminInboxThreads(adminId: number, status: AdminThreadStatus): Promise<AdminInboxThread[]> {
  const rows = await prisma.chats.findMany({
    where: { OR: [{ sender_id: adminId }, { reciver_id: adminId }] },
    orderBy: { id: 'desc' },
    take: 1500,
  });
  const states = await prisma.admin_message_threads.findMany({ where: { admin_id: adminId }, select: { member_id: true, status: true } }).catch(() => []);
  const stateByMember = new Map(states.map((s) => [s.member_id, s.status]));
  const byMember = new Map<number, { last: string; at: string | null; count: number; unread: number }>();
  for (const row of rows) {
    const memberId = row.sender_id === adminId ? row.reciver_id : row.sender_id;
    if (!memberId || memberId === adminId) continue;
    const rowStatus = stateByMember.get(memberId) || 'open';
    if (rowStatus !== status) continue;
    const current = byMember.get(memberId);
    if (current) {
      current.count += 1;
      if (row.reciver_id === adminId && row.is_read === 0) current.unread += 1;
      continue;
    }
    byMember.set(memberId, {
      last: row.message,
      at: row.created_at ? row.created_at.toISOString() : null,
      count: 1,
      unread: row.reciver_id === adminId && row.is_read === 0 ? 1 : 0,
    });
  }
  const memberIds = [...byMember.keys()];
  const members = memberIds.length ? await prisma.users.findMany({ where: { id: { in: memberIds.map((id) => BigInt(id)) } }, select: { id: true, name: true, userName: true } }) : [];
  const memberName = new Map(members.map((m) => [toInt(m.id), m.name || m.userName || `#${toInt(m.id)}`]));
  return [...byMember.entries()].map(([memberId, t]) => ({ adminId, memberId, memberName: memberName.get(memberId) || `#${memberId}`, ...t }));
}

export async function archiveAdminThread(adminId: number, memberId: number, actorId: number): Promise<boolean> {
  if (!adminId || !memberId || !actorId) return false;
  const now = new Date();
  await prisma.$transaction([
    prisma.admin_message_threads.upsert({
      where: { admin_id_member_id: { admin_id: adminId, member_id: memberId } },
      create: { admin_id: adminId, member_id: memberId, status: 'archived', archived_at: now, archived_by: actorId, created_at: now, updated_at: now },
      update: { status: 'archived', archived_at: now, archived_by: actorId, updated_at: now },
    }),
    prisma.chats.updateMany({ where: { sender_id: memberId, reciver_id: adminId, is_read: 0 }, data: { is_read: 1 } }),
  ]);
  return true;
}

export async function restoreAdminThread(adminId: number, memberId: number): Promise<boolean> {
  const result = await prisma.admin_message_threads.updateMany({
    where: { admin_id: adminId, member_id: memberId, status: 'archived' },
    data: { status: 'open', archived_at: null, archived_by: null, updated_at: new Date() },
  });
  return result.count > 0;
}

/** Permanent removal is intentionally possible only after the thread is archived. */
export async function deleteArchivedAdminThread(adminId: number, memberId: number): Promise<boolean> {
  const state = await prisma.admin_message_threads.findUnique({ where: { admin_id_member_id: { admin_id: adminId, member_id: memberId } }, select: { status: true } });
  if (state?.status !== 'archived') return false;
  await prisma.$transaction([
    prisma.chats.deleteMany({ where: { OR: [{ sender_id: adminId, reciver_id: memberId }, { sender_id: memberId, reciver_id: adminId }] } }),
    prisma.admin_message_threads.delete({ where: { admin_id_member_id: { admin_id: adminId, member_id: memberId } } }),
  ]);
  return true;
}

/** Recent conversations across the whole site (for admin monitoring). */
export async function listAllConversations(limit = 120) {
  const rows = await prisma.chats.findMany({ orderBy: { id: 'desc' }, take: 1500 });
  const pairs = new Map<string, { a: number; b: number; last: string; at: string | null; count: number }>();
  for (const c of rows) {
    const a = Math.min(c.sender_id, c.reciver_id);
    const b = Math.max(c.sender_id, c.reciver_id);
    if (!a || !b) continue;
    const k = `${a}-${b}`;
    const ex = pairs.get(k);
    if (ex) { ex.count += 1; continue; }
    pairs.set(k, { a, b, last: c.message, at: c.created_at ? c.created_at.toISOString() : null, count: 1 });
  }
  const list = [...pairs.values()].slice(0, limit);
  const ids = [...new Set(list.flatMap((p) => [p.a, p.b]))].map((n) => BigInt(n));
  const users = ids.length ? await prisma.users.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, userName: true } }) : [];
  const nameOf = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || 'مستخدم']));
  return list.map((p) => ({ ...p, aName: nameOf.get(p.a) || `#${p.a}`, bName: nameOf.get(p.b) || `#${p.b}` }));
}

/** Full message list between two users, for admin review (no read-marking). */
export async function getAdminThread(a: number, b: number) {
  const rows = await prisma.chats.findMany({
    where: { OR: [{ sender_id: a, reciver_id: b }, { sender_id: b, reciver_id: a }] },
    orderBy: { id: 'asc' },
    take: 1000,
  });
  const users = await prisma.users.findMany({ where: { id: { in: [BigInt(a), BigInt(b)] } }, select: { id: true, name: true, userName: true } });
  const nameOf = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || 'مستخدم']));
  return {
    aName: nameOf.get(a) || `#${a}`,
    bName: nameOf.get(b) || `#${b}`,
    messages: rows.map((r) => ({
      id: toInt(r.id),
      senderName: nameOf.get(r.sender_id) || `#${r.sender_id}`,
      message: r.message,
      at: r.created_at ? r.created_at.toISOString() : null,
    })),
  };
}

export type ChatMsg = { id: number; fromMe: boolean; message: string; at: string | null; read: boolean };
export type PollResult = { messages: ChatMsg[]; myReadMax: number; typing: boolean; ids: number[] };

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

  const typ = await prisma.chat_typing.findUnique({ where: { user_id_peer_id: { user_id: otherId, peer_id: userId } } }).catch(() => null);
  const typing = !!typ && typ.updated_at.getTime() >= Date.now() - 5_000;

  // Full id set of the thread so the client can drop any message the other
  // party deleted (poll only appends new ids; this reconciles removals).
  const allRows = await prisma.chats.findMany({
    where: { OR: [{ sender_id: userId, reciver_id: otherId }, { sender_id: otherId, reciver_id: userId }] },
    orderBy: { id: 'asc' },
    take: 500,
    select: { id: true },
  });

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
    ids: allRows.map((r) => toInt(r.id)),
  };
}

export type AdminMessageRow = { id: number; senderId: number; senderName: string; message: string; at: string | null };

/** آخر رسائل أرسلها أي مشرف/إدارة (لا العضو نفسه) لهذا المستلم — تُعرض في صناديق
 *  المراسلة الإدارية (راسل صاحب الإعلان/المتجر) فيرى أي مسؤول آخر أنه سبق تواصُل
 *  معه ولا يكرّر نفس الرسالة. */
export async function listAdminMessagesTo(recipientId: number, limit = 5): Promise<AdminMessageRow[]> {
  const admins = await prisma.users.findMany({ where: { is_admin: 1 }, select: { id: true } }).catch(() => []);
  const adminIds = admins.map((a) => toInt(a.id));
  if (!adminIds.length) return [];
  const rows = await prisma.chats.findMany({
    where: { reciver_id: recipientId, sender_id: { in: adminIds } },
    orderBy: { id: 'desc' }, take: limit,
    select: { id: true, sender_id: true, message: true, created_at: true },
  }).catch(() => []);
  if (!rows.length) return [];
  const senderIds = [...new Set(rows.map((r) => r.sender_id))];
  const senders = await prisma.users.findMany({ where: { id: { in: senderIds.map((id) => BigInt(id)) } }, select: { id: true, name: true, userName: true } }).catch(() => []);
  const nameById = new Map(senders.map((s) => [toInt(s.id), s.name || s.userName || `#${toInt(s.id)}`]));
  return rows.map((r) => ({
    id: toInt(r.id), senderId: r.sender_id, senderName: nameById.get(r.sender_id) || `#${r.sender_id}`,
    message: r.message, at: r.created_at ? r.created_at.toISOString() : null,
  }));
}
