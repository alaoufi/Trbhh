import Link from 'next/link';
import {
  Users, Megaphone, ShieldCheck, Flag, MessagesSquare, Clock, Copy, Sparkles, Crown,
  MonitorPlay, ShieldAlert, Mail, BookOpen, LayoutGrid, KeyRound, Ban, Settings, Database, Smartphone, Store,
} from 'lucide-react';
import { adminStats } from '@/lib/admin';
import { getPackages } from '@/lib/packages';
import { countPendingPromos } from '@/lib/promos';
import { countAdminUnread, getPrimaryAdminId } from '@/lib/admin-inbox';
import { requireAnyAdmin, getUserPerms, getUserRole, ROLE_LABELS, type Perm } from '@/lib/roles';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'لوحة الإدارة' };

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);

type Card = { group: string; label: string; icon: React.ElementType; href: string; perm: Perm | null; value?: number; highlight?: boolean; nav?: boolean };

const GROUPS: { key: string; label: string }[] = [
  { key: 'ads', label: 'الإعلانات والمحتوى' },
  { key: 'members', label: 'الأعضاء والصلاحيات' },
  { key: 'stores', label: 'إدارة المتاجر' },
  { key: 'safety', label: 'الحماية والرقابة' },
  { key: 'marketing', label: 'التسويق والباقات' },
  { key: 'system', label: 'النظام والإعدادات' },
];

export default async function AdminHome() {
  const session = await requireAnyAdmin();
  const [s, perms, role, packages, pendingPromos, adminUnread, primaryAdminId] = await Promise.all([
    adminStats(), getUserPerms(session.uid), getUserRole(session.uid), getPackages().catch(() => []),
    countPendingPromos().catch(() => 0), countAdminUnread().catch(() => 0), getPrimaryAdminId().catch(() => 0),
  ]);
  const isPrimaryAdmin = primaryAdminId === session.uid;

  const allCards: Card[] = [
    // الإعلانات والمحتوى
    { group: 'ads', label: 'بانتظار الموافقة', value: s.pendingAds, icon: Clock, href: '/admin/ads?view=pending', highlight: true, perm: 'ads' },
    { group: 'ads', label: 'إجمالي الإعلانات', value: s.ads, icon: Megaphone, href: '/admin/ads', perm: 'ads' },
    { group: 'ads', label: 'إعلانات نشطة', value: s.activeAds, icon: Megaphone, href: '/admin/ads', perm: 'ads' },
    { group: 'ads', label: 'الإعلانات المكررة', value: s.duplicateAds, icon: Copy, href: '/admin/duplicates', highlight: true, perm: 'duplicates' },
    { group: 'ads', label: 'الإعلانات المبوّبة', value: s.classified, icon: Sparkles, href: '/admin/classified', perm: 'classified' },
    { group: 'ads', label: 'الأقسام', icon: LayoutGrid, href: '/admin/categories', perm: 'categories', nav: true },
    // الأعضاء والصلاحيات
    { group: 'members', label: 'المستخدمون', value: s.users, icon: Users, href: '/admin/users', perm: 'users' },
    { group: 'members', label: 'طلبات توثيق معلّقة', value: s.pendingVerify, icon: ShieldCheck, href: '/admin/verifications', highlight: true, perm: 'verifications' },
    { group: 'members', label: 'طلبات تغيير الاسم', value: s.pendingNames, icon: Users, href: '/admin/name-requests', highlight: true, perm: 'users' },
    { group: 'members', label: 'الأدوار والصلاحيات', icon: KeyRound, href: '/admin/roles', perm: 'users', nav: true },
    { group: 'members', label: 'بوّابات التوثيق (SMS/واتساب)', icon: Smartphone, href: '/admin/verification', perm: 'users', nav: true },
    // إدارة المتاجر
    { group: 'stores', label: 'إدارة المتاجر', icon: Store, href: '/admin/stores', perm: 'stores', nav: true },
    // الحماية والرقابة
    { group: 'safety', label: 'البلاغات', value: s.reports, icon: Flag, href: '/admin/reports', perm: 'reports' },
    { group: 'safety', label: 'سجل الحماية', icon: ShieldAlert, href: '/admin/moderation', perm: 'reports', nav: true },
    { group: 'safety', label: 'مراقبة المراسلات', icon: MessagesSquare, href: '/admin/messages', perm: 'messages', nav: true },
    { group: 'safety', label: 'الكلمات وحارس المحتوى', icon: Ban, href: '/admin/words', perm: 'words', nav: true },
    // التسويق والباقات
    { group: 'marketing', label: 'الباقات', value: packages.length, icon: Crown, href: '/admin/packages', perm: 'packages' },
    { group: 'marketing', label: 'ترويجية بانتظار الموافقة', value: pendingPromos, icon: MonitorPlay, href: '/admin/promos', highlight: true, perm: 'promos' },
    // النظام والإعدادات
    { group: 'system', label: 'الإعدادات', icon: Settings, href: '/admin/settings', perm: 'users', nav: true },
    { group: 'system', label: 'النسخ الاحتياطي', icon: Database, href: '/admin/backup', perm: 'backup', nav: true },
    { group: 'system', label: 'النقاشات', value: s.debates, icon: MessagesSquare, href: '/debates', perm: null },
    { group: 'system', label: 'دليل الإدارة', icon: BookOpen, href: '/admin/guide', perm: null, nav: true },
  ];
  const visible = allCards.filter((c) => c.perm === null || perms.has(c.perm));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-primary">لوحة الإدارة</h1>
        {role && <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">صلاحيتك: {ROLE_LABELS[role]}</span>}
      </div>

      {/* رسائل الأعضاء للإدارة — تبقى بارزة حتى يُرَدّ عليها */}
      {isPrimaryAdmin && adminUnread > 0 && (
        <Link href="/messages" className="card-3d flex items-center gap-3 rounded-2xl !border-amber-400 bg-amber-50 p-4 hover:bg-amber-100">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-amber-500 text-white"><Mail className="h-5 w-5" /></span>
          <div className="flex-1">
            <div className="font-bold text-amber-900">لديك {en(adminUnread)} رسالة من الأعضاء بانتظار الرد</div>
            <div className="text-xs text-amber-800">اضغط للاطّلاع والرد — تبقى بارزة حتى تُقرأ ويُرَدّ عليها.</div>
          </div>
          <span className="shrink-0 text-sm font-bold text-amber-700">فتح ←</span>
        </Link>
      )}

      {GROUPS.map((g) => {
        const cards = visible.filter((c) => c.group === g.key);
        if (!cards.length) return null;
        return (
          <section key={g.key} className="space-y-2.5">
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-primary">
              <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-primary to-[hsl(var(--primary)/0.55)]" />
              {g.label}
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {cards.map((c) => (
                <Link
                  key={c.label}
                  href={c.href}
                  className={`flex items-center gap-3 card-3d rounded-xl p-4 ${c.highlight && (c.value ?? 0) > 0 ? '!border-amber-400 bg-amber-50' : ''}`}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><c.icon className="h-5 w-5" /></span>
                  {c.nav ? (
                    <div className="font-bold leading-tight text-primary">{c.label}</div>
                  ) : (
                    <div><div className="text-xl font-bold text-primary">{en(c.value ?? 0)}</div><div className="text-xs text-muted-foreground">{c.label}</div></div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
