import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LayoutDashboard, Megaphone, Heart, User, LogOut, PlusCircle, Building2, ShieldCheck } from 'lucide-react';
import { getSession } from '@/lib/auth';

const nav = [
  { href: '/account', label: 'لوحة التحكم', icon: LayoutDashboard },
  { href: '/account/ads', label: 'إعلاناتي', icon: Megaphone },
  { href: '/account/favorites', label: 'المفضلة', icon: Heart },
  { href: '/account/company', label: 'شركتي', icon: Building2 },
  { href: '/account/verify', label: 'توثيق الحساب', icon: ShieldCheck },
  { href: '/account/profile', label: 'الملف الشخصي', icon: User },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <aside className="h-fit rounded-xl border bg-card p-3 shadow-sm">
        <div className="mb-3 flex items-center gap-2 border-b pb-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-accent font-bold text-accent-foreground">
            {session.name?.charAt(0) ?? 'ع'}
          </span>
          <span className="text-sm font-semibold">{session.name}</span>
        </div>
        <nav className="space-y-1">
          <Link href="/ads/new" className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <PlusCircle className="h-4 w-4" /> أضف إعلان
          </Link>
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary">
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
          <Link href="/logout" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10">
            <LogOut className="h-4 w-4" /> خروج
          </Link>
        </nav>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
