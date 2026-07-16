'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessagesSquare, PlusCircle, Bell, Mail, Building2, Search, LogIn, Share2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = { href: string; label: string; icon: LucideIcon; primary?: boolean; badge?: boolean };

// بنود تتطلّب تسجيل الدخول → تظهر فقط للمسجّل. للزائر بنود عامة فقط.
const authedItems: NavItem[] = [
  { href: '/', label: 'الرئيسية', icon: Home },
  { href: '/debates', label: 'مناقشات', icon: MessagesSquare },
  { href: '/ads/new', label: 'أضف إعلان', icon: PlusCircle, primary: true },
  { href: '/notifications', label: 'الاشعارات', icon: Bell, badge: true },
  { href: '/messages', label: 'الرسائل', icon: Mail },
];
const guestItems: NavItem[] = [
  { href: '/', label: 'الرئيسية', icon: Home },
  { href: '/companies', label: 'المتاجر', icon: Building2 },
  { href: '/login', label: 'تسجيل الدخول', icon: LogIn, primary: true },
  { href: '/debates', label: 'مناقشات', icon: MessagesSquare },
  { href: '/search', label: 'بحث', icon: Search },
];

// زر مشاركة الصفحة الحالية — يحل محل «مناقشات» عند إخفائها من التحكم
const shareItem: NavItem = { href: '__share', label: 'مشاركة', icon: Share2 };

export function MobileNav({ unread = 0, isAuthed = false, debatesOn = true }: { unread?: number; isAuthed?: boolean; debatesOn?: boolean }) {
  const path = usePathname();
  const items = (isAuthed ? authedItems : guestItems).map((i) => (!debatesOn && i.href === '/debates' ? shareItem : i));

  const sharePage = async () => {
    const url = window.location.href;
    const title = document.title;
    try {
      if (navigator.share) await navigator.share({ url, title });
      else {
        await navigator.clipboard.writeText(url);
        alert('تم نسخ رابط الصفحة ✓');
      }
    } catch {
      /* أغلق العضو نافذة المشاركة */
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/20 bg-[#16294a] md:hidden">
      <ul className="flex items-stretch justify-around">
        {items.map(({ href, label, icon: Icon, primary, badge }) => {
          const active = path === href;
          const inner = (
            <>
              {primary ? (
                <span className="grid h-9 w-9 -translate-y-1 place-items-center rounded-full bg-[#f0b429] text-[#16294a] shadow-lg">
                  <Icon className="h-5 w-5" />
                </span>
              ) : (
                <span className="relative">
                  <Icon className={cn('h-6 w-6', active ? 'text-[#f0b429]' : 'text-[#f0b429]/70')} />
                  {badge && unread > 0 && (
                    <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </span>
              )}
              <span className={cn(primary && '-translate-y-1')}>{label}</span>
            </>
          );
          return (
            <li key={href} className="flex-1">
              {href === '__share' ? (
                <button type="button" onClick={sharePage} className="flex w-full flex-col items-center gap-0.5 py-1.5 text-[11px] text-[#f0b429]">
                  {inner}
                </button>
              ) : (
                <Link href={href} className="flex flex-col items-center gap-0.5 py-1.5 text-[11px] text-[#f0b429]">
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
