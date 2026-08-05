import Link from 'next/link';
import { Bell } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { hasAnyAdmin, getUserPerms } from '@/lib/roles';
import { storeIdOfUser } from '@/lib/merchant';
import { SiteMenu } from '@/components/site-menu';
import { ADMIN_NAV } from '@/components/admin-nav-def';
import { HeaderSearch } from '@/components/header-search';
import { HeaderCta } from '@/components/header-cta';
import { LiveClock } from '@/components/live-clock';
import { AdminAlertsBanner } from '@/components/admin-alerts-banner';
import { ProfileSwitcher } from '@/components/profile-switcher';

export async function Header() {
  const session = await getSession();
  const admin = session ? await hasAnyAdmin(session.uid) : false;
  const myStoreId = session ? await storeIdOfUser(session.uid).catch(() => 0) : 0;
  // اسم المتجر لمبدّل الهوية (اختياري: يظهر فقط لأصحاب المتاجر)
  const myStoreName = myStoreId ? await import('@/lib/merchant').then((m) => m.getStoreMeta(myStoreId)).then((mt) => mt?.storeName || 'متجري').catch(() => 'متجري') : '';
  // الهوية الفعّالة الآن (اسمها ونوعها) — لعرض «من أنا» في القائمة، تتغيّر عند التبديل
  const activeProfile = session ? await import('@/lib/profiles').then((m) => m.getActiveProfile(session.uid)).catch(() => null) : null;
  // الحسابات المرتبطة بنفس المالك (للتبديل من مبدّل الهوية) — فارغة إن لا ربط
  const linkedAccts = session ? await import('@/lib/account-links').then((m) => m.linkedAccounts(session.uid)).catch(() => []) : [];
  // روابط الإدارة المصرّح بها — تُعرض في قائمة الهيدر داخل لوحة الإدارة
  const adminHrefs = admin
    ? await getUserPerms(session!.uid).then((perms) => ADMIN_NAV.filter((n) => n.perm === null || perms.has(n.perm)).map((n) => n.href)).catch(() => [] as string[])
    : [];
  // جرس الهيدر: مجموع الرسائل غير المقروءة + التنبيهات الجديدة
  // الجرس = رسائل غير مقروءة + تنبيهات (عدا نوع message لئلا تُعدّ الرسالة مرتين)
  const [unreadMsgs, newNotifs] = session
    ? await Promise.all([
        prisma.chats.count({ where: { reciver_id: session.uid, is_read: 0 } }).catch(() => 0),
        prisma.notfications.count({ where: { user_id: String(session.uid), read_at: null, type: { not: 'message' } } }).catch(() => 0),
      ])
    : [0, 0];
  const bellCount = unreadMsgs + newNotifs;
  // «عروض اليوم» و«المزادات» في القائمة — تظهر فقط عند تفعيلها من التحكم
  const dealsOn = await import('@/lib/store-extras').then((m) => m.dealsEnabled()).catch(() => false);
  const auctionsOn = await import('@/lib/settings').then((m) => m.auctionsEnabled()).catch(() => false);
  return (
    <>
    <header className="sticky top-0 z-40 border-b border-black/20 bg-gradient-to-r from-[#3b82f6] to-[#7dd3fc]">
      <div className="container relative flex h-16 items-center gap-2">
        {/* hamburger on the right (RTL: first child) */}
        <SiteMenu isAuthed={!!session} isAdmin={admin} adminHrefs={adminHrefs} dealsOn={dealsOn} auctionsOn={auctionsOn} myStoreId={myStoreId} myStoreName={myStoreName} currentUid={session?.uid || 0} activeName={activeProfile?.name || ''} activeType={activeProfile?.type || 'personal'} linkedAccounts={linkedAccts.map((a) => ({ id: a.id, name: a.name, hasStore: a.hasStore, storeName: a.storeName, isAdmin: a.isAdmin }))} />

        {/* الزر الرئيسي — يتغيّر حسب الصفحة (دخول/رابط المتجر/الصفحة الرئيسية في صفحة الدخول) */}
        <HeaderCta isAuthed={!!session} myStoreId={myStoreId} />

        {/* بحث مصغّر: عدسة تفتح حقل البحث */}
        <HeaderSearch />

        {/* جرس الرسائل والتنبيهات + ساعة حية بتوقيت الرياض تحته */}
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          {session && (
            <Link href="/notifications" aria-label="التنبيهات والرسائل" className="relative text-[#f0b429]">
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

        {/* logo on the left (RTL: last child) — يبقى داخل هامش الحاوية بدل ملامسة حافة
            الشاشة تماماً. logo-header.png هو الملف المعتمد رسمياً (لوحة كاملة بخلفية
            داكنة وشعار «عقار تربح» الذهبي) — يُستخدم كما هو بلا اقتصاص لضمان مطابقته
            تماماً للنسخة المعتمدة في كل مكان بالموقع (الهيدر وبطاقات المشاركة).
            <img> عادي بدل next/image عمداً: محسّن الصور عبر sharp على هذا السيرفر
            المستضاف ذاتياً سبق أن سبّب اختفاء محتوى كامل لصور أخرى (انظر next.config.js
            تعليق remotePatterns) — نفس فئة العطل هنا (شعار يظهر ثم يختفي فوراً). صورة
            محلية صغيرة من public/ لا تحتاج تحسيناً خادمياً أصلاً. */}
        {/* شعار «عقار تربح» المستقل (الشعار الرسمي الذهبي) */}
        <Link href="/" className="shrink-0">
          <img src="/logo-aqar-256.png?v=3" alt="عقار تربح" width={256} height={256} className="h-12 w-12 rounded-xl object-cover shadow-sm ring-1 ring-[#f0b429]/30" />
        </Link>
      </div>
    </header>
    {/* شريط الهوية الفعّالة (للعضو). ختم المركز الرسمي «متجر موثّق» عائم أعلى يسار الصفحة
        (يضعه SealReposition) — يظهر للعضو والزائر، ونافذته تفتح وتُغلق طبيعياً. */}
    {session && <ProfileBar uid={session.uid} />}
    {/* 🔔 تنبيه إداري عالمي: يظهر لأي إداري في كل صفحة حتى تُعالَج الطلبات المعلقة */}
    {admin && <AdminAlertsBanner />}
    </>
  );
}

async function ProfileBar({ uid }: { uid: number }) {
  const { getUserProfiles, getActiveProfile } = await import('@/lib/profiles');
  const { linkedAccounts } = await import('@/lib/account-links');
  const [profiles, active, linked] = await Promise.all([
    getUserProfiles(uid).catch(() => []),
    getActiveProfile(uid).catch(() => null),
    linkedAccounts(uid).catch(() => []),
  ]);
  if (!active) return null;
  const toItem = (p: { id: number; name: string; type: 'personal' | 'store'; avatarUrl: string; color: string | null }) => ({ id: p.id, name: p.name, type: p.type, avatarUrl: p.avatarUrl, color: p.color });
  const linkedItems = linked.filter((a) => a.id !== uid).map((a) => ({ id: a.id, name: a.name, hasStore: a.hasStore, storeName: a.storeName }));
  return (
    <div className="relative z-50 border-b bg-white/95">
      <div className="container flex min-h-9 items-center py-1">
        <ProfileSwitcher active={toItem(active)} profiles={profiles.map(toItem)} linked={linkedItems} />
      </div>
    </div>
  );
}
