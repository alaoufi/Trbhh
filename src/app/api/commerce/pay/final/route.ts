import { NextRequest, NextResponse } from 'next/server';
import { SITE } from '@/lib/constants';
import { prisma } from '@/lib/prisma';
import { getCommerceGateway } from '@/lib/commerce/runtime';
import { reconcileCommerceOrder } from '@/lib/commerce/reconcile';

export const dynamic = 'force-dynamic';

/**
 * عودة متصفح العميل من صفحة دفع الراجحي لطلب تجارة (a=معرّف محاولة الدفع). لا نثق
 * بمعطيات المتصفح: نستخرج الطلب والعضو من المحاولة، ثم نسوّي عبر استعلام موثوق من
 * البنك (reconcileCommerceOrder → gateway.verify). لا يُنشأ ولا يُكرَّر أي دفع هنا.
 */
async function settle(attemptId: number): Promise<number> {
  if (!Number.isSafeInteger(attemptId) || attemptId <= 0) return 0;
  const rows = await prisma.$queryRaw<{ order_id: bigint; member_id: bigint }[]>`
    SELECT a.order_id, o.member_id FROM commerce_payment_attempts a
    INNER JOIN commerce_orders o ON o.id=a.order_id WHERE a.id=${BigInt(attemptId)} LIMIT 1`.catch(() => []);
  const row = rows[0];
  if (!row) return 0;
  const orderId = Number(row.order_id);
  const gateway = await getCommerceGateway();
  if (gateway?.ready) {
    await reconcileCommerceOrder(prisma, { memberId: row.member_id, orderId: row.order_id }, gateway, []).catch(() => {});
  }
  return orderId;
}

function resultRedirect(orderId: number): NextResponse {
  const url = new URL(orderId > 0 ? `/account/orders/${orderId}` : '/account/orders', `https://${SITE.domain}`);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const a = Number(new URL(req.url).searchParams.get('a') || 0);
  return resultRedirect(await settle(a));
}
export async function GET(req: NextRequest): Promise<NextResponse> {
  const a = Number(new URL(req.url).searchParams.get('a') || 0);
  return resultRedirect(await settle(a));
}
