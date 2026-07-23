import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { timeAgo } from '@/lib/utils';
import { cached } from '@/lib/redis';

type Item = { n: number; label: string; href: string; oldest: Date | null };

/**
 * شريط تنبيه إداري عالمي: يظهر لأي عضو إدارة في كل صفحات الموقع فور دخوله
 * ما دامت هناك طلبات أو رسائل بانتظار إجراء — مع وقت التأخير (عمر أقدم طلب)
 * لكل بند، والمتأخر أكثر من ٢٤ ساعة يتلوّن أحمر داكناً. يستمر بالظهور حتى
 * تُعالَج كل البنود فيختفي تلقائياً.
 */
export async function AdminAlertsBanner() {
  const notArchived = { OR: [{ data_archive: null }, { data_archive: '' }] };

  // عدّاد + أقدم طلب لكل بند (لحساب وقت التأخير)
  const [
    pendingAds, oldestAd,
    pendingTopups, oldestTopup,
    pendingVerify,
    userNameReqs, oldestUserName,
    storeNameReqs, oldestStoreName,
    reports, oldestReport,
    pendingStores, oldestStore,
    transfers, oldestTransfer,
    platformReqs, oldestPlatform,
    adminUnread, oldestAdminMsg,
    pendingPromos,
    verifyOrders,
  ] = await Promise.all([
    prisma.ads.count({ where: { status: 0, publish_at: null, paused_by_owner: 0, ...notArchived } }).catch(() => 0),
    prisma.ads.findFirst({ where: { status: 0, publish_at: null, paused_by_owner: 0, ...notArchived }, orderBy: { created_at: 'asc' }, select: { created_at: true } }).then((r) => r?.created_at ?? null).catch(() => null),
    prisma.wallet_topups.count({ where: { status: 0 } }).catch(() => 0),
    prisma.wallet_topups.findFirst({ where: { status: 0 }, orderBy: { created_at: 'asc' }, select: { created_at: true } }).then((r) => r?.created_at ?? null).catch(() => null),
    // نفس تعريف تبويب «بانتظار الموافقة» في صفحة التوثيق — المرفوض (step=2) ليس طلباً معلقاً
    prisma.users.count({ where: { trusted: { not: 1 }, step: { not: 2 }, OR: [{ step: 1 }, { national_identity: { gt: 0 } }, { commercial_register: { gt: 0 } }, { work_permit: { gt: 0 } }] } }).catch(() => 0),
    prisma.name_requests.count({ where: { status: 0, kind: 'user' } }).catch(() => 0),
    prisma.name_requests.findFirst({ where: { status: 0, kind: 'user' }, orderBy: { created_at: 'asc' }, select: { created_at: true } }).then((r) => r?.created_at ?? null).catch(() => null),
    prisma.name_requests.count({ where: { status: 0, kind: 'store' } }).catch(() => 0),
    prisma.name_requests.findFirst({ where: { status: 0, kind: 'store' }, orderBy: { created_at: 'asc' }, select: { created_at: true } }).then((r) => r?.created_at ?? null).catch(() => null),
    // البلاغات بانتظار إجراء (لم تُغلق بعد بحظر/حذف/تجاهل) — تُعالَج من صفحة البلاغات
    prisma.repord_ads.count({ where: { status: 0 } }).catch(() => 0),
    prisma.repord_ads.findFirst({ where: { status: 0 }, orderBy: { created_at: 'asc' }, select: { created_at: true } }).then((r) => r?.created_at ?? null).catch(() => null),
    prisma.stores.count({ where: { status: 0 } }).catch(() => 0),
    prisma.stores.findFirst({ where: { status: 0 }, orderBy: { id: 'asc' }, select: { created_at: true } }).then((r) => r?.created_at ?? null).catch(() => null),
    prisma.store_transfers.count({ where: { status: 1 } }).catch(() => 0),
    prisma.store_transfers.findFirst({ where: { status: 1 }, orderBy: { id: 'asc' }, select: { created_at: true } }).then((r) => r?.created_at ?? null).catch(() => null),
    prisma.store_offers.count({ where: { kind: 'platform', status: 0 } }).catch(() => 0),
    prisma.store_offers.findFirst({ where: { kind: 'platform', status: 0 }, orderBy: { id: 'asc' }, select: { created_at: true } }).then((r) => r?.created_at ?? null).catch(() => null),
    import('@/lib/admin-inbox').then((m) => m.countAdminUnread()).catch(() => 0),
    import('@/lib/admin-inbox').then(async (m) => {
      const adminId = await m.getPrimaryAdminId().catch(() => 0);
      if (!adminId) return null;
      const r = await prisma.chats.findFirst({ where: { reciver_id: adminId, is_read: 0 }, orderBy: { created_at: 'asc' }, select: { created_at: true } }).catch(() => null);
      return r?.created_at ?? null;
    }).catch(() => null),
    import('@/lib/promos').then((m) => m.countPendingPromos()).catch(() => 0),
    import('@/lib/verify-paid').then((m) => m.countPendingVerifyOrders()).catch(() => ({ n: 0, oldest: null })),
  ]);

  // سندات شحن مكرَّرة (تطابق سند سابق) بانتظار المراجعة — مقارنة البصمات مكلفة
  // نسبياً فتُخزَّن مؤقتاً لدقيقة واحدة بدل إعادة حسابها في كل تحميل صفحة إدارية
  const dupTopups = await cached('admin:dup-topups-count', 60, () =>
    import('@/lib/wallet').then((m) => m.countPendingDupTopups()).catch(() => 0),
  );

  // حظر آلي بانتظار مراجعتكم (فكّ الحظر أو الإبقاء عليه) — يبقى ظاهراً حتى تُبتّ فيه، لا يزول بمرور الوقت
  const [newBans, oldestNewBan] = await Promise.all([
    prisma.mod_log.count({ where: { action: 'banned', reviewed_at: null } }).catch(() => 0),
    prisma.mod_log.findFirst({ where: { action: 'banned', reviewed_at: null }, orderBy: { created_at: 'asc' }, select: { created_at: true } }).then((r) => r?.created_at ?? null).catch(() => null),
  ]);

  const items: Item[] = [
    // سند مكرّر: خطورته أعلى من طلب شحن عادي — يظهر دائماً بالأسلوب العاجل (أحمر) بغض النظر عن عمره
    { n: dupTopups, label: '⚠️ سند شحن مكرَّر يحتاج مطابقة', href: '/admin/topups', oldest: dupTopups > 0 ? new Date(0) : null },
    { n: pendingTopups, label: 'تأكيد شحن رصيد', href: '/admin/topups', oldest: oldestTopup },
    { n: pendingAds, label: 'إعلان بانتظار الموافقة', href: '/admin/ads?view=pending', oldest: oldestAd },
    { n: adminUnread, label: 'مراسلة للإدارة بلا رد (أعضاء وتجار)', href: '/messages', oldest: oldestAdminMsg },
    { n: reports, label: 'بلاغ/شكوى جديدة', href: '/admin/reports', oldest: oldestReport },
    { n: userNameReqs, label: 'طلب تغيير اسم عضو', href: '/admin/name-requests', oldest: oldestUserName },
    { n: storeNameReqs, label: 'طلب اسم متجر', href: '/admin/name-requests', oldest: oldestStoreName },
    { n: pendingVerify, label: 'طلب توثيق', href: '/admin/verifications', oldest: null },
    { n: pendingStores, label: 'متجر بانتظار الاعتماد', href: '/admin/stores', oldest: oldestStore },
    { n: transfers, label: 'نقل ملكية جاهز للتنفيذ', href: '/admin/stores', oldest: oldestTransfer },
    { n: platformReqs, label: 'طلب عرض منتجات', href: '/admin/stores', oldest: oldestPlatform },
    { n: verifyOrders.n, label: 'طلب توثيق متجر (مدفوع)', href: '/admin/stores', oldest: verifyOrders.oldest },
    { n: pendingPromos, label: 'إعلان ترويجي معلّق', href: '/admin/promos', oldest: null },
    { n: newBans, label: 'حظر آلي جديد (تجاوزات)', href: '/admin/reports?tab=auto', oldest: oldestNewBan },
  ].filter((i) => i.n > 0);

  if (!items.length) return null;
  const total = items.reduce((s, i) => s + i.n, 0);
  const isLate = (d: Date | null) => !!d && Date.now() - d.getTime() > 24 * 3600_000;

  return (
    <div className="border-b-2 border-red-300 bg-gradient-to-l from-red-50 via-amber-50 to-red-50">
      <div className="container flex flex-wrap items-center gap-2 py-2">
        <span className="flex shrink-0 items-center gap-1.5 text-sm font-extrabold text-red-700">
          <span className="grid h-6 w-6 animate-pulse place-items-center rounded-full bg-red-600 text-[11px] text-white">{total > 99 ? '99+' : total}</span>
          🔔 بانتظار إجرائكم:
        </span>
        {items.map((i) => (
          <Link
            key={`${i.href}-${i.label}`}
            href={i.href}
            className={`rounded-full border px-2.5 py-1 text-xs font-bold shadow-sm ${isLate(i.oldest) ? 'border-red-700 bg-red-600 text-white hover:bg-red-700' : 'border-red-300 bg-white text-red-700 hover:bg-red-100'}`}
          >
            {i.n} {i.label}
            {i.oldest && <span className={`mr-1 font-extrabold ${isLate(i.oldest) ? 'text-amber-200' : 'text-amber-700'}`}>⏱ تأخير: {timeAgo(i.oldest)}</span>}
            {' ←'}
          </Link>
        ))}
      </div>
    </div>
  );
}
