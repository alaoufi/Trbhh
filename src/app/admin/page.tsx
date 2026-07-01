import { Users, Megaphone, ShieldCheck, Flag, LayoutGrid, MessagesSquare } from 'lucide-react';
import { adminStats } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'لوحة الإدارة' };

export default async function AdminHome() {
  const s = await adminStats();
  const cards = [
    { label: 'المستخدمون', value: s.users, icon: Users },
    { label: 'إجمالي الإعلانات', value: s.ads, icon: Megaphone },
    { label: 'إعلانات نشطة', value: s.activeAds, icon: Megaphone },
    { label: 'طلبات توثيق معلّقة', value: s.pendingVerify, icon: ShieldCheck },
    { label: 'البلاغات', value: s.reports, icon: Flag },
    { label: 'النقاشات', value: s.debates, icon: MessagesSquare },
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">لوحة الإدارة</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground"><c.icon className="h-5 w-5" /></span>
            <div><div className="text-xl font-bold">{new Intl.NumberFormat('ar-SA').format(c.value)}</div><div className="text-xs text-muted-foreground">{c.label}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
