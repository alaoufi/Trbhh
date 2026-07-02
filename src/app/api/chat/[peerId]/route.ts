import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pollThread, sendChat, setTyping } from '@/lib/chat';

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
  const id = await sendChat(session.uid, other, message);
  await prisma.notfications
    .create({ data: { title: `رسالة جديدة من ${session.name || 'عضو'}`, route: `/messages/${session.uid}`, user_id: String(other), type: 'message' } })
    .catch(() => {});
  return Response.json({ ok: true, id });
}
