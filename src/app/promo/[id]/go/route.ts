import { NextRequest, NextResponse } from 'next/server';
import { getPromoById, recordPromoClick } from '@/lib/promos';

export const dynamic = 'force-dynamic';

/** Count a click on a promo banner then redirect to its link. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPromoById(Number(id));
  if (!p || !p.link || !/^https?:\/\//i.test(p.link)) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  await recordPromoClick(p.id).catch(() => {});
  return NextResponse.redirect(p.link);
}
