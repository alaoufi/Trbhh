import Link from 'next/link';
import { headers } from 'next/headers';
import { Home, ChevronDown } from 'lucide-react';
import { requireAnyAdmin, getUserPerms, getUserRole, ROLE_LABELS } from '@/lib/roles';
import { ScrollTop } from '@/components/scroll-top';
import { ADMIN_GROUPS } from '@/components/admin-nav-def';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAnyAdmin();
  // تذكيرات قرب انتهاء الاشتراك — تشغيل كسول (لا جدولة خلفية)؛ ذاتي الخنق كل ٣٠ دقيقة
  import('@/lib/subscription').then((m) => { m.sendDueSubReminders().catch(() => {}); m.sendMonthlyStoreReports().catch(() => {}); }).catch(() => {});
  const [perms, role] = await Promise.all([getUserPerms(session.uid), getUserRole(session.uid)]);
  const pathname = ((await headers()).get('x-pathname') || '').split('?')[0];

  // المتشابهات في قوائم فرعية ملوّنة — تُفتح المجموعة التي تحوي الصفحة الحالية
  const groups = ADMIN_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((n) => n.perm === null || perms.has(n.perm)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="grid gap-4 md:grid-cols-[230px_1fr]">
      <aside id="admin-nav" className="h-fit card-3d rounded-xl p-3">
        <div className="mb-3 border-b pb-3">
          <div className="text-base font-extrabold text-primary">لوحة التحكم</div>
          {role && <div className="mt-1 text-xs font-bold text-muted-foreground">صلاحيتك: <span className="font-extrabold text-primary">{ROLE_LABELS[role]}</span></div>}
        </div>
        <nav className="space-y-1.5">
          {groups.map((g) =>
            g.key === 'top' ? (
              // الروابط الرئيسية مباشرة بلا طي
              g.items.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={`${href}#admin-content`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold hover:bg-secondary" style={{ color: g.color }}>
                  <Icon className="h-4 w-4" /> {label}
                </Link>
              ))
            ) : (
              <details key={g.key} open={g.items.some((n) => pathname === n.href || pathname.startsWith(n.href + '/'))} className="overflow-hidden rounded-lg border" style={{ borderColor: `${g.color}40` }}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-extrabold text-white" style={{ background: g.color }}>
                  <span className="flex items-center gap-2"><g.icon className="h-4 w-4" /> {g.title}</span>
                  <ChevronDown className="h-4 w-4 opacity-80" />
                </summary>
                <div className="space-y-0.5 p-1" style={{ background: `${g.color}0d` }}>
                  {g.items.map(({ href, label, icon: Icon }) => (
                    <Link key={href} href={`${href}#admin-content`} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold hover:bg-white/70 ${pathname === href ? 'bg-white shadow-sm' : ''}`} style={{ color: g.color }}>
                      <Icon className="h-4 w-4" /> {label}
                    </Link>
                  ))}
                </div>
              </details>
            ),
          )}
          <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-secondary"><Home className="h-4 w-4" /> العودة للموقع</Link>
        </nav>
      </aside>
      <section id="admin-content" className="min-w-0 scroll-mt-20 font-bold">{children}</section>
      <ScrollTop targetId="admin-nav" />
    </div>
  );
}
