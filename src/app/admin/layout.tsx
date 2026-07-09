import Link from 'next/link';
import { Home } from 'lucide-react';
import { requireAnyAdmin, getUserPerms, getUserRole, ROLE_LABELS } from '@/lib/roles';
import { ScrollTop } from '@/components/scroll-top';
import { ADMIN_NAV as nav } from '@/components/admin-nav-def';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAnyAdmin();
  // تذكيرات قرب انتهاء الاشتراك — تشغيل كسول (لا جدولة خلفية)؛ ذاتي الخنق كل ٣٠ دقيقة
  import('@/lib/subscription').then((m) => m.sendDueSubReminders()).catch(() => {});
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
