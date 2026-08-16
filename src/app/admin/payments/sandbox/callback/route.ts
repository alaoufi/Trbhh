import { NextRequest, NextResponse } from 'next/server';
import { requireAction } from '@/lib/roles';
import { decodeArbCallback } from '@/lib/payments/providers/alrajhi-arb';
import { readSandboxTicket } from '@/lib/payments/alrajhi-sandbox';

export const dynamic = 'force-dynamic';

function ticketOf(url: URL) { return url.searchParams.get('ticket') || ''; }
function ticket(url: URL) { return readSandboxTicket(ticketOf(url), { secret: process.env.DATABASE_PAYMENT_SECRET || '' }); }
function resultOf(body: unknown, data: ReturnType<typeof ticket>) {
  if (!data) return null;
  const decrypted = decodeArbCallback(body, process.env.ALRAJHI_TERMINAL_RESOURCE_KEY || '');
  return decrypted && String(decrypted.trackId || '') === data.trackId ? String(decrypted.result || 'unknown').toLowerCase() : null;
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url); const data = ticket(url);
  let body: unknown = null; try { body = await req.json(); } catch { body = Object.fromEntries((await req.formData()).entries()); }
  if (!resultOf(body, data)) return NextResponse.json([{ status: '2', errorText: 'sandbox notification validation failed' }], { status: 400 });
  return NextResponse.json([{ status: '1', result: `${url.origin}${url.pathname}?ticket=${encodeURIComponent(ticketOf(url))}` }]);
}

export async function GET(req: NextRequest) {
  await requireAction('users', 'edit');
  const url = new URL(req.url); const data = ticket(url);
  const body = Object.fromEntries(url.searchParams.entries());
  const result = resultOf(body, data) || 'unverified';
  return NextResponse.redirect(new URL(`/admin/payments/sandbox?result=${encodeURIComponent(result)}`, url.origin), 303);
}
