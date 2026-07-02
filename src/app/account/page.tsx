import Link from 'next/link';
import { Megaphone, Heart, Mail } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getMyStats } from '@/lib/account';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'لوحة التحكم' };

export default async function AccountHome() {
  const session = await requireUser();
  const stats = await getMyStats(session.uid);
  const cards = [
    { href: '/account/ads', label: 'إعلاناتي', value: stats.ads, icon: Megaphone },
    { href: '/account/favorites', label: 'المفضلة', value: stats.favorites, icon: Heart },
    { href: '/messages', label: 'رسائل غير مقروءة', value: stats.unread, icon: Mail },
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-primary">مرحباً {session.name} 👋</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map(({ href, label, value, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 card-3d rounded-xl p-4 hover:border-primary">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="h-5 w-5" /></span>
            <div><div className="text-xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
