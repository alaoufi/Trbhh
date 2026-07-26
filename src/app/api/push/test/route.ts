import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { sendTestPush } from '@/lib/push';

export const dynamic = 'force-dynamic';

/** تنبيه تجريبي لجهاز العضو الحالي — لتشخيص وصول الدفع من لوحة الحساب. */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, reason: 'unauth' }, { status: 401 });
  const res = await sendTestPush(session.uid);
  return NextResponse.json({ ok: res.sent > 0, ...res });
}
