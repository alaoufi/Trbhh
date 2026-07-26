import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { pollThread, sendChat, setTyping, deleteChatMessage } from '@/lib/chat';
import { getMsgDeleteMinutes } from '@/lib/settings';
import { getPrimaryAdminId, smartAdminReply, shouldAutoReply } from '@/lib/admin-inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ peerId: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'unauth' }, { status: 401 });
  const { peerId } = await ctx.params;
  const other = Number(peerId);
  const after = Number(req.nextUrl.searchParams.get('after') || '0') || 0;
  if (!other || other === session.uid) return Response.json({ messages: [], myReadMax: 0, typing: false });
  const res = await pollThread(session.uid, other, after);
  return Response.json(res);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ peerId: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'unauth' }, { status: 401 });
  const { peerId } = await ctx.params;
  const other = Number(peerId);
  if (!other || other === session.uid) return Response.json({ ok: false });

  const body = await req.json().catch(() => ({} as { kind?: string; message?: string }));
  if (body.kind === 'typing') {
    await setTyping(session.uid, other);
    return Response.json({ ok: true });
  }
  const message = String(body.message || '').trim();
  if (!message) return Response.json({ ok: false });
  // حماية المراسلات: حارس المحتوى (منع + عقوبات) والكلمات المرفوضة (حجب)
  const { screenChatMessage } = await import('@/lib/chat');
  const screened = await screenChatMessage(session.uid, message);
  if (!screened.ok) return Response.json({ ok: false, blocked: true, banned: screened.banned });
  // sendChat يرسل تنبيهاً فورياً (Web Push) للمستلم، وتُحتسب الرسالة من غير المقروء
  // في الجرس — فلا نُنشئ صف تنبيه إضافي (كان يُعدّ الرسالة مرتين في الجرس).
  const id = await sendChat(session.uid, other, screened.text);

  // Smart automatic acknowledgement when a member messages the administration
  try {
    const adminId = await getPrimaryAdminId();
    if (adminId && other === adminId && session.uid !== adminId && (await shouldAutoReply(adminId, session.uid))) {
      await sendChat(adminId, session.uid, smartAdminReply(message));
    }
  } catch {
    /* auto-reply is best-effort */
  }
  return Response.json({ ok: true, id });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ peerId: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'unauth' }, { status: 401 });
  await ctx.params; // peer is implied by the message ownership check
  const body = await req.json().catch(() => ({} as { messageId?: number }));
  const messageId = Number(body.messageId || 0);
  if (!messageId) return Response.json({ ok: false });
  const windowMin = await getMsgDeleteMinutes();
  const ok = await deleteChatMessage(session.uid, messageId, windowMin);
  return Response.json({ ok, expired: !ok });
}
