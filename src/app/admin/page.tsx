import Link from 'next/link';
import { Users, Megaphone, ShieldCheck, Flag, MessagesSquare, Clock, Copy, Sparkles } from 'lucide-react';
import { adminStats } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'لوحة الإدارة' };

export default async function AdminHome() {
  const s = await adminStats();
  const cards = [
    { label: 'إعلانات بانتظار الموافقة', value: s.pendingAds, icon: Clock, href: '/admin/ads?pending=1', highlight: true },
    { label: 'المستخدمون', value: s.users, icon: Users, href: '/admin/users' },
    { label: 'إجمالي الإعلانات', value: s.ads, icon: Megaphone, href: '/admin/ads' },
    { label: 'إعلانات نشطة', value: s.activeAds, icon: Megaphone, href: '/admin/ads' },
    { label: 'طلبات توثيق معلّقة', value: s.pendingVerify, icon: ShieldCheck, href: '/admin/verifications' },
    { label: 'البلاغات', value: s.reports, icon: Flag, href: '/admin/reports' },
    { label: 'الإعلانات المكررة', value: s.duplicateAds, icon: Copy, href: '/admin/duplicates', highlight: true },
    { label: 'الإعلانات المبوّبة', value: s.classified, icon: Sparkles, href: '/admin/classified' },
    { label: 'النقاشات', value: s.debates, icon: MessagesSquare, href: '/debates' },
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-primary">لوحة الإدارة</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`flex items-center gap-3 card-3d rounded-xl p-4 ${c.highlight && c.value > 0 ? '!border-amber-400 bg-amber-50' : ''}`}
          >
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary"><c.icon className="h-5 w-5" /></span>
            <div><div className="text-xl font-bold text-primary">{new Intl.NumberFormat('ar-SA').format(c.value)}</div><div className="text-xs text-muted-foreground">{c.label}</div></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
