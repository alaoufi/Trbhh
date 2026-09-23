import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * وسيط صور CJ: يجلب الصورة من شبكة CJ ويمرّرها للمتصفّح مباشرةً — **بلا تخزين على
 * الخادم** (لا مساحة). يتجاوز أي منع تحميل/تحسين على روابط CJ. مقيّد بمضيفات CJ فقط
 * (حماية من SSRF). قراءة فقط، لا يمسّ أي بيانات.
 */
const ALLOWED = /(^|\.)(cjdropshipping\.(com|cn)|aliyuncs\.com)$/i;

export async function GET(request: Request) {
  const u = new URL(request.url).searchParams.get('u') || '';
  let target: URL;
  try { target = new URL(u); } catch { return new NextResponse('bad_url', { status: 400 }); }
  if (target.protocol !== 'https:' || !ALLOWED.test(target.hostname)) return new NextResponse('forbidden', { status: 403 });

  const res = await fetch(target.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://cjdropshipping.com/', Accept: 'image/*' },
    signal: AbortSignal.timeout(12000),
  }).catch(() => null);
  if (!res || !res.ok) return new NextResponse('not_found', { status: 404 });
  const ct = res.headers.get('content-type') || 'image/jpeg';
  if (!ct.startsWith('image/')) return new NextResponse('not_image', { status: 415 });
  const buf = Buffer.from(await res.arrayBuffer());
  return new NextResponse(buf, { headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400, immutable' } });
}
