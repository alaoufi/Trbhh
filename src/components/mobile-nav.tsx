'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessagesSquare, PlusCircle, Bell, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/', label: 'الرئيسية', icon: Home },
  { href: '/debates', label: 'نقاشات', icon: MessagesSquare },
  { href: '/ads/new', label: 'أضف', icon: PlusCircle, primary: true },
  { href: '/notifications', label: 'التنبيهات', icon: Bell },
  { href: '/messages', label: 'الرسائل', icon: Mail },
];

export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur md:hidden">
      <ul className="flex items-stretch justify-around">
        {items.map(({ href, label, icon: Icon, primary }) => {
          const active = path === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  'flex flex-col items-center gap-1 py-2 text-[11px]',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <span className={cn(primary && 'grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground')}>
                  <Icon className={cn(primary ? 'h-5 w-5' : 'h-5 w-5')} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
