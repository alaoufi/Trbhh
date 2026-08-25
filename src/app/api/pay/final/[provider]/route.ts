import { NextRequest, NextResponse } from 'next/server';
import { SITE } from '@/lib/constants';
import { confirmTopupById, resolveAlrajhiFinalResult } from '@/lib/payments';
import { readAlrajhiCallbackBody } from '@/lib/payments/alrajhi-callback';

export const dynamic = 'force-dynamic';

function resultRedirect(topupId: number): NextResponse {
  const resultUrl = new URL('/payment/result', `https://${SITE.domain}`);
  if (topupId > 0) resultUrl.searchParams.set('t', String(topupId));
  return NextResponse.redirect(resultUrl, { status: 303 });
}

/** ARB's final Bank Hosted result: CAPTURED credits atomically; a final refusal is rejected. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const topupId = Number(new URL(req.url).searchParams.get('t') || 0);
  if (provider !== 'alrajhi_arb' || !Number.isSafeInteger(topupId) || topupId <= 0) return resultRedirect(0);
  const body = await readAlrajhiCallbackBody(req);
  await resolveAlrajhiFinalResult(topupId, body);
  return resultRedirect(topupId);
}

/** Safe fallback for a bank/browser GET: it can only settle after a bank inquiry. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const topupId = Number(new URL(req.url).searchParams.get('t') || 0);
  if (provider === 'alrajhi_arb' && Number.isSafeInteger(topupId) && topupId > 0) await confirmTopupById(topupId).catch(() => {});
  return resultRedirect(topupId);
}
