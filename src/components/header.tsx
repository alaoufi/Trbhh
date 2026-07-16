import Link from 'next/link';
import Image from 'next/image';
import { Bell } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { hasAnyAdmin, getUserPerms } from '@/lib/roles';
import { getCategories } from '@/lib/data';
import { storeIdOfUser } from '@/lib/merchant';
import { SiteMenu } from '@/components/site-menu';
import { ADMIN_NAV } from '@/components/admin-nav-def';
import { HeaderSearch } from '@/components/header-search';
import { HeaderCta } from '@/components/header-cta';
import { LiveClock } from '@/components/live-clock';
import { AdminAlertsBanner } from '@/components/admin-alerts-banner';

export async function Header() {
  const session = await getSession();
  const admin = session ? await hasAnyAdmin(session.uid) : false;
  // إخفاء الأقسام من قائمة الموقع عند تعطيلها من التحكم
  const catsOn = await import('@/lib/settings').then((m) => m.categoriesEnabled()).catch(() => true);
  const categories = catsOn ? await getCategories() : [];
  const myStoreId = session ? await storeIdOfUser(session.uid).catch(() => 0) : 0;
  // اسم المتجر لمبدّل الهوية (اختياري: يظهر فقط لأصحاب المتاجر)
  const myStoreName = myStoreId ? await import('@/lib/merchant').then((m) => m.getStoreMeta(myStoreId)).then((mt) => mt?.storeName || 'متجري').catch(() => 'متجري') : '';
  // الحسابات المرتبطة بنفس المالك (للتبديل من مبدّل الهوية) — فارغة إن لا ربط
  const linkedAccts = session ? await import('@/lib/account-links').then((m) => m.linkedAccounts(session.uid)).catch(() => []) : [];
  // روابط الإدارة المصرّح بها — تُعرض في قائمة الهيدر داخل لوحة الإدارة
  const adminHrefs = admin
    ? await getUserPerms(session!.uid).then((perms) => ADMIN_NAV.filter((n) => n.perm === null || perms.has(n.perm)).map((n) => n.href)).catch(() => [] as string[])
    : [];
  // جرس الهيدر: مجموع الرسائل غير المقروءة + التنبيهات الجديدة
  const [unreadMsgs, newNotifs] = session
    ? await Promise.all([
        prisma.chats.count({ where: { reciver_id: session.uid, is_read: 0 } }).catch(() => 0),
        prisma.notfications.count({ where: { user_id: String(session.uid), read_at: null } }).catch(() => 0),
      ])
    : [0, 0];
  const bellCount = unreadMsgs + newNotifs;
  // «عروض اليوم» و«المزادات» في القائمة — تظهر فقط عند تفعيلها من التحكم
  const dealsOn = await import('@/lib/store-extras').then((m) => m.dealsEnabled()).catch(() => false);
  const auctionsOn = await import('@/lib/settings').then((m) => m.auctionsEnabled()).catch(() => false);
  const debatesOn = await import('@/lib/settings').then((m) => m.debatesEnabled()).catch(() => true);
  return (
    <>
    <header className="sticky top-0 z-40 border-b border-[#d8dfeb] bg-[#eef1f7]">
      <div className="container relative flex h-16 items-center gap-2">
        {/* hamburger on the right (RTL: first child) */}
        <SiteMenu isAuthed={!!session} isAdmin={admin} categories={categories} adminHrefs={adminHrefs} dealsOn={dealsOn} auctionsOn={auctionsOn} debatesOn={debatesOn} myStoreId={myStoreId} myStoreName={myStoreName} currentUid={session?.uid || 0} linkedAccounts={linkedAccts.map((a) => ({ id: a.id, name: a.name, hasStore: a.hasStore, storeName: a.storeName, isAdmin: a.isAdmin }))} />

        {/* الزر الرئيسي — يتغيّر حسب الصفحة (دخول/رابط المتجر/الصفحة الرئيسية في صفحة الدخول) */}
        <HeaderCta isAuthed={!!session} myStoreId={myStoreId} />

        {/* بحث مصغّر: عدسة تفتح حقل البحث */}
        <HeaderSearch />

        {/* جرس الرسائل والتنبيهات + ساعة حية بتوقيت الرياض تحته */}
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          {session && (
            <Link href="/notifications" aria-label="التنبيهات والرسائل" className="relative text-primary">
              <Bell className="h-5 w-5" />
              {bellCount > 0 && (
                <span className="absolute -left-2 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-[18px] text-white shadow">
                  {bellCount > 99 ? '99+' : bellCount}
                </span>
              )}
            </Link>
          )}
          <LiveClock />
        </div>

        {/* logo on the left (RTL: last child) — الشعار كما هو بحواف متلاشية (المركز معتم كاملاً، فقط الأطراف تذوب في الهيدر الكحلي الخفيف)؛ الأصل القديم محفوظ بالاسم logo-mark-256.png للتراجع الفوري */}
        <Link href="/" className="shrink-0">
          <Image src="/logo-feathered.png" alt="تربح" width={48} height={48} priority className="h-12 w-12 object-contain" />
        </Link>
      </div>
    </header>
    {/* 🔔 تنبيه إداري عالمي: يظهر لأي إداري في كل صفحة حتى تُعالَج الطلبات المعلقة */}
    {admin && <AdminAlertsBanner />}
    </>
  );
}
