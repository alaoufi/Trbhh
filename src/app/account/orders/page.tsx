import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatSar } from '@/lib/commerce/money';

export const dynamic = 'force-dynamic';
export default async function MemberOrders() {
  const session = await requireUser();
  const rows = await prisma.$queryRaw<{ id: bigint; status: string; total_minor: number }[]>`SELECT id,status,total_minor FROM commerce_orders WHERE member_id=${BigInt(session.uid)} ORDER BY id DESC LIMIT 100`;
  return <section className="card-3d space-y-3 rounded-xl p-4"><h1 className="text-xl font-bold text-primary">طلباتي من تربح</h1>
    {rows.length === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات.</p>}
    {rows.map(row => <Link key={row.id.toString()} href={`/account/orders/${row.id}`} className="flex justify-between rounded-lg border p-3 text-sm">
      <span>طلب #{row.id.toString()}</span><span>{formatSar(row.total_minor)} ر.س</span><span>{row.status === 'paid' ? 'مدفوع' : row.status === 'cancelled' ? 'ملغي' : 'بانتظار الدفع'}</span>
    </Link>)}
  </section>;
}
