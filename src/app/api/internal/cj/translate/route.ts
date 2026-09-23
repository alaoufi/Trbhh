import { NextResponse } from 'next/server';
import { constantSecret } from '@/lib/suppliers/crypto';
import { warmCjTranslations } from '@/lib/cj/translate-warm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * تهيئة الترجمات المجدولة (كرون أسبوعي داخلي) — تترجم شجرة التصنيفات وحقول السلع
 * المستوردة الناقصة وتخزّنها على الخادم، فيصبح التصفّح سريعاً وآمناً. مصادقة Bearer
 * بنفس سر التسوية الداخلي. قراءة فقط، لا شراء ولا تعديل بيانات المصدر.
 * جدولة مقترحة (على الخادم): أسبوعياً، مثال crontab:
 *   0 3 * * 1  curl -sS -X POST -H "Authorization: Bearer $SUPPLIER_RECONCILE_SECRET" https://trbhh.sa/api/internal/cj/translate
 */
export async function POST(request: Request) {
  const secret = process.env.SUPPLIER_RECONCILE_SECRET || '';
  const headers = { 'Cache-Control': 'no-store' };
  if (secret.length < 32) return NextResponse.json({ error: 'not_configured' }, { status: 503, headers });
  const auth = request.headers.get('authorization') || '';
  if (auth.length > 1024 || !auth.startsWith('Bearer ') || !constantSecret(auth.slice(7), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });
  }
  try {
    return NextResponse.json({ ok: true, warmed: await warmCjTranslations() }, { headers });
  } catch {
    return NextResponse.json({ error: 'warm_unavailable' }, { status: 503, headers });
  }
}
