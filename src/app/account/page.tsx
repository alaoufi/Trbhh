import Link from 'next/link';
import { Megaphone, Heart, Mail, Sparkles, BarChart3, Star, Flag, Bell, ListFilter, LayoutTemplate, Wallet, Users, User, Store, Shield } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getMyStats } from '@/lib/account';
import { getBalance } from '@/lib/wallet';
import { prisma } from '@/lib/prisma';
import { getMemberAlerts } from '@/lib/alerts';
import { getCategories } from '@/lib/data';
import { getInterests } from '@/lib/interests';
import { getSellerRating } from '@/lib/reviews';
import { InterestsPicker } from '@/components/interests-picker';
import { PushToggle } from '@/components/push-toggle';
import { CopyChip } from '@/components/copy-chip';
import { TopupPromoBanner } from '@/components/topup-promo-banner';
import { referralEnabled, getReferralReward } from '@/lib/points';
import { SITE } from '@/lib/constants';
import { setInterestsAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'لوحة التحكم' };

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);

export default async function AccountHome({ searchParams }: { searchParams?: Promise<{ switched?: string; error?: string }> }) {
  const session = await requireUser();
  const sp = searchParams ? await searchParams : {};
  // نقطة الزيارة اليومية (إن فُعّلت) — لا تؤخر الصفحة
  import('@/lib/points').then((m) => m.grantDailyVisit(session.uid)).catch(() => {});
  const [stats, alerts, categories, interests, rating, balance, newNotifs, refOn] = await Promise.all([
    getMyStats(session.uid), getMemberAlerts(session.uid), getCategories(), getInterests(session.uid), getSellerRating(session.uid), getBalance(session.uid),
    prisma.notfications.count({ where: { user_id: String(session.uid), read_at: null } }).catch(() => 0),
    referralEnabled(),
  ]);
  const refReward = refOn ? await getReferralReward() : 0;
  // اكتشاف خدمات هذا الحساب تلقائياً عند الدخول: عضو (دائماً) + متجر + إدارة + حسابات مرتبطة
  const [myStoreId, isAdmin] = await Promise.all([
    import('@/lib/merchant').then((m) => m.storeIdOfUser(session.uid)).catch(() => 0),
    import('@/lib/roles').then((m) => m.hasAnyAdmin(session.uid)).catch(() => false),
  ]);
  const myStoreName = myStoreId ? await import('@/lib/merchant').then((m) => m.getStoreMeta(myStoreId)).then((mt) => mt?.storeName || 'متجري').catch(() => 'متجري') : '';
  const linkedCount = await import('@/lib/account-links').then((m) => m.linkedAccounts(session.uid)).then((a) => a.length).catch(() => 0);
  const cards = [
    { href: '/account/ads', label: 'إعلاناتي', value: stats.ads, icon: Megaphone },
    { href: '/account/favorites', label: 'المفضلة', value: stats.favorites, icon: Heart },
    { href: '/messages', label: 'رسائل غير مقروءة', value: stats.unread, icon: Mail },
    { href: '/notifications', label: 'تنبيهات جديدة', value: newNotifs, icon: Bell },
  ];
  const notices: { href: string; icon: React.ElementType; text: string }[] = [];
  if (alerts.messages > 0) notices.push({ href: '/messages', icon: Mail, text: `لديك ${en(alerts.messages)} رسالة جديدة غير مقروءة` });
  if (alerts.reviews > 0) notices.push({ href: `/users/${session.uid}`, icon: Star, text: `لديك ${en(alerts.reviews)} تقييم جديد` });
  if (alerts.reports > 0) notices.push({ href: '/account/reports', icon: Flag, text: `يوجد ${en(alerts.reports)} بلاغ جديد على إعلاناتك (المُبلِّغ سرّي لدى الإدارة)` });
  const catsOn = await import('@/lib/settings').then((m) => m.categoriesEnabled()).catch(() => true);
  return (
    <div className="space-y-4">
      {sp.switched === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ تم التبديل — أنت الآن في حساب «{session.name}».</div>}
      {sp.error === 'notlinked' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">تعذّر التبديل: هذا الحساب غير مرتبط بحسابك.</div>}
      {sp.error === 'switchbanned' && <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">تعذّر التبديل: الحساب المطلوب محظور.</div>}
      <h1 className="text-xl font-bold text-primary">مرحباً {session.name} 👋</h1>

      {/* 🎭 اكتشاف خدمات هذا الحساب تلقائياً عند الدخول (متجر/إدارة/عضو) — يظهر عند وجود صفة إضافية أو حسابات مرتبطة */}
      {(myStoreId > 0 || isAdmin || linkedCount > 0) && (
        <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-primary">
            🎭 خدمات هذا الحساب <span className="text-[11px] font-normal text-muted-foreground">— اكتُشفت تلقائياً</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-card px-3 py-2.5 shadow-sm">
              <span className="flex items-center gap-2 font-bold text-foreground"><User className="h-4 w-4 text-sky-600" /> عضو</span>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-extrabold text-sky-700">أنت هنا</span>
            </div>
            {myStoreId > 0 && (
              <Link href="/store" className="flex items-center justify-between gap-2 rounded-xl bg-card px-3 py-2.5 shadow-sm hover:border-primary hover:bg-accent">
                <span className="flex min-w-0 items-center gap-2 font-bold text-foreground"><Store className="h-4 w-4 shrink-0 text-emerald-600" /> <span className="line-clamp-1">متجر «{myStoreName}»</span></span>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">دخول ←</span>
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin" className="flex items-center justify-between gap-2 rounded-xl bg-card px-3 py-2.5 shadow-sm hover:border-primary hover:bg-accent">
                <span className="flex items-center gap-2 font-bold text-foreground"><Shield className="h-4 w-4 text-amber-600" /> لوحة الإدارة</span>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">دخول ←</span>
              </Link>
            )}
            {linkedCount > 0 && (
              <Link href="/account/identities" className="flex items-center justify-between gap-2 rounded-xl bg-card px-3 py-2.5 shadow-sm hover:border-primary hover:bg-accent">
                <span className="flex items-center gap-2 font-bold text-foreground"><Users className="h-4 w-4 text-violet-600" /> حسابات مرتبطة ({linkedCount})</span>
                <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-extrabold text-violet-700">تنقّل ←</span>
              </Link>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">تنتقل بين خدماتك من هنا أو من «القائمة ← 🎭 هوياتي». كل خدمة تعمل باسمها ورقمها دون تداخل.</p>
        </div>
      )}

      {notices.length > 0 && (
        <div className="space-y-2 rounded-2xl border-2 border-primary/25 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-sm font-bold text-primary"><Bell className="h-4 w-4" /> تنبيهات جديدة</div>
          {notices.map((n) => (
            <Link key={n.href} href={n.href} className="flex items-center gap-2 rounded-xl bg-card p-2.5 text-sm font-medium shadow-sm hover:border-primary hover:bg-accent">
              <n.icon className="h-4 w-4 shrink-0 text-primary" />
              <span className="flex-1">{n.text}</span>
              <span className="text-xs text-primary">عرض ←</span>
            </Link>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(({ href, label, value, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 card-3d rounded-xl p-4 hover:border-primary">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="h-5 w-5" /></span>
            <div><div className="text-xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>
          </Link>
        ))}
      </div>
      {/* دعوة صديق — رابط إحالة بمكافأة للطرفين */}
      {refOn && refReward > 0 && (
        <div className="card-3d flex flex-wrap items-center gap-3 rounded-xl border-2 border-sky-300 bg-sky-50/50 p-4">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-sky-100 text-2xl">🤝</span>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sky-800">ادعُ صديقاً واربحا معاً</div>
            <div className="text-xs text-muted-foreground">شارك رابطك — إذا سجّل صديقك ونشر أول إعلان أو وثّق حسابه يحصل كلاكما على {refReward} ر.س رصيداً.</div>
            <div dir="ltr" className="mt-1 select-all break-all text-xs font-bold text-sky-700">https://{SITE.domain}/r/{session.uid}</div>
          </div>
          <CopyChip text={`https://${SITE.domain}/r/${session.uid}`} />
        </div>
      )}

      {/* التنبيهات الفورية — تظهر فقط عند تفعيلها من الإدارة */}
      <PushToggle />

      {/* بانر عرض الشحن — الأرقام من التحكم */}
      <TopupPromoBanner />

      {/* المحفظة وشحن الرصيد — المبلغ + إيصال التحويل ثم تأكيد الإدارة */}
      <Link href="/account/wallet#topup" className="flex items-center gap-3 card-3d rounded-xl border-2 border-emerald-500/30 bg-emerald-50/50 p-4 hover:border-emerald-500">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><Wallet className="h-5 w-5" /></span>
        <div className="flex-1"><div className="font-bold text-emerald-800">شحن رصيدك</div><div className="text-xs text-muted-foreground">أرسل المبلغ وأرفق الإيصال — يُضاف لرصيدك بعد تأكيد الإدارة</div></div>
        <div className="text-left"><div className="text-lg font-extrabold text-emerald-700">{en(balance)}</div><div className="text-[11px] text-muted-foreground">رصيدك (ر.س)</div></div>
      </Link>
      <Link href="/account/analytics" className="flex items-center gap-3 card-3d rounded-xl p-4 hover:border-primary">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground"><BarChart3 className="h-5 w-5" /></span>
        <div><div className="font-bold">تحليلات إعلاناتي</div><div className="text-xs text-muted-foreground">مشاهدات إعلاناتك يومياً وأفضلها أداءً</div></div>
      </Link>
      <Link href="/account/design" className="flex items-center gap-3 card-3d rounded-xl p-4 hover:border-primary">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground"><LayoutTemplate className="h-5 w-5" /></span>
        <div><div className="font-bold">قالب التصميم</div><div className="text-xs text-muted-foreground">اختر هوية الموقع وعاينها قبل الاعتماد</div></div>
      </Link>
      {/* ربط حساباتي — الدخول بحساب آخر والتبديل بينها (اختياري) */}
      <Link href="/account/identities" className="flex items-center gap-3 card-3d rounded-xl border-2 border-violet-500/30 bg-violet-50/40 p-4 hover:border-violet-500">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-violet-100 text-violet-700"><Users className="h-5 w-5" /></span>
        <div><div className="font-bold text-violet-800">ربط حساباتي</div><div className="text-xs text-muted-foreground">ادخل بحساباتك الأخرى وتنقّل بينها من دخول واحد — اختياري</div></div>
      </Link>
      <Link href="/account/classified" className="flex items-center gap-3 card-3d rounded-xl p-4 hover:border-primary">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground"><Sparkles className="h-5 w-5" /></span>
        <div><div className="font-bold">إعلاناتي المبوّبة</div><div className="text-xs text-muted-foreground">تعديل أو حذف إعلاناتك المبوّبة</div></div>
      </Link>

      {/* كل ما يخص العضو: تقييماتي والبلاغات */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href={`/users/${session.uid}`} className="flex items-center gap-3 card-3d rounded-xl p-4 hover:border-primary">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground"><Star className="h-5 w-5" /></span>
          <div><div className="font-bold">تقييماتي</div><div className="text-xs text-muted-foreground">{rating.count ? `${rating.avg} من 5 (${en(rating.count)} تقييم)` : 'لا تقييمات بعد'}</div></div>
        </Link>
        <Link href="/account/reports" className="flex items-center gap-3 card-3d rounded-xl p-4 hover:border-primary">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground"><Flag className="h-5 w-5" /></span>
          <div><div className="font-bold">البلاغات على إعلاناتي</div><div className="text-xs text-muted-foreground">راجع البلاغات وأرسل ردّك للإدارة</div></div>
        </Link>
      </div>

      {/* الأقسام ذات الاهتمام — تظهر دائماً بأعلى الرئيسية */}
      <div className="card-3d space-y-2 rounded-xl p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-primary"><ListFilter className="h-4 w-4" /> أقسامي المهمّة</div>
        <p className="text-xs text-muted-foreground">اختر الأقسام التي تهمّك من القائمة، وستظهر إعلاناتها دائماً في أعلى الصفحة الرئيسية.</p>
        {catsOn && <InterestsPicker categories={categories} selected={interests} action={setInterestsAction} />}
      </div>
    </div>
  );
}
