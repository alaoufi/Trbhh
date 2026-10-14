import {AdminSidebar} from '@/components/admin-sidebar';
import {Suspense} from 'react';
import {AdminPageHeading} from '@/components/admin-page-heading';
import { requireAnyAdmin } from '@/lib/roles';
import { readActorAccess } from '@/lib/access-control/guards';
import { canAccessPage } from '@/lib/access-control/catalog';
import { ScrollTop } from '@/components/scroll-top';
import { ADMIN_GROUPS } from '@/components/admin-nav-def';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAnyAdmin();
  const access = await readActorAccess(session.uid);

  // المتشابهات في قوائم فرعية ملوّنة — تُفتح المجموعة التي تحوي الصفحة الحالية
  const groups = ADMIN_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((n) => canAccessPage(access.keys, n.href)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="grid gap-4 md:grid-cols-[230px_1fr]">
      {/* على الجوال: القائمة الجانبية (الهامبرغر ☰ «قائمة الإدارة») تكفي، فلا نكرّر هذه
          القائمة ونزحم المكان — تظهر كشريط جانبي على الشاشات الكبيرة فقط. */}
      <Suspense fallback={null}><AdminSidebar allowedHrefs={groups.flatMap(group=>group.items.map(item=>item.href))} roles={access.roles.map(role=>({id:String(role.id),name:role.name}))}/></Suspense>
      <section id="admin-content" className="min-w-0 scroll-mt-20 font-bold"><Suspense fallback={null}><AdminPageHeading items={groups.flatMap(group=>group.items.map(({href,label})=>({href,label})))}/></Suspense>{children}</section>
      <ScrollTop targetId="admin-content" />
    </div>
  );
}
