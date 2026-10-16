import { NextResponse } from 'next/server';
import { constantSecret } from '@/lib/suppliers/crypto';
import { runArabicTranslationWorker } from '@/lib/cj/translation-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Authenticated bounded text-cache worker; never reads or writes product metadata. */
export async function POST(request: Request) {
  const secret = process.env.SUPPLIER_RECONCILE_SECRET || '';
  const headers = { 'Cache-Control': 'no-store' };
  if (secret.length < 32) return NextResponse.json({ error: 'not_configured' }, { status: 503, headers });
  const auth = request.headers.get('authorization') || '';
  if (auth.length > 1024 || !auth.startsWith('Bearer ') || !constantSecret(auth.slice(7), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });
  }
  try {
    return NextResponse.json({ ok: true, worker: await runArabicTranslationWorker() }, { headers });
  } catch {
    return NextResponse.json({ error: 'worker_unavailable' }, { status: 503, headers });
  }
}
