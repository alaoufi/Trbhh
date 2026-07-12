import Link from 'next/link';
import { prisma } from '@/lib/prisma';

/**
 * شريط تنبيه إداري عالمي: يظهر لأي عضو إدارة في كل صفحات الموقع فور دخوله
 * ما دامت هناك طلبات أو رسائل بانتظار إجراء — ويستمر بالظهور (يتكرر مع كل
 * صفحة) حتى تُعالَج كل البنود فيختفي تلقائياً.
 */
export async function AdminAlertsBanner() {
  const notArchived = { OR: [{ data_archive: null }, { data_archive: '' }] };
  const [pendingAds, pendingVerify, pendingNames, pendingTopups, pendingStores, adminUnread, pendingPromos] = await Promise.all([
    // إعلانات بانتظار الموافقة (غير المجدولة — المجدولة تنشر نفسها بموعدها)
    prisma.ads.count({ where: { status: 0, publish_at: null, ...notArchived } }).catch(() => 0),
    prisma.users.count({ where: { step: { gt: 0 }, trusted: 0 } }).catch(() => 0),
    prisma.name_requests.count({ where: { status: 0 } }).catch(() => 0),
    prisma.wallet_topups.count({ where: { status: 0 } }).catch(() => 0),
    prisma.stores.count({ where: { status: 0 } }).catch(() => 0),
    import('@/lib/admin-inbox').then((m) => m.countAdminUnread()).catch(() => 0),
    import('@/lib/promos').then((m) => m.countPendingPromos()).catch(() => 0),
  ]);

  const items = [
    { n: pendingAds, label: 'إعلان بانتظار الموافقة', href: '/admin/ads?view=pending' },
    { n: pendingTopups, label: 'طلب شحن رصيد', href: '/admin/topups' },
    { n: pendingVerify, label: 'طلب توثيق', href: '/admin/verifications' },
    { n: pendingNames, label: 'طلب تغيير اسم', href: '/admin/name-requests' },
    { n: pendingStores, label: 'متجر بانتظار الاعتماد', href: '/admin/stores' },
    { n: adminUnread, label: 'رسالة للإدارة بلا رد', href: '/messages' },
    { n: pendingPromos, label: 'إعلان ترويجي معلّق', href: '/admin/promos' },
  ].filter((i) => i.n > 0);

  if (!items.length) return null;
  const total = items.reduce((s, i) => s + i.n, 0);

  return (
    <div className="border-b-2 border-red-300 bg-gradient-to-l from-red-50 via-amber-50 to-red-50">
      <div className="container flex flex-wrap items-center gap-2 py-2">
        <span className="flex shrink-0 items-center gap-1.5 text-sm font-extrabold text-red-700">
          <span className="grid h-6 w-6 animate-pulse place-items-center rounded-full bg-red-600 text-[11px] text-white">{total > 99 ? '99+' : total}</span>
          🔔 تنبيه إداري — بانتظار إجرائكم:
        </span>
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="rounded-full border border-red-300 bg-white px-2.5 py-1 text-xs font-bold text-red-700 shadow-sm hover:bg-red-100">
            {i.n} {i.label} ←
          </Link>
        ))}
      </div>
    </div>
  );
}
