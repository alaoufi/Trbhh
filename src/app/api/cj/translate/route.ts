import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasAccess } from '@/lib/access-control/guards';
import { translateToArabicForDisplay, isArabicText } from '@/lib/cj/translate';

/**
 * ترجمة نص واحد عند الطلب (للترجمة الفورية عند التحميل والنقر على كلمة غير مترجمة).
 * للموظّفين فقط (products:view). تُخزّن الترجمة في الذاكرة فيستفيد منها الجميع لاحقاً.
 * قراءة/كتابة ذاكرة الترجمة فقط — لا تمسّ أي شيء مالي.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function POST(request: Request) {
  const session = await getSession().catch(() => null);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });
  if (!(await hasAccess(session.uid, 'products', 'view').catch(() => false))) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid' }, { status: 400, headers }); }
  const text = body && typeof body === 'object' && typeof (body as Record<string, unknown>).text === 'string' ? (body as Record<string, unknown>).text as string : '';
  const trimmed = text.trim().slice(0, 2000);
  if (!trimmed) return NextResponse.json({ error: 'empty' }, { status: 400, headers });
  if (isArabicText(trimmed)) return NextResponse.json({ ar: trimmed }, { headers });
  // ترجمة عرض متساهلة: النتيجة محقّقة أنها عربية ذات معنى داخل الدالة (ولو بقيت ماركات
  // إنجليزية في عنوان تسويقي)، فلا نُعيد تطبيق الفحص الصارم الذي يرفض المختلط.
  const ar = await translateToArabicForDisplay(trimmed).catch(() => null);
  return NextResponse.json({ ar: ar || null }, { headers });
}
