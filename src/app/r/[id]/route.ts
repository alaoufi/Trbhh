import { NextRequest, NextResponse } from 'next/server';

/** رابط دعوة صديق: يحفظ هوية الداعي في كوكي ثم يفتح صفحة التسجيل. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = Number(id) || 0;
  const res = NextResponse.redirect(new URL('/login?mode=register', req.url));
  if (uid > 0) {
    res.cookies.set('trbhh_ref', String(uid), { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' });
  }
  return res;
}
