import Link from 'next/link';
import { LayoutDashboard, Users, Megaphone, LayoutGrid, Flag, ShieldCheck, Home } from 'lucide-react';
import { requireAdmin } from '@/lib/admin';

const nav = [
  { href: '/admin', label: 'لوحة الإدارة', icon: LayoutDashboard },
  { href: '/admin/users', label: 'المستخدمون', icon: Users },
  { href: '/admin/ads', label: 'الإعلانات', icon: Megaphone },
  { href: '/admin/categories', label: 'الأقسام', icon: LayoutGrid },
  { href: '/admin/reports', label: 'البلاغات', icon: Flag },
  { href: '/admin/verifications', label: 'طلبات التوثيق', icon: ShieldCheck },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <aside className="h-fit rounded-xl border bg-card p-3 shadow-sm">
        <div className="mb-3 border-b pb-3 text-sm font-bold text-primary">لوحة التحكم</div>
        <nav className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary">
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
          <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"><Home className="h-4 w-4" /> العودة للموقع</Link>
        </nav>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
