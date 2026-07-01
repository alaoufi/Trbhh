'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessagesSquare, PlusCircle, Bell, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/', label: 'الرئيسية', icon: Home },
  { href: '/debates', label: 'مناقشات', icon: MessagesSquare },
  { href: '/ads/new', label: 'أضف إعلان', icon: PlusCircle, primary: true },
  { href: '/notifications', label: 'الاشعارات', icon: Bell, badge: true },
  { href: '/messages', label: 'الرسائل', icon: Mail },
];

export function MobileNav({ unread = 0 }: { unread?: number }) {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-primary/15 bg-accent/95 backdrop-blur md:hidden">
      <ul className="flex items-stretch justify-around">
        {items.map(({ href, label, icon: Icon, primary, badge }) => {
          const active = path === href;
          return (
            <li key={href} className="flex-1">
              <Link href={href} className="flex flex-col items-center gap-0.5 py-1.5 text-[11px] text-primary">
                {primary ? (
                  <span className="grid h-11 w-11 -translate-y-2 place-items-center rounded-full bg-primary text-white shadow-lg">
                    <Icon className="h-6 w-6" />
                  </span>
                ) : (
                  <span className="relative">
                    <Icon className={cn('h-6 w-6', active ? 'text-primary' : 'text-primary/80')} />
                    {badge && unread > 0 && (
                      <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </span>
                )}
                <span className={cn(primary && '-translate-y-1')}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
