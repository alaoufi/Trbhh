import {randomBytes, timingSafeEqual} from 'node:crypto';
import {NextRequest, NextResponse} from 'next/server';
import {prisma} from '@/lib/prisma';
import {hasAction} from '@/lib/roles';
import {supplierConfig} from '@/lib/suppliers/config';
import {parseMerchantInvitation, startMerchantOAuth} from '@/lib/suppliers/merchant-oauth';
import {readOAuthForm} from '@/lib/suppliers/oauth-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const csrfCookie = 'salla_merchant_start';
const callbackPath = '/api/integrations/salla/callback';
const headers = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://accounts.salla.sa; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
};
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const failure = () => new NextResponse('رابط التفويض غير صالح أو انتهت صلاحيته. تواصل مع إدارة تربح للحصول على رابط جديد.', {status: 400, headers});

/** GET is harmless: messaging-app previews cannot consume the invitation. */
export async function GET(request: NextRequest) {
  try {
    const config = supplierConfig();
    const invitation = request.nextUrl.searchParams.get('invite') || '';
    const payload = parseMerchantInvitation(invitation, config);
    const csrf = randomBytes(32).toString('hex');
    const response = new NextResponse(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تفويض متجر سلة — تربح</title><style>body{font-family:system-ui;margin:0;background:#faf9f6;color:#16294a}main{max-width:480px;margin:10vh auto;padding:28px}h1{font-size:25px}p{line-height:1.9}button{width:100%;border:0;border-radius:12px;background:#16294a;color:white;padding:16px;font:inherit;cursor:pointer}small{display:block;margin-top:20px;line-height:1.8}</style><main><h1>ربط ${escape(payload.expectedName)} بتربح</h1><p>انتقل إلى سلة ووافق من حساب صاحب المتجر لإتاحة قراءة بيانات المتجر ومنتجاته.</p><form method="post" action="/api/integrations/salla/authorize"><input type="hidden" name="invite" value="${escape(invitation)}"><input type="hidden" name="csrf" value="${csrf}"><button type="submit">متابعة التفويض في سلة</button></form><small>لا يُفعّل هذا الإجراء الشراء أو الدفع، ولا ينشر المنتجات للعامة.</small></main></html>`, {headers: {...headers, 'Content-Type':'text/html; charset=utf-8'}});
    response.cookies.set(csrfCookie, csrf, {httpOnly:true, secure:config.origin.startsWith('https:'), sameSite:'strict', path:'/api/integrations/salla/authorize', maxAge:600});
    return response;
  } catch { return failure(); }
}

export async function POST(request: NextRequest) {
  try {
    const config = supplierConfig();
    if (request.headers.get('origin') !== config.origin) return failure();
    const form = await readOAuthForm(request);
    const csrf = form.get('csrf') || '', expected = request.cookies.get(csrfCookie)?.value || '';
    if (!/^[a-f0-9]{64}$/.test(csrf) || !/^[a-f0-9]{64}$/.test(expected) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(expected))) return failure();
    const invitation = form.get('invite') || '';
    const payload = parseMerchantInvitation(invitation, config);
    if (!await hasAction(Number(payload.adminId), 'suppliers', 'edit')) return failure();
    const result = await startMerchantOAuth(prisma, invitation, config);
    const response = NextResponse.redirect(result.url, 303);
    for (const [name,value] of [['salla_oauth_browser', result.browser], ['salla_merchant_context', result.context]]) {
      response.cookies.set(name,value,{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'lax',path:callbackPath,maxAge:600});
    }
    response.cookies.set(csrfCookie,'',{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'strict',path:'/api/integrations/salla/authorize',maxAge:0});
    response.headers.set('Cache-Control','no-store');
    response.headers.set('Referrer-Policy','no-referrer');
    return response;
  } catch { return failure(); }
}
