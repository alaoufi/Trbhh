import Link from 'next/link';
import { LayoutDashboard, Users, Megaphone, LayoutGrid, Flag, ShieldCheck, Home, Copy, Sparkles, Ban, Crown, Settings, MonitorPlay, BookOpen, ShieldAlert, DatabaseBackup, KeyRound } from 'lucide-react';
import { requireAnyAdmin, getUserPerms, getUserRole, ROLE_LABELS, type Perm } from '@/lib/roles';
import { ScrollTop } from '@/components/scroll-top';

const nav: { href: string; label: string; icon: React.ElementType; perm: Perm | null }[] = [
  { href: '/admin', label: 'لوحة الإدارة', icon: LayoutDashboard, perm: null },
  { href: '/guide', label: 'دليل الاستخدام', icon: BookOpen, perm: null },
  { href: '/admin/users', label: 'المستخدمون', icon: Users, perm: 'users' },
  { href: '/admin/roles', label: 'الأدوار والصلاحيات', icon: KeyRound, perm: 'users' },
  { href: '/admin/ads', label: 'الإعلانات', icon: Megaphone, perm: 'ads' },
  { href: '/admin/duplicates', label: 'الإعلانات المكررة', icon: Copy, perm: 'duplicates' },
  { href: '/admin/classified', label: 'الإعلانات المبوّبة', icon: Sparkles, perm: 'classified' },
  { href: '/admin/categories', label: 'الأقسام', icon: LayoutGrid, perm: 'categories' },
  { href: '/admin/words', label: 'الكلمات المرفوضة', icon: Ban, perm: 'words' },
  { href: '/admin/guard-words', label: 'كلمات حارس المحتوى', icon: ShieldAlert, perm: 'words' },
  { href: '/admin/reports', label: 'البلاغات', icon: Flag, perm: 'reports' },
  { href: '/admin/verifications', label: 'طلبات التوثيق', icon: ShieldCheck, perm: 'verifications' },
  { href: '/admin/packages', label: 'الباقات', icon: Crown, perm: 'packages' },
  { href: '/admin/promos', label: 'الإعلانات الترويجية', icon: MonitorPlay, perm: 'promos' },
  { href: '/admin/settings', label: 'الإعدادات', icon: Settings, perm: 'users' },
  { href: '/admin/backup', label: 'نسخ احتياطي واستعادة', icon: DatabaseBackup, perm: 'backup' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAnyAdmin();
  const [perms, role] = await Promise.all([getUserPerms(session.uid), getUserRole(session.uid)]);
  const items = nav.filter((n) => n.perm === null || perms.has(n.perm));
  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <aside id="admin-nav" className="h-fit card-3d rounded-xl p-3">
        <div className="mb-3 border-b pb-3">
          <div className="text-base font-extrabold text-primary">لوحة التحكم</div>
          {role && <div className="mt-1 text-xs font-bold text-muted-foreground">صلاحيتك: <span className="font-extrabold text-primary">{ROLE_LABELS[role]}</span></div>}
        </div>
        <nav className="space-y-1">
          {items.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={`${href}#admin-content`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold hover:bg-secondary">
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
          <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-secondary"><Home className="h-4 w-4" /> العودة للموقع</Link>
        </nav>
      </aside>
      <section id="admin-content" className="min-w-0 scroll-mt-20 font-bold">{children}</section>
      <ScrollTop targetId="admin-nav" />
    </div>
  );
}
