import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LayoutDashboard, Megaphone, Heart, User, LogOut, UserX, PlusCircle, Building2, ShieldCheck, Wallet, Users } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { AccountNavScroller } from '@/components/account-nav-scroller';

const nav = [
  { href: '/account', label: 'لوحة التحكم', icon: LayoutDashboard },
  { href: '/account/identities', label: 'هوياتي', icon: Users },
  { href: '/account/profile', label: 'الملف الشخصي', icon: User },
  { href: '/account/ads', label: 'إعلاناتي', icon: Megaphone },
  { href: '/account/wallet', label: 'محفظتي', icon: Wallet },
  { href: '/account/favorites', label: 'المفضلة', icon: Heart },
  { href: '/store', label: 'متجري', icon: Building2 },
  { href: '/account/verify', label: 'توثيق الحساب', icon: ShieldCheck },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-[220px_1fr]">
      <aside className="h-fit min-w-0 card-3d rounded-xl p-3">
        <div className="mb-3 hidden items-center gap-2 border-b pb-3 md:flex">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-accent font-bold text-accent-foreground">
            {session.name?.charAt(0) ?? 'ع'}
          </span>
          <span className="text-sm font-semibold">{session.name}</span>
        </div>
        {/* على الجوال: شريط تنقّل أفقي مضغوط بأسهم يمين/يسار تُظهر العناصر المخفية؛ على الشاشات الكبيرة: قائمة جانبية عمودية */}
        <AccountNavScroller>
          <Link href="/ads/new" className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <PlusCircle className="h-4 w-4" /> أضف إعلان
          </Link>
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm hover:bg-secondary">
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
          {/* حذف الحساب — متطلب متاجر التطبيقات (يظهر داخل التطبيق) */}
          <Link href="/delete-account" className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-destructive/80 hover:bg-destructive/10">
            <UserX className="h-4 w-4" /> حذف الحساب
          </Link>
          {/* خروج: /logout معالج مسار (route handler) لا صفحة — يجب أن يكون <a> بتنقّل
              كامل لا <Link> (الاستباق التلقائي كان سيُلغي الجلسة عند التصفّح). */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/logout" className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10">
            <LogOut className="h-4 w-4" /> خروج
          </a>
        </AccountNavScroller>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
