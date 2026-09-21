import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cjConfig } from '@/lib/cj/config';
import { verifySignature, constantSecret, digest } from '@/lib/suppliers/crypto';

/**
 * مستقبِل webhooks من CJ (تحديثات الطلب/التتبّع). التحقّق عبر توقيع HMAC
 * (x-cj-signature) أو سرّ ثابت (x-cj-secret) من CJ_WEBHOOK_SECRET. لا يُنفّذ أي
 * شراء؛ يخزّن الحدث فقط (idempotent) لمعالجته لاحقاً. الأسرار من البيئة فقط.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 1_048_576;

export async function POST(req: NextRequest) {
  const cfg = cjConfig();
  if (!cfg.webhookSecret) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });

  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length > MAX_BODY) return NextResponse.json({ ok: false }, { status: 413 });

  const sig = req.headers.get('x-cj-signature') || '';
  const secretHeader = req.headers.get('x-cj-secret') || '';
  const authed = (sig && verifySignature(raw, sig, cfg.webhookSecret)) || (secretHeader && constantSecret(secretHeader, cfg.webhookSecret));
  if (!authed) return NextResponse.json({ ok: false }, { status: 401 });

  let payload: Record<string, unknown> | null = null;
  try { payload = JSON.parse(raw.toString('utf8')) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const type = String(payload?.type ?? payload?.messageType ?? '').slice(0, 64);
  const idPart = String(payload?.id ?? payload?.orderId ?? payload?.trackNumber ?? '');
  const eventKey = (idPart ? digest(`${type}:${idPart}`) : digest(raw)).slice(0, 180);

  await prisma.$executeRaw`INSERT INTO cj_webhook_events (event_key, type) VALUES (${eventKey}, ${type}) ON DUPLICATE KEY UPDATE id=id`.catch(() => {});
  return NextResponse.json({ ok: true });
}
