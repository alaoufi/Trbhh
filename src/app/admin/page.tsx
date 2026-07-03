import Link from 'next/link';
import { Users, Megaphone, ShieldCheck, Flag, MessagesSquare, Clock, Copy, Sparkles, Crown, MonitorPlay, ShieldAlert } from 'lucide-react';
import { adminStats } from '@/lib/admin';
import { getPackages } from '@/lib/packages';
import { countPendingPromos } from '@/lib/promos';
import { requireAnyAdmin, getUserPerms, getUserRole, ROLE_LABELS, type Perm } from '@/lib/roles';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'لوحة الإدارة' };

export default async function AdminHome() {
  const session = await requireAnyAdmin();
  const [s, perms, role, packages, pendingPromos] = await Promise.all([adminStats(), getUserPerms(session.uid), getUserRole(session.uid), getPackages().catch(() => []), countPendingPromos().catch(() => 0)]);
  const allCards: { label: string; value: number; icon: React.ElementType; href: string; highlight?: boolean; perm: Perm | null }[] = [
    { label: 'إعلانات بانتظار الموافقة', value: s.pendingAds, icon: Clock, href: '/admin/ads?view=pending', highlight: true, perm: 'ads' },
    { label: 'المستخدمون', value: s.users, icon: Users, href: '/admin/users', perm: 'users' },
    { label: 'إجمالي الإعلانات', value: s.ads, icon: Megaphone, href: '/admin/ads', perm: 'ads' },
    { label: 'إعلانات نشطة', value: s.activeAds, icon: Megaphone, href: '/admin/ads', perm: 'ads' },
    { label: 'طلبات توثيق معلّقة', value: s.pendingVerify, icon: ShieldCheck, href: '/admin/verifications', perm: 'verifications' },
    { label: 'البلاغات', value: s.reports, icon: Flag, href: '/admin/reports', perm: 'reports' },
    { label: 'الإعلانات المكررة', value: s.duplicateAds, icon: Copy, href: '/admin/duplicates', highlight: true, perm: 'duplicates' },
    { label: 'سجل الحماية', value: 0, icon: ShieldAlert, href: '/admin/moderation', perm: 'reports' },
    { label: 'مراقبة المراسلات', value: 0, icon: MessagesSquare, href: '/admin/messages', perm: 'messages' },
    { label: 'الإعلانات المبوّبة', value: s.classified, icon: Sparkles, href: '/admin/classified', perm: 'classified' },
    { label: 'الباقات', value: packages.length, icon: Crown, href: '/admin/packages', perm: 'packages' },
    { label: 'إعلانات ترويجية بانتظار الموافقة', value: pendingPromos, icon: MonitorPlay, href: '/admin/promos', highlight: true, perm: 'promos' },
    { label: 'النقاشات', value: s.debates, icon: MessagesSquare, href: '/debates', perm: null },
  ];
  const cards = allCards.filter((c) => c.perm === null || perms.has(c.perm));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-primary">لوحة الإدارة</h1>
        {role && (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            صلاحيتك: {ROLE_LABELS[role]}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        الأقسام المتاحة لك حسب صلاحياتك: {[...perms].length} قسم.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`flex items-center gap-3 card-3d rounded-xl p-4 ${c.highlight && c.value > 0 ? '!border-amber-400 bg-amber-50' : ''}`}
          >
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary"><c.icon className="h-5 w-5" /></span>
            <div><div className="text-xl font-bold text-primary">{new Intl.NumberFormat('en-US').format(c.value)}</div><div className="text-xs text-muted-foreground">{c.label}</div></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
