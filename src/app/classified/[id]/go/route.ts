import { NextRequest, NextResponse } from 'next/server';
import { getClassifiedById, recordClassifiedClick } from '@/lib/classified';

export const dynamic = 'force-dynamic';

/** Count a click-through then redirect to the ad's external link. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getClassifiedById(Number(id));
  if (!c || !c.link || !/^https?:\/\//i.test(c.link)) {
    return NextResponse.redirect(new URL(`/classified/${id}`, req.url));
  }
  await recordClassifiedClick(c.id).catch(() => {});
  return NextResponse.redirect(c.link);
}
